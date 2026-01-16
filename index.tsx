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
      try {
        // Try standard naming first, then typo naming
        let response = await fetch('tv.m3u');
        if (!response.ok) response = await fetch('tv.mu3');
        
        if (response.ok) {
          const text = await response.text();
          parseM3U(text);
        } else {
          console.log("No default tv.m3u/tv.mu3 found at root.");
        }
      } catch (err) {
        console.error("Error loading M3U file:", err);
      }
    };
    
    loadM3U();

    // Listen for hash changes to toggle admin
    const handleHashChange = () => setIsAdmin(window.location.hash === '#admin');
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const parseM3U = (data: string) => {
    const lines = data.split('\n');
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
      const cats = Array.from(new Set(['All', ...newChannels.map(c => c.category || 'General')]));
      setCategories(cats);
    }
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

  // Admin Save
  const saveAdminSettings = () => {
    localStorage.setItem('toffee_watermark', JSON.stringify(watermark));
    localStorage.setItem('toffee_dev', JSON.stringify(devSettings));
    showToast("Admin Settings Saved Successfully");
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
            {/* Watermark Section */}
            <div className="bg-header p-6 rounded-3xl border border-border space-y-4">
              <h2 className="text-xl font-bold flex items-center gap-2"><i className="fa-solid fa-stamp text-toffee"></i> Watermark Settings</h2>
              <div className="space-y-2">
                <label className="text-xs text-gray-500 font-bold uppercase">Logo Path</label>
                <input type="text" value={watermark.url} onChange={e => setWatermark({...watermark, url: e.target.value})} className="w-full bg-black border border-border p-3 rounded-xl outline-none" />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-gray-500 font-bold uppercase">Opacity ({Math.round(watermark.opacity * 100)}%)</label>
                <input type="range" min="0" max="1" step="0.1" value={watermark.opacity} onChange={e => setWatermark({...watermark, opacity: parseFloat(e.target.value)})} className="w-full accent-toffee" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs text-gray-500 font-bold uppercase">Top Pos (%)</label>
                  <input type="range" min="0" max="100" value={watermark.top} onChange={e => setWatermark({...watermark, top: parseInt(e.target.value)})} className="w-full accent-toffee" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-gray-500 font-bold uppercase">Left Pos (%)</label>
                  <input type="range" min="0" max="100" value={watermark.left} onChange={e => setWatermark({...watermark, left: parseInt(e.target.value)})} className="w-full accent-toffee" />
                </div>
              </div>
            </div>

            {/* Developer Section */}
            <div className="bg-header p-6 rounded-3xl border border-border space-y-4">
              <h2 className="text-xl font-bold flex items-center gap-2"><i className="fa-solid fa-user-gear text-toffee"></i> Developer Settings</h2>
              <div className="space-y-2">
                <label className="text-xs text-gray-500 font-bold uppercase">Dev Photo Path</label>
                <input type="text" value={devSettings.photo} onChange={e => setDevSettings({...devSettings, photo: e.target.value})} className="w-full bg-black border border-border p-3 rounded-xl outline-none" />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-gray-500 font-bold uppercase">Dev Name</label>
                <input type="text" value={devSettings.name} onChange={e => setDevSettings({...devSettings, name: e.target.value})} className="w-full bg-black border border-border p-3 rounded-xl outline-none" />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-gray-500 font-bold uppercase">Bio Note</label>
                <textarea value={devSettings.note} onChange={e => setDevSettings({...devSettings, note: e.target.value})} className="w-full bg-black border border-border p-3 rounded-xl outline-none h-24 resize-none" />
              </div>
            </div>
          </div>

          <button onClick={saveAdminSettings} className="w-full bg-toffee py-4 rounded-2xl font-black text-xl shadow-lg active:scale-95 transition-transform">SAVE ALL SETTINGS</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-dark text-white select-none font-sans overflow-x-hidden">
      {/* Header */}
      <header className="flex justify-between items-center p-4 bg-header border-b border-border sticky top-0 z-[100]">
        <div className="text-2xl font-black text-toffee italic tracking-tighter">TOFFEE ULTRA</div>
        <div className="flex gap-5 text-xl">
          <i className="fa-solid fa-magnifying-glass hover:text-toffee cursor-pointer" onClick={() => setActiveModal('key')}></i>
          <i className="fa-solid fa-gear hover:text-toffee cursor-pointer" onClick={() => window.location.hash = '#admin'}></i>
        </div>
      </header>

      {/* Video Box */}
      <div className={`video-box w-full bg-black relative flex items-center justify-center transition-all duration-300 ${isLandscapeMode ? 'full-rotate' : 'h-[210px]'}`}>
        <video 
          ref={videoRef} 
          className="w-full h-full object-contain"
          onLoadStart={() => setIsLoading(true)}
          onCanPlay={() => setIsLoading(false)}
          onEnded={() => changeCh(1)}
          onError={() => { if(currentIdx >=0) handleChannelError(channels[currentIdx].id); }}
          playsInline
        />
        
        {/* Watermark - Controlled by Admin */}
        {isPowerOn && (
          <img 
            src={watermark.url} 
            className="absolute pointer-events-none" 
            style={{ 
              opacity: watermark.opacity, 
              top: `${watermark.top}%`, 
              left: `${watermark.left}%`, 
              height: '35px', 
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

      {/* Status */}
      <div className="flex justify-between items-center px-5 py-3 bg-card border-b border-border text-sm">
        <div className="font-bold truncate max-w-[70%] text-gray-200">
          {currentIdx >= 0 && isPowerOn ? channels[currentIdx].name : "TV Ready - Select Channel"}
        </div>
        <div className="text-toffee font-extrabold text-[10px] tracking-widest">LIVE PRO</div>
      </div>

      {/* Controller Area */}
      <div className="p-6 flex flex-col items-center gap-6">
        <div className={`remote-ui w-full max-w-[320px] space-y-5 ${isRemoteHidden ? 'hidden h-0 opacity-0' : 'block opacity-100 transition-all duration-500'}`}>
          <div className="flex justify-between">
            <button className={`btn-circle ${isPowerOn ? 'text-green-500 shadow-[0_0_15px_green]' : 'text-red-600'}`} onClick={togglePower}>
              <i className="fa-solid fa-power-off"></i>
            </button>
            <button className="btn-circle" onClick={() => location.reload()}>
              <i className="fa-solid fa-house"></i>
            </button>
            <button className="btn-circle" onClick={() => { setIsMuted(!isMuted); if(videoRef.current) videoRef.current.muted = !isMuted; }}>
              <i className={`fa-solid ${isMuted ? 'fa-volume-xmark' : 'fa-volume-high'}`}></i>
            </button>
          </div>

          <div className="flex justify-center gap-4">
            <button className="btn-circle text-xs font-bold" onClick={() => {
              const next = (currentCatIdx - 1 + categories.length) % categories.length;
              setCurrentCatIdx(next);
              showToast(`Category: ${categories[next]}`);
            }}>
              <i className="fa-solid fa-chevron-left"></i>
            </button>
            <button className="btn-circle scale-110 border-toffee text-toffee" onClick={() => videoRef.current?.paused ? videoRef.current.play() : videoRef.current?.pause()}>
              <i className={`fa-solid ${videoRef.current?.paused ? 'fa-play' : 'fa-pause'}`}></i>
            </button>
            <button className="btn-circle text-xs font-bold" onClick={() => {
              const next = (currentCatIdx + 1) % categories.length;
              setCurrentCatIdx(next);
              showToast(`Category: ${categories[next]}`);
            }}>
              <i className="fa-solid fa-chevron-right"></i>
            </button>
          </div>

          <div className="grid grid-cols-[60px_1fr_60px] gap-4 h-[140px]">
            <div className="bg-header border border-border rounded-full flex flex-col justify-between items-center py-4 shadow-inner">
               <button className="text-white h-10 w-full" onClick={() => { setVolume(v => Math.min(100, v+10)); showToast(`Volume: ${volume}%`); }}><i className="fa-solid fa-plus"></i></button>
               <span className="text-[9px] font-black text-gray-600">VOL</span>
               <button className="text-white h-10 w-full" onClick={() => { setVolume(v => Math.max(0, v-10)); showToast(`Volume: ${volume}%`); }}><i className="fa-solid fa-minus"></i></button>
            </div>
            
            {/* ROUND ICON GRID */}
            <div className="grid grid-cols-2 gap-3 p-1">
              <button className="btn-circle w-full h-full text-[10px] font-black" onClick={() => setActiveModal('list')}>LIST</button>
              <button className="btn-circle w-full h-full text-lg" onClick={() => setIsLandscapeMode(!isLandscapeMode)}>
                <i className={`fa-solid ${isLandscapeMode ? 'fa-compress' : 'fa-expand'}`}></i>
              </button>
              <button className="btn-circle w-full h-full text-lg" onClick={() => setActiveModal('key')}><i className="fa-solid fa-keyboard"></i></button>
              <button className="btn-circle w-full h-full text-[10px] font-black" onClick={() => setActiveModal('guide')}>GUIDE</button>
            </div>

            <div className="bg-header border border-border rounded-full flex flex-col justify-between items-center py-4 shadow-inner">
               <button className="text-white h-10 w-full" onClick={() => changeCh(1)}><i className="fa-solid fa-chevron-up"></i></button>
               <span className="text-[9px] font-black text-gray-600">CH</span>
               <button className="text-white h-10 w-full" onClick={() => changeCh(-1)}><i className="fa-solid fa-chevron-down"></i></button>
            </div>
          </div>
          
          <div className="text-center text-[10px] font-black text-toffee tracking-[0.2em] uppercase">
            {categories[currentCatIdx] || 'All'}
          </div>
        </div>

        <div className="text-gray-600 text-xs font-bold tracking-tighter uppercase underline cursor-pointer" onClick={() => setIsRemoteHidden(!isRemoteHidden)}>
          {isRemoteHidden ? 'Show Controls' : 'Hide Controls'}
        </div>
      </div>

      {/* Grid */}
      <section className="px-5 pb-12">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-4 w-1 bg-toffee"></div>
          <div className="text-sm font-black uppercase tracking-widest">{categories[currentCatIdx] || 'All'} Channels</div>
        </div>
        <div className="grid grid-cols-4 gap-4">
          {filteredChannels.map(ch => {
            const realIdx = channels.indexOf(ch);
            const isActive = realIdx === currentIdx;
            return (
              <div key={ch.id} className="flex flex-col items-center gap-2 cursor-pointer active:scale-90 transition-all" onClick={() => playChannel(realIdx)}>
                <div className={`w-[65px] h-[65px] bg-white rounded-full flex items-center justify-center overflow-hidden border-2 transition-all ${isActive ? 'border-toffee shadow-[0_0_15px_#ff005577]' : 'border-transparent'}`}>
                  <img src={ch.logo || `https://via.placeholder.com/60?text=${(ch.name?.[0] || '?').toUpperCase()}`} className="w-[70%] h-[70%] object-contain" alt={ch.name} />
                </div>
                <span className="text-[9px] font-bold text-center text-gray-500 line-clamp-1 w-full px-1">{ch.name}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-card p-10 mt-auto border-t border-border text-center">
        <img src={devSettings.photo} className="w-16 h-16 rounded-full border-2 border-toffee mx-auto mb-4 object-cover shadow-[0_0_20px_#ff005555]" alt="Dev" onError={(e) => (e.currentTarget.src = 'https://via.placeholder.com/100?text=Dev')} />
        <div className="text-lg font-black text-toffee uppercase tracking-tighter">{devSettings.name}</div>
        <p className="text-[10px] text-gray-500 max-w-[240px] mx-auto my-3 leading-relaxed font-medium">{devSettings.note}</p>
        <div className="flex justify-center gap-6 mt-5 text-xl text-gray-600">
           <a href="#"><i className="fa-brands fa-facebook hover:text-toffee"></i></a>
           <a href="#"><i className="fa-brands fa-github hover:text-toffee"></i></a>
           <a href="#"><i className="fa-brands fa-whatsapp hover:text-toffee"></i></a>
        </div>
        <div className="text-[8px] text-gray-800 mt-10 tracking-[0.3em] font-black uppercase opacity-40">© 2026 TOFFEE CLONE BY MUJAHID</div>
      </footer>

      {/* Modals */}
      {activeModal && (
        <div className="fixed inset-0 z-[5000] flex items-center justify-center p-5">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setActiveModal(null)}></div>
          <div className="relative bg-header border border-toffee rounded-[40px] w-full max-w-[340px] p-8 shadow-2xl animate-in zoom-in-95 duration-200">
             {activeModal === 'key' && (
               <>
                 <h3 className="text-lg font-black text-toffee mb-6 text-center uppercase tracking-widest">Global Search</h3>
                 <input 
                   type="text" className="w-full bg-black border border-border p-4 text-center rounded-2xl text-white outline-none mb-6"
                   placeholder="Channel Name..." autoFocus value={manualChInput} onChange={(e) => setManualChInput(e.target.value)}
                 />
                 <button className="w-full h-14 bg-toffee text-white font-black rounded-full active:scale-95 transition-transform" onClick={() => {
                   const found = channels.findIndex(c => c.name.toLowerCase().includes(manualChInput.toLowerCase()));
                   if(found !== -1) playChannel(found);
                   else showToast("Channel Not Found");
                   setActiveModal(null); setManualChInput("");
                 }}>GO LIVE</button>
               </>
             )}
             {activeModal === 'list' && (
               <>
                 <h3 className="text-lg font-black text-toffee mb-6 text-center uppercase tracking-widest">Mini Icons</h3>
                 <div className="grid grid-cols-3 gap-4 max-h-[300px] overflow-y-auto pr-2">
                    {channels.slice(0, 18).map((ch, idx) => (
                       <div key={idx} className="aspect-square bg-white rounded-full p-2 flex items-center justify-center cursor-pointer active:scale-90 transition-transform" onClick={() => { playChannel(idx); setActiveModal(null); }}>
                          <img src={ch.logo || `https://via.placeholder.com/40`} className="w-full h-full object-contain" />
                       </div>
                    ))}
                 </div>
                 <button className="w-full mt-8 text-gray-500 font-black text-[10px] uppercase tracking-widest" onClick={() => setActiveModal(null)}>CLOSE PANEL</button>
               </>
             )}
             {activeModal === 'guide' && (
               <>
                 <h3 className="text-lg font-black text-toffee mb-6 text-center uppercase tracking-widest">User Help</h3>
                 <div className="text-[10px] space-y-4 text-gray-400 font-bold uppercase tracking-wider">
                    <div className="flex gap-4 items-center"><i className="fa-solid fa-power-off text-toffee text-lg"></i> Boot system before streaming</div>
                    <div className="flex gap-4 items-center"><i className="fa-solid fa-expand text-toffee text-lg"></i> Force landscape orientation</div>
                    <div className="flex gap-4 items-center"><i className="fa-solid fa-gear text-toffee text-lg"></i> Access admin at #admin hash</div>
                 </div>
                 <button className="w-full h-14 bg-toffee text-white font-black rounded-full mt-8" onClick={() => setActiveModal(null)}>GOT IT</button>
               </>
             )}
          </div>
        </div>
      )}

      {/* Toast */}
      <div className={`fixed bottom-10 left-1/2 -translate-x-1/2 bg-black/95 text-white border border-toffee px-8 py-3 rounded-full text-sm font-bold shadow-2xl transition-all duration-300 z-[10000] ${toast.show ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0'}`}>
        {toast.msg}
      </div>
    </div>
  );
};

const container = document.getElementById('app-root');
const root = createRoot(container!);
root.render(<App />);
