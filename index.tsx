
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI } from "@google/genai";

// --- Types ---
interface Channel {
  id: string;
  name: string;
  url: string;
  logo?: string;
  category?: string;
}

interface WatermarkConfig {
  opacity: number;
  top: number;
  left: number;
  url: string;
}

interface DevConfig {
  photo: string;
  name: string;
  note: string;
}

// --- Constants ---
const PRIMARY_COLOR = '#ff0055';

// --- App Component ---
const App = () => {
  // Navigation & View
  const [isAdmin, setIsAdmin] = useState(window.location.hash === '#admin');

  // Channel State
  const [channels, setChannels] = useState<Channel[]>([]);
  const [categories, setCategories] = useState<string[]>(['All']);
  const [currentIdx, setCurrentIdx] = useState<number>(-1);
  const [currentCatIdx, setCurrentCatIdx] = useState(0);
  const [deadChannelIds, setDeadChannelIds] = useState<Set<string>>(new Set());

  // Player & UI State
  const [isPowerOn, setIsPowerOn] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(80);
  const [isLandscape, setIsLandscape] = useState(false);
  const [toast, setToast] = useState<{ msg: string; show: boolean }>({ msg: '', show: false });
  const [activeModal, setActiveModal] = useState<string | null>(null);

  // Assistant State
  const [isListening, setIsListening] = useState(false);
  const [assistantText, setAssistantText] = useState('');

  // Admin Config
  const [watermark, setWatermark] = useState<WatermarkConfig>(() => {
    try {
      const saved = localStorage.getItem('ultra_iptv_watermark');
      return saved ? JSON.parse(saved) : { opacity: 0.5, top: 10, left: 10, url: 'https://cdn-icons-png.flaticon.com/512/717/717426.png' };
    } catch {
      return { opacity: 0.5, top: 10, left: 10, url: '' };
    }
  });

  const [dev, setDev] = useState<DevConfig>(() => {
    try {
      const saved = localStorage.getItem('ultra_iptv_dev');
      return saved ? JSON.parse(saved) : { photo: 'https://via.placeholder.com/150?text=Mujahid', name: 'Mujahid', note: "I build highly responsive and aesthetic UI experiences." };
    } catch {
      return { photo: '', name: 'Mujahid', note: "" };
    }
  });

  const videoRef = useRef<HTMLVideoElement>(null);

  // --- Effects ---
  useEffect(() => {
    const handleHash = () => setIsAdmin(window.location.hash === '#admin');
    window.addEventListener('hashchange', handleHash);

    const loadData = async () => {
      const paths = ['tv.mu3', 'tv.m3u', '/tv.mu3', '/tv.m3u'];
      let foundData = "";
      
      for (const path of paths) {
        try {
          const res = await fetch(path);
          if (res.ok) {
            foundData = await res.text();
            break;
          }
        } catch (e) { continue; }
      }

      if (foundData) {
        parseM3U(foundData);
        showToast("Playlist loaded from local file");
      } else {
        const saved = localStorage.getItem('ultra_iptv_channels');
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            setChannels(parsed);
            updateCategories(parsed);
          } catch {
            setDemoChannels();
          }
        } else {
          setDemoChannels();
        }
      }
    };

    loadData();
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const setDemoChannels = () => {
    const demo = [
      { id: 'd1', name: 'Demo Somoy TV', url: 'https://cdn-1.toffeelive.com/somoy/index.m3u8', category: 'News', logo: 'https://seeklogo.com/images/S/somoy-tv-logo-87B757523F-seeklogo.com.png' },
      { id: 'd2', name: 'Demo T Sports', url: 'https://cdn-1.toffeelive.com/tsports/index.m3u8', category: 'Sports', logo: 'https://tsports.com/static/media/tsports-logo.8e7b99c2.png' }
    ];
    setChannels(demo);
    updateCategories(demo);
  };

  // --- Gemini Assistant Integration ---
  const startAssistant = async () => {
    if (!('webkitSpeechRecognition' in window)) {
      showToast("Speech Recognition not supported");
      return;
    }

    const SpeechRecognition = (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);

    recognition.onresult = async (event: any) => {
      const transcript = event.results[0][0].transcript;
      setAssistantText(`Searching for: "${transcript}"`);
      await processVoiceCommand(transcript);
    };

    recognition.start();
  };

  const processVoiceCommand = async (query: string) => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `The user said: "${query}". 
        Available channels are: ${channels.map(c => c.name).join(', ')}. 
        Pick the most relevant channel name and return ONLY the exact channel name. 
        If nothing matches, return "None".`,
      });

      const matchedName = response.text?.trim();
      if (matchedName && matchedName !== 'None') {
        const foundIdx = channels.findIndex(c => c.name.toLowerCase().includes(matchedName.toLowerCase()));
        if (foundIdx !== -1) {
          playChannel(foundIdx);
          showToast(`Switching to ${channels[foundIdx].name}`);
        } else {
          showToast("Channel not found");
        }
      } else {
        showToast("Sorry, I couldn't find that channel.");
      }
    } catch (err) {
      console.error(err);
      showToast("Assistant failed to connect");
    }
  };

  // --- Functions ---
  const parseM3U = (data: string) => {
    const lines = data.split(/\r?\n/);
    const newChannels: Channel[] = [];
    let current: Partial<Channel> | null = null;

    lines.forEach(line => {
      line = line.trim();
      if (line.startsWith('#EXTINF:')) {
        current = { id: Math.random().toString(36).substring(2, 11), name: 'Unknown' };
        const nameMatch = line.match(/,(.+)$/);
        if (nameMatch) current.name = nameMatch[1].trim();
        const logoMatch = line.match(/tvg-logo="([^"]+)"/);
        if (logoMatch) current.logo = logoMatch[1];
        const groupMatch = line.match(/group-title="([^"]+)"/);
        if (groupMatch) current.category = groupMatch[1];
      } else if (line && !line.startsWith('#') && current) {
        current.url = line;
        newChannels.push(current as Channel);
        current = null;
      }
    });

    if (newChannels.length > 0) {
      setChannels(newChannels);
      updateCategories(newChannels);
      localStorage.setItem('ultra_iptv_channels', JSON.stringify(newChannels));
    }
  };

  const updateCategories = (list: Channel[]) => {
    const cats = Array.from(new Set(['All', ...list.map(c => c.category || 'General')]));
    setCategories(cats);
  };

  const showToast = (msg: string) => {
    setToast({ msg, show: true });
    setTimeout(() => setToast({ msg: '', show: false }), 3000);
  };

  const playChannel = (idx: number) => {
    if (idx < 0 || idx >= channels.length) return;
    if (!isPowerOn) setIsPowerOn(true);
    
    setCurrentIdx(idx);
    const ch = channels[idx];
    if (videoRef.current && ch?.url) {
      setIsLoading(true);
      videoRef.current.src = ch.url;
      videoRef.current.play().catch(() => {
        handleChannelError(ch.id);
        setIsLoading(false);
      });
    }
  };

  const handleChannelError = (id: string) => {
    setDeadChannelIds(prev => {
      const updated = new Set(prev);
      updated.add(id);
      return updated;
    });
    showToast("Signal Lost - Tuning Next...");
    setTimeout(() => changeCh(1), 800);
  };

  const changeCh = (dir: number) => {
    if (channels.length === 0) return;
    const nextIdx = (currentIdx + dir + channels.length) % channels.length;
    playChannel(nextIdx);
  };

  const togglePower = () => {
    if (!isPowerOn) {
      setIsPowerOn(true);
      showToast("System Booting...");
      if (channels.length > 0) playChannel(0);
    } else {
      setIsPowerOn(false);
      showToast("Powering Off");
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.src = "";
      }
      setCurrentIdx(-1);
    }
  };

  const saveAdmin = () => {
    localStorage.setItem('ultra_iptv_watermark', JSON.stringify(watermark));
    localStorage.setItem('ultra_iptv_dev', JSON.stringify(dev));
    showToast("Configuration Applied Successfully");
  };

  const filteredChannels = useMemo(() => {
    const cat = categories[currentCatIdx] || 'All';
    return channels.filter(c => !deadChannelIds.has(c.id) && (cat === 'All' || (c.category || 'General') === cat));
  }, [channels, currentCatIdx, categories, deadChannelIds]);

  // --- Admin Panel Render ---
  if (isAdmin) {
    return (
      <div className="min-h-screen bg-dark text-white p-6 font-sans">
        <div className="max-w-4xl mx-auto space-y-8">
          <header className="flex justify-between items-center border-b border-white/5 pb-6">
            <h1 className="text-3xl font-black text-toffee italic tracking-tighter uppercase">ROOT ADMIN</h1>
            <button onClick={() => window.location.hash = ''} className="bg-toffee px-8 py-2 rounded-full font-black uppercase text-xs tracking-widest shadow-lg shadow-toffee/20">Return Home</button>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-header p-8 rounded-[40px] border border-white/5 space-y-6 shadow-2xl">
              <h2 className="text-xl font-bold flex items-center gap-3"><i className="fa-solid fa-stamp text-toffee"></i> Brand Overlay</h2>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest">URL</label>
                  <input type="text" value={watermark.url} onChange={e => setWatermark({...watermark, url: e.target.value})} className="w-full bg-black border border-white/5 p-4 rounded-2xl outline-none focus:border-toffee transition-colors" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Alpha ({Math.round(watermark.opacity * 100)}%)</label>
                  <input type="range" min="0" max="1" step="0.1" value={watermark.opacity} onChange={e => setWatermark({...watermark, opacity: parseFloat(e.target.value)})} className="w-full accent-toffee" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Y-Axis</label>
                    <input type="range" min="0" max="100" value={watermark.top} onChange={e => setWatermark({...watermark, top: parseInt(e.target.value)})} className="w-full accent-toffee" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest">X-Axis</label>
                    <input type="range" min="0" max="100" value={watermark.left} onChange={e => setWatermark({...watermark, left: parseInt(e.target.value)})} className="w-full accent-toffee" />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-header p-8 rounded-[40px] border border-white/5 space-y-6 shadow-2xl">
              <h2 className="text-xl font-bold flex items-center gap-3"><i className="fa-solid fa-user-gear text-toffee"></i> Identity</h2>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Dev Name</label>
                  <input type="text" value={dev.name} onChange={e => setDev({...dev, name: e.target.value})} className="w-full bg-black border border-white/5 p-4 rounded-2xl outline-none" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Manifesto</label>
                  <textarea value={dev.note} onChange={e => setDev({...dev, note: e.target.value})} className="w-full bg-black border border-white/5 p-4 rounded-2xl outline-none h-32 resize-none" />
                </div>
              </div>
            </div>
          </div>

          <button onClick={saveAdmin} className="w-full bg-toffee py-6 rounded-3xl font-black text-xl shadow-2xl active:scale-[0.98] transition-all">WRITE TO DATABASE</button>
        </div>
      </div>
    );
  }

  // --- Main Player Render ---
  return (
    <div className="flex flex-col min-h-screen bg-dark text-white select-none font-sans overflow-x-hidden">
      <header className="flex justify-between items-center px-6 py-4 bg-header border-b border-white/5 sticky top-0 z-[100] backdrop-blur-xl bg-opacity-90">
        <div className="text-2xl font-black text-toffee italic tracking-tighter uppercase flex items-center gap-2">
          TOFFEE <span className="text-[10px] font-bold tracking-[0.2em] bg-toffee text-white px-2 py-0.5 rounded italic">ULTRA</span>
        </div>
        <div className="flex gap-6 text-xl items-center">
          <i className={`fa-solid fa-microphone ${isListening ? 'text-toffee animate-pulse scale-125' : 'text-gray-400 hover:text-white'} cursor-pointer transition-all`} onClick={startAssistant}></i>
          <i className="fa-solid fa-magnifying-glass hover:text-toffee cursor-pointer transition-colors" onClick={() => setActiveModal('search')}></i>
          <i className="fa-solid fa-gear hover:text-toffee cursor-pointer transition-colors" onClick={() => window.location.hash = '#admin'}></i>
        </div>
      </header>

      <div className={`video-box w-full bg-black relative flex items-center justify-center overflow-hidden transition-all duration-700 ease-in-out ${isLandscape ? 'full-rotate' : 'h-[240px] shadow-[inset_0_0_100px_rgba(0,0,0,0.8)] shadow-black/50'}`}>
        {!isPowerOn ? (
           <div className="absolute inset-0 bg-[#070007] flex flex-col items-center justify-center">
              <div className="text-toffee font-black text-xs tracking-[0.5em] animate-pulse">SYSTEM STANDBY</div>
              <div className="w-16 h-1 mt-4 bg-white/5 rounded-full overflow-hidden">
                <div className="w-1/3 h-full bg-toffee/20"></div>
              </div>
           </div>
        ) : (
          <>
            <video 
              ref={videoRef} 
              className="w-full h-full object-contain"
              onLoadStart={() => setIsLoading(true)}
              onCanPlay={() => setIsLoading(false)}
              onEnded={() => changeCh(1)}
              onError={() => { if(currentIdx >=0) handleChannelError(channels[currentIdx].id); }}
              playsInline
            />
            
            {/* Overlay Grid / Scanlines Effect */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%]"></div>
            
            {watermark.url && (
              <img 
                src={watermark.url} 
                className="absolute pointer-events-none transition-all drop-shadow-lg" 
                style={{ 
                  opacity: watermark.opacity, 
                  top: `${watermark.top}%`, 
                  left: `${watermark.left}%`, 
                  height: '30px', 
                  objectFit: 'contain' 
                }} 
              />
            )}

            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                <div className="w-10 h-10 border-2 border-white/10 border-t-toffee rounded-full animate-spin"></div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex justify-between items-center px-6 py-4 bg-card border-b border-white/5 text-[10px] font-black tracking-widest">
        <div className="truncate max-w-[70%] text-gray-400 uppercase flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${isPowerOn ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]'}`}></div>
          {currentIdx >= 0 && isPowerOn ? channels[currentIdx].name : "RECEIVER READY"}
        </div>
        <div className="text-toffee border border-toffee/20 px-3 py-1 rounded-full bg-toffee/5">LIVE 4K ULTRA</div>
      </div>

      {/* Modern Controller Area */}
      <div className="p-8 flex flex-col items-center gap-8 relative">
        {isListening && (
           <div className="absolute top-0 left-0 right-0 py-2 text-center text-toffee font-black text-xs animate-bounce tracking-widest bg-dark/80 backdrop-blur-md z-10">
             LISTENING... {assistantText}
           </div>
        )}
        
        <div className="w-full max-w-[340px] space-y-8">
          <div className="flex justify-between px-2">
            <button className={`btn-circle ${isPowerOn ? 'text-green-500' : 'text-red-500'}`} onClick={togglePower}>
              <i className="fa-solid fa-power-off text-xl"></i>
            </button>
            <button className="btn-circle" onClick={() => location.reload()}>
              <i className="fa-solid fa-house"></i>
            </button>
            <button className="btn-circle" onClick={() => { setIsMuted(!isMuted); if(videoRef.current) videoRef.current.muted = !isMuted; }}>
              <i className={`fa-solid ${isMuted ? 'fa-volume-xmark' : 'fa-volume-high'}`}></i>
            </button>
          </div>

          <div className="flex justify-center gap-8 items-center">
            <button className="btn-circle w-[55px] h-[55px] border-none bg-header/60 active:bg-toffee" onClick={() => {
              const next = (currentCatIdx - 1 + categories.length) % categories.length;
              setCurrentCatIdx(next);
            }}>
              <i className="fa-solid fa-chevron-left"></i>
            </button>
            <button className="btn-circle scale-[1.3] border-toffee/40 text-toffee bg-dark shadow-2xl active:scale-110" onClick={() => videoRef.current?.paused ? videoRef.current.play() : videoRef.current?.pause()}>
              <i className={`fa-solid ${videoRef.current?.paused ? 'fa-play' : 'fa-pause'}`}></i>
            </button>
            <button className="btn-circle w-[55px] h-[55px] border-none bg-header/60 active:bg-toffee" onClick={() => {
              const next = (currentCatIdx + 1) % categories.length;
              setCurrentCatIdx(next);
            }}>
              <i className="fa-solid fa-chevron-right"></i>
            </button>
          </div>

          <div className="grid grid-cols-[70px_1fr_70px] gap-6 h-[180px]">
            <div className="bg-header border border-white/5 rounded-full flex flex-col justify-between items-center py-6 shadow-2xl">
               <button className="text-white h-12 w-full active:text-toffee" onClick={() => { setVolume(v => Math.min(100, v+10)); }}><i className="fa-solid fa-plus"></i></button>
               <span className="text-[10px] font-black text-gray-600 uppercase">VOL</span>
               <button className="text-white h-12 w-full active:text-toffee" onClick={() => { setVolume(v => Math.max(0, v-10)); }}><i className="fa-solid fa-minus"></i></button>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <button className="btn-circle w-full h-full text-[10px] font-black tracking-widest text-gray-400" onClick={() => setActiveModal('list')}>LIST</button>
              <button className="btn-circle w-full h-full text-lg text-gray-400" onClick={() => setIsLandscape(!isLandscape)}>
                <i className={`fa-solid ${isLandscape ? 'fa-compress text-toffee' : 'fa-expand'}`}></i>
              </button>
              <button className="btn-circle w-full h-full text-lg text-gray-400" onClick={startAssistant}><i className="fa-solid fa-microphone"></i></button>
              <button className="btn-circle w-full h-full text-[10px] font-black tracking-widest text-gray-400" onClick={() => setActiveModal('guide')}>INFO</button>
            </div>

            <div className="bg-header border border-white/5 rounded-full flex flex-col justify-between items-center py-6 shadow-2xl">
               <button className="text-white h-12 w-full active:text-toffee" onClick={() => changeCh(1)}><i className="fa-solid fa-chevron-up"></i></button>
               <span className="text-[10px] font-black text-gray-600 uppercase">CH</span>
               <button className="text-white h-12 w-full active:text-toffee" onClick={() => changeCh(-1)}><i className="fa-solid fa-chevron-down"></i></button>
            </div>
          </div>
          
          <div className="text-center text-[10px] font-black text-toffee tracking-[0.4em] uppercase opacity-70">
            {categories[currentCatIdx] || 'Global Feed'}
          </div>
        </div>
      </div>

      <section className="px-6 pb-24">
        <div className="flex items-center gap-3 mb-8">
          <div className="h-4 w-1 bg-toffee rounded-full"></div>
          <div className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-500">Available Broadcasters</div>
        </div>
        <div className="grid grid-cols-4 gap-6">
          {filteredChannels.map(ch => {
            const realIdx = channels.indexOf(ch);
            const isActive = realIdx === currentIdx;
            return (
              <div key={ch.id} className="flex flex-col items-center gap-2 cursor-pointer group" onClick={() => playChannel(realIdx)}>
                <div className={`w-[70px] h-[70px] bg-white rounded-3xl flex items-center justify-center overflow-hidden border-2 transition-all duration-300 active:scale-90 ${isActive ? 'border-toffee shadow-2xl scale-110' : 'border-transparent opacity-60 group-hover:opacity-100'}`}>
                  <img src={ch.logo || `https://via.placeholder.com/100?text=${ch.name[0]}`} className="w-[80%] h-[80%] object-contain" alt={ch.name} />
                </div>
                <span className={`text-[8px] font-black text-center uppercase tracking-tighter line-clamp-1 w-full ${isActive ? 'text-toffee' : 'text-gray-600'}`}>{ch.name}</span>
              </div>
            );
          })}
        </div>
      </section>

      <footer className="bg-card p-12 border-t border-white/5 text-center">
        <div className="relative inline-block mb-6">
          <img src={dev.photo} className="w-20 h-20 rounded-full border-2 border-toffee/20 mx-auto object-cover grayscale hover:grayscale-0 transition-all duration-500" alt="Dev" />
          <div className="absolute -bottom-1 -right-1 bg-green-500 w-4 h-4 rounded-full border-4 border-card"></div>
        </div>
        <div className="text-xl font-black text-toffee uppercase italic tracking-tighter">{dev.name}</div>
        <p className="text-[10px] text-gray-600 max-w-[240px] mx-auto my-4 font-bold opacity-60 uppercase tracking-widest leading-relaxed">
          {dev.note}
        </p>
        <div className="flex justify-center gap-8 mt-8 text-xl text-gray-700">
           <a href="#" className="hover:text-toffee transition-colors"><i className="fa-brands fa-facebook-f"></i></a>
           <a href="#" className="hover:text-toffee transition-colors"><i className="fa-brands fa-github"></i></a>
           <a href="#" className="hover:text-toffee transition-colors"><i className="fa-brands fa-x-twitter"></i></a>
        </div>
        <div className="text-[8px] text-gray-800 mt-12 tracking-[0.5em] font-black uppercase">© 2026 ULTRA OPS — ARCHITECTED IN DHAKA</div>
      </footer>

      {/* Modals */}
      {activeModal && (
        <div className="fixed inset-0 z-[5000] flex items-center justify-center p-6 backdrop-blur-sm">
          <div className="absolute inset-0 bg-black/90" onClick={() => setActiveModal(null)}></div>
          <div className="relative bg-header border border-white/5 rounded-[40px] w-full max-w-[340px] p-10 shadow-2xl animate-in zoom-in-95 duration-200">
             {activeModal === 'search' && (
               <>
                 <h3 className="text-xs font-black text-toffee mb-8 text-center uppercase tracking-[0.4em]">CHANNEL INDEX</h3>
                 <input 
                   type="text" className="w-full bg-black border border-white/5 p-5 text-center rounded-2xl text-white font-black text-lg outline-none mb-6 focus:border-toffee transition-all"
                   placeholder="ENTER NAME" autoFocus onChange={(e) => {
                     const q = e.target.value.toLowerCase();
                     if(q.length > 2) {
                       const f = channels.findIndex(c => c.name.toLowerCase().includes(q));
                       if(f !== -1) { playChannel(f); showToast(`Playing: ${channels[f].name}`); }
                     }
                   }}
                 />
                 <button className="w-full h-14 bg-toffee text-white font-black rounded-2xl text-xs uppercase tracking-widest active:scale-95 transition-all" onClick={() => setActiveModal(null)}>DISMISS</button>
               </>
             )}
             {activeModal === 'list' && (
               <>
                 <h3 className="text-xs font-black text-toffee mb-8 text-center uppercase tracking-[0.4em]">QUICK LIST</h3>
                 <div className="grid grid-cols-3 gap-4 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                    {channels.slice(0, 50).map((ch, idx) => (
                       <div key={idx} className="aspect-square bg-white rounded-2xl p-2 flex items-center justify-center cursor-pointer active:scale-90 border-2 border-transparent hover:border-toffee" onClick={() => { playChannel(idx); setActiveModal(null); }}>
                          <img src={ch.logo || `https://via.placeholder.com/50`} className="w-[80%] h-[80%] object-contain" alt="ch" />
                       </div>
                    ))}
                 </div>
                 <button className="w-full mt-8 text-gray-500 font-black text-[9px] uppercase tracking-[0.4em]" onClick={() => setActiveModal(null)}>EXIT DIRECTORY</button>
               </>
             )}
             {activeModal === 'guide' && (
               <>
                 <h3 className="text-xs font-black text-toffee mb-8 text-center uppercase tracking-[0.4em]">SYSTEM INFO</h3>
                 <div className="text-[9px] space-y-5 text-gray-400 font-bold uppercase tracking-[0.2em]">
                    <div className="flex gap-4 items-center bg-black/40 p-3 rounded-xl"><i className="fa-solid fa-microphone text-toffee"></i> GEMINI SMART VOICE SEARCH</div>
                    <div className="flex gap-4 items-center bg-black/40 p-3 rounded-xl"><i className="fa-solid fa-rotate text-toffee"></i> 90° ROTATION CAPABLE</div>
                    <div className="flex gap-4 items-center bg-black/40 p-3 rounded-xl"><i className="fa-solid fa-shield text-toffee"></i> AES ENCRYPTED STREAMS</div>
                    <div className="flex gap-4 items-center bg-black/40 p-3 rounded-xl"><i className="fa-solid fa-terminal text-toffee"></i> LOCAL M3U SYNC v2.4</div>
                 </div>
                 <button className="w-full h-14 bg-white/5 text-white font-black rounded-2xl mt-8 text-xs tracking-widest" onClick={() => setActiveModal(null)}>CLOSE</button>
               </>
             )}
          </div>
        </div>
      )}

      {/* Global Toast */}
      <div className={`fixed bottom-10 left-1/2 -translate-x-1/2 bg-black/95 text-white border border-white/10 px-8 py-4 rounded-3xl text-[9px] font-black shadow-2xl transition-all duration-500 z-[10000] uppercase tracking-widest ${toast.show ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-20 opacity-0 scale-50'}`}>
        {toast.msg}
      </div>
    </div>
  );
};

// --- Secure Render Entry ---
const startApp = () => {
  const container = document.getElementById('app-root');
  if (!container) return;
  const root = createRoot(container);
  root.render(<App />);
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}
