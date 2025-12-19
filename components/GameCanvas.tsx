
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Beatmap, ScoreData, HitObject, HitObjectType, SkinData } from '../types';
import { COLORS, HIT_WINDOW_300, HIT_WINDOW_100, HIT_WINDOW_50 } from '../constants';

interface GameCanvasProps {
  beatmap: Beatmap;
  audioCtx: AudioContext;
  skin: SkinData | null;
  onFinish: (score: ScoreData) => void;
  onBack: () => void;
}

const OSU_RES_X = 512;
const OSU_RES_Y = 384;
const AUDIO_OFFSET = 25; 

const GameCanvas: React.FC<GameCanvasProps> = ({ beatmap, audioCtx, skin, onFinish, onBack }) => {
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
  const mouseState = useRef({ x: 0, y: 0, isDown: false });
  const spinnerState = useRef({ currentAngle: 0, lastAngle: 0, totalRotation: 0, rpm: 0, lastTime: 0 });
  const skinImages = useRef<Record<string, HTMLImageElement>>({});

  const [displayScore, setDisplayScore] = useState(scoreRef.current);

  const getApproachTime = (ar: number) => {
    if (ar < 5) return 1200 + 600 * (5 - ar) / 5;
    if (ar === 5) return 1200;
    return 1200 - 750 * (ar - 5) / 5;
  };

  const approachTime = getApproachTime(beatmap.approachRate);
  const circleRadius = (54.4 - 4.48 * beatmap.circleSize);

  useEffect(() => {
    if (!skin) return;
    Object.entries(skin).forEach(([key, url]) => {
      if (url) {
        const img = new Image();
        // Fixed: cast url as string to avoid type error where Object.entries returns unknown values
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

  const handleInput = useCallback((clientX: number, clientY: number) => {
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

  useEffect(() => {
    const move = (e: MouseEvent) => { mouseState.current.x = e.clientX; mouseState.current.y = e.clientY; };
    const keydown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'z' || k === 'x') {
        mouseState.current.isDown = true;
        handleInput(mouseState.current.x, mouseState.current.y);
      }
      if (e.key === 'Escape') onBack();
    };
    const keyup = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'z' || k === 'x') mouseState.current.isDown = false;
    };
    const mousedown = (e: MouseEvent) => {
      mouseState.current.isDown = true;
      handleInput(e.clientX, e.clientY);
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
  }, [handleInput, onBack]);

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
    };
    resize();
    window.addEventListener('resize', resize);

    const source = audioCtx.createBufferSource();
    source.buffer = beatmap.audioBuffer;
    source.connect(audioCtx.destination);
    startTimeRef.current = audioCtx.currentTime + 0.5;
    source.start(startTimeRef.current);
    audioSourceRef.current = source;

    const draw = () => {
      const currentTime = (audioCtx.currentTime - startTimeRef.current) * 1000 - AUDIO_OFFSET;
      const t = transform.current;
      const m = mouseState.current;
      const list = objects.current;
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let allDone = true;

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
                if (m.isDown && Math.sqrt((m.x - bx) ** 2 + (m.y - by) ** 2) <= circleRadius * 2.5 * t.scale) {
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
                if (skinImages.current.approachcircle) {
                  const size = (circleRadius * 2 + progress * circleRadius * 4) * t.scale;
                  ctx.globalAlpha = Math.max(0, 1 - progress);
                  ctx.drawImage(skinImages.current.approachcircle, sx - size/2, sy - size/2, size, size);
                } else {
                  ctx.beginPath(); ctx.arc(sx, sy, Math.max(circleRadius * t.scale, (circleRadius + progress * circleRadius * 2) * t.scale), 0, Math.PI * 2);
                  ctx.strokeStyle = `rgba(255, 255, 255, ${Math.max(0, 1 - progress)})`; ctx.lineWidth = 2; ctx.stroke();
                }
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
                
                if (m.isDown) {
                   const deltaAngle = Math.atan2(Math.sin(angle - spinnerState.current.lastAngle), Math.cos(angle - spinnerState.current.lastAngle));
                   spinnerState.current.totalRotation += Math.abs(deltaAngle);
                   spinnerState.current.currentAngle += deltaAngle;
                   
                   if (deltaT > 0) {
                      const currentRPM = (Math.abs(deltaAngle) / (Math.PI * 2)) / (deltaT / 60000);
                      spinnerState.current.rpm = spinnerState.current.rpm * 0.9 + currentRPM * 0.1;
                   }

                   const requiredRotation = Math.PI * 8; 
                   if (spinnerState.current.totalRotation > requiredRotation && !obj.wasSpun) {
                      obj.wasSpun = true; obj.hit = true; updateScore(300, '300');
                   }
                } else {
                  spinnerState.current.rpm *= 0.95;
                }
                
                spinnerState.current.lastAngle = angle;
                spinnerState.current.lastTime = now;

                // Visual Spinner Core
                ctx.save();
                ctx.translate(cx, cy);
                ctx.rotate(spinnerState.current.currentAngle);
                
                // Glow Effect
                const grad = ctx.createRadialGradient(0,0,0, 0,0, rBase * 0.4);
                grad.addColorStop(0, 'rgba(255,255,255,0.8)');
                grad.addColorStop(1, 'rgba(255,102,170,0)');
                ctx.fillStyle = grad;
                ctx.beginPath(); ctx.arc(0,0, rBase*0.4, 0, Math.PI*2); ctx.fill();
                
                // Spinner Center Point
                ctx.fillStyle = 'white';
                ctx.beginPath(); ctx.arc(0,0, 6 * t.scale, 0, Math.PI*2); ctx.fill();
                ctx.restore();

                // Progress Ring
                const sProg = (currentTime - obj.time) / (obj.endTime - obj.time);
                ctx.beginPath();
                ctx.arc(cx, cy, rBase, -Math.PI/2, (-Math.PI/2) + (Math.PI * 2 * (1 - sProg)));
                ctx.strokeStyle = COLORS.accent; ctx.lineWidth = 12 * t.scale; ctx.lineCap = 'round'; ctx.stroke();
                
                // RPM & Text
                ctx.fillStyle = 'white';
                ctx.font = `900 italic ${Math.floor(40 * t.scale)}px "Exo 2"`;
                ctx.textAlign = 'center';
                ctx.fillText(Math.floor(spinnerState.current.rpm).toString(), cx, cy + rBase + 60 * t.scale);
                ctx.font = `700 italic ${Math.floor(14 * t.scale)}px "Exo 2"`;
                ctx.fillStyle = 'rgba(255,255,255,0.5)';
                ctx.fillText("RPM", cx, cy + rBase + 85 * t.scale);

                if (obj.wasSpun) {
                  ctx.fillStyle = '#ffcc00';
                  ctx.font = `900 italic ${Math.floor(30 * t.scale)}px "Exo 2"`;
                  ctx.fillText("CLEAR!", cx, cy + rBase - 40 * t.scale);
                }
             }
          }
        } else break;
      }

      // Cursor
      if (skinImages.current.cursor) {
        const cSize = 40 * t.scale;
        ctx.drawImage(skinImages.current.cursor, m.x - cSize/2, m.y - cSize/2, cSize, cSize);
      } else {
        ctx.beginPath(); ctx.arc(m.x, m.y, 8 * t.scale, 0, Math.PI * 2); ctx.fillStyle = 'white'; ctx.fill();
        ctx.beginPath(); ctx.arc(m.x, m.y, 12 * t.scale, 0, Math.PI * 2); ctx.strokeStyle = 'white'; ctx.lineWidth = 2; ctx.stroke();
      }

      if (allDone && currentTime > beatmap.duration) { onFinish(scoreRef.current); return; }
      requestRef.current = requestAnimationFrame(draw);
    };

    requestRef.current = requestAnimationFrame(draw);
    return () => { source.stop(); cancelAnimationFrame(requestRef.current); window.removeEventListener('resize', resize); };
  }, [beatmap, audioCtx, onFinish, approachTime, circleRadius]);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-black cursor-none">
      <div className="absolute inset-0 z-0 bg-cover bg-center opacity-40 pointer-events-none transition-all duration-500" style={{ backgroundImage: beatmap.backgroundUrl ? `url(${beatmap.backgroundUrl})` : 'none', transform: 'translateZ(0)' }} />
      <canvas ref={canvasRef} className="relative z-10 block w-full h-full bg-transparent" />
      <div className="absolute inset-0 z-20 pointer-events-none p-10 flex flex-col justify-between">
        <div className="flex justify-between items-start">
           <div className="drop-shadow-[0_0_15px_rgba(0,0,0,0.8)]">
              <div className="text-7xl font-black italic tracking-tighter text-white tabular-nums"> {displayScore.totalScore.toLocaleString()} </div>
              <div className="text-3xl text-pink-400 font-black italic">{displayScore.accuracy.toFixed(2)}%</div>
           </div>
           <button onClick={onBack} className="pointer-events-auto bg-black/40 hover:bg-pink-600 px-8 py-4 rounded-2xl backdrop-blur-2xl border border-white/10 transition-all font-black italic text-sm hover:scale-110"> QUIT (ESC) </button>
        </div>
        <div className="flex items-end justify-between">
           <div className="text-9xl font-black italic text-white drop-shadow-[0_0_30px_rgba(0,0,0,0.8)] select-none"> {displayScore.combo > 1 && `${displayScore.combo}x`} </div>
           <div className="w-1/4 h-2 bg-white/10 rounded-full overflow-hidden border border-white/5">
             <div className="h-full bg-pink-500 transition-all duration-100" style={{ width: `${Math.max(0, Math.min(100, (audioCtx.currentTime - startTimeRef.current) * 1000 / beatmap.duration * 100))}%` }} />
           </div>
        </div>
      </div>
    </div>
  );
};

export default GameCanvas;
