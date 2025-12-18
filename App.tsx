
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { GameState, Beatmap, ScoreData, BeatmapSet } from './types';
import { generateSampleBeatmap } from './utils/gameLogic';
import { loadOsz } from './utils/beatmapParser';
import GameCanvas from './components/GameCanvas';

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(GameState.MENU);
  const [allBeatmaps, setAllBeatmaps] = useState<Beatmap[]>([]);
  const [selectedSet, setSelectedSet] = useState<BeatmapSet | null>(null);
  const [selectedMap, setSelectedMap] = useState<Beatmap | null>(null);
  const [lastScore, setLastScore] = useState<ScoreData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  const audioCtxRef = useRef<AudioContext | null>(null);
  const previewSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const getAudioCtx = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioCtxRef.current;
  };

  const stopPreview = () => {
    if (previewSourceRef.current) {
      try {
        previewSourceRef.current.stop();
      } catch (e) {}
      previewSourceRef.current = null;
    }
  };

  useEffect(() => {
    if (gameState !== GameState.MENU) {
      stopPreview();
      return;
    }

    if (selectedSet && selectedSet.difficulties.length > 0) {
      const bestMap = selectedSet.difficulties[0];
      if (bestMap.audioBuffer) {
        stopPreview();
        const ctx = getAudioCtx();
        const source = ctx.createBufferSource();
        source.buffer = bestMap.audioBuffer;
        source.connect(ctx.destination);
        source.loop = true;
        
        const startTime = (bestMap.previewTime || 0) / 1000;
        source.start(0, startTime);
        previewSourceRef.current = source;
      }
    }

    return () => stopPreview();
  }, [selectedSet, gameState]);

  const beatmapSets = useMemo(() => {
    const sets: Record<string, BeatmapSet> = {};
    [...allBeatmaps].forEach(m => {
      const key = `${m.artist}-${m.title}`;
      if (!sets[key]) {
        sets[key] = { 
          title: m.title, 
          artist: m.artist, 
          creator: m.creator || "Unknown",
          backgroundUrl: m.backgroundUrl, 
          difficulties: [] 
        };
      }
      // Sicherstellen, dass Hintergrund übernommen wird, falls der erste Eintrag keinen hatte
      if (!sets[key].backgroundUrl && m.backgroundUrl) {
        sets[key].backgroundUrl = m.backgroundUrl;
      }
      sets[key].difficulties.push(m);
    });
    Object.values(sets).forEach(s => s.difficulties.sort((a, b) => a.difficultyValue - b.difficultyValue));
    return Object.values(sets);
  }, [allBeatmaps]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsLoading(true);
    try {
      const maps = await loadOsz(file, getAudioCtx());
      setAllBeatmaps(prev => [...maps, ...prev]);
    } catch (err) {
      alert("Error loading .osz file.");
    } finally {
      setIsLoading(false);
    }
  };

  const startMap = (map: Beatmap) => {
    stopPreview();
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    setSelectedMap(map);
    setGameState(GameState.PLAYING);
  };

  return (
    <div className="w-full h-screen bg-[#0d0d0d] text-white overflow-hidden font-['Exo_2']">
      {gameState === GameState.MENU && (
        <div className="flex h-full relative">
          <div className="absolute inset-0 z-0 opacity-25 blur-lg scale-110 transition-all duration-1000">
            {selectedSet?.backgroundUrl && <img src={selectedSet.backgroundUrl} className="w-full h-full object-cover" alt="" />}
          </div>

          <a 
            href="https://github.com/justinsanjp/osuwebengine" 
            target="_blank" 
            rel="noopener noreferrer"
            className="absolute top-8 right-8 z-50 p-2 bg-white/5 hover:bg-white/20 rounded-full transition-all border border-white/10 hover:scale-110"
            title="GitHub Repository"
          >
            <svg height="24" width="24" viewBox="0 0 16 16" fill="white"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path></svg>
          </a>

          <div className="w-1/3 h-full z-10 flex flex-col p-12 bg-gradient-to-r from-black/90 via-black/60 to-transparent">
             <div className="mb-auto">
                <div className="relative inline-block pr-8">
                  <h1 className="text-8xl font-black italic tracking-tighter text-pink-500 drop-shadow-[0_0_30px_rgba(236,72,153,0.4)] mb-2 cursor-default relative">
                    OSU!JWE
                    <div className="absolute -top-1 -right-4 bg-pink-500 text-[11px] font-black text-white px-2 py-0.5 rounded shadow-[0_0_15px_rgba(236,72,153,0.8)] border border-pink-400 z-50 pointer-events-none transform skew-x-[-12deg] tracking-normal uppercase">
                      BETA
                    </div>
                  </h1>
                </div>
                <p className="text-xl font-bold tracking-widest text-pink-300/80 uppercase">Justin's Osu! Web Engine</p>
                <p className="text-[10px] text-white/30 uppercase tracking-tighter mt-1 max-w-xs leading-tight">
                  Disclaimer: This is a fan-made web clone and is not affiliated with, authorized, or endorsed by the official Osu! team or ppy Pty Ltd.
                </p>
             </div>

             {selectedSet ? (
               <div className="animate-in slide-in-from-left duration-300">
                  <h2 className="text-5xl font-black italic mb-1 leading-tight drop-shadow-md">{selectedSet.title}</h2>
                  <p className="text-2xl text-pink-400 font-bold mb-1 drop-shadow-md">{selectedSet.artist}</p>
                  <p className="text-sm text-white/40 font-bold italic mb-8 uppercase tracking-widest">Beatmap By {selectedSet.creator}</p>
                  
                  <div className="space-y-4 max-h-[40vh] overflow-y-auto pr-4 custom-scrollbar">
                    {selectedSet.difficulties.map(d => (
                      <div 
                        key={d.id}
                        onClick={() => startMap(d)}
                        className={`group p-4 rounded-xl cursor-pointer transition-all border ${selectedMap?.id === d.id ? 'bg-pink-600 border-pink-400 shadow-lg' : 'bg-white/5 border-white/5 hover:bg-white/10 hover:translate-x-2'}`}
                      >
                         <div className="flex justify-between items-center">
                            <span className="font-black italic text-xl">{d.difficulty}</span>
                            <span className="text-xs bg-black/30 px-2 py-1 rounded">★ {d.difficultyValue.toFixed(2)}</span>
                         </div>
                      </div>
                    ))}
                  </div>
               </div>
             ) : (
               <div className="text-white/20 text-xl font-black italic">Select a beatmap to see details</div>
             )}

             <div className="mt-12 flex gap-4">
                <label className="flex-1 bg-pink-600 hover:bg-pink-500 p-4 rounded-2xl cursor-pointer text-center font-black italic transition-all shadow-lg active:scale-95 group">
                   <span className="group-hover:scale-110 inline-block transition-transform">IMPORT .OSZ</span>
                   <input type="file" accept=".osz" onChange={handleFileUpload} className="hidden" />
                </label>
             </div>
          </div>

          <div className="w-2/3 h-full z-10 p-12 overflow-y-auto custom-scrollbar bg-black/20 backdrop-blur-sm">
             <div className="grid grid-cols-1 gap-4">
                {isLoading && <div className="p-8 text-center text-pink-500 font-black italic animate-pulse text-2xl">EXTRACTING BEATMAP DATA...</div>}
                
                {beatmapSets.map((set, i) => (
                  <div 
                    key={i}
                    onClick={() => { setSelectedSet(set); setSelectedMap(null); }}
                    className={`group relative overflow-hidden rounded-2xl transition-all cursor-pointer ${selectedSet?.title === set.title ? 'ring-4 ring-pink-500 scale-[1.02] shadow-2xl' : 'hover:scale-[1.01] hover:bg-white/5'}`}
                  >
                    <div className="absolute inset-0 bg-cover bg-center opacity-30 group-hover:opacity-50 transition-opacity" style={{ backgroundImage: set.backgroundUrl ? `url(${set.backgroundUrl})` : 'none' }} />
                    <div className="absolute inset-0 bg-gradient-to-r from-black via-black/60 to-transparent" />
                    
                    <div className="relative p-6 flex items-center gap-6">
                       <div className="w-2 h-16 bg-pink-500 rounded-full shadow-[0_0_15px_rgba(236,72,153,0.5)]" />
                       <div className="flex-1">
                          <h3 className="text-3xl font-black italic truncate max-w-md">{set.title}</h3>
                          <div className="flex items-center gap-2">
                            <p className="text-pink-400/80 font-bold uppercase tracking-wider text-sm">{set.artist}</p>
                            <span className="text-white/20 text-[10px] uppercase font-black">by {set.creator}</span>
                          </div>
                       </div>
                       <div className="ml-auto text-right">
                          <div className="text-xs uppercase font-black opacity-50 mb-1">Difficulties</div>
                          <div className="flex gap-1 justify-end">
                             {set.difficulties.map((_, idx) => <div key={idx} className="w-2 h-2 rounded-full bg-pink-400 shadow-[0_0_5px_rgba(236,72,153,0.5)]" />)}
                          </div>
                       </div>
                    </div>
                  </div>
                ))}

                {beatmapSets.length === 0 && !isLoading && (
                  <div className="p-20 text-center border-4 border-dashed border-white/5 rounded-[3rem] bg-white/5">
                     <div className="text-4xl font-black italic text-white/10">No beatmaps found</div>
                     <p className="text-white/10 font-bold mt-2 uppercase tracking-widest">Import an .osz file to start clicking circles</p>
                  </div>
                )}
             </div>
          </div>
        </div>
      )}

      {gameState === GameState.PLAYING && selectedMap && (
        <GameCanvas 
          beatmap={selectedMap} 
          audioCtx={getAudioCtx()}
          onFinish={(score) => { setLastScore(score); setGameState(GameState.RESULTS); }}
          onBack={() => setGameState(GameState.MENU)}
        />
      )}

      {gameState === GameState.RESULTS && lastScore && (
        <div className="h-full flex flex-col items-center justify-center bg-[#050505] p-8 animate-in fade-in zoom-in duration-500">
          <div className="bg-[#111] p-16 rounded-[4rem] border-4 border-pink-600 shadow-[0_0_100px_rgba(236,72,153,0.2)] w-full max-w-4xl">
            <h2 className="text-8xl font-black italic text-center mb-16 text-pink-500 drop-shadow-lg tracking-tighter">SUCCESS</h2>
            
            <div className="grid grid-cols-2 gap-12 mb-16">
               <div className="text-center">
                  <div className="text-8xl font-black italic text-white mb-2">{lastScore.totalScore.toLocaleString()}</div>
                  <div className="text-pink-400 font-black uppercase tracking-widest">Final Score</div>
               </div>
               <div className="text-center">
                  <div className="text-8xl font-black italic text-pink-300 mb-2">{lastScore.accuracy.toFixed(2)}%</div>
                  <div className="text-pink-400 font-black uppercase tracking-widest">Accuracy</div>
               </div>
            </div>

            <div className="grid grid-cols-4 gap-4 mb-16">
               {[
                 { label: '300s', val: lastScore.count300, color: 'text-blue-400' },
                 { label: '100s', val: lastScore.count100, color: 'text-green-400' },
                 { label: '50s', val: lastScore.count50, color: 'text-yellow-400' },
                 { label: 'Miss', val: lastScore.countMiss, color: 'text-red-500' }
               ].map(item => (
                 <div key={item.label} className="bg-black/40 p-6 rounded-3xl text-center border border-white/5">
                    <div className={`text-4xl font-black italic ${item.color}`}>{item.val}</div>
                    <div className="text-[10px] uppercase font-bold text-white/30 tracking-widest mt-1">{item.label}</div>
                 </div>
               ))}
            </div>

            <button 
              onClick={() => setGameState(GameState.MENU)}
              className="w-full bg-pink-600 hover:bg-pink-500 py-8 rounded-3xl text-3xl font-black italic transition-all transform hover:scale-[1.02] active:scale-95 shadow-2xl"
            >
              CONTINUE
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
