
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Beatmap, ScoreData, HitObject, HitObjectType } from '../types';
import { COLORS, HIT_WINDOW_300, HIT_WINDOW_100, HIT_WINDOW_50 } from '../constants';

interface GameCanvasProps {
  beatmap: Beatmap;
  audioCtx: AudioContext;
  onFinish: (score: ScoreData) => void;
  onBack: () => void;
}

const OSU_RES_X = 512;
const OSU_RES_Y = 384;

// Audio Latency Compensation (ms) - Kleiner Puffer für WebAudio Start-Verzögerung
const AUDIO_OFFSET = 25; 

const GameCanvas: React.FC<GameCanvasProps> = ({ beatmap, audioCtx, onFinish, onBack }) => {
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
  const spinnerRotation = useRef({ current: 0, lastAngle: 0, total: 0 });

  const [displayScore, setDisplayScore] = useState(scoreRef.current);

  // Berechnung der Approach Time basierend auf der offiziellen osu! Formel
  const getApproachTime = (ar: number) => {
    if (ar < 5) return 1200 + 600 * (5 - ar) / 5;
    if (ar === 5) return 1200;
    return 1200 - 750 * (ar - 5) / 5;
  };

  const approachTime = getApproachTime(beatmap.approachRate);
  // Kreisradius basierend auf CircleSize (CS)
  const circleRadius = (54.4 - 4.48 * beatmap.circleSize);

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
    // Synchronisierte Zeitnahme
    const currentTime = (audioCtx.currentTime - startTimeRef.current) * 1000 - AUDIO_OFFSET;
    const t = transform.current;
    const list = objects.current;
    
    // Wir prüfen nur die nächsten paar Objekte, um Performance zu sparen
    const searchLimit = Math.min(nextHittableIndex.current + 10, list.length);

    for (let i = nextHittableIndex.current; i < searchLimit; i++) {
      const obj = list[i];
      if (obj.hit || obj.missed) continue;
      
      const timeDiff = Math.abs(currentTime - obj.time);
      
      // Wenn das Objekt noch zu weit in der Zukunft liegt, abbrechen
      if (currentTime < obj.time - approachTime) break;

      const sx = obj.x * t.scale + t.offsetX;
      const sy = obj.y * t.scale + t.offsetY;
      const dist = Math.sqrt((clientX - sx) ** 2 + (clientY - sy) ** 2);

      const scaledRadius = circleRadius * t.scale * 1.2; // Etwas großzügigeres Padding wie in osu!

      if ((obj.type === HitObjectType.CIRCLE || obj.type === HitObjectType.SLIDER) && dist <= scaledRadius) {
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
    const move = (e: MouseEvent) => { 
      mouseState.current.x = e.clientX; 
      mouseState.current.y = e.clientY; 
    };
    const keydown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'z' || k === 'x' || k === 'y') {
        mouseState.current.isDown = true;
        handleInput(mouseState.current.x, mouseState.current.y);
      }
      if (e.key === 'Escape') onBack();
    };
    const keyup = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'z' || k === 'x' || k === 'y') mouseState.current.isDown = false;
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
    
    // 500ms Vorlaufzeit für Stabilität
    startTimeRef.current = audioCtx.currentTime + 0.5;
    source.start(startTimeRef.current);
    audioSourceRef.current = source;

    const draw = () => {
      // Zentraler Zeitstempel für diesen Frame
      const currentTime = (audioCtx.currentTime - startTimeRef.current) * 1000 - AUDIO_OFFSET;
      const t = transform.current;
      const m = mouseState.current;
      const list = objects.current;
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      let allDone = true;

      for (let i = nextHittableIndex.current; i < list.length; i++) {
        const obj = list[i];
        
        if ((obj.type === HitObjectType.CIRCLE && (obj.hit || obj.missed)) || (obj.type !== HitObjectType.CIRCLE && currentTime > obj.endTime + 100)) {
           if (i === nextHittableIndex.current) nextHittableIndex.current++;
           continue;
        }

        allDone = false;
        const timeUntilHit = obj.time - currentTime;

        // Miss detection
        if (timeUntilHit < -HIT_WINDOW_50 && !obj.hit && obj.type === HitObjectType.CIRCLE) {
          obj.missed = true;
          updateScore(0, 'miss');
          continue;
        }

        // Nur zeichnen, wenn das Objekt innerhalb des AR-Fensters liegt
        if (timeUntilHit <= approachTime) {
          const sx = obj.x * t.scale + t.offsetX;
          const sy = obj.y * t.scale + t.offsetY;
          const progress = Math.max(0, timeUntilHit / approachTime);

          if (obj.type === HitObjectType.CIRCLE || obj.type === HitObjectType.SLIDER) {
            // Slider Path
            if (obj.type === HitObjectType.SLIDER && obj.sliderPoints) {
              ctx.beginPath();
              ctx.lineCap = 'round';
              ctx.lineJoin = 'round';
              ctx.lineWidth = circleRadius * 2 * t.scale;
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
              ctx.moveTo(sx, sy);
              for (let pIdx = 1; pIdx < obj.sliderPoints.length; pIdx++) {
                ctx.lineTo(obj.sliderPoints[pIdx].x * t.scale + t.offsetX, obj.sliderPoints[pIdx].y * t.scale + t.offsetY);
              }
              ctx.stroke();
              
              // Slider Ball
              if (currentTime >= obj.time && currentTime <= obj.endTime) {
                const sliderProgress = (currentTime - obj.time) / (obj.endTime - obj.time);
                const pLen = obj.sliderPoints.length - 1;
                const pointIdx = Math.floor(sliderProgress * pLen);
                const nextPointIdx = Math.min(pointIdx + 1, pLen);
                const subProgress = (sliderProgress * pLen) % 1;
                
                const bX = (obj.sliderPoints[pointIdx].x + (obj.sliderPoints[nextPointIdx].x - obj.sliderPoints[pointIdx].x) * subProgress) * t.scale + t.offsetX;
                const bY = (obj.sliderPoints[pointIdx].y + (obj.sliderPoints[nextPointIdx].y - obj.sliderPoints[pointIdx].y) * subProgress) * t.scale + t.offsetY;
                
                ctx.beginPath();
                ctx.arc(bX, bY, circleRadius * 0.9 * t.scale, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                ctx.fill();

                // Tracking
                const ballDist = Math.sqrt((m.x - bX) ** 2 + (m.y - bY) ** 2);
                if (m.isDown && ballDist <= circleRadius * 2 * t.scale) {
                    if (!obj.hit) { obj.hit = true; updateScore(300, '300'); }
                }
              }
            }

            // Hit Circle (nur wenn noch nicht getroffen oder Slider)
            if (currentTime <= obj.time || obj.type === HitObjectType.SLIDER) {
              const alpha = Math.min(1, (approachTime - timeUntilHit) / 200); // Fade-in
              ctx.globalAlpha = alpha;

              ctx.beginPath();
              ctx.arc(sx, sy, circleRadius * t.scale, 0, Math.PI * 2);
              ctx.fillStyle = COLORS.accent;
              ctx.fill();
              ctx.strokeStyle = 'white';
              ctx.lineWidth = 3;
              ctx.stroke();

              ctx.fillStyle = 'white';
              ctx.font = `bold ${Math.floor(20 * t.scale)}px "Exo 2"`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText((obj.id % 9 + 1).toString(), sx, sy);

              // Approach Circle
              if (progress > 0) {
                ctx.beginPath();
                ctx.arc(sx, sy, Math.max(circleRadius * t.scale, (circleRadius + progress * circleRadius * 2) * t.scale), 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(255, 255, 255, ${Math.max(0, 1 - progress)})`;
                ctx.lineWidth = 2;
                ctx.stroke();
              }
              ctx.globalAlpha = 1;
            }
          } else if (obj.type === HitObjectType.SPINNER) {
             const cx = window.innerWidth / 2;
             const cy = window.innerHeight / 2;
             const r = 140 * t.scale;
             
             ctx.beginPath();
             ctx.arc(cx, cy, r, 0, Math.PI * 2);
             ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
             ctx.lineWidth = 8;
             ctx.stroke();

             if (currentTime >= obj.time && currentTime <= obj.endTime) {
                const dx = m.x - cx, dy = m.y - cy;
                const angle = Math.atan2(dy, dx);
                if (m.isDown) {
                   const delta = Math.atan2(Math.sin(angle - spinnerRotation.current.lastAngle), Math.cos(angle - spinnerRotation.current.lastAngle));
                   spinnerRotation.current.total += Math.abs(delta);
                   if (spinnerRotation.current.total > Math.PI * 6 && !obj.wasSpun) {
                      obj.wasSpun = true; obj.hit = true; updateScore(300, '300');
                   }
                }
                spinnerRotation.current.lastAngle = angle;
                const sProg = (currentTime - obj.time) / (obj.endTime - obj.time);
                ctx.beginPath();
                ctx.arc(cx, cy, r, -Math.PI/2, (-Math.PI/2) + (Math.PI * 2 * (1 - sProg)));
                ctx.strokeStyle = COLORS.accent;
                ctx.lineWidth = 10;
                ctx.stroke();
             }
          }
        } else {
          // Da HitObjects zeitlich sortiert sind, können wir die Schleife abbrechen
          break;
        }
      }

      if (allDone && currentTime > beatmap.duration) {
        onFinish(scoreRef.current);
        return;
      }
      requestRef.current = requestAnimationFrame(draw);
    };

    requestRef.current = requestAnimationFrame(draw);
    return () => {
      source.stop();
      cancelAnimationFrame(requestRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [beatmap, audioCtx, onFinish, approachTime, circleRadius]);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-black">
      <div 
        className="absolute inset-0 z-0 bg-cover bg-center opacity-40 pointer-events-none transition-all duration-500"
        style={{ 
          backgroundImage: beatmap.backgroundUrl ? `url(${beatmap.backgroundUrl})` : 'none',
          transform: 'translateZ(0)'
        }}
      />
      <canvas ref={canvasRef} className="relative z-10 block w-full h-full bg-transparent" />
      <div className="absolute inset-0 z-20 pointer-events-none p-10 flex flex-col justify-between">
        <div className="flex justify-between items-start">
           <div className="drop-shadow-[0_0_15px_rgba(0,0,0,0.8)]">
              <div className="text-7xl font-black italic tracking-tighter text-white tabular-nums">
                {displayScore.totalScore.toLocaleString()}
              </div>
              <div className="text-3xl text-pink-400 font-black italic">{displayScore.accuracy.toFixed(2)}%</div>
           </div>
           <button onClick={onBack} className="pointer-events-auto bg-black/40 hover:bg-pink-600 px-8 py-4 rounded-2xl backdrop-blur-2xl border border-white/10 transition-all font-black italic text-sm hover:scale-110">
             QUIT (ESC)
           </button>
        </div>
        <div className="flex items-end justify-between">
           <div className="text-9xl font-black italic text-white drop-shadow-[0_0_30px_rgba(0,0,0,0.8)] select-none">
             {displayScore.combo > 1 && `${displayScore.combo}x`}
           </div>
           <div className="w-1/4 h-2 bg-white/10 rounded-full overflow-hidden border border-white/5">
             <div className="h-full bg-pink-500 transition-all duration-100" 
               style={{ width: `${Math.max(0, Math.min(100, (audioCtx.currentTime - startTimeRef.current) * 1000 / beatmap.duration * 100))}%` }}
             />
           </div>
        </div>
      </div>
    </div>
  );
};

export default GameCanvas;
