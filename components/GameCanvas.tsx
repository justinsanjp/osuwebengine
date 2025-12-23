
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Beatmap, ScoreData, HitObject, HitObjectType, SkinData, UserSettings, GameMode } from '../types';
import { COLORS, HIT_WINDOW_300, HIT_WINDOW_100, HIT_WINDOW_50 } from '../constants';

interface GameCanvasProps {
  beatmap: Beatmap;
  audioCtx: AudioContext;
  skin: SkinData | null;
  settings: UserSettings;
  onFinish: (score: ScoreData) => void;
  onBack: () => void;
}

const OSU_RES_X = 512;
const OSU_RES_Y = 384;
const AUDIO_OFFSET = 25; 

// Taiko Constants
const TAIKO_NOTE_SIZE = 60;
const TAIKO_BIG_SCALE = 1.6;
const TAIKO_TRACK_HEIGHT = 140;
const TAIKO_TOP_HEIGHT = 120; 
const TAIKO_HIT_X = 260; 

// Mania Constants
const MANIA_COL_WIDTH = 70;
const MANIA_HIT_Y_OFFSET = 100; // Distance from bottom

// Helper for smooth movement
const lerp = (start: number, end: number, factor: number) => {
  return start + (end - start) * factor;
};

const GameCanvas: React.FC<GameCanvasProps> = ({ beatmap, audioCtx, skin, settings, onFinish, onBack }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef<number>(0);
  
  const objects = useRef<HitObject[]>(JSON.parse(JSON.stringify(beatmap.objects)));
  const nextHittableIndex = useRef<number>(0);
  const scoreRef = useRef<ScoreData>({
    totalScore: 0, combo: 0, maxCombo: 0, accuracy: 100,
    count300: 0, count100: 0, count50: 0, countMiss: 0
  });

  const transform = useRef({ scale: 1, offsetX: 0, offsetY: 0 });
  
  // Raw input from hardware
  const mouseState = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2, isDown: false });
  // Smooth visual position (what is actually drawn and hit-tested)
  const visualMouse = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });

  // Store cursor history for trail effect {x, y, time}
  const cursorHistory = useRef<{x: number, y: number, time: number}[]>([]);

  const spinnerState = useRef({ currentAngle: 0, lastAngle: 0, totalRotation: 0, rpm: 0, lastTime: 0 });
  const taikoDrumState = useRef({ 
    leftInner: false, rightInner: false, leftOuter: false, rightOuter: false,
    lastHitTime: 0
  });
  // Mania Key State (Array of 4 booleans for 4K)
  const maniaKeyState = useRef<boolean[]>([false, false, false, false]);

  const skinImages = useRef<Record<string, HTMLImageElement>>({});
  const [displayScore, setDisplayScore] = useState(scoreRef.current);

  const getApproachTime = (ar: number) => {
    if (ar < 5) return 1200 + 600 * (5 - ar) / 5;
    if (ar === 5) return 1200;
    return 1200 - 750 * (ar - 5) / 5;
  };

  const approachTime = getApproachTime(beatmap.approachRate);
  const circleRadius = (54.4 - 4.48 * beatmap.circleSize);

  // Scroll speeds
  const taikoScrollSpeed = (1.4 * beatmap.sliderMultiplier!) * 0.45; 
  const maniaScrollSpeed = (1.4 * beatmap.sliderMultiplier!) * 0.55;

  useEffect(() => {
    if (!skin) return;
    Object.entries(skin).forEach(([key, url]) => {
      if (url) {
        const img = new Image();
        img.src = url as string;
        skinImages.current[key] = img;
      }
    });
  }, [skin]);

  const updateScore = (points: number, hitType: '300' | '100' | '50' | 'miss') => {
    const s = scoreRef.current;
    let newCombo = hitType === 'miss' ? 0 : s.combo + 1;
    const nextScore = {
      ...s,
      totalScore: s.totalScore + points * (newCombo || 1),
      combo: newCombo,
      maxCombo: Math.max(s.maxCombo, newCombo),
      count300: s.count300 + (hitType === '300' ? 1 : 0),
      count100: s.count100 + (hitType === '100' ? 1 : 0),
      count50: s.count50 + (hitType === '50' ? 1 : 0),
      countMiss: s.countMiss + (hitType === 'miss' ? 1 : 0),
    };
    const totalHits = nextScore.count300 + nextScore.count100 + nextScore.count50 + nextScore.countMiss;
    nextScore.accuracy = totalHits > 0 
      ? ((nextScore.count300 * 300 + nextScore.count100 * 100 + nextScore.count50 * 50) / (totalHits * 300)) * 100 
      : 100;
    scoreRef.current = nextScore;
    setDisplayScore(nextScore);
  };

  // --- STANDARD INPUT HANDLING ---
  // We use the coordinates passed in, which should be the VISUAL (smooth) coordinates
  const handleStandardInput = useCallback((clientX: number, clientY: number) => {
    const currentTime = (audioCtx.currentTime - startTimeRef.current) * 1000 - AUDIO_OFFSET;
    const t = transform.current;
    const list = objects.current;
    const searchLimit = Math.min(nextHittableIndex.current + 10, list.length);

    for (let i = nextHittableIndex.current; i < searchLimit; i++) {
      const obj = list[i];
      if (obj.hit || obj.missed) continue;
      if (currentTime < obj.time - approachTime) break;

      const sx = obj.x * t.scale + t.offsetX;
      const sy = obj.y * t.scale + t.offsetY;
      const dist = Math.sqrt((clientX - sx) ** 2 + (clientY - sy) ** 2);
      const scaledRadius = circleRadius * t.scale * 1.5;

      if ((obj.type === HitObjectType.CIRCLE || obj.type === HitObjectType.SLIDER) && dist <= scaledRadius) {
        const timeDiff = Math.abs(currentTime - obj.time);
        if (timeDiff <= HIT_WINDOW_50) {
          obj.hit = true;
          if (timeDiff <= HIT_WINDOW_300) updateScore(300, '300');
          else if (timeDiff <= HIT_WINDOW_100) updateScore(100, '100');
          else updateScore(50, '50');
          return;
        }
      }
    }
  }, [audioCtx, approachTime, circleRadius]);

  // --- TAIKO INPUT HANDLING ---
  const handleTaikoInput = useCallback((keyType: 'inner' | 'outer') => {
    const currentTime = (audioCtx.currentTime - startTimeRef.current) * 1000 - AUDIO_OFFSET;
    const list = objects.current;
    
    for (let i = nextHittableIndex.current; i < list.length; i++) {
        const obj = list[i];
        if (obj.hit || obj.missed) continue;
        
        if (obj.time - currentTime > HIT_WINDOW_50) break;
        
        if (obj.type === HitObjectType.CIRCLE || obj.type === HitObjectType.SLIDER) {
            const timeDiff = Math.abs(currentTime - obj.time);
            
            if (timeDiff <= HIT_WINDOW_50) {
                const isBlue = (obj.hitSound & 2) || (obj.hitSound & 8);
                const isRed = !isBlue;

                if ((keyType === 'inner' && isRed) || (keyType === 'outer' && isBlue)) {
                    obj.hit = true;
                    if (timeDiff <= HIT_WINDOW_300) updateScore(300, '300');
                    else if (timeDiff <= HIT_WINDOW_100) updateScore(100, '100');
                    else updateScore(300, '300');
                    taikoDrumState.current.lastHitTime = Date.now();
                    return;
                }
            } else if (currentTime > obj.time + HIT_WINDOW_50) {
                obj.missed = true;
                updateScore(0, 'miss');
            }
        }
        else if (obj.type === HitObjectType.SPINNER) {
             if (currentTime >= obj.time && currentTime <= obj.endTime) {
                 updateScore(100, '100');
                 taikoDrumState.current.lastHitTime = Date.now();
                 return; 
             }
        }
    }
  }, [audioCtx]);

  // --- MANIA INPUT HANDLING ---
  const handleManiaInput = useCallback((columnIndex: number, isDown: boolean) => {
    if (!isDown) return; // Only trigger on key down for basic hits
    const currentTime = (audioCtx.currentTime - startTimeRef.current) * 1000 - AUDIO_OFFSET;
    const list = objects.current;

    for (let i = nextHittableIndex.current; i < list.length; i++) {
      const obj = list[i];
      if (obj.hit || obj.missed) continue;

      // Calculate column from X coordinate (0-512 range mapped to 0-3)
      const col = Math.floor(obj.x * 4 / 512);
      
      if (col !== columnIndex) continue;

      // Too far in future
      if (obj.time - currentTime > HIT_WINDOW_50) {
        break; 
      }

      const timeDiff = Math.abs(currentTime - obj.time);

      if (timeDiff <= HIT_WINDOW_50) {
         obj.hit = true;
         if (timeDiff <= HIT_WINDOW_300) updateScore(300, '300');
         else if (timeDiff <= HIT_WINDOW_100) updateScore(100, '100');
         else updateScore(50, '50');
         return; // Hit one object per key press
      }
    }
  }, [audioCtx]);


  useEffect(() => {
    const move = (e: MouseEvent) => { 
        // Just update raw hardware position
        if (beatmap.mode === GameMode.STANDARD) {
            mouseState.current.x = e.clientX; 
            mouseState.current.y = e.clientY;
        }
    };
    
    const keydown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      
      if (beatmap.mode === GameMode.STANDARD) {
          const standardKeys = settings.keys.standard.map(k => k.toLowerCase());
          if (standardKeys.includes(k)) {
            mouseState.current.isDown = true;
            // Use VISUAL mouse position for hit detection so you hit what you see
            handleStandardInput(visualMouse.current.x, visualMouse.current.y);
          }
      } else if (beatmap.mode === GameMode.TAIKO) {
          const taikoKeys = settings.keys.taiko.map(k => k.toLowerCase());
          if (k === taikoKeys[0]) { taikoDrumState.current.leftOuter = true; handleTaikoInput('outer'); }
          if (k === taikoKeys[1]) { taikoDrumState.current.leftInner = true; handleTaikoInput('inner'); }
          if (k === taikoKeys[2]) { taikoDrumState.current.rightInner = true; handleTaikoInput('inner'); }
          if (k === taikoKeys[3]) { taikoDrumState.current.rightOuter = true; handleTaikoInput('outer'); }
      } else if (beatmap.mode === GameMode.MANIA) {
          const maniaKeys = settings.keys.mania4k.map(k => k.toLowerCase());
          const index = maniaKeys.indexOf(k);
          if (index !== -1) {
              maniaKeyState.current[index] = true;
              handleManiaInput(index, true);
          }
      }
      
      if (e.key === 'Escape') onBack();
    };

    const keyup = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (beatmap.mode === GameMode.STANDARD) {
          const standardKeys = settings.keys.standard.map(k => k.toLowerCase());
          if (standardKeys.includes(k)) mouseState.current.isDown = false;
      } else if (beatmap.mode === GameMode.TAIKO) {
          const taikoKeys = settings.keys.taiko.map(k => k.toLowerCase());
          if (k === taikoKeys[0]) taikoDrumState.current.leftOuter = false;
          if (k === taikoKeys[1]) taikoDrumState.current.leftInner = false;
          if (k === taikoKeys[2]) taikoDrumState.current.rightInner = false;
          if (k === taikoKeys[3]) taikoDrumState.current.rightOuter = false;
      } else if (beatmap.mode === GameMode.MANIA) {
          const maniaKeys = settings.keys.mania4k.map(k => k.toLowerCase());
          const index = maniaKeys.indexOf(k);
          if (index !== -1) {
              maniaKeyState.current[index] = false;
          }
      }
    };

    const mousedown = (e: MouseEvent) => {
      if (beatmap.mode === GameMode.STANDARD) {
          mouseState.current.isDown = true;
          // Use VISUAL mouse position
          handleStandardInput(visualMouse.current.x, visualMouse.current.y);
      }
    };
    const mouseup = () => mouseState.current.isDown = false;

    window.addEventListener('mousemove', move);
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    window.addEventListener('mousedown', mousedown);
    window.addEventListener('mouseup', mouseup);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('mousedown', mousedown);
      window.removeEventListener('mouseup', mouseup);
    };
  }, [handleStandardInput, handleTaikoInput, handleManiaInput, onBack, settings, beatmap.mode]);


  // --- RENDERING HELPERS ---
  const drawRepeatArrow = (ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, scale: number, opacity: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.globalAlpha = opacity;
    const pulse = 1 + Math.sin(Date.now() / 100) * 0.1;
    ctx.scale(scale * pulse, scale * pulse);
    ctx.beginPath();
    ctx.moveTo(10, -15); ctx.lineTo(-10, 0); ctx.lineTo(10, 15);
    ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'white'; ctx.stroke();
    ctx.restore();
  };

  const drawStar = (ctx: CanvasRenderingContext2D, cx: number, cy: number, spikes: number, outerRadius: number, innerRadius: number, color: string) => {
      let rot = Math.PI / 2 * 3;
      let x = cx;
      let y = cy;
      let step = Math.PI / spikes;

      ctx.beginPath();
      ctx.moveTo(cx, cy - outerRadius);
      for (let i = 0; i < spikes; i++) {
        x = cx + Math.cos(rot) * outerRadius;
        y = cy + Math.sin(rot) * outerRadius;
        ctx.lineTo(x, y);
        rot += step;

        x = cx + Math.cos(rot) * innerRadius;
        y = cy + Math.sin(rot) * innerRadius;
        ctx.lineTo(x, y);
        rot += step;
      }
      ctx.lineTo(cx, cy - outerRadius);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !beatmap.audioBuffer) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const scale = Math.min(window.innerWidth / OSU_RES_X, window.innerHeight / OSU_RES_Y) * 0.8;
      transform.current = {
        scale,
        offsetX: (window.innerWidth - OSU_RES_X * scale) / 2,
        offsetY: (window.innerHeight - OSU_RES_Y * scale) / 2
      };
      // Initialize cursor center
      mouseState.current = { x: window.innerWidth / 2, y: window.innerHeight / 2, isDown: false };
      visualMouse.current = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    };
    resize();
    window.addEventListener('resize', resize);

    const source = audioCtx.createBufferSource();
    source.buffer = beatmap.audioBuffer;
    source.connect(audioCtx.destination);
    startTimeRef.current = audioCtx.currentTime + 0.5;
    source.start(startTimeRef.current);
    audioSourceRef.current = source;

    // --- DRAW LOOP ---
    const draw = () => {
      const currentTime = (audioCtx.currentTime - startTimeRef.current) * 1000 - AUDIO_OFFSET;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Interpolate visual mouse towards raw mouse input
      // Increased from 0.15 to 0.67 for much snappier response
      const smoothingFactor = 0.67; 
      visualMouse.current.x = lerp(visualMouse.current.x, mouseState.current.x, smoothingFactor);
      visualMouse.current.y = lerp(visualMouse.current.y, mouseState.current.y, smoothingFactor);
      
      let allDone = true;

      if (beatmap.mode === GameMode.STANDARD) {
          // --- STANDARD MODE RENDER ---
          const t = transform.current;
          const m = visualMouse.current; // Use smooth position for rendering
          const list = objects.current;

          for (let i = nextHittableIndex.current; i < list.length; i++) {
            const obj = list[i];
            if ((obj.type === HitObjectType.CIRCLE && (obj.hit || obj.missed)) || (obj.type !== HitObjectType.CIRCLE && currentTime > obj.endTime + 200)) {
               if (i === nextHittableIndex.current) nextHittableIndex.current++;
               continue;
            }

            allDone = false;
            const timeUntilHit = obj.time - currentTime;
            if (timeUntilHit < -HIT_WINDOW_50 && !obj.hit && obj.type === HitObjectType.CIRCLE) {
              obj.missed = true;
              updateScore(0, 'miss');
              continue;
            }

            if (timeUntilHit <= approachTime) {
              const sx = obj.x * t.scale + t.offsetX;
              const sy = obj.y * t.scale + t.offsetY;
              const progress = Math.max(0, timeUntilHit / approachTime);

              if (obj.type === HitObjectType.CIRCLE || obj.type === HitObjectType.SLIDER) {
                if (obj.type === HitObjectType.SLIDER && obj.sliderPoints) {
                  const pLen = obj.sliderPoints.length - 1;
                  ctx.beginPath(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                  ctx.lineWidth = circleRadius * 2 * t.scale; ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
                  ctx.moveTo(sx, sy);
                  for (let pIdx = 1; pIdx <= pLen; pIdx++) ctx.lineTo(obj.sliderPoints[pIdx].x * t.scale + t.offsetX, obj.sliderPoints[pIdx].y * t.scale + t.offsetY);
                  ctx.stroke();

                   if (obj.slides && obj.slides > 1) {
                    const oneSlideDuration = (obj.endTime - obj.time) / obj.slides;
                    const slideIndex = Math.floor((currentTime - obj.time) / oneSlideDuration);
                    if (slideIndex < obj.slides - 1) {
                      const atEnd = (slideIndex % 2 === 0);
                      const pt = atEnd ? obj.sliderPoints[pLen] : obj.sliderPoints[0];
                      const prevPt = atEnd ? obj.sliderPoints[pLen-1] : obj.sliderPoints[1];
                      drawRepeatArrow(ctx, pt.x * t.scale + t.offsetX, pt.y * t.scale + t.offsetY, Math.atan2(pt.y - prevPt.y, pt.x - prevPt.x), t.scale, Math.min(1, (approachTime - timeUntilHit) / 200));
                    }
                  }

                  if (currentTime >= obj.time && currentTime <= obj.endTime) {
                    const oneSlideDuration = (obj.endTime - obj.time) / (obj.slides || 1);
                    const slideProg = ((currentTime - obj.time) % oneSlideDuration) / oneSlideDuration;
                    const visualProg = (Math.floor((currentTime - obj.time) / oneSlideDuration) % 2 === 1) ? 1 - slideProg : slideProg;
                    const pos = visualProg * pLen; const idx = Math.floor(pos); const nextIdx = Math.min(idx + 1, pLen); const sub = pos % 1;
                    const bx = (obj.sliderPoints[idx].x + (obj.sliderPoints[nextIdx].x - obj.sliderPoints[idx].x) * sub) * t.scale + t.offsetX;
                    const by = (obj.sliderPoints[idx].y + (obj.sliderPoints[nextIdx].y - obj.sliderPoints[idx].y) * sub) * t.scale + t.offsetY;
                    ctx.beginPath(); ctx.arc(bx, by, circleRadius * 0.9 * t.scale, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'; ctx.fill();
                    // Hit logic for sliding
                    if (mouseState.current.isDown && Math.sqrt((m.x - bx) ** 2 + (m.y - by) ** 2) <= circleRadius * 2.5 * t.scale) {
                      if (!obj.hit) { obj.hit = true; updateScore(300, '300'); }
                    }
                  }
                }

                if (currentTime <= obj.time || obj.type === HitObjectType.SLIDER) {
                  const alpha = Math.min(1, (approachTime - timeUntilHit) / 200);
                  ctx.globalAlpha = alpha;
                  
                  if (skinImages.current.hitcircle) {
                    const size = circleRadius * 2 * t.scale;
                    ctx.drawImage(skinImages.current.hitcircle, sx - size/2, sy - size/2, size, size);
                  } else {
                    ctx.beginPath(); ctx.arc(sx, sy, circleRadius * t.scale, 0, Math.PI * 2);
                    ctx.fillStyle = COLORS.accent; ctx.fill(); ctx.strokeStyle = 'white'; ctx.lineWidth = 3; ctx.stroke();
                  }
                  
                  ctx.fillStyle = 'white'; ctx.font = `bold ${Math.floor(20 * t.scale)}px "Exo 2"`;
                  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                  ctx.fillText((obj.id % 9 + 1).toString(), sx, sy);

                  if (progress > 0) {
                      ctx.beginPath(); ctx.arc(sx, sy, Math.max(circleRadius * t.scale, (circleRadius + progress * circleRadius * 2) * t.scale), 0, Math.PI * 2);
                      ctx.strokeStyle = `rgba(255, 255, 255, ${Math.max(0, 1 - progress)})`; ctx.lineWidth = 2; ctx.stroke();
                  }
                  ctx.globalAlpha = 1;
                }
              } else if (obj.type === HitObjectType.SPINNER) {
                 const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
                 const rBase = 160 * t.scale;
                 if (currentTime >= obj.time && currentTime <= obj.endTime) {
                    const dx = m.x - cx, dy = m.y - cy, angle = Math.atan2(dy, dx);
                    const now = Date.now();
                    const deltaT = now - spinnerState.current.lastTime;
                    if (mouseState.current.isDown) {
                       const deltaAngle = Math.atan2(Math.sin(angle - spinnerState.current.lastAngle), Math.cos(angle - spinnerState.current.lastAngle));
                       spinnerState.current.totalRotation += Math.abs(deltaAngle);
                       spinnerState.current.currentAngle += deltaAngle;
                       if (deltaT > 0) {
                          const currentRPM = (Math.abs(deltaAngle) / (Math.PI * 2)) / (deltaT / 60000);
                          spinnerState.current.rpm = spinnerState.current.rpm * 0.9 + currentRPM * 0.1;
                       }
                       if (spinnerState.current.totalRotation > Math.PI * 8 && !obj.wasSpun) {
                          obj.wasSpun = true; obj.hit = true; updateScore(300, '300');
                       }
                    } else spinnerState.current.rpm *= 0.95;
                    spinnerState.current.lastAngle = angle; spinnerState.current.lastTime = now;
                    // Visuals
                    ctx.save(); ctx.translate(cx, cy); ctx.rotate(spinnerState.current.currentAngle);
                    ctx.fillStyle = 'white'; ctx.beginPath(); ctx.arc(0,0, 6 * t.scale, 0, Math.PI*2); ctx.fill(); ctx.restore();
                    const sProg = (currentTime - obj.time) / (obj.endTime - obj.time);
                    ctx.beginPath(); ctx.arc(cx, cy, rBase, -Math.PI/2, (-Math.PI/2) + (Math.PI * 2 * (1 - sProg)));
                    ctx.strokeStyle = COLORS.accent; ctx.lineWidth = 12 * t.scale; ctx.stroke();
                    if (obj.wasSpun) { ctx.fillStyle = '#ffcc00'; ctx.fillText("CLEAR!", cx, cy + rBase - 40 * t.scale); }
                 }
              }
            } else break;
          }

          // --- CURSOR TRAIL LOGIC ---
          const now = Date.now();
          // Push current VISUAL mouse position to history
          cursorHistory.current.push({ x: m.x, y: m.y, time: now });
          cursorHistory.current = cursorHistory.current.filter(p => now - p.time < 120);

          // Draw trail
          if (skinImages.current.cursorTrail) {
             const tImg = skinImages.current.cursorTrail;
             cursorHistory.current.forEach(p => {
                 const age = now - p.time;
                 const opacity = 1 - (age / 120);
                 if (opacity > 0) {
                     ctx.globalAlpha = opacity * 0.6; // Slightly transparent trail
                     const tSize = 80 * t.scale; 
                     ctx.drawImage(tImg, p.x - tSize/2, p.y - tSize/2, tSize, tSize);
                 }
             });
          } else {
             // Default generic trail
             cursorHistory.current.forEach(p => {
                 const age = now - p.time;
                 const life = 1 - (age / 120);
                 if (life > 0) {
                     ctx.globalAlpha = life * 0.4;
                     ctx.beginPath();
                     ctx.arc(p.x, p.y, (16 * t.scale) * life, 0, Math.PI * 2);
                     ctx.fillStyle = '#ff66aa';
                     ctx.fill();
                 }
             });
          }
          ctx.globalAlpha = 1;

          // Main Cursor (drawn at visual position m)
          if (skinImages.current.cursor) {
            const cSize = 110 * t.scale; 
            ctx.drawImage(skinImages.current.cursor, m.x - cSize/2, m.y - cSize/2, cSize, cSize);
          } else {
            ctx.beginPath(); ctx.arc(m.x, m.y, 16 * t.scale, 0, Math.PI * 2); ctx.fillStyle = 'white'; ctx.fill();
            ctx.beginPath(); ctx.arc(m.x, m.y, 24 * t.scale, 0, Math.PI * 2); ctx.strokeStyle = 'white'; ctx.lineWidth = 3; ctx.stroke();
          }

      } else if (beatmap.mode === GameMode.TAIKO) {
          // --- TAIKO MODE RENDER ---
          const t = transform.current;
          const list = objects.current;
          
          // 1. Draw Background (Orange with stars)
          const grad = ctx.createLinearGradient(0, 0, 0, TAIKO_TOP_HEIGHT);
          grad.addColorStop(0, '#ffaa00');
          grad.addColorStop(1, '#ff6600');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, window.innerWidth, TAIKO_TOP_HEIGHT);

          // Stars pattern
          ctx.save();
          for(let s=0; s<10; s++) {
             drawStar(ctx, 100 + s * 150, 40 + (s%2)*30, 5, 15, 7, 'rgba(255,255,255,0.4)');
             drawStar(ctx, 50 + s * 150, 80 + (s%3)*10, 5, 10, 5, 'rgba(255,255,255,0.3)');
          }
          ctx.restore();

          // 2. Draw Track
          const trackY = TAIKO_TOP_HEIGHT;
          ctx.fillStyle = '#111';
          ctx.fillRect(0, trackY, window.innerWidth, TAIKO_TRACK_HEIGHT);
          
          // Track borders
          ctx.strokeStyle = '#333';
          ctx.lineWidth = 4;
          ctx.beginPath(); ctx.moveTo(0, trackY); ctx.lineTo(window.innerWidth, trackY); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, trackY + TAIKO_TRACK_HEIGHT); ctx.lineTo(window.innerWidth, trackY + TAIKO_TRACK_HEIGHT); ctx.stroke();

          // Hit Circle (Judgement Line)
          const drumY = trackY + TAIKO_TRACK_HEIGHT / 2;
          ctx.beginPath();
          ctx.arc(TAIKO_HIT_X, drumY, TAIKO_NOTE_SIZE / 2 + 2, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255,255,255,0.6)';
          ctx.lineWidth = 3;
          ctx.stroke();

          // 3. Draw Left Panel (Mascot & Drum UI)
          const panelWidth = 200;
          ctx.fillStyle = '#ff3366'; // Pink
          ctx.fillRect(0, 0, panelWidth, TAIKO_TOP_HEIGHT + TAIKO_TRACK_HEIGHT);
          ctx.strokeStyle = '#aa2244';
          ctx.lineWidth = 2;
          ctx.strokeRect(0, 0, panelWidth, TAIKO_TOP_HEIGHT + TAIKO_TRACK_HEIGHT);

          // Mascot (Placeholder for Pippidon)
          ctx.fillStyle = 'white';
          ctx.beginPath(); ctx.arc(panelWidth/2, TAIKO_TOP_HEIGHT/2, 40, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = 'black';
          ctx.beginPath(); ctx.arc(panelWidth/2 - 15, TAIKO_TOP_HEIGHT/2 - 5, 5, 0, Math.PI*2); ctx.fill();
          ctx.beginPath(); ctx.arc(panelWidth/2 + 15, TAIKO_TOP_HEIGHT/2 - 5, 5, 0, Math.PI*2); ctx.fill();
          ctx.beginPath(); ctx.arc(panelWidth/2, TAIKO_TOP_HEIGHT/2 + 10, 5, 0, Math.PI*2); ctx.fill(); 
          
          // Drum Input Display (Left Panel)
          const ds = taikoDrumState.current;
          const drumDisplayX = panelWidth / 2;
          const drumDisplayY = trackY + TAIKO_TRACK_HEIGHT / 2;
          const dRad = 45;

          // Outer (Blue)
          ctx.beginPath(); ctx.arc(drumDisplayX, drumDisplayY, dRad, Math.PI/2, Math.PI*1.5); // Left half
          ctx.fillStyle = ds.leftOuter ? '#66ccff' : '#336699'; ctx.fill(); ctx.strokeStyle='white'; ctx.stroke();

          ctx.beginPath(); ctx.arc(drumDisplayX, drumDisplayY, dRad, Math.PI*1.5, Math.PI/2); // Right half
          ctx.fillStyle = ds.rightOuter ? '#66ccff' : '#336699'; ctx.fill(); ctx.strokeStyle='white'; ctx.stroke();

          // Inner (Red)
          const iRad = 25;
          ctx.beginPath(); ctx.arc(drumDisplayX, drumDisplayY, iRad, Math.PI/2, Math.PI*1.5); 
          ctx.fillStyle = ds.leftInner ? '#ff6666' : '#993333'; ctx.fill(); ctx.strokeStyle='white'; ctx.stroke();

          ctx.beginPath(); ctx.arc(drumDisplayX, drumDisplayY, iRad, Math.PI*1.5, Math.PI/2); 
          ctx.fillStyle = ds.rightInner ? '#ff6666' : '#993333'; ctx.fill(); ctx.strokeStyle='white'; ctx.stroke();

          // 4. Draw Objects (Scroll Right to Left)
          for (let i = nextHittableIndex.current; i < list.length; i++) {
             const obj = list[i];
             if (obj.hit || obj.missed) {
                 if (i === nextHittableIndex.current) nextHittableIndex.current++;
                 continue;
             }
             
             const x = TAIKO_HIT_X + (obj.time - currentTime) * taikoScrollSpeed;
             
             if (x > window.innerWidth + 100) break;
             if (x < TAIKO_HIT_X - 100 && !obj.hit && !obj.missed && obj.type === HitObjectType.CIRCLE) {
                 obj.missed = true; 
                 updateScore(0, 'miss');
                 continue; 
             }

             const isBlue = (obj.hitSound & 2) || (obj.hitSound & 8);
             const isBig = (obj.hitSound & 4);
             const radius = (TAIKO_NOTE_SIZE / 2) * (isBig ? TAIKO_BIG_SCALE : 1);

             ctx.save();
             ctx.beginPath();
             ctx.rect(panelWidth, trackY, window.innerWidth - panelWidth, TAIKO_TRACK_HEIGHT);
             ctx.clip();

             if (obj.type === HitObjectType.CIRCLE) {
                 ctx.beginPath();
                 ctx.arc(x, drumY, radius, 0, Math.PI*2);
                 ctx.fillStyle = isBlue ? '#3399cc' : '#eb4f4f'; 
                 ctx.fill();
                 ctx.strokeStyle = 'white'; ctx.lineWidth = 3; ctx.stroke();
                 
                 ctx.fillStyle = 'rgba(255,255,255,0.9)';
                 ctx.beginPath(); ctx.arc(x, drumY, radius * 0.5, 0, Math.PI*2); ctx.fill();

             } else if (obj.type === HitObjectType.SLIDER) {
                 const endX = TAIKO_HIT_X + (obj.endTime - currentTime) * taikoScrollSpeed;
                 const w = Math.max(0, endX - x);
                 ctx.fillStyle = '#ffcc00';
                 ctx.fillRect(x, drumY - radius, w, radius * 2);
                 ctx.strokeStyle = 'white'; ctx.lineWidth = 2; ctx.strokeRect(x, drumY - radius, w, radius * 2);
                 
                 ctx.beginPath(); ctx.arc(x, drumY, radius, 0, Math.PI*2); ctx.fillStyle='#ffcc00'; ctx.fill(); ctx.stroke();
                 ctx.beginPath(); ctx.arc(endX, drumY, radius, 0, Math.PI*2); ctx.fill(); ctx.stroke();

             } else if (obj.type === HitObjectType.SPINNER) {
                 const endX = TAIKO_HIT_X + (obj.endTime - currentTime) * taikoScrollSpeed;
                 const w = Math.max(50, endX - x);
                 ctx.fillStyle = 'white'; ctx.fillRect(x, drumY - radius*1.5, w, radius*3);
                 ctx.fillStyle = 'red'; ctx.font = "bold 20px Arial"; ctx.fillText("SPIN!", x + 10, drumY);
             }
             ctx.restore();
          }

          if (Date.now() - ds.lastHitTime < 100) {
              ctx.beginPath();
              ctx.arc(TAIKO_HIT_X, drumY, TAIKO_NOTE_SIZE/2 + 10, 0, Math.PI*2);
              ctx.fillStyle = 'rgba(255, 255, 200, 0.5)';
              ctx.fill();
          }

      } else if (beatmap.mode === GameMode.MANIA) {
          // --- MANIA MODE RENDER ---
          const list = objects.current;
          
          // Calculate centering
          const trackWidth = 4 * MANIA_COL_WIDTH;
          const trackX = (window.innerWidth - trackWidth) / 2;
          const hitY = window.innerHeight - MANIA_HIT_Y_OFFSET;

          // 1. Draw Track Background
          ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
          ctx.fillRect(trackX, 0, trackWidth, window.innerHeight);

          // 2. Draw Lane Lines
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
          ctx.lineWidth = 2;
          for (let i = 1; i < 4; i++) {
            ctx.beginPath();
            ctx.moveTo(trackX + i * MANIA_COL_WIDTH, 0);
            ctx.lineTo(trackX + i * MANIA_COL_WIDTH, window.innerHeight);
            ctx.stroke();
          }
          
          // Side borders
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 4;
          ctx.beginPath(); ctx.moveTo(trackX, 0); ctx.lineTo(trackX, window.innerHeight); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(trackX + trackWidth, 0); ctx.lineTo(trackX + trackWidth, window.innerHeight); ctx.stroke();

          // 3. Draw Judgement Line
          ctx.fillStyle = '#ff66aa';
          ctx.fillRect(trackX, hitY - 2, trackWidth, 4);

          // 4. Draw Key Receptors (Bottom)
          const keys = settings.keys.mania4k;
          for (let i = 0; i < 4; i++) {
             const kx = trackX + i * MANIA_COL_WIDTH;
             const isPressed = maniaKeyState.current[i];
             const receptorHeight = 60;
             const ky = hitY + 5;
             
             // Visual pressed state
             ctx.fillStyle = isPressed 
                ? 'rgba(255, 255, 255, 0.8)' 
                : 'rgba(0, 0, 0, 0.5)';
             ctx.fillRect(kx + 2, ky, MANIA_COL_WIDTH - 4, receptorHeight);
             
             ctx.strokeStyle = isPressed ? '#ff66aa' : 'white';
             ctx.lineWidth = 3;
             ctx.strokeRect(kx + 2, ky, MANIA_COL_WIDTH - 4, receptorHeight);
             
             // Draw Key Letter
             ctx.fillStyle = isPressed ? 'black' : 'white';
             ctx.font = 'bold 24px "Exo 2"';
             ctx.textAlign = 'center';
             ctx.textBaseline = 'middle';
             ctx.fillText(keys[i].toUpperCase(), kx + MANIA_COL_WIDTH / 2, ky + receptorHeight / 2);
             
             // Lighting effect column up
             if (isPressed) {
                const grad = ctx.createLinearGradient(0, hitY, 0, hitY - 300);
                grad.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
                grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
                ctx.fillStyle = grad;
                ctx.fillRect(kx, hitY - 300, MANIA_COL_WIDTH, 300);
             }
          }

          // 5. Draw Notes (Scroll Top to Bottom)
          for (let i = nextHittableIndex.current; i < list.length; i++) {
            const obj = list[i];
            if (obj.hit || obj.missed) {
                if (i === nextHittableIndex.current) nextHittableIndex.current++;
                continue;
            }

            // Map 0-512 X coords to 0-3 columns
            const col = Math.floor(obj.x * 4 / 512);
            if (col < 0 || col > 3) continue;

            const timeDiff = obj.time - currentTime;
            
            // Standard Down Scroll: 
            // y = hitY - (timeDiff * speed)
            // if timeDiff is positive (future), y is above hitY.
            const noteY = hitY - (timeDiff * maniaScrollSpeed);

            // Culling
            if (noteY < -200) break; // Still far up (assuming sorted list roughly) - wait, sorted by time, so higher time means higher up (smaller Y). 
            // Actually in osu, larger time = later. 
            // noteY = hitY - (positive val) -> smaller Y (upwards).
            // If noteY is way off screen top, we might stop processing if we assume time order.
            
            // Miss check (passed line)
            if (noteY > window.innerHeight + 50 && !obj.hit) {
               obj.missed = true;
               updateScore(0, 'miss');
               continue;
            }

            const kx = trackX + col * MANIA_COL_WIDTH;
            const noteHeight = 30; // standard note height

            // Render Hold Notes (Sliders)
            if (obj.type === HitObjectType.SLIDER) {
                const endTimeDiff = obj.endTime - currentTime;
                const endY = hitY - (endTimeDiff * maniaScrollSpeed);
                const height = noteY - endY;
                
                // Draw Body
                ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
                ctx.fillRect(kx + 4, endY, MANIA_COL_WIDTH - 8, height);
                
                // Draw End Cap
                ctx.fillStyle = 'white';
                ctx.fillRect(kx + 4, endY, MANIA_COL_WIDTH - 8, noteHeight / 2);
            }

            // Draw Note Head
            // Color pattern: White, Blue, Blue, White (standard 4K) or Pink/White
            const isPink = col === 1 || col === 2;
            ctx.fillStyle = isPink ? '#ff66aa' : '#ffffff';
            
            // Note Rect
            ctx.fillRect(kx + 2, noteY - noteHeight, MANIA_COL_WIDTH - 4, noteHeight);
            
            // Inner detail
            ctx.fillStyle = 'rgba(0,0,0,0.2)';
            ctx.fillRect(kx + 6, noteY - noteHeight + 4, MANIA_COL_WIDTH - 12, noteHeight - 8);
          }
      }

      if (allDone && currentTime > beatmap.duration) { onFinish(scoreRef.current); return; }
      requestRef.current = requestAnimationFrame(draw);
    };

    requestRef.current = requestAnimationFrame(draw);
    return () => { source.stop(); cancelAnimationFrame(requestRef.current); window.removeEventListener('resize', resize); };
  }, [beatmap, audioCtx, onFinish, approachTime, circleRadius, settings, taikoScrollSpeed, maniaScrollSpeed]);

  return (
    <div className={`relative w-full h-screen overflow-hidden ${beatmap.mode === GameMode.TAIKO ? '' : 'cursor-none'} bg-black`}>
      <div className="absolute inset-0 z-0 bg-cover bg-center opacity-40 pointer-events-none transition-all duration-500" style={{ backgroundImage: beatmap.backgroundUrl ? `url(${beatmap.backgroundUrl})` : 'none', transform: 'translateZ(0)' }} />
      <canvas ref={canvasRef} className="relative z-10 block w-full h-full bg-transparent" />
      <div className="absolute inset-0 z-20 pointer-events-none p-10 flex flex-col justify-between">
        {/* UI Overlay for Score - customized slightly for Taiko vs Standard if needed */}
        <div className="flex justify-between items-start">
           <div className="drop-shadow-[0_0_15px_rgba(0,0,0,0.8)]">
              <div className="text-7xl font-black italic tracking-tighter text-white tabular-nums"> {displayScore.totalScore.toLocaleString()} </div>
              <div className="text-3xl text-pink-400 font-black italic">{displayScore.accuracy.toFixed(2)}%</div>
           </div>
           <button onClick={onBack} className="pointer-events-auto bg-black/40 hover:bg-pink-600 px-8 py-4 rounded-2xl backdrop-blur-2xl border border-white/10 transition-all font-black italic text-sm hover:scale-110"> QUIT (ESC) </button>
        </div>
        
        {/* Progress Bar & Combo - hide for Taiko bottom area or adjust */}
        {beatmap.mode !== GameMode.TAIKO && beatmap.mode !== GameMode.MANIA && (
            <div className="flex items-end justify-between">
            <div className="text-9xl font-black italic text-white drop-shadow-[0_0_30px_rgba(0,0,0,0.8)] select-none"> {displayScore.combo > 1 && `${displayScore.combo}x`} </div>
            <div className="w-1/4 h-2 bg-white/10 rounded-full overflow-hidden border border-white/5">
                <div className="h-full bg-pink-500 transition-all duration-100" style={{ width: `${Math.max(0, Math.min(100, (audioCtx.currentTime - startTimeRef.current) * 1000 / beatmap.duration * 100))}%` }} />
            </div>
            </div>
        )}
        {/* Special Taiko/Mania Combo Display */}
        {(beatmap.mode === GameMode.TAIKO || beatmap.mode === GameMode.MANIA) && (
             <div className="absolute bottom-10 left-10">
                 <div className="text-8xl font-black italic text-white drop-shadow-[0_0_30px_rgba(0,0,0,0.8)] select-none"> {displayScore.combo > 1 && `${displayScore.combo}x`} </div>
             </div>
        )}
      </div>
    </div>
  );
};

export default GameCanvas;
