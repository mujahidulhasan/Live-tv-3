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
  visible: boolean;
}

interface DevSettings {
  photo: string;
  name: string;
  note: string;
}

// --- App Component ---
const App = () => {
  // Routing simulation via Hash
  const [view, setView] = useState<'player' | 'admin'>(window.location.hash === '#admin' ? 'admin' : 'player');

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
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; show: boolean }>({ msg: '', show: false });

  // Admin Configurable Settings (Persisted in LocalStorage)
  const [watermark, setWatermark] = useState<WatermarkSettings>(() => {
    const saved = localStorage.getItem('toffee_watermark_v2');
    return saved ? JSON.parse(saved) : { opacity: 0.6, top: 10, left: 10, url: 'assets/logo.png', visible: true };
  });

  const [devSettings, setDevSettings] = useState<DevSettings>(() => {
    const saved = localStorage.getItem('toffee_dev_v2');
    return saved ? JSON.parse(saved) : { photo: 'assets/dev.png', name: 'Mujahid', note: "Dhaka Polytechnic student. I build highly responsive and aesthetic UI experiences." };
  });

  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [manualChInput, setManualChInput] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);

  // Sync state with hash for admin routing
  useEffect(() => {
    const handleHashChange = () => {
      setView(window.location.hash === '#admin' ? 'admin' : 'player');
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Optimized tv.mu3 / tv.m3u Loader for Vercel
  useEffect(() => {
    const loadM3U = async () => {
      // Use cache busting to force Vercel to serve the latest file
      const bust = `?v=${Date.now()}`;
      const paths = ['tv.mu3', 'tv.m3u', '/tv.mu3', '/tv.m3u', './tv.mu3'];
      
      let data = "";
      for (const path of paths) {
        try {
          const res = await fetch(path + bust);
          if (res.ok) {
            data = await res.text();
            if (data.trim().startsWith('#EXTM3U')) break;
          }
        } catch (e) {
          console.warn(`Failed to fetch ${path}`);
        }
      }

      if (data) {
        parseM3U(data);
        showToast("Playlist Synced from Server");
      } else {
        // Fallback to local storage or demo
        const saved = localStorage.getItem('toffee_iptv_data');
        if (saved) {
          const parsed = JSON.parse(saved);
          setChannels(parsed);
          updateCategories(parsed);
        } else {
          const demo = [
            { id: '1', name: 'Somoy TV', url: 'https://cdn-1.toffeelive.com/somoy/index.m3u8', category: 'News', logo: 'https://seeklogo.com/images/S/somoy-tv-logo-87B757523F-seeklogo.com.png' },
            { id: '2', name: 'T Sports', url: 'https://cdn-1.toffeelive.com/tsports/index.m3u8', category: 'Sports', logo: 'https://tsports.com/static/media/tsports-logo.8e7b99c2.png' }
          ];
          setChannels(demo);
          updateCategories(demo);
        }
      }
    };
    loadM3U();
  }, []);

  const parseM3U = (data: string) => {
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
      updateCategories(newChannels);
      localStorage.setItem('toffee_iptv_data', JSON.stringify(newChannels));
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

  const togglePower = () => {
    if (!isPowerOn) {
      setIsPowerOn(true);
      showToast("System Booting...");
      if (channels.length > 0) playChannel(0);
    } else {
      setIsPowerOn(false);
      showToast("Shutting Down");
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
        handleError(ch.id);
        setIsLoading(false);
      });
    }
  };

  const handleError = (id: string) => {
    setErrorIds(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    showToast("Load Failed - Channel Hidden");
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

  // Admin Section Render
  if (view === 'admin') {
    return (
      <div className="min-h-screen bg-dark text-white p-6 font-sans">
        <div className="max-w-4xl mx-auto space-y-8">
          <header className="flex justify-between items-center border-b border-border pb-4">
            <h1 className="text-2xl font-black text-toffee tracking-tighter">ADMIN PANEL</h1>
            <button 
              onClick={() => { window.location.hash = ''; }}
              className="bg-toffee px-6 py-2 rounded-full font-bold text-sm shadow-lg shadow-toffee/20"
            >
              Back to TV
            </button>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Watermark Section */}
            <div className="bg-header p-6 rounded-3xl border border-border space-y-6">
              <h2 className="text-xl font-bold flex items-center gap-2"><i className="fa-solid fa-stamp text-toffee"></i> Watermark Control</h2>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-sm text-gray-400 font-bold">Visibility</label>
                  <button 
                    onClick={() => setWatermark({...watermark, visible: !watermark.visible})}
                    className={`w-12 h-6 rounded-full transition-colors ${watermark.visible ? 'bg-toffee' : 'bg-gray-700'}`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full transition-transform ${watermark.visible ? 'translate-x-7' : 'translate-x-1'}`}></div>
                  </button>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 font-bold mb-2 uppercase">Logo URL/Path</label>
                  <input type="text" value={watermark.url} onChange={e => setWatermark({...watermark, url: e.target.value})} className="w-full bg-black border border-border p-3 rounded-xl outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 font-bold mb-2 uppercase">Opacity ({Math.round(watermark.opacity * 100)}%)</label>
                  <input type="range" min="0" max="1" step="0.1" value={watermark.opacity} onChange={e => setWatermark({...watermark, opacity: parseFloat(e.target.value)})} className="w-full accent-toffee" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-500 font-bold mb-2 uppercase">Top Pos (%)</label>
                    <input type="range" min="0" max="100" value={watermark.top} onChange={e => setWatermark({...watermark, top: parseInt(e.target.value)})} className="w-full accent-toffee" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 font-bold mb-2 uppercase">Left Pos (%)</label>
                    <input type="range" min="0" max="100" value={watermark.left} onChange={e => setWatermark({...watermark, left: parseInt(e.target.value)})} className="w-full accent-toffee" />
                  </div>
                </div>
              </div>
            </div>

            {/* Developer Section */}
            <div className="bg-header p-6 rounded-3xl border border-border space-y-6">
              <h2 className="text-xl font-bold flex items-center gap-2"><i className="fa-solid fa-user-gear text-toffee"></i> Developer Info</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-gray-500 font-bold mb-2 uppercase">Photo Path (e.g. assets/dev.png)</label>
                  <input type="text" value={devSettings.photo} onChange={e => setDevSettings({...devSettings, photo: e.target.value})} className="w-full bg-black border border-border p-3 rounded-xl outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 font-bold mb-2 uppercase">Dev Name</label>
                  <input type="text" value={devSettings.name} onChange={e => setDevSettings({...devSettings, name: e.target.value})} className="w-full bg-black border border-border p-3 rounded-xl outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 font-bold mb-2 uppercase">Note / Bio</label>
                  <textarea value={devSettings.note} onChange={e => setDevSettings({...devSettings, note: e.target.value})} className="w-full bg-black border border-border p-3 rounded-xl outline-none text-sm h-24 resize-none" />
                </div>
              </div>
            </div>
          </div>

          <button 
            onClick={() => {
              localStorage.setItem('toffee_watermark_v2', JSON.stringify(watermark));
              localStorage.setItem('toffee_dev_v2', JSON.stringify(devSettings));
              showToast("Settings Saved Locally");
            }}
            className="w-full bg-toffee py-4 rounded-2xl font-black text-xl shadow-xl hover:brightness-110 active:scale-95 transition-all"
          >
            SAVE CHANGES
          </button>
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
          <i className="fa-solid fa-gear hover:text-toffee cursor-pointer" onClick={() => { window.location.hash = '#admin'; }}></i>
        </div>
      </header>

      {/* Video Box */}
      <div className={`video-box w-full bg-black relative flex items-center justify-center transition-all duration-300 ${isFullScreen ? 'full-rotate' : 'h-[220px]'}`}>
        <video 
          ref={videoRef} 
          className="w-full h-full object-contain"
          onLoadStart={() => setIsLoading(true)}
          onCanPlay={() => setIsLoading(false)}
          onEnded={() => changeCh(1)}
          onError={() => { if(currentIdx >=0) handleError(channels[currentIdx].id); }}
          playsInline
        />
        
        {/* Admin Watermark */}
        {isPowerOn && watermark.visible && watermark.url && (
          <img 
            src={watermark.url} 
            className="absolute pointer-events-none transition-all duration-500" 
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
      <div className="flex justify-between items-center px-6 py-4 bg-card border-b border-border text-sm">
        <div className="font-bold truncate max-w-[75%] text-gray-200 flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isPowerOn ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
          {currentIdx >= 0 && isPowerOn ? channels[currentIdx].name : "TV Offline"}
        </div>
        <div className="text-toffee font-black text-[10px] tracking-widest uppercase bg-header px-2 py-1 rounded-md border border-border">LIVE PRO</div>
      </div>

      {/* Controller */}
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
               <button className="text-white h-12 w-full active:text-toffee" onClick={() => { setVolume(v => Math.min(100, v+10)); showToast(`Vol: ${volume}%`); }}><i className="fa-solid fa-plus"></i></button>
               <span className="text-[10px] font-black text-gray-600 uppercase">VOL</span>
               <button className="text-white h-12 w-full active:text-toffee" onClick={() => { setVolume(v => Math.max(0, v-10)); showToast(`Vol: ${volume}%`); }}><i className="fa-solid fa-minus"></i></button>
            </div>
            
            <div className="grid grid-cols-2 gap-4 p-1">
              <button className="btn-circle w-full h-full text-[10px] font-black" onClick={() => setActiveModal('list')}>LIST</button>
              <button className="btn-circle w-full h-full" onClick={() => setIsFullScreen(!isFullScreen)}>
                <i className={`fa-solid ${isFullScreen ? 'fa-compress text-toffee' : 'fa-expand'}`}></i>
              </button>
              <button className="btn-circle w-full h-full" onClick={() => setActiveModal('key')}><i className="fa-solid fa-keyboard"></i></button>
              <button className="btn-circle w-full h-full text-[10px] font-black" onClick={() => setActiveModal('guide')}>GUIDE</button>
            </div>

            <div className="bg-header border border-border rounded-full flex flex-col justify-between items-center py-5 shadow-2xl">
               <button className="text-white h-12 w-full active:text-toffee" onClick={() => changeCh(1)}><i className="fa-solid fa-chevron-up"></i></button>
               <span className="text-[10px] font-black text-gray-600 uppercase">CH</span>
               <button className="text-white h-12 w-full active:text-toffee" onClick={() => changeCh(-1)}><i className="fa-solid fa-chevron-down"></i></button>
            </div>
          </div>
          <div className="text-center text-[11px] font-black text-toffee tracking-[0.3em] uppercase opacity-80 pt-2">
            {categories[currentCatIdx] || 'All Categories'}
          </div>
        </div>
        <div className="text-gray-600 text-[10px] font-black tracking-[0.2em] uppercase underline cursor-pointer" onClick={() => setIsRemoteHidden(!isRemoteHidden)}>
          {isRemoteHidden ? 'Restore Remote' : 'Hide Remote'}
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
                <div className={`w-[72px] h-[72px] bg-white rounded-full flex items-center justify-center overflow-hidden border-2 transition-all duration-300 ${isActive ? 'border-toffee shadow-[0_0_20px_rgba(255,0,85,0.4)] scale-105' : 'border-transparent'}`}>
                  <img src={ch.logo || `https://via.placeholder.com/60?text=${(ch.name?.[0] || '?').toUpperCase()}`} className="w-[75%] h-[75%] object-contain" alt={ch.name} />
                </div>
                <span className="text-[10px] font-bold text-center text-gray-500 line-clamp-1 w-full uppercase tracking-tighter px-1">{ch.name}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Footer / Dev */}
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
        <div className="text-[9px] text-gray-800 mt-12 tracking-[0.4em] font-black uppercase opacity-50">© 2026 MUJAHID ULTRA PRO</div>
      </footer>

      {/* Modals */}
      {activeModal && (
        <div className="fixed inset-0 z-[5000] flex items-center justify-center p-5">
          <div className="absolute inset-0 bg-black/95 backdrop-blur-lg" onClick={() => setActiveModal(null)}></div>
          <div className="relative bg-header border border-toffee/50 rounded-[45px] w-full max-w-[360px] p-10 shadow-2xl animate-in zoom-in-90 duration-300">
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
                 <button className="w-full mt-10 text-gray-500 font-black text-[11px] uppercase tracking-[0.3em]" onClick={() => setActiveModal(null)}>CLOSE</button>
               </>
             )}
             {activeModal === 'guide' && (
               <>
                 <h3 className="text-xl font-black text-toffee mb-8 text-center uppercase tracking-[0.2em]">HELP GUIDE</h3>
                 <div className="text-[11px] space-y-5 text-gray-400 font-bold uppercase tracking-wider">
                    <div className="flex gap-5 items-center"><i className="fa-solid fa-power-off text-toffee text-xl"></i> START ENGINE BEFORE PLAY</div>
                    <div className="flex gap-5 items-center"><i className="fa-solid fa-expand text-toffee text-xl"></i> ROTATE FOR LANDSCAPE</div>
                    <div className="flex gap-5 items-center"><i className="fa-solid fa-gear text-toffee text-xl"></i> ADMIN AT #ADMIN HASH</div>
                    <div className="flex gap-5 items-center"><i className="fa-solid fa-sync text-toffee text-xl"></i> AUTO-SYNCS FROM TV.MU3</div>
                 </div>
                 <button className="w-full h-16 bg-toffee text-white font-black rounded-full mt-10 shadow-xl" onClick={() => setActiveModal(null)}>GOT IT</button>
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
