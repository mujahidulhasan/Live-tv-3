import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createRoot } from 'react-dom/client';

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

  // Admin Config
  const [watermark, setWatermark] = useState<WatermarkConfig>(() => {
    const saved = localStorage.getItem('ultra_iptv_watermark');
    return saved ? JSON.parse(saved) : { opacity: 0.5, top: 10, left: 10, url: 'assets/logo.png' };
  });

  const [dev, setDev] = useState<DevConfig>(() => {
    const saved = localStorage.getItem('ultra_iptv_dev');
    return saved ? JSON.parse(saved) : { photo: 'assets/dev.png', name: 'Mujahid', note: "I build highly responsive and aesthetic UI experiences." };
  });

  const videoRef = useRef<HTMLVideoElement>(null);

  // --- Effects ---
  useEffect(() => {
    const handleHash = () => setIsAdmin(window.location.hash === '#admin');
    window.addEventListener('hashchange', handleHash);

    // Initial load from local storage or fetch
    const loadData = async () => {
      // Priority 1: Fetch local tv.mu3 or tv.m3u
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
          const parsed = JSON.parse(saved);
          setChannels(parsed);
          updateCategories(parsed);
        } else {
          // Fallback demo
          const demo = [
            { id: 'd1', name: 'Demo Somoy TV', url: 'https://cdn-1.toffeelive.com/somoy/index.m3u8', category: 'News', logo: 'https://seeklogo.com/images/S/somoy-tv-logo-87B757523F-seeklogo.com.png' },
            { id: 'd2', name: 'Demo T Sports', url: 'https://cdn-1.toffeelive.com/tsports/index.m3u8', category: 'Sports', logo: 'https://tsports.com/static/media/tsports-logo.8e7b99c2.png' }
          ];
          setChannels(demo);
          updateCategories(demo);
        }
      }
    };

    loadData();
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

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
    setTimeout(() => setToast({ msg: '', show: false }), 2500);
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
    showToast("Load Failed - Skipping Channel");
    // Optionally auto-play next
    setTimeout(() => changeCh(1), 500);
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
    }
  };

  const saveAdmin = () => {
    localStorage.setItem('ultra_iptv_watermark', JSON.stringify(watermark));
    localStorage.setItem('ultra_iptv_dev', JSON.stringify(dev));
    showToast("Admin Config Saved");
  };

  const filteredChannels = useMemo(() => {
    const cat = categories[currentCatIdx] || 'All';
    return channels.filter(c => !deadChannelIds.has(c.id) && (cat === 'All' || (c.category || 'General') === cat));
  }, [channels, currentCatIdx, categories, deadChannelIds]);

  // --- Render Admin Panel ---
  if (isAdmin) {
    return (
      <div className="min-h-screen bg-dark text-white p-6 font-sans">
        <div className="max-w-4xl mx-auto space-y-8">
          <header className="flex justify-between items-center border-b border-border pb-6">
            <h1 className="text-3xl font-black text-toffee italic tracking-tighter">ADMIN CONTROL</h1>
            <button onClick={() => window.location.hash = ''} className="bg-toffee px-8 py-2 rounded-full font-black uppercase text-xs tracking-widest shadow-lg shadow-toffee/20">Exit Admin</button>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Watermark Section */}
            <div className="bg-header p-8 rounded-[40px] border border-border space-y-6 shadow-2xl">
              <h2 className="text-xl font-bold flex items-center gap-3"><i className="fa-solid fa-stamp text-toffee"></i> Watermark Settings</h2>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Logo URL</label>
                  <input type="text" value={watermark.url} onChange={e => setWatermark({...watermark, url: e.target.value})} className="w-full bg-black border border-border p-4 rounded-2xl outline-none focus:border-toffee transition-colors" />
                </div>
                
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Opacity ({Math.round(watermark.opacity * 100)}%)</label>
                  <input type="range" min="0" max="1" step="0.1" value={watermark.opacity} onChange={e => setWatermark({...watermark, opacity: parseFloat(e.target.value)})} className="w-full h-2 bg-border rounded-lg appearance-none cursor-pointer accent-toffee" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Top Pos ({watermark.top}%)</label>
                    <input type="range" min="0" max="100" value={watermark.top} onChange={e => setWatermark({...watermark, top: parseInt(e.target.value)})} className="w-full accent-toffee" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Left Pos ({watermark.left}%)</label>
                    <input type="range" min="0" max="100" value={watermark.left} onChange={e => setWatermark({...watermark, left: parseInt(e.target.value)})} className="w-full accent-toffee" />
                  </div>
                </div>
              </div>
            </div>

            {/* Developer Section */}
            <div className="bg-header p-8 rounded-[40px] border border-border space-y-6 shadow-2xl">
              <h2 className="text-xl font-bold flex items-center gap-3"><i className="fa-solid fa-user-gear text-toffee"></i> Developer Settings</h2>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Dev Photo Path</label>
                  <input type="text" value={dev.photo} onChange={e => setDev({...dev, photo: e.target.value})} className="w-full bg-black border border-border p-4 rounded-2xl outline-none focus:border-toffee transition-colors" placeholder="assets/dev.png" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Display Name</label>
                  <input type="text" value={dev.name} onChange={e => setDev({...dev, name: e.target.value})} className="w-full bg-black border border-border p-4 rounded-2xl outline-none" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Bio Note</label>
                  <textarea value={dev.note} onChange={e => setDev({...dev, note: e.target.value})} className="w-full bg-black border border-border p-4 rounded-2xl outline-none h-24 resize-none" />
                </div>
              </div>
            </div>
          </div>

          <button onClick={saveAdmin} className="w-full bg-toffee py-6 rounded-3xl font-black text-xl shadow-2xl active:scale-[0.98] transition-all hover:brightness-110">SAVE ALL CONFIGURATIONS</button>
        </div>
      </div>
    );
  }

  // --- Render Main Player ---
  return (
    <div className="flex flex-col min-h-screen bg-dark text-white select-none font-sans overflow-x-hidden">
      {/* App Header */}
      <header className="flex justify-between items-center px-6 py-4 bg-header border-b border-border sticky top-0 z-[100] backdrop-blur-md bg-opacity-80">
        <div className="text-2xl font-black text-toffee italic tracking-tighter">TOFFEE ULTRA</div>
        <div className="flex gap-6 text-xl">
          <i className="fa-solid fa-magnifying-glass hover:text-toffee cursor-pointer transition-colors" onClick={() => setActiveModal('search')}></i>
          <i className="fa-solid fa-gear hover:text-toffee cursor-pointer transition-colors" onClick={() => window.location.hash = '#admin'}></i>
        </div>
      </header>

      {/* Video Area */}
      <div className={`video-box w-full bg-black relative flex items-center justify-center transition-all duration-500 ${isLandscape ? 'full-rotate' : 'h-[230px]'}`}>
        <video 
          ref={videoRef} 
          className="w-full h-full object-contain"
          onLoadStart={() => setIsLoading(true)}
          onCanPlay={() => setIsLoading(false)}
          onEnded={() => changeCh(1)}
          onError={() => { if(currentIdx >=0) handleChannelError(channels[currentIdx].id); }}
          playsInline
        />
        
        {/* Admin Watermark */}
        {isPowerOn && watermark.url && (
          <img 
            src={watermark.url} 
            className="absolute pointer-events-none transition-all" 
            style={{ 
              opacity: watermark.opacity, 
              top: `${watermark.top}%`, 
              left: `${watermark.left}%`, 
              height: '35px', 
              objectFit: 'contain' 
            }} 
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />
        )}

        {isLoading && (
          <div className="absolute w-12 h-12 border-4 border-white/10 border-t-toffee rounded-full animate-spin"></div>
        )}
      </div>

      {/* Channel Info */}
      <div className="flex justify-between items-center px-6 py-4 bg-card border-b border-border text-xs">
        <div className="font-black truncate max-w-[70%] text-gray-200 uppercase tracking-widest flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${isPowerOn ? 'bg-green-500 shadow-[0_0_8px_green]' : 'bg-red-500'}`}></div>
          {currentIdx >= 0 && isPowerOn ? channels[currentIdx].name : "Select Channel"}
        </div>
        <div className="text-toffee font-black bg-header px-3 py-1 rounded-full border border-border shadow-inner">LIVE ULTRA PRO</div>
      </div>

      {/* Modern Controller Area */}
      <div className="p-8 flex flex-col items-center gap-8">
        <div className="w-full max-w-[340px] space-y-8">
          {/* Top Control Bar */}
          <div className="flex justify-between px-2">
            <button className={`btn-circle ${isPowerOn ? 'text-green-500 shadow-[0_0_25px_rgba(34,197,94,0.3)]' : 'text-red-500'}`} onClick={togglePower}>
              <i className="fa-solid fa-power-off text-xl"></i>
            </button>
            <button className="btn-circle" onClick={() => location.reload()}>
              <i className="fa-solid fa-house"></i>
            </button>
            <button className="btn-circle" onClick={() => { setIsMuted(!isMuted); if(videoRef.current) videoRef.current.muted = !isMuted; }}>
              <i className={`fa-solid ${isMuted ? 'fa-volume-xmark' : 'fa-volume-high'}`}></i>
            </button>
          </div>

          {/* Media & Category Controls */}
          <div className="flex justify-center gap-8 items-center">
            <button className="btn-circle w-[55px] h-[55px] border-none bg-header/40 active:bg-toffee" onClick={() => {
              const next = (currentCatIdx - 1 + categories.length) % categories.length;
              setCurrentCatIdx(next);
              showToast(`Category: ${categories[next]}`);
            }}>
              <i className="fa-solid fa-chevron-left"></i>
            </button>
            <button className="btn-circle scale-[1.3] border-toffee text-toffee bg-dark shadow-2xl" onClick={() => videoRef.current?.paused ? videoRef.current.play() : videoRef.current?.pause()}>
              <i className={`fa-solid ${videoRef.current?.paused ? 'fa-play' : 'fa-pause'}`}></i>
            </button>
            <button className="btn-circle w-[55px] h-[55px] border-none bg-header/40 active:bg-toffee" onClick={() => {
              const next = (currentCatIdx + 1) % categories.length;
              setCurrentCatIdx(next);
              showToast(`Category: ${categories[next]}`);
            }}>
              <i className="fa-solid fa-chevron-right"></i>
            </button>
          </div>

          {/* Vertical Control Pillars + Middle Circle Grid */}
          <div className="grid grid-cols-[70px_1fr_70px] gap-6 h-[180px]">
            {/* VOL Pillar */}
            <div className="bg-header border border-border rounded-full flex flex-col justify-between items-center py-6 shadow-2xl">
               <button className="text-white h-12 w-full active:text-toffee" onClick={() => { setVolume(v => Math.min(100, v+10)); showToast(`Volume: ${volume}%`); }}><i className="fa-solid fa-plus"></i></button>
               <span className="text-[10px] font-black text-gray-600 uppercase tracking-tighter">VOL</span>
               <button className="text-white h-12 w-full active:text-toffee" onClick={() => { setVolume(v => Math.max(0, v-10)); showToast(`Volume: ${volume}%`); }}><i className="fa-solid fa-minus"></i></button>
            </div>
            
            {/* 2x2 Circle Grid for Tools */}
            <div className="grid grid-cols-2 gap-4">
              <button className="btn-circle w-full h-full text-[10px] font-black tracking-widest" onClick={() => setActiveModal('list')}>LIST</button>
              <button className="btn-circle w-full h-full text-lg" onClick={() => setIsLandscape(!isLandscape)}>
                <i className={`fa-solid ${isLandscape ? 'fa-compress text-toffee' : 'fa-expand'}`}></i>
              </button>
              <button className="btn-circle w-full h-full text-lg" onClick={() => setActiveModal('search')}><i className="fa-solid fa-keyboard"></i></button>
              <button className="btn-circle w-full h-full text-[10px] font-black tracking-widest" onClick={() => setActiveModal('guide')}>GUIDE</button>
            </div>

            {/* CH Pillar */}
            <div className="bg-header border border-border rounded-full flex flex-col justify-between items-center py-6 shadow-2xl">
               <button className="text-white h-12 w-full active:text-toffee" onClick={() => changeCh(1)}><i className="fa-solid fa-chevron-up"></i></button>
               <span className="text-[10px] font-black text-gray-600 uppercase tracking-tighter">CH</span>
               <button className="text-white h-12 w-full active:text-toffee" onClick={() => changeCh(-1)}><i className="fa-solid fa-chevron-down"></i></button>
            </div>
          </div>
          
          <div className="text-center text-[10px] font-black text-toffee tracking-[0.4em] uppercase opacity-70">
            {categories[currentCatIdx] || 'All Categories'}
          </div>
        </div>
      </div>

      {/* Grid Display */}
      <section className="px-6 pb-20">
        <div className="flex items-center gap-3 mb-10">
          <div className="h-6 w-1.5 bg-toffee rounded-full shadow-[0_0_10px_#ff0055]"></div>
          <div className="text-sm font-black uppercase tracking-[0.3em] text-gray-400">{categories[currentCatIdx] || 'All'} CHANNELS</div>
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-5 gap-8">
          {filteredChannels.map(ch => {
            const realIdx = channels.indexOf(ch);
            const isActive = realIdx === currentIdx;
            return (
              <div key={ch.id} className="flex flex-col items-center gap-3 cursor-pointer group" onClick={() => playChannel(realIdx)}>
                <div className={`w-[75px] h-[75px] bg-white rounded-full flex items-center justify-center overflow-hidden border-2 transition-all duration-300 active:scale-90 ${isActive ? 'border-toffee shadow-[0_0_25px_rgba(255,0,85,0.5)] scale-110' : 'border-transparent group-hover:border-header'}`}>
                  <img src={ch.logo || `https://via.placeholder.com/60?text=${(ch.name?.[0] || '?').toUpperCase()}`} className="w-[75%] h-[75%] object-contain" alt={ch.name} />
                </div>
                <span className="text-[10px] font-black text-center text-gray-500 line-clamp-1 w-full uppercase tracking-tighter opacity-80">{ch.name}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Profile Footer */}
      <footer className="bg-card p-14 border-t border-border text-center shadow-inner">
        <div className="relative inline-block mb-8">
          <img src={dev.photo} className="w-24 h-24 rounded-full border-2 border-toffee mx-auto object-cover shadow-[0_0_30px_rgba(255,0,85,0.4)] transition-transform hover:scale-105" alt="Dev" onError={(e) => (e.currentTarget.src = 'https://via.placeholder.com/100?text=Mujahid')} />
          <div className="absolute bottom-1 right-2 bg-green-500 w-5 h-5 rounded-full border-4 border-card"></div>
        </div>
        <div className="text-3xl font-black text-toffee uppercase italic tracking-tighter">{dev.name}</div>
        <p className="text-xs text-gray-500 max-w-[280px] mx-auto my-6 leading-relaxed font-bold opacity-60 italic">
          "{dev.note}"
        </p>
        <div className="flex justify-center gap-10 mt-10 text-3xl text-gray-700">
           <a href="#" className="hover:text-toffee transition-colors"><i className="fa-brands fa-facebook"></i></a>
           <a href="#" className="hover:text-toffee transition-colors"><i className="fa-brands fa-github"></i></a>
           <a href="#" className="hover:text-toffee transition-colors"><i className="fa-brands fa-whatsapp"></i></a>
        </div>
        <div className="text-[10px] text-gray-800 mt-16 tracking-[0.5em] font-black uppercase opacity-40">© 2026 ARCHITECTURE BY MUJAHID</div>
      </footer>

      {/* Modals */}
      {activeModal && (
        <div className="fixed inset-0 z-[5000] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-xl" onClick={() => setActiveModal(null)}></div>
          <div className="relative bg-header border border-toffee/30 rounded-[50px] w-full max-w-[360px] p-12 shadow-[0_0_80px_rgba(0,0,0,0.8)] animate-in zoom-in-95 duration-300">
             {activeModal === 'search' && (
               <>
                 <h3 className="text-xl font-black text-toffee mb-10 text-center uppercase tracking-[0.3em]">QUICK FIND</h3>
                 <input 
                   type="text" className="w-full bg-black border border-border p-6 text-center rounded-[30px] text-white font-black text-xl outline-none mb-10 focus:border-toffee transition-all shadow-inner"
                   placeholder="CHANNEL NAME" autoFocus onChange={(e) => {
                     const q = e.target.value.toLowerCase();
                     if(q.length > 2) {
                       const f = channels.findIndex(c => c.name.toLowerCase().includes(q));
                       if(f !== -1) { playChannel(f); showToast(`Playing: ${channels[f].name}`); }
                     }
                   }}
                 />
                 <button className="w-full h-16 bg-toffee text-white font-black rounded-full shadow-2xl active:scale-95 transition-transform uppercase tracking-widest" onClick={() => setActiveModal(null)}>BACK TO PLAYER</button>
               </>
             )}
             {activeModal === 'list' && (
               <>
                 <h3 className="text-xl font-black text-toffee mb-10 text-center uppercase tracking-[0.3em]">FAVORITES</h3>
                 <div className="grid grid-cols-3 gap-6 max-h-[340px] overflow-y-auto pr-2 custom-scrollbar">
                    {channels.slice(0, 30).map((ch, idx) => (
                       <div key={idx} className="aspect-square bg-white rounded-full p-2 flex items-center justify-center cursor-pointer active:scale-90 shadow-xl border-4 border-transparent hover:border-toffee transition-all" onClick={() => { playChannel(idx); setActiveModal(null); }}>
                          <img src={ch.logo || `https://via.placeholder.com/40`} className="w-full h-full object-contain" alt="ch" />
                       </div>
                    ))}
                 </div>
                 <button className="w-full mt-12 text-gray-500 font-black text-[10px] uppercase tracking-[0.4em]" onClick={() => setActiveModal(null)}>CLOSE PANEL</button>
               </>
             )}
             {activeModal === 'guide' && (
               <>
                 <h3 className="text-xl font-black text-toffee mb-10 text-center uppercase tracking-[0.3em]">ASSISTANCE</h3>
                 <div className="text-[10px] space-y-6 text-gray-400 font-bold uppercase tracking-widest">
                    <div className="flex gap-6 items-center"><i className="fa-solid fa-power-off text-toffee text-2xl"></i> SYSTEM BOOT REQUIRED</div>
                    <div className="flex gap-6 items-center"><i className="fa-solid fa-expand text-toffee text-2xl"></i> 90° FORCE ORIENTATION</div>
                    <div className="flex gap-6 items-center"><i className="fa-solid fa-gear text-toffee text-2xl"></i> ROOT ADMIN AT #ADMIN</div>
                    <div className="flex gap-6 items-center"><i className="fa-solid fa-file-code text-toffee text-2xl"></i> AUTO SYNC TV.MU3 FILE</div>
                 </div>
                 <button className="w-full h-16 bg-toffee text-white font-black rounded-full mt-12 shadow-2xl" onClick={() => setActiveModal(null)}>CLOSE GUIDE</button>
               </>
             )}
          </div>
        </div>
      )}

      {/* Global Toast */}
      <div className={`fixed bottom-14 left-1/2 -translate-x-1/2 bg-black/95 text-white border border-toffee/50 px-10 py-5 rounded-full text-[10px] font-black shadow-2xl transition-all duration-500 z-[10000] uppercase tracking-widest ${toast.show ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-28 opacity-0 scale-50'}`}>
        {toast.msg}
      </div>
    </div>
  );
};

// --- Render ---
const container = document.getElementById('app-root');
const root = createRoot(container!);
root.render(<App />);
