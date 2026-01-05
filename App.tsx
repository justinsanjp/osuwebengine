import React, { useState, useRef, useMemo, useEffect } from 'react';
import { GameState, Beatmap, ScoreData, BeatmapSet, SkinData, UserSettings, GameMode, Language } from './types';
import { loadOsz, loadOsk } from './utils/beatmapParser';
import { DEFAULT_SETTINGS, TRANSLATIONS } from './constants';
import GameCanvas from './components/GameCanvas';

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(GameState.MAIN_MENU);
  const [allBeatmaps, setAllBeatmaps] = useState<Beatmap[]>([]);
  const [selectedSet, setSelectedSet] = useState<BeatmapSet | null>(null);
  const [selectedMap, setSelectedMap] = useState<Beatmap | null>(null);
  const [lastScore, setLastScore] = useState<ScoreData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [activeSkin, setActiveSkin] = useState<SkinData | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  // Modals state
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  
  const [settings, setSettings] = useState<UserSettings>(() => {
    const saved = localStorage.getItem('osu_settings');
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
  });

  const [awaitingKey, setAwaitingKey] = useState<{mode: keyof UserSettings['keys'], index: number} | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const previewSourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Translation helper
  const t = (key: keyof typeof TRANSLATIONS['en']) => {
    return TRANSLATIONS[settings.language][key];
  };

  useEffect(() => {
    localStorage.setItem('osu_settings', JSON.stringify(settings));
  }, [settings]);

  // Check for first time visit (Language -> Welcome)
  useEffect(() => {
    const langSet = localStorage.getItem('osu_language_set');
    const welcomeShown = localStorage.getItem('osu_welcome_shown');

    if (!langSet) {
        setShowLanguageModal(true);
    } else if (!welcomeShown) {
        setShowWelcomeModal(true);
    }
  }, []);

  const handleLanguageSelect = (lang: Language) => {
      setSettings(prev => ({ ...prev, language: lang }));
      localStorage.setItem('osu_language_set', 'true');
      setShowLanguageModal(false);
      // If we just set the language, check if we need to show welcome modal next
      if (!localStorage.getItem('osu_welcome_shown')) {
          setShowWelcomeModal(true);
      }
  };

  const getAudioCtx = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioCtxRef.current;
  };

  const stopPreview = () => {
    if (previewSourceRef.current) {
      try { previewSourceRef.current.stop(); } catch (e) {}
      previewSourceRef.current = null;
    }
  };

  const handleFiles = async (files: FileList | File[]) => {
    setIsLoading(true);
    const fileArray = Array.from(files);
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') await ctx.resume();
    
    for (const file of fileArray) {
      const ext = file.name.toLowerCase().split('.').pop();
      try {
        if (ext === 'osz') {
          const maps = await loadOsz(file, ctx);
          setAllBeatmaps(prev => [...maps, ...prev]);
        } else if (ext === 'osk') {
          const skin = await loadOsk(file);
          setActiveSkin(skin);
          console.log("Skin loaded successfully");
        }
      } catch (err) {
        console.error("Error processing file:", file.name, err);
      }
    }
    setIsLoading(false);
  };

  const handleDownloadRecommended = async () => {
    setShowWelcomeModal(false);
    setIsLoading(true);
    
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') await ctx.resume();

    const newMaps: Beatmap[] = [];
    let successCount = 0;

    try {
        console.log("Scanning beatmaps directory via list.json...");
        const listResponse = await fetch('/beatmaps/list.json');
        
        if (!listResponse.ok) {
            throw new Error("Could not find '/beatmaps/list.json'. Please create this file to list your beatmaps.");
        }

        const filenames: string[] = await listResponse.json();
        console.log(`Found ${filenames.length} beatmaps in list:`, filenames);

        for (const filename of filenames) {
            const url = `/beatmaps/${filename}`;
            try {
                console.log(`Downloading: ${url}`);
                const response = await fetch(url);
                if (response.ok) {
                    const blob = await response.blob();
                    const file = new File([blob], filename); 
                    const maps = await loadOsz(file, ctx);
                    
                    if (maps.length > 0) {
                        newMaps.push(...maps);
                        successCount++;
                    }
                } else {
                    console.warn(`Failed to download ${url}: ${response.status}`);
                }
            } catch (e) {
                console.warn(`Network error for ${url}`, e);
            }
        }

        if (newMaps.length > 0) {
            setAllBeatmaps(prev => [...newMaps, ...prev]);
            setTimeout(() => setGameState(GameState.SONG_SELECT), 100);
        } else {
            alert("No valid beatmaps found in the scanned files.");
            setGameState(GameState.SONG_SELECT);
        }

    } catch (err: any) {
        console.error(err);
        alert(`Error scanning beatmaps: ${err.message}`);
        setGameState(GameState.SONG_SELECT);
    }

    setIsLoading(false);
    localStorage.setItem('osu_welcome_shown', 'true');
  };

  const skipWelcome = () => {
    setShowWelcomeModal(false);
    localStorage.setItem('osu_welcome_shown', 'true');
  };

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = () => setIsDragging(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
  };

  useEffect(() => {
    if (gameState !== GameState.SONG_SELECT) { stopPreview(); return; }
    if (selectedSet && selectedSet.difficulties.length > 0) {
      const bestMap = selectedSet.difficulties[0];
      if (bestMap.audioBuffer) {
        stopPreview();
        const ctx = getAudioCtx();
        const source = ctx.createBufferSource();
        source.buffer = bestMap.audioBuffer;
        source.connect(ctx.destination);
        source.loop = true;
        source.start(0, (bestMap.previewTime || 0) / 1000);
        previewSourceRef.current = source;
      }
    }
    return () => stopPreview();
  }, [selectedSet, gameState]);

  useEffect(() => {
    if (!awaitingKey) return;
    const handleKey = (e: KeyboardEvent) => {
      e.preventDefault();
      const newSettings = { ...settings };
      newSettings.keys[awaitingKey.mode][awaitingKey.index] = e.key === " " ? "Space" : e.key.toLowerCase();
      setSettings(newSettings);
      setAwaitingKey(null);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [awaitingKey, settings]);

  const beatmapSets = useMemo(() => {
    const sets: Record<string, BeatmapSet> = {};
    allBeatmaps.forEach(m => {
      const key = `${m.artist}-${m.title}`;
      if (!sets[key]) sets[key] = { title: m.title, artist: m.artist, creator: m.creator || "Unknown", backgroundUrl: m.backgroundUrl, difficulties: [] };
      if (!sets[key].backgroundUrl && m.backgroundUrl) sets[key].backgroundUrl = m.backgroundUrl;
      sets[key].difficulties.push(m);
    });
    Object.values(sets).forEach(s => s.difficulties.sort((a, b) => a.difficultyValue - b.difficultyValue));
    return Object.values(sets);
  }, [allBeatmaps]);

  useEffect(() => {
    if (gameState === GameState.SONG_SELECT && !selectedSet && beatmapSets.length > 0) {
        setSelectedSet(beatmapSets[0]);
    }
  }, [gameState, beatmapSets, selectedSet]);

  const startMap = (map: Beatmap) => {
    stopPreview();
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    setSelectedMap(map);
    setGameState(GameState.PLAYING);
  };

  const getModeIcon = (mode: GameMode) => {
    switch(mode) {
      case GameMode.TAIKO: return '🥁';
      case GameMode.MANIA: return '🎹';
      case GameMode.CATCH: return '🍎';
      default: return '●';
    }
  };

  return (
    <div 
      className="w-full h-screen bg-[#0d0d0d] text-white overflow-hidden font-['Exo_2']"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {isDragging && (
        <div className="fixed inset-0 z-[100] bg-pink-600/40 backdrop-blur-md border-8 border-dashed border-white/50 flex items-center justify-center pointer-events-none animate-in fade-in duration-200">
           <div className="text-center">
              <div className="text-9xl mb-4">📥</div>
              <div className="text-6xl font-black italic tracking-tighter">{t('dropFiles')}</div>
           </div>
        </div>
      )}

      {/* Language Selection Modal (First Time) */}
      {showLanguageModal && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/95 backdrop-blur-xl animate-in fade-in zoom-in duration-500 p-6">
           <div className="bg-[#111] border-4 border-pink-600 p-10 rounded-[3rem] shadow-[0_0_100px_rgba(236,72,153,0.3)] max-w-lg w-full text-center relative overflow-hidden">
               <h2 className="text-3xl font-black italic text-white mb-8 uppercase drop-shadow-lg">{TRANSLATIONS.en.selectLang}</h2>
               <div className="flex flex-col gap-4">
                  <button onClick={() => handleLanguageSelect('en')} className="w-full bg-white/5 hover:bg-pink-600 border border-white/10 hover:border-pink-400 py-6 rounded-2xl font-black italic text-2xl transition-all uppercase group">
                     🇺🇸 English
                  </button>
                  <button onClick={() => handleLanguageSelect('jp')} className="w-full bg-white/5 hover:bg-pink-600 border border-white/10 hover:border-pink-400 py-6 rounded-2xl font-black italic text-2xl transition-all uppercase group">
                     🇯🇵 日本語
                  </button>
               </div>
           </div>
        </div>
      )}

      {/* Welcome Modal */}
      {showWelcomeModal && !showLanguageModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-xl animate-in fade-in zoom-in duration-500 p-6">
           <div className="bg-[#111] border-4 border-pink-600 p-10 rounded-[3rem] shadow-[0_0_100px_rgba(236,72,153,0.3)] max-w-lg w-full text-center relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-pink-500 via-white to-pink-500 animate-pulse"></div>
              <h2 className="text-5xl font-black italic text-white mb-6 uppercase drop-shadow-lg">{t('welcomeTitle')}</h2>
              <p className="text-xl text-white/80 mb-8 font-bold whitespace-pre-line">
                 {t('welcomeText')}
              </p>
              <div className="flex flex-col gap-4">
                 <button onClick={handleDownloadRecommended} className="w-full bg-pink-600 hover:bg-pink-500 py-4 rounded-2xl font-black italic text-xl transition-all transform hover:scale-[1.02] shadow-lg uppercase flex items-center justify-center gap-2">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                    {t('download')}
                 </button>
                 <button onClick={skipWelcome} className="w-full bg-white/5 hover:bg-white/10 py-3 rounded-2xl font-bold italic text-white/50 hover:text-white transition-all uppercase">
                    {t('noThanks')}
                 </button>
              </div>
           </div>
        </div>
      )}

      {gameState === GameState.MAIN_MENU && (
        <div className="h-full w-full flex flex-col items-center justify-center relative bg-black">
          <div className="absolute inset-0 bg-cover bg-center opacity-20 blur-sm scale-110" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1614850523296-d8c1af93d400?q=80&w=2070&auto=format&fit=crop')" }} />
          
          <div className="relative z-10 flex flex-col items-center gap-16">
            <div className="relative inline-block animate-pulse-slow cursor-pointer" onClick={() => setGameState(GameState.SONG_SELECT)}>
              <h1 className="text-[10rem] font-black italic tracking-tighter text-pink-500 drop-shadow-[0_0_50px_rgba(236,72,153,0.6)] mb-2 uppercase relative">
                OSU!JWE
                <div className="absolute top-2 -right-8 bg-pink-500 text-[18px] font-black text-white px-4 py-1 rounded shadow-[0_0_25px_rgba(236,72,153,0.9)] border-2 border-pink-400 z-50 pointer-events-none transform skew-x-[-12deg] tracking-normal uppercase">BETA</div>
              </h1>
            </div>

            <div className="flex flex-col gap-4 w-96">
               <button onClick={() => setGameState(GameState.SONG_SELECT)} className="group relative overflow-hidden bg-white/5 hover:bg-pink-600 border border-white/10 hover:border-pink-400 p-6 rounded-2xl transition-all transform hover:-translate-y-1 hover:scale-105">
                  <span className="relative z-10 text-4xl font-black italic tracking-tighter uppercase group-hover:text-white">{t('play')}</span>
                  <div className="absolute top-0 -left-full w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent group-hover:left-full transition-all duration-700" />
               </button>

               <button onClick={() => setIsSettingsOpen(true)} className="group relative overflow-hidden bg-white/5 hover:bg-pink-600 border border-white/10 hover:border-pink-400 p-6 rounded-2xl transition-all transform hover:-translate-y-1 hover:scale-105">
                  <span className="relative z-10 text-3xl font-black italic tracking-tighter uppercase">{t('settings')}</span>
               </button>

               <a href="https://justinsanjp.de/osu-changelog.html" target="_blank" rel="noopener noreferrer" className="group relative overflow-hidden bg-white/5 hover:bg-pink-600 border border-white/10 hover:border-pink-400 p-6 rounded-2xl transition-all transform hover:-translate-y-1 hover:scale-105 text-center">
                  <span className="relative z-10 text-3xl font-black italic tracking-tighter uppercase">{t('changelog')}</span>
               </a>

               <a href="https://discord.gg/ExXNS2swJp" target="_blank" rel="noopener noreferrer" className="group relative overflow-hidden bg-[#5865F2] hover:bg-[#4752c4] p-6 rounded-2xl transition-all transform hover:-translate-y-1 hover:scale-105 text-center flex items-center justify-center gap-4">
                  <svg className="w-8 h-8 fill-white" viewBox="0 0 24 24"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037 19.736 19.736 0 0 0-4.885 1.515.069.069 0 0 0-.032.027C.533 9.048-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.086 2.176 2.419 0 1.334-.966 2.419-2.176 2.419zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.086 2.176 2.419 0 1.334-.946 2.419-2.176 2.419z"/></svg>
                  <span className="relative z-10 text-2xl font-black italic tracking-tighter uppercase">{t('discord')}</span>
               </a>
            </div>
          </div>

          <div className="absolute bottom-6 text-white/30 text-xs font-bold uppercase tracking-widest text-center whitespace-pre-line">
            {t('disclaimer')}
          </div>

          {/* Settings Popup */}
          {isSettingsOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl animate-in fade-in duration-300 p-6">
              <div className="bg-[#111] border-4 border-pink-600 p-10 rounded-[3rem] shadow-[0_0_100px_rgba(236,72,153,0.3)] max-w-2xl w-full relative max-h-[90vh] flex flex-col">
                 <button onClick={() => setIsSettingsOpen(false)} className="absolute top-6 right-6 text-white/40 hover:text-white transition-colors p-2 z-10">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"></path></svg>
                 </button>
                 <div className="text-center mb-6">
                    <h3 className="text-4xl font-black italic tracking-tighter text-pink-500 uppercase underline decoration-pink-500/30">{t('settings')}</h3>
                 </div>
                 
                 <div className="flex-1 overflow-y-auto px-4 custom-scrollbar space-y-8">
                    {/* Language Settings */}
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                        <h4 className="text-xl font-black italic text-pink-300 uppercase mb-3">{t('language')}</h4>
                        <div className="flex gap-4">
                            <button onClick={() => setSettings(p => ({...p, language: 'en'}))} className={`flex-1 py-3 rounded-xl font-bold uppercase transition-all ${settings.language === 'en' ? 'bg-pink-600 text-white shadow-lg' : 'bg-black/40 text-white/50 hover:bg-white/10'}`}>English</button>
                            <button onClick={() => setSettings(p => ({...p, language: 'jp'}))} className={`flex-1 py-3 rounded-xl font-bold uppercase transition-all ${settings.language === 'jp' ? 'bg-pink-600 text-white shadow-lg' : 'bg-black/40 text-white/50 hover:bg-white/10'}`}>日本語</button>
                        </div>
                    </div>

                    {/* Keys Settings */}
                    <div>
                        <h4 className="text-2xl font-black italic text-white/80 uppercase mb-4 text-center">{t('keys')}</h4>
                        <div className="space-y-4">
                        {Object.entries(settings.keys).map(([mode, keys]) => (
                        <div key={mode} className="bg-white/5 p-4 rounded-2xl border border-white/10">
                            <h4 className="text-xl font-black italic text-pink-300 uppercase mb-3">{mode.replace('mania', 'mania ')}</h4>
                            <div className="flex flex-wrap gap-2">
                            {(keys as string[]).map((key, i) => (
                                <button 
                                key={i} 
                                onClick={() => setAwaitingKey({mode: mode as any, index: i})}
                                className={`flex-1 min-w-[60px] p-3 rounded-xl border transition-all uppercase font-bold text-sm ${
                                    awaitingKey?.mode === mode && awaitingKey?.index === i 
                                    ? 'bg-pink-500 border-white text-white' 
                                    : 'bg-black/40 border-white/10 hover:border-pink-500 text-white/80'
                                }`}
                                >
                                {awaitingKey?.mode === mode && awaitingKey?.index === i ? '???' : key}
                                </button>
                            ))}
                            </div>
                        </div>
                        ))}
                        </div>
                    </div>
                 </div>

                 <div className="mt-8 pt-6 border-t border-white/5">
                    <button onClick={() => setIsSettingsOpen(false)} className="w-full bg-pink-600 hover:bg-pink-500 py-4 rounded-2xl font-black italic text-xl transition-all transform hover:scale-[1.02] shadow-lg">{t('saveClose')}</button>
                 </div>
              </div>
            </div>
          )}
        </div>
      )}

      {gameState === GameState.SONG_SELECT && (
        <div className="flex h-full relative">
          <div className="absolute inset-0 z-0 opacity-25 blur-lg scale-110 transition-all duration-1000">
            {selectedSet?.backgroundUrl && <img src={selectedSet.backgroundUrl} className="w-full h-full object-cover" alt="" />}
          </div>

          <a href="https://github.com/justinsanjp/osuwebengine" target="_blank" rel="noopener noreferrer" className="absolute top-8 right-8 z-50 p-2 bg-white/5 hover:bg-white/20 rounded-full transition-all border border-white/10 hover:scale-110" title="GitHub">
            <svg height="24" width="24" viewBox="0 0 16 16" fill="white"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path></svg>
          </a>

          <div className="w-1/3 h-full z-10 flex flex-col p-12 bg-gradient-to-r from-black/90 via-black/60 to-transparent">
             <div className="mb-auto">
                <div className="relative inline-block pr-8 cursor-pointer" onClick={() => setGameState(GameState.MAIN_MENU)}>
                  <h1 className="text-8xl font-black italic tracking-tighter text-pink-500 drop-shadow-[0_0_30px_rgba(236,72,153,0.4)] mb-2 uppercase relative">
                    OSU!JWE
                    <div className="absolute -top-1 -right-4 bg-pink-500 text-[11px] font-black text-white px-2 py-0.5 rounded shadow-[0_0_15px_rgba(236,72,153,0.8)] border border-pink-400 z-50 pointer-events-none transform skew-x-[-12deg] tracking-normal uppercase">BETA</div>
                  </h1>
                </div>
                <p className="text-xl font-bold tracking-widest text-pink-300/80 uppercase">Justin's Osu! Web Engine</p>
                {activeSkin && <p className="text-[10px] text-pink-400 uppercase font-black tracking-widest mt-2">{t('customSkin')}</p>}
             </div>

             {selectedSet ? (
               <div className="animate-in slide-in-from-left duration-300">
                  <h2 className="text-5xl font-black italic mb-1 leading-tight drop-shadow-md">{selectedSet.title}</h2>
                  <p className="text-2xl text-pink-400 font-bold mb-1 drop-shadow-md">{selectedSet.artist}</p>
                  <p className="text-sm text-white/40 font-bold italic mb-8 uppercase tracking-widest">{t('mapBy')} {selectedSet.creator}</p>
                  <div className="space-y-4 max-h-[40vh] overflow-y-auto pr-4 custom-scrollbar">
                    {selectedSet.difficulties.map(d => (
                      <div key={d.id} onClick={() => startMap(d)} className={`group p-4 rounded-xl cursor-pointer transition-all border ${selectedMap?.id === d.id ? 'bg-pink-600 border-pink-400 shadow-lg' : 'bg-white/5 border-white/5 hover:bg-white/10 hover:translate-x-2'}`}>
                         <div className="flex justify-between items-center">
                            <div className="flex items-center gap-3">
                              <span className="text-2xl opacity-70 group-hover:opacity-100 transition-opacity" title={GameMode[d.mode]}>{getModeIcon(d.mode)}</span>
                              <span className="font-black italic text-xl">{d.difficulty}</span>
                            </div>
                            <span className="text-xs bg-black/30 px-2 py-1 rounded">★ {d.difficultyValue.toFixed(2)}</span>
                         </div>
                      </div>
                    ))}
                  </div>
               </div>
             ) : (
               <div className="text-white/20 text-xl font-black italic">{t('selectMap')}</div>
             )}

             <div className="mt-12 flex flex-col gap-4">
                <label className="bg-pink-600 hover:bg-pink-500 p-4 rounded-2xl cursor-pointer text-center font-black italic transition-all shadow-lg active:scale-95 group">
                   <span className="group-hover:scale-110 inline-block transition-transform">{t('import')}</span>
                   <input type="file" accept=".osz,.osk" multiple onChange={(e) => e.target.files && handleFiles(e.target.files)} className="hidden" />
                </label>
                <button onClick={() => setGameState(GameState.MAIN_MENU)} className="bg-white/5 hover:bg-white/10 p-4 rounded-2xl cursor-pointer text-center font-black italic transition-all border border-white/5 uppercase">{t('back')}</button>
             </div>
          </div>

          <div className="w-2/3 h-full z-10 p-12 overflow-y-auto custom-scrollbar bg-black/20 backdrop-blur-sm">
             <div className="grid grid-cols-1 gap-4">
                {isLoading && <div className="p-8 text-center text-pink-500 font-black italic animate-pulse text-2xl uppercase">{t('processing')}</div>}
                {beatmapSets.map((set, i) => (
                  <div key={i} onClick={() => { setSelectedSet(set); setSelectedMap(null); }} className={`group relative overflow-hidden rounded-2xl transition-all cursor-pointer ${selectedSet?.title === set.title ? 'ring-4 ring-pink-500 scale-[1.02] shadow-2xl' : 'hover:scale-[1.01] hover:bg-white/5'}`}>
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
                    </div>
                  </div>
                ))}
                {beatmapSets.length === 0 && !isLoading && (
                  <div className="p-20 text-center border-4 border-dashed border-white/5 rounded-[3rem] bg-white/5">
                     <div className="text-4xl font-black italic text-white/10">{t('noMaps')}</div>
                     <p className="text-white/10 font-bold mt-2 uppercase tracking-widest">{t('dropFiles')}</p>
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
          skin={activeSkin}
          settings={settings}
          onFinish={(score) => { setLastScore(score); setGameState(GameState.RESULTS); }}
          onBack={() => setGameState(GameState.SONG_SELECT)}
        />
      )}

      {gameState === GameState.RESULTS && lastScore && (
        <div className="h-full flex flex-col items-center justify-center bg-[#050505] p-8 animate-in fade-in zoom-in duration-500">
          <div className="bg-[#111] p-16 rounded-[4rem] border-4 border-pink-600 shadow-[0_0_100px_rgba(236,72,153,0.2)] w-full max-w-4xl">
            <h2 className="text-8xl font-black italic text-center mb-16 text-pink-500 drop-shadow-lg tracking-tighter uppercase">{t('success')}</h2>
            <div className="grid grid-cols-2 gap-12 mb-16">
               <div className="text-center">
                  <div className="text-8xl font-black italic text-white mb-2">{lastScore.totalScore.toLocaleString()}</div>
                  <div className="text-pink-400 font-black uppercase tracking-widest">{t('score')}</div>
               </div>
               <div className="text-center">
                  <div className="text-8xl font-black italic text-pink-300 mb-2">{lastScore.accuracy.toFixed(2)}%</div>
                  <div className="text-pink-400 font-black uppercase tracking-widest">{t('accuracy')}</div>
               </div>
            </div>
            <button onClick={() => setGameState(GameState.SONG_SELECT)} className="w-full bg-pink-600 hover:bg-pink-500 py-8 rounded-3xl text-3xl font-black italic transition-all transform hover:scale-[1.02] active:scale-95 shadow-2xl uppercase">{t('continue')}</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;