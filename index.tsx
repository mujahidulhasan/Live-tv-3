import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createRoot } from 'react-dom/client';

// --- Interfaces ---
interface Channel {
  id: string;
  name: string;
  url: string;
  logo?: string;
  category?: string;
}

interface WatermarkSettings {
  opacity: number;
  top: number;
  left: number;
  url: string;
}

interface DevSettings {
  photo: string;
  name: string;
  note: string;
}

const App = () => {
  // Routing simulation
  const [isAdmin, setIsAdmin] = useState(window.location.hash === '#admin');

  // Channel State
  const [channels, setChannels] = useState<Channel[]>([]);
  const [categories, setCategories] = useState<string[]>(['All']);
  const [currentIdx, setCurrentIdx] = useState<number>(-1);
  const [currentCatIdx, setCurrentCatIdx] = useState(0);
  const [errorIds, setErrorIds] = useState<Set<string>>(new Set());

  // Player State
  const [volume, setVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  const [isPowerOn, setIsPowerOn] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRemoteHidden, setIsRemoteHidden] = useState(false);
  const [isLandscapeMode, setIsLandscapeMode] = useState(false);
  const [toast, setToast] = useState<{ msg: string; show: boolean }>({ msg: '', show: false });

  // Admin Configurable Settings (Persisted in LocalStorage)
  const [watermark, setWatermark] = useState<WatermarkSettings>(() => {
    const saved = localStorage.getItem('toffee_watermark');
    return saved ? JSON.parse(saved) : { opacity: 0.6, top: 10, left: 10, url: 'assets/logo.png' };
  });

  const [devSettings, setDevSettings] = useState<DevSettings>(() => {
    const saved = localStorage.getItem('toffee_dev');
    return saved ? JSON.parse(saved) : { photo: 'assets/dev.png', name: 'Mujahid', note: "Dhaka Polytechnic student. I build highly responsive and aesthetic UI experiences." };
  });

  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [manualChInput, setManualChInput] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);

  // Auto-load tv.m3u or tv.mu3 on startup
  useEffect(() => {
    const loadM3U = async () => {
      console.log("Attempting to load M3U file...");
      try {
        // We try standard names.mu3 was specifically mentioned by user.
        const filesToTry = ['tv.mu3', 'tv.m3u', '/tv.mu3', '/tv.m3u'];
        let text = "";
        let success = false;

        for (const file of filesToTry) {
          try {
            const response = await fetch(file);
            if (response.ok) {
              text = await response.text();
              console.log(`Successfully fetched ${file}`);
              success = true;
              break;
            }
          } catch (e) {
            continue;
          }
        }
        
        if (success && text.trim().length > 0) {
          parseM3U(text);
          showToast("Playlist loaded from root");
        } else {
          // Fallback to localStorage if no file found
          const savedData = localStorage.getItem('toffee_iptv_data');
          if (savedData) {
            const parsed = JSON.parse(savedData);
            setChannels(parsed);
            updateCategoryList(parsed);
          } else {
            // Default demo data
            const demo = [
              { id: '1', name: 'Somoy TV', url: 'https://cdn-1.toffeelive.com/somoy/index.m3u8', category: 'News', logo: 'https://seeklogo.com/images/S/somoy-tv-logo-87B757523F-seeklogo.com.png' },
              { id: '2', name: 'T Sports', url: 'https://cdn-1.toffeelive.com/tsports/index.m3u8', category: 'Sports', logo: 'https://tsports.com/static/media/tsports-logo.8e7b99c2.png' }
            ];
            setChannels(demo);
            updateCategoryList(demo);
          }
        }
      } catch (err) {
        console.error("Error in loading process:", err);
      }
    };
    
    loadM3U();

    // Listen for hash changes to toggle admin
    const handleHashChange = () => setIsAdmin(window.location.hash === '#admin');
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const parseM3U = (data: string) => {
    // Handle both \n and \r\n line endings
    const lines = data.split(/\r?\n/);
    const newChannels: Channel[] = [];
    let current: Partial<Channel> | null = null;

    lines.forEach(line => {
      line = line.trim();
      if (line.startsWith('#EXTINF:')) {
        current = { id: Math.random().toString(36).substr(2, 9), name: 'Unknown' };
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
      updateCategoryList(newChannels);
      localStorage.setItem('toffee_iptv_data', JSON.stringify(newChannels));
    }
  };

  const updateCategoryList = (list: Channel[]) => {
    const cats = Array.from(new Set(['All', ...list.map(c => c.category || 'General')]));
    setCategories(cats);
  };

  const showToast = (msg: string) => {
    setToast({ msg, show: true });
    setTimeout(() => setToast({ msg: '', show: false }), 2500);
  };

  const togglePower = () => {
    if (!isPowerOn) {
      setIsPowerOn(true);
      showToast("System Starting...");
      if (channels.length > 0) playChannel(0);
    } else {
      setIsPowerOn(false);
      showToast("Powering Off");
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.src = "";
      }
    }
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
    setErrorIds(prev => {
      const updated = new Set(prev);
      updated.add(id);
      return updated;
    });
    showToast("Load Failed - Hiding Channel");
  };

  const changeCh = (dir: number) => {
    if (channels.length === 0) return;
    const next = (currentIdx + dir + channels.length) % channels.length;
    playChannel(next);
  };

  const filteredChannels = useMemo(() => {
    const cat = categories[currentCatIdx] || 'All';
    return channels.filter(c => !errorIds.has(c.id) && (cat === 'All' || (c.category || 'General') === cat));
  }, [channels, currentCatIdx, categories, errorIds]);

  const saveAdminSettings = () => {
    localStorage.setItem('toffee_watermark', JSON.stringify(watermark));
    localStorage.setItem('toffee_dev', JSON.stringify(devSettings));
    showToast("Settings Saved Successfully");
  };

  if (isAdmin) {
    return (
      <div className="min-h-screen bg-dark p-6 font-sans text-white">
        <div className="max-w-4xl mx-auto space-y-8">
          <header className="flex justify-between items-center border-b border-border pb-4">
            <h1 className="text-3xl font-black text-toffee">ADMIN DASHBOARD</h1>
            <button onClick={() => { window.location.hash = ''; }} className="bg-toffee px-6 py-2 rounded-full font-bold">Exit Admin</button>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-header p-6 rounded-3xl border border-border space-y-4">
              <h2 className="text-xl font-bold flex items-center gap-2"><i className="fa-solid fa-stamp text-toffee"></i> Watermark Control</h2>
              <div className="space-y-2">
                <label className="text-xs text-gray-500 font-bold uppercase">Logo Image Path</label>
                <input type="text" value={watermark.url} onChange={e => setWatermark({...watermark, url: e.target.value})} className="w-full bg-black border border-border p-3 rounded-xl outline-none" placeholder="assets/logo.png" />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-gray-500 font-bold uppercase">Opacity ({Math.round(watermark.opacity * 100)}%)</label>
                <input type="range" min="0" max="1" step="0.1" value={watermark.opacity} onChange={e => setWatermark({...watermark, opacity: parseFloat(e.target.value)})} className="w-full accent-toffee" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs text-gray-500 font-bold uppercase">Top (%)</label>
                  <input type="range" min="0" max="100" value={watermark.top} onChange={e => setWatermark({...watermark, top: parseInt(e.target.value)})} className="w-full accent-toffee" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-gray-500 font-bold uppercase">Left (%)</label>
                  <input type="range" min="0" max="100" value={watermark.left} onChange={e => setWatermark({...watermark, left: parseInt(e.target.value)})} className="w-full accent-toffee" />
                </div>
              </div>
            </div>

            <div className="bg-header p-6 rounded-3xl border border-border space-y-4">
              <h2 className="text-xl font-bold flex items-center gap-2"><i className="fa-solid fa-user-tie text-toffee"></i> Developer Info</h2>
              <div className="space-y-2">
                <label className="text-xs text-gray-500 font-bold uppercase">Photo URL</label>
                <input type="text" value={devSettings.photo} onChange={e => setDevSettings({...devSettings, photo: e.target.value})} className="w-full bg-black border border-border p-3 rounded-xl outline-none" placeholder="assets/dev.png" />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-gray-500 font-bold uppercase">Full Name</label>
                <input type="text" value={devSettings.name} onChange={e => setDevSettings({...devSettings, name: e.target.value})} className="w-full bg-black border border-border p-3 rounded-xl outline-none" />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-gray-500 font-bold uppercase">Bio Note</label>
                <textarea value={devSettings.note} onChange={e => setDevSettings({...devSettings, note: e.target.value})} className="w-full bg-black border border-border p-3 rounded-xl outline-none h-24 resize-none" />
              </div>
            </div>
          </div>

          <button onClick={saveAdminSettings} className="w-full bg-toffee py-4 rounded-2xl font-black text-xl shadow-lg hover:brightness-110 active:scale-95 transition-all">SAVE SETTINGS</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-dark text-white select-none font-sans overflow-x-hidden">
      {/* Header */}
      <header className="flex justify-between items-center p-4 bg-header border-b border-border sticky top-0 z-[100]">
        <div className="text-2xl font-black text-toffee italic tracking-tighter uppercase">TOFFEE ULTRA</div>
        <div className="flex gap-5 text-xl">
          <i className="fa-solid fa-magnifying-glass hover:text-toffee cursor-pointer" onClick={() => setActiveModal('key')}></i>
          <i className="fa-solid fa-gear hover:text-toffee cursor-pointer" onClick={() => window.location.hash = '#admin'}></i>
        </div>
      </header>

      {/* Video Display */}
      <div className={`video-box w-full bg-black relative flex items-center justify-center transition-all duration-300 ${isLandscapeMode ? 'full-rotate' : 'h-[220px]'}`}>
        <video 
          ref={videoRef} 
          className="w-full h-full object-contain"
          onLoadStart={() => setIsLoading(true)}
          onCanPlay={() => setIsLoading(false)}
          onEnded={() => changeCh(1)}
          onError={() => { if(currentIdx >=0) handleChannelError(channels[currentIdx].id); }}
          playsInline
        />
        
        {/* Dynamic Watermark */}
        {isPowerOn && watermark.url && (
          <img 
            src={watermark.url} 
            className="absolute pointer-events-none transition-all duration-500" 
            style={{ 
              opacity: watermark.opacity, 
              top: `${watermark.top}%`, 
              left: `${watermark.left}%`, 
              height: '40px', 
              objectFit: 'contain' 
            }} 
            alt="watermark"
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />
        )}

        {isLoading && (
          <div className="absolute w-12 h-12 border-4 border-white/20 border-t-toffee rounded-full animate-spin"></div>
        )}
      </div>

      {/* Info Bar */}
      <div className="flex justify-between items-center px-6 py-4 bg-card border-b border-border text-sm">
        <div className="font-bold truncate max-w-[75%] text-gray-100 flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isPowerOn ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
          {currentIdx >= 0 && isPowerOn ? channels[currentIdx].name : "System Offline"}
        </div>
        <div className="text-toffee font-black text-[10px] tracking-widest uppercase bg-header px-2 py-1 rounded-md border border-border">ULTRA PRO</div>
      </div>

      {/* Remote Controls */}
      <div className="p-6 flex flex-col items-center gap-6">
        <div className={`remote-ui w-full max-w-[340px] space-y-6 ${isRemoteHidden ? 'hidden h-0 opacity-0' : 'block opacity-100 transition-all duration-500'}`}>
          <div className="flex justify-between">
            <button className={`btn-circle ${isPowerOn ? 'text-green-500 shadow-[0_0_20px_rgba(34,197,94,0.3)]' : 'text-red-600'}`} onClick={togglePower}>
              <i className="fa-solid fa-power-off text-xl"></i>
            </button>
            <button className="btn-circle" onClick={() => location.reload()}>
              <i className="fa-solid fa-house"></i>
            </button>
            <button className="btn-circle" onClick={() => { setIsMuted(!isMuted); if(videoRef.current) videoRef.current.muted = !isMuted; }}>
              <i className={`fa-solid ${isMuted ? 'fa-volume-xmark' : 'fa-volume-high'}`}></i>
            </button>
          </div>

          <div className="flex justify-center gap-6 items-center">
            <button className="btn-circle w-[50px] h-[50px] border-none bg-header/50" onClick={() => {
              const next = (currentCatIdx - 1 + categories.length) % categories.length;
              setCurrentCatIdx(next);
              showToast(`Cat: ${categories[next]}`);
            }}>
              <i className="fa-solid fa-chevron-left"></i>
            </button>
            <button className="btn-circle scale-125 border-toffee text-toffee bg-dark shadow-xl" onClick={() => videoRef.current?.paused ? videoRef.current.play() : videoRef.current?.pause()}>
              <i className={`fa-solid ${videoRef.current?.paused ? 'fa-play' : 'fa-pause'}`}></i>
            </button>
            <button className="btn-circle w-[50px] h-[50px] border-none bg-header/50" onClick={() => {
              const next = (currentCatIdx + 1) % categories.length;
              setCurrentCatIdx(next);
              showToast(`Cat: ${categories[next]}`);
            }}>
              <i className="fa-solid fa-chevron-right"></i>
            </button>
          </div>

          <div className="grid grid-cols-[65px_1fr_65px] gap-4 h-[160px]">
            <div className="bg-header border border-border rounded-full flex flex-col justify-between items-center py-5 shadow-2xl">
               <button className="text-white h-12 w-full active:text-toffee" onClick={() => { setVolume(v => Math.min(100, v+10)); showToast(`Vol: ${volume}%`); }}><i className="fa-solid fa-plus text-lg"></i></button>
               <span className="text-[10px] font-black text-gray-600 uppercase tracking-tighter">VOL</span>
               <button className="text-white h-12 w-full active:text-toffee" onClick={() => { setVolume(v => Math.max(0, v-10)); showToast(`Vol: ${volume}%`); }}><i className="fa-solid fa-minus text-lg"></i></button>
            </div>
            
            <div className="grid grid-cols-2 gap-4 p-1">
              <button className="btn-circle w-full h-full text-[10px] font-black tracking-tighter" onClick={() => setActiveModal('list')}>LIST</button>
              <button className="btn-circle w-full h-full" onClick={() => setIsLandscapeMode(!isLandscapeMode)}>
                <i className={`fa-solid ${isLandscapeMode ? 'fa-compress text-toffee' : 'fa-expand'}`}></i>
              </button>
              <button className="btn-circle w-full h-full" onClick={() => setActiveModal('key')}><i className="fa-solid fa-keyboard"></i></button>
              <button className="btn-circle w-full h-full text-[10px] font-black tracking-tighter" onClick={() => setActiveModal('guide')}>GUIDE</button>
            </div>

            <div className="bg-header border border-border rounded-full flex flex-col justify-between items-center py-5 shadow-2xl">
               <button className="text-white h-12 w-full active:text-toffee" onClick={() => changeCh(1)}><i className="fa-solid fa-chevron-up text-lg"></i></button>
               <span className="text-[10px] font-black text-gray-600 uppercase tracking-tighter">CH</span>
               <button className="text-white h-12 w-full active:text-toffee" onClick={() => changeCh(-1)}><i className="fa-solid fa-chevron-down text-lg"></i></button>
            </div>
          </div>
          
          <div className="text-center text-[11px] font-black text-toffee tracking-[0.3em] uppercase opacity-80 pt-2">
            {categories[currentCatIdx] || 'All Categories'}
          </div>
        </div>

        <div className="text-gray-600 text-[10px] font-black tracking-[0.2em] uppercase underline cursor-pointer hover:text-toffee" onClick={() => setIsRemoteHidden(!isRemoteHidden)}>
          {isRemoteHidden ? 'Restore Interface' : 'Minimize Controller'}
        </div>
      </div>

      {/* Channel Grid */}
      <section className="px-6 pb-16">
        <div className="flex items-center gap-3 mb-8">
          <div className="h-5 w-1.5 bg-toffee rounded-full"></div>
          <div className="text-sm font-black uppercase tracking-[0.2em] text-gray-300">{categories[currentCatIdx] || 'All'} CHANNELS</div>
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-5 gap-5">
          {filteredChannels.map(ch => {
            const realIdx = channels.indexOf(ch);
            const isActive = realIdx === currentIdx;
            return (
              <div key={ch.id} className="flex flex-col items-center gap-3 cursor-pointer active:scale-90 transition-transform group" onClick={() => playChannel(realIdx)}>
                <div className={`w-[72px] h-[72px] bg-white rounded-full flex items-center justify-center overflow-hidden border-2 transition-all duration-300 ${isActive ? 'border-toffee shadow-[0_0_20px_rgba(255,0,85,0.4)] scale-105' : 'border-transparent group-hover:border-header'}`}>
                  <img src={ch.logo || `https://via.placeholder.com/60?text=${(ch.name?.[0] || '?').toUpperCase()}`} className="w-[75%] h-[75%] object-contain" alt={ch.name} />
                </div>
                <span className="text-[10px] font-bold text-center text-gray-500 line-clamp-1 w-full uppercase tracking-tighter px-1">{ch.name}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Footer / Dev Profile */}
      <footer className="bg-card p-12 mt-auto border-t border-border text-center">
        <div className="relative inline-block mb-6">
          <img src={devSettings.photo} className="w-20 h-20 rounded-full border-2 border-toffee mx-auto object-cover shadow-[0_0_25px_rgba(255,0,85,0.3)]" alt="Dev" onError={(e) => (e.currentTarget.src = 'https://via.placeholder.com/100?text=Mujahid')} />
          <div className="absolute -bottom-1 -right-1 bg-green-500 w-4 h-4 rounded-full border-2 border-card"></div>
        </div>
        <div className="text-2xl font-black text-toffee uppercase tracking-tighter italic">{devSettings.name}</div>
        <p className="text-[11px] text-gray-500 max-w-[280px] mx-auto my-4 leading-relaxed font-semibold italic opacity-80 underline underline-offset-4 decoration-toffee/30">
          "{devSettings.note}"
        </p>
        <div className="flex justify-center gap-8 mt-8 text-2xl text-gray-600">
           <a href="#" className="hover:text-toffee transition-colors"><i className="fa-brands fa-facebook"></i></a>
           <a href="#" className="hover:text-toffee transition-colors"><i className="fa-brands fa-github"></i></a>
           <a href="#" className="hover:text-toffee transition-colors"><i className="fa-brands fa-whatsapp"></i></a>
        </div>
        <div className="text-[9px] text-gray-800 mt-12 tracking-[0.4em] font-black uppercase opacity-50">© 2026 CLONE ARCHITECTURE BY MUJAHID</div>
      </footer>

      {/* UI Modals */}
      {activeModal && (
        <div className="fixed inset-0 z-[5000] flex items-center justify-center p-5">
          <div className="absolute inset-0 bg-black/95 backdrop-blur-lg" onClick={() => setActiveModal(null)}></div>
          <div className="relative bg-header border border-toffee/50 rounded-[45px] w-full max-w-[360px] p-10 shadow-[0_0_50px_rgba(0,0,0,0.5)] animate-in zoom-in-90 duration-300">
             {activeModal === 'key' && (
               <>
                 <h3 className="text-xl font-black text-toffee mb-8 text-center uppercase tracking-[0.2em]">DIRECT SEARCH</h3>
                 <input 
                   type="text" className="w-full bg-black border border-border p-5 text-center rounded-3xl text-white font-bold text-xl outline-none mb-8 focus:border-toffee transition-colors"
                   placeholder="CHANNEL NAME" autoFocus value={manualChInput} onChange={(e) => setManualChInput(e.target.value)}
                 />
                 <button className="w-full h-16 bg-toffee text-white font-black rounded-full shadow-lg active:scale-95 transition-transform uppercase tracking-widest" onClick={() => {
                   const found = channels.findIndex(c => c.name.toLowerCase().includes(manualChInput.toLowerCase()));
                   if(found !== -1) playChannel(found);
                   else showToast("NOT FOUND");
                   setActiveModal(null); setManualChInput("");
                 }}>GO LIVE</button>
               </>
             )}
             {activeModal === 'list' && (
               <>
                 <h3 className="text-xl font-black text-toffee mb-8 text-center uppercase tracking-[0.2em]">FAVORITES</h3>
                 <div className="grid grid-cols-3 gap-5 max-h-[320px] overflow-y-auto pr-3 custom-scrollbar">
                    {channels.slice(0, 24).map((ch, idx) => (
                       <div key={idx} className="aspect-square bg-white rounded-full p-2 flex items-center justify-center cursor-pointer active:scale-90 shadow-lg border-2 border-transparent hover:border-toffee transition-all" onClick={() => { playChannel(idx); setActiveModal(null); }}>
                          <img src={ch.logo || `https://via.placeholder.com/40`} className="w-full h-full object-contain" alt="ch" />
                       </div>
                    ))}
                 </div>
                 <button className="w-full mt-10 text-gray-500 font-black text-[11px] uppercase tracking-[0.3em]" onClick={() => setActiveModal(null)}>BACK TO PLAYER</button>
               </>
             )}
             {activeModal === 'guide' && (
               <>
                 <h3 className="text-xl font-black text-toffee mb-8 text-center uppercase tracking-[0.2em]">GUIDE</h3>
                 <div className="text-[11px] space-y-5 text-gray-400 font-bold uppercase tracking-wider">
                    <div className="flex gap-5 items-center"><i className="fa-solid fa-power-off text-toffee text-xl"></i> START ENGINE BEFORE PLAY</div>
                    <div className="flex gap-5 items-center"><i className="fa-solid fa-expand text-toffee text-xl"></i> ROTATE FOR LANDSCAPE</div>
                    <div className="flex gap-5 items-center"><i className="fa-solid fa-gear text-toffee text-xl"></i> SETTINGS AT #ADMIN</div>
                    <div className="flex gap-5 items-center"><i className="fa-solid fa-cloud-arrow-down text-toffee text-xl"></i> AUTO-SYNC TV.MU3 FILE</div>
                 </div>
                 <button className="w-full h-16 bg-toffee text-white font-black rounded-full mt-10 shadow-xl" onClick={() => setActiveModal(null)}>I UNDERSTAND</button>
               </>
             )}
          </div>
        </div>
      )}

      {/* Global Toast */}
      <div className={`fixed bottom-12 left-1/2 -translate-x-1/2 bg-black/95 text-white border border-toffee px-10 py-4 rounded-full text-xs font-black shadow-2xl transition-all duration-500 z-[10000] uppercase tracking-widest ${toast.show ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-24 opacity-0 scale-50'}`}>
        {toast.msg}
      </div>
    </div>
  );
};

const container = document.getElementById('app-root');
const root = createRoot(container!);
root.render(<App />);
