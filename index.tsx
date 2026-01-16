
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createRoot } from 'react-dom/client';

// --- Interfaces ---
interface Channel {
  id: string;
  name: string;
  url: string;
  logo?: string;
  category?: string;
  isError?: boolean;
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
  // Navigation
  const [view, setView] = useState<'player' | 'admin'>('player');

  // Channel State
  const [channels, setChannels] = useState<Channel[]>([]);
  const [categories, setCategories] = useState<string[]>(['All']);
  const [currentIdx, setCurrentIdx] = useState<number>(-1);
  const [currentCatIdx, setCurrentCatIdx] = useState(0);
  const [errorChannels, setErrorChannels] = useState<Set<string>>(new Set());

  // Player State
  const [volume, setVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  const [isPowerOn, setIsPowerOn] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRemoteHidden, setIsRemoteHidden] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; show: boolean }>({ msg: '', show: false });

  // Settings
  const [watermark, setWatermark] = useState<WatermarkSettings>({
    opacity: 0.5,
    top: 10,
    left: 10,
    url: 'assets/logo.png',
    visible: true
  });
  const [devSettings, setDevSettings] = useState<DevSettings>({
    photo: 'assets/dev.png',
    name: 'Mujahid',
    note: "Hi, I'm Mujahid, a Dhaka Polytechnic student. I love building unique UI experiences."
  });

  // UI State
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [manualChInput, setManualChInput] = useState("");
  const [m3uText, setM3uText] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);

  // Initialize Data
  useEffect(() => {
    // Check URL for admin path simulation
    if (window.location.hash === '#admin' || window.location.pathname.endsWith('/admin')) {
      setView('admin');
    }

    // Load persisted settings
    const savedWatermark = localStorage.getItem('iptv_watermark');
    if (savedWatermark) setWatermark(JSON.parse(savedWatermark));

    const savedDev = localStorage.getItem('iptv_dev');
    if (savedDev) setDevSettings(JSON.parse(savedDev));

    const savedData = localStorage.getItem('toffee_iptv_data');
    if (savedData) {
      const parsed = JSON.parse(savedData);
      setChannels(parsed);
      updateCategories(parsed);
    } else {
      // Auto-load tv.m3u from project root
      fetch('tv.m3u')
        .then(res => res.text())
        .then(text => parseM3U(text))
        .catch(() => {
          // Fallback if no tv.m3u
          const demo = [
            { id: '1', name: 'Somoy TV', url: 'https://cdn-1.toffeelive.com/somoy/index.m3u8', category: 'News', logo: 'https://seeklogo.com/images/S/somoy-tv-logo-87B757523F-seeklogo.com.png' },
            { id: '2', name: 'T Sports', url: 'https://cdn-1.toffeelive.com/tsports/index.m3u8', category: 'Sports', logo: 'https://tsports.com/static/media/tsports-logo.8e7b99c2.png' }
          ];
          setChannels(demo);
          updateCategories(demo);
        });
    }
  }, []);

  const updateCategories = (list: Channel[]) => {
    const cats = Array.from(new Set(['All', ...list.map(c => c.category || 'General')]));
    setCategories(cats);
  };

  const showToast = (msg: string) => {
    setToast({ msg, show: true });
    setTimeout(() => setToast({ msg: '', show: false }), 2500);
  };

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
      updateCategories(newChannels);
      localStorage.setItem('toffee_iptv_data', JSON.stringify(newChannels));
    }
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
        handleVideoError(ch.id);
        setIsLoading(false);
      });
    }
  };

  // --- Added changeCh function to fix ReferenceError ---
  const changeCh = (dir: number) => {
    if (channels.length === 0) return;
    const nextIdx = (currentIdx + dir + channels.length) % channels.length;
    playChannel(nextIdx);
  };

  const handleVideoError = (id: string) => {
    setErrorChannels(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    showToast("Channel Load Error");
  };

  const adjustVolume = (amt: number) => {
    const newVol = Math.max(0, Math.min(100, volume + amt));
    setVolume(newVol);
    if (videoRef.current) {
      videoRef.current.muted = false;
      setIsMuted(false);
      videoRef.current.volume = newVol / 100;
    }
    showToast(`Volume ${newVol}%`);
  };

  const filteredChannels = useMemo(() => {
    const cat = categories[currentCatIdx] || 'All';
    return (cat === 'All' ? channels : channels.filter(c => (c.category || 'General') === cat))
      .filter(c => !errorChannels.has(c.id));
  }, [channels, currentCatIdx, categories, errorChannels]);

  // Admin Actions
  const saveAdminSettings = () => {
    localStorage.setItem('iptv_watermark', JSON.stringify(watermark));
    localStorage.setItem('iptv_dev', JSON.stringify(devSettings));
    showToast("Admin Settings Saved");
  };

  if (view === 'admin') {
    return (
      <div className="min-h-screen bg-[#0b010b] text-white p-6 font-sans">
        <header className="flex justify-between items-center mb-8 border-b border-[#222] pb-4">
          <h1 className="text-2xl font-black text-[#ff0055]">ADMIN PANEL</h1>
          <button 
            className="px-6 py-2 bg-[#ff0055] rounded-full font-bold"
            onClick={() => { setView('player'); window.location.hash = ''; }}
          >
            Back to Player
          </button>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Watermark Section */}
          <div className="bg-[#1a021a] p-6 rounded-3xl border border-[#222]">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <i className="fa-solid fa-stamp text-[#ff0055]"></i> Watermark Controls
            </h2>
            <div className="space-y-6">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Opacity ({Math.round(watermark.opacity * 100)}%)</label>
                <input 
                  type="range" min="0" max="1" step="0.1" 
                  className="w-full accent-[#ff0055]" 
                  value={watermark.opacity} 
                  onChange={e => setWatermark({...watermark, opacity: parseFloat(e.target.value)})} 
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Top Pos ({watermark.top}%)</label>
                  <input 
                    type="range" min="0" max="100" 
                    className="w-full accent-[#ff0055]" 
                    value={watermark.top} 
                    onChange={e => setWatermark({...watermark, top: parseInt(e.target.value)})} 
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Left Pos ({watermark.left}%)</label>
                  <input 
                    type="range" min="0" max="100" 
                    className="w-full accent-[#ff0055]" 
                    value={watermark.left} 
                    onChange={e => setWatermark({...watermark, left: parseInt(e.target.value)})} 
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Logo Path</label>
                <input 
                  type="text" 
                  className="w-full bg-black border border-[#222] p-3 rounded-xl outline-none" 
                  value={watermark.url} 
                  onChange={e => setWatermark({...watermark, url: e.target.value})} 
                />
              </div>
            </div>
          </div>

          {/* Dev Info Section */}
          <div className="bg-[#1a021a] p-6 rounded-3xl border border-[#222]">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <i className="fa-solid fa-user-gear text-[#ff0055]"></i> Developer Settings
            </h2>
            <div className="space-y-6">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Dev Photo Path</label>
                <input 
                  type="text" 
                  className="w-full bg-black border border-[#222] p-3 rounded-xl outline-none" 
                  value={devSettings.photo} 
                  onChange={e => setDevSettings({...devSettings, photo: e.target.value})} 
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Dev Name</label>
                <input 
                  type="text" 
                  className="w-full bg-black border border-[#222] p-3 rounded-xl outline-none" 
                  value={devSettings.name} 
                  onChange={e => setDevSettings({...devSettings, name: e.target.value})} 
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Short Note</label>
                <textarea 
                  className="w-full bg-black border border-[#222] p-3 rounded-xl outline-none h-24 resize-none" 
                  value={devSettings.note} 
                  onChange={e => setDevSettings({...devSettings, note: e.target.value})} 
                />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8">
          <button 
            className="w-full py-4 bg-[#ff0055] text-white font-black rounded-2xl text-xl shadow-[0_10px_30px_#ff005544]"
            onClick={saveAdminSettings}
          >
            SAVE ALL SETTINGS
          </button>
        </div>

        {/* Toast */}
        <div className={`fixed bottom-10 left-1/2 -translate-x-1/2 bg-black/90 text-white border border-[#ff0055] px-8 py-3 rounded-full text-sm font-bold transition-all duration-300 z-[10000] ${toast.show ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0'}`}>
          {toast.msg}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#0b010b] text-white select-none font-sans overflow-x-hidden">
      {/* Header */}
      <header className="flex justify-between items-center p-4 bg-[#1a021a] border-b border-[#222] sticky top-0 z-[100]">
        <div className="flex items-center gap-2">
          <img src={watermark.url} className="h-6 object-contain" onError={(e) => (e.currentTarget.style.display='none')} />
          <div className="text-xl font-black text-[#ff0055] italic tracking-tighter">TOFFEE ULTRA</div>
        </div>
        <div className="flex gap-5 text-xl">
          <i className="fa-solid fa-magnifying-glass hover:text-[#ff0055] cursor-pointer" onClick={() => setActiveModal('key')}></i>
          <i className="fa-solid fa-gear hover:text-[#ff0055] cursor-pointer" onClick={() => setView('admin')}></i>
        </div>
      </header>

      {/* Video Player */}
      <div className={`video-box w-full bg-black relative flex items-center justify-center transition-all duration-300 ${isFullScreen ? 'full-rotate' : 'h-[210px]'}`}>
        <video 
          ref={videoRef} 
          className="w-full h-full object-contain"
          onLoadStart={() => setIsLoading(true)}
          onCanPlay={() => setIsLoading(false)}
          onEnded={() => changeCh(1)}
          onError={() => { if(currentIdx >=0) handleVideoError(channels[currentIdx].id); }}
          playsInline
        />
        
        {/* Watermark */}
        {watermark.visible && isPowerOn && (
          <img 
            src={watermark.url} 
            className="absolute pointer-events-none"
            style={{
              top: `${watermark.top}%`,
              left: `${watermark.left}%`,
              opacity: watermark.opacity,
              height: '30px',
              objectFit: 'contain'
            }}
          />
        )}

        {isLoading && (
          <div className="absolute w-12 h-12 border-4 border-white/20 border-t-[#ff0055] rounded-full animate-spin"></div>
        )}
        {videoRef.current?.paused && isPowerOn && !isLoading && (
          <i className="fa-solid fa-play text-5xl text-[#ff0055] opacity-70 pointer-events-none absolute"></i>
        )}
      </div>

      {/* Status Bar */}
      <div className="flex justify-between items-center px-5 py-3 bg-[#120112] border-b border-[#222] text-sm">
        <div className="font-bold truncate max-w-[70%]">
          {currentIdx >= 0 && isPowerOn ? channels[currentIdx].name : "Power off - Select Channel"}
        </div>
        <div className="text-[#ff0055] font-extrabold tracking-tighter">LIVE PRO</div>
      </div>

      {/* Remote Interface */}
      <div className="p-6 flex flex-col items-center gap-6">
        <div className={`remote-ui w-full max-w-[320px] space-y-6 transition-all duration-300 ${isRemoteHidden ? 'hidden h-0 opacity-0' : 'block opacity-100'}`}>
          <div className="flex justify-between">
            <button className={`btn-circle ${isPowerOn ? 'text-green-500 shadow-[0_0_15px_green]' : 'text-red-600 shadow-[0_0_15px_#ff000022]'}`} onClick={togglePower}>
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
            <button className="btn-circle scale-110 border-[#ff0055] text-[#ff0055]" onClick={() => videoRef.current?.paused ? videoRef.current.play() : videoRef.current?.pause()}>
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
            <div className="bg-[#1a021a] border border-[#333] rounded-full flex flex-col justify-between items-center py-4">
               <button className="text-white h-12 w-full active:text-[#ff0055]" onClick={() => adjustVolume(10)}><i className="fa-solid fa-plus"></i></button>
               <span className="text-[9px] font-black text-gray-500">VOL</span>
               <button className="text-white h-12 w-full active:text-[#ff0055]" onClick={() => adjustVolume(-10)}><i className="fa-solid fa-minus"></i></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button className="btn-circle w-full h-full text-[10px] font-black" onClick={() => setActiveModal('list')}>LIST</button>
              <button className="btn-circle w-full h-full" onClick={() => setIsFullScreen(!isFullScreen)}>
                <i className={`fa-solid ${isFullScreen ? 'fa-compress' : 'fa-expand'}`}></i>
              </button>
              <button className="btn-circle w-full h-full" onClick={() => setActiveModal('key')}><i className="fa-solid fa-keyboard"></i></button>
              <button className="btn-circle w-full h-full text-[10px] font-black" onClick={() => setActiveModal('guide')}>GUIDE</button>
            </div>
            <div className="bg-[#1a021a] border border-[#333] rounded-full flex flex-col justify-between items-center py-4">
               <button className="text-white h-12 w-full active:text-[#ff0055]" onClick={() => changeCh(1)}><i className="fa-solid fa-chevron-up"></i></button>
               <span className="text-[9px] font-black text-gray-500">CH</span>
               <button className="text-white h-12 w-full active:text-[#ff0055]" onClick={() => changeCh(-1)}><i className="fa-solid fa-chevron-down"></i></button>
            </div>
          </div>
          <div className="text-center text-[10px] font-black text-[#ff0055] tracking-widest uppercase">
            {categories[currentCatIdx] || 'All'}
          </div>
        </div>

        <div className="text-gray-600 text-[11px] font-bold tracking-tighter uppercase underline cursor-pointer" onClick={() => setIsRemoteHidden(!isRemoteHidden)}>
          {isRemoteHidden ? 'Open Controller' : 'Hide Controller'}
        </div>
      </div>

      {/* Grid */}
      <section className="px-5 pb-12">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-4 w-1 bg-[#ff0055]"></div>
          <div className="text-sm font-black uppercase tracking-widest">{categories[currentCatIdx] || 'All'} Channels</div>
        </div>
        <div className="grid grid-cols-4 gap-4">
          {filteredChannels.map(ch => {
            const realIdx = channels.indexOf(ch);
            const isActive = realIdx === currentIdx;
            return (
              <div key={ch.id} className="flex flex-col items-center gap-2 cursor-pointer active:scale-90 transition-all" onClick={() => playChannel(realIdx)}>
                <div className={`w-[68px] h-[68px] bg-white rounded-full flex items-center justify-center overflow-hidden border-2 transition-all ${isActive ? 'border-[#ff0055] shadow-[0_0_15px_#ff005566]' : 'border-transparent'}`}>
                  <img src={ch.logo || `https://via.placeholder.com/60?text=${(ch.name?.[0] || '?').toUpperCase()}`} className="w-[70%] h-[70%] object-contain" alt={ch.name} />
                </div>
                <span className="text-[9px] font-bold text-center text-gray-500 line-clamp-1 w-full px-1">{ch.name}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#120112] p-10 mt-auto border-t border-[#222] text-center">
        <img src={devSettings.photo} className="w-16 h-16 rounded-full border-2 border-[#ff0055] mx-auto mb-4 object-cover shadow-[0_0_20px_#ff005555]" onError={(e) => (e.currentTarget.src='https://via.placeholder.com/100?text=Dev')} />
        <div className="text-lg font-black text-[#ff0055] uppercase tracking-tighter">{devSettings.name}</div>
        <p className="text-[10px] text-gray-500 max-w-[240px] mx-auto my-3 leading-relaxed font-medium">{devSettings.note}</p>
        <div className="text-[8px] text-gray-800 mt-10 tracking-[0.3em] font-black uppercase opacity-50">© 2026 TOFFEE CLONE BY MUJAHID</div>
      </footer>

      {/* Modals */}
      {activeModal && (
        <div className="fixed inset-0 z-[5000] flex items-center justify-center p-5">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setActiveModal(null)}></div>
          <div className="relative bg-[#1a021a] border border-[#ff0055] rounded-[40px] w-full max-w-[340px] p-8 shadow-2xl animate-in zoom-in-95 duration-200">
             {activeModal === 'key' && (
               <>
                 <h3 className="text-lg font-black text-[#ff0055] mb-6 text-center uppercase tracking-widest">Channel Search</h3>
                 <input 
                   type="text" className="w-full bg-black border border-[#333] p-4 text-center rounded-2xl text-white outline-none mb-6"
                   placeholder="Name or Number..." autoFocus value={manualChInput} onChange={(e) => setManualChInput(e.target.value)}
                 />
                 <button className="w-full h-14 bg-[#ff0055] text-white font-black rounded-full active:scale-95" onClick={() => {
                   const num = parseInt(manualChInput);
                   if (num > 0 && num <= channels.length) playChannel(num - 1);
                   else {
                     const found = channels.findIndex(c => c.name.toLowerCase().includes(manualChInput.toLowerCase()));
                     if(found !== -1) playChannel(found);
                     else showToast("Not Found");
                   }
                   setActiveModal(null); setManualChInput("");
                 }}>GO LIVE</button>
               </>
             )}
             {activeModal === 'list' && (
               <>
                 <h3 className="text-lg font-black text-[#ff0055] mb-6 text-center uppercase tracking-widest">Quick View</h3>
                 <div className="grid grid-cols-3 gap-4 max-h-[300px] overflow-y-auto pr-2">
                    {channels.slice(0, 18).map((ch, idx) => (
                       <div key={idx} className="aspect-square bg-white rounded-full p-2 flex items-center justify-center cursor-pointer active:scale-90" onClick={() => { playChannel(idx); setActiveModal(null); }}>
                          <img src={ch.logo || `https://via.placeholder.com/40`} className="w-full h-full object-contain" />
                       </div>
                    ))}
                 </div>
                 <button className="w-full mt-8 text-gray-500 font-black text-xs uppercase" onClick={() => setActiveModal(null)}>CLOSE</button>
               </>
             )}
             {activeModal === 'guide' && (
               <>
                 <h3 className="text-lg font-black text-[#ff0055] mb-6 text-center uppercase tracking-widest">Operation Guide</h3>
                 <div className="text-[10px] space-y-4 text-gray-400 font-bold uppercase tracking-wider">
                    <div className="flex gap-4 items-center"><i className="fa-solid fa-power-off text-[#ff0055]"></i> Start the main server</div>
                    <div className="flex gap-4 items-center"><i className="fa-solid fa-expand text-[#ff0055]"></i> Force rotate landscape</div>
                    <div className="flex gap-4 items-center"><i className="fa-solid fa-gear text-[#ff0055]"></i> Access admin portal</div>
                 </div>
                 <button className="w-full h-14 bg-[#ff0055] text-white font-black rounded-full mt-8" onClick={() => setActiveModal(null)}>GOT IT</button>
               </>
             )}
          </div>
        </div>
      )}

      {/* Toast */}
      <div className={`fixed bottom-10 left-1/2 -translate-x-1/2 bg-black/90 text-white border border-[#ff0055] px-8 py-3 rounded-full text-sm font-bold shadow-2xl transition-all duration-300 z-[10000] ${toast.show ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0'}`}>
        {toast.msg}
      </div>
    </div>
  );
};

// --- Render ---
const container = document.getElementById('app-root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
