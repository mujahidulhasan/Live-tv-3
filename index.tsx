
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

// --- Constants ---
const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "password123";

// --- App Component ---
const App = () => {
  // Navigation & Auth
  const [route, setRoute] = useState<'player' | 'admin-login' | 'admin-panel'>(() => {
    return window.location.hash === '#admin' ? 'admin-login' : 'player';
  });
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');

  // Data
  const [channels, setChannels] = useState<Channel[]>([]);
  const [categories, setCategories] = useState<string[]>(['All']);
  const [currentIdx, setCurrentIdx] = useState<number>(-1);
  const [currentCatIdx, setCurrentCatIdx] = useState(0);
  const [deadChannelIds, setDeadChannelIds] = useState<Set<string>>(new Set());

  // UI
  const [isPowerOn, setIsPowerOn] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(100);
  const [isLandscape, setIsLandscape] = useState(false);
  const [isRemoteMinimized, setIsRemoteMinimized] = useState(false);
  const [toast, setToast] = useState<{ msg: string; show: boolean }>({ msg: '', show: false });
  const [activeModal, setActiveModal] = useState<string | null>(null);

  // Dialing
  const [dialBuffer, setDialBuffer] = useState('');
  const dialTimeoutRef = useRef<number | null>(null);

  // Admin Config
  const [manualM3U, setManualM3U] = useState('');
  const [m3uUrl, setM3uUrl] = useState('');
  const [watermark, setWatermark] = useState<WatermarkConfig>(() => {
    try {
      const saved = localStorage.getItem('ultra_iptv_watermark');
      return saved ? JSON.parse(saved) : { opacity: 0.5, top: 5, left: 5, url: '' };
    } catch {
      return { opacity: 0.5, top: 5, left: 5, url: '' };
    }
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const playPromiseRef = useRef<Promise<void> | null>(null);

  const showToast = (msg: string) => {
    setToast({ msg, show: true });
    setTimeout(() => setToast({ msg: '', show: false }), 4000);
  };

  const updateCategories = (list: Channel[]) => {
    const cats = Array.from(new Set(['All', ...list.map(c => c.category || 'General')]));
    setCategories(cats);
  };

  const parseM3U = (data: string) => {
    if (!data || data.trim().length === 0) return false;
    const lines = data.split(/\r?\n/);
    const newChannels: Channel[] = [];
    let currentMetadata: Partial<Channel> | null = null;

    for (let line of lines) {
      line = line.trim();
      if (!line) continue;
      if (line.toUpperCase().includes('#EXTINF:')) {
        const lastCommaIndex = line.lastIndexOf(',');
        const name = lastCommaIndex !== -1 ? line.substring(lastCommaIndex + 1).trim() : 'Unknown';
        const logoMatch = line.match(/tvg-logo="([^"]+)"/i) || line.match(/logo="([^"]+)"/i);
        const groupMatch = line.match(/group-title="([^"]+)"/i) || line.match(/category="([^"]+)"/i);
        currentMetadata = {
          id: `ch-${Math.random().toString(36).substring(2, 9)}`,
          name: name,
          logo: logoMatch ? logoMatch[1] : '',
          category: groupMatch ? groupMatch[1] : 'General'
        };
      } else if (line.startsWith('http')) {
        if (currentMetadata) {
          currentMetadata.url = line;
          newChannels.push(currentMetadata as Channel);
          currentMetadata = null;
        } else {
          newChannels.push({ id: `stream-${newChannels.length}`, name: `Stream ${newChannels.length + 1}`, url: line, category: 'Other' });
        }
      }
    }
    if (newChannels.length > 0) {
      setChannels(newChannels);
      updateCategories(newChannels);
      localStorage.setItem('ultra_iptv_channels', JSON.stringify(newChannels));
      showToast(`${newChannels.length} Channels Loaded`);
      return true;
    }
    return false;
  };

  const loadFromUrl = async (url: string) => {
    if (!url) return;
    showToast("Fetching External Feed...");
    try {
      const res = await fetch(url);
      if (res.ok) {
        const text = await res.text();
        parseM3U(text);
      } else {
        showToast("Fetch Failed: " + res.status);
      }
    } catch (e) {
      showToast("Network Error: Check CORS settings");
    }
  };

  const loadData = async (force = false) => {
    const paths = ['tv.m3u8', 'tv.m3u'];
    let found = false;
    for (const path of paths) {
      try {
        const res = await fetch(`${path}?t=${Date.now()}`, { cache: 'no-store' });
        if (res.ok) {
          const text = await res.text();
          if (text.includes('#EXTINF') || text.includes('http')) {
            found = parseM3U(text);
            if (found) break;
          }
        }
      } catch (e) {}
    }
    if (!found && !force) {
      const saved = localStorage.getItem('ultra_iptv_channels');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.length > 0) {
            setChannels(parsed);
            updateCategories(parsed);
            found = true;
          }
        } catch {}
      }
    }
  };

  useEffect(() => {
    loadData();
    const handleHash = () => {
      if (window.location.hash === '#admin') setRoute('admin-login');
      else setRoute('player');
    };
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const handlePlayChannel = async (idx: number) => {
    if (idx < 0 || idx >= channels.length) return;
    if (playPromiseRef.current) {
        try { await playPromiseRef.current; } catch(e) {}
    }
    if (!isPowerOn) setIsPowerOn(true);
    setCurrentIdx(idx);
    const ch = channels[idx];
    if (videoRef.current && ch?.url) {
      setIsLoading(true);
      videoRef.current.src = ch.url;
      try {
        playPromiseRef.current = videoRef.current.play();
        await playPromiseRef.current;
      } catch (err) {
        console.warn("Playback Interrupted", err);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const changeCh = (dir: number) => {
    if (channels.length === 0) return;
    const nextIdx = (currentIdx + dir + channels.length) % channels.length;
    handlePlayChannel(nextIdx);
  };

  const handleNumberDial = (num: string) => {
    const newBuffer = dialBuffer + num;
    setDialBuffer(newBuffer);
    showToast(`Tuning: ${newBuffer}`);
    if (dialTimeoutRef.current) clearTimeout(dialTimeoutRef.current);
    dialTimeoutRef.current = window.setTimeout(() => {
      const targetIdx = parseInt(newBuffer) - 1;
      if (!isNaN(targetIdx) && targetIdx >= 0 && targetIdx < channels.length) {
        handlePlayChannel(targetIdx);
      } else {
        showToast("Invalid Channel");
      }
      setDialBuffer('');
    }, 2000);
  };

  const handleLogin = () => {
    if (loginUser === ADMIN_USERNAME && loginPass === ADMIN_PASSWORD) {
      setRoute('admin-panel');
      showToast("Access Granted");
    } else {
      showToast("Invalid Credentials");
    }
  };

  const filteredChannels = useMemo(() => {
    const cat = categories[currentCatIdx] || 'All';
    return channels.filter(c => !deadChannelIds.has(c.id) && (cat === 'All' || (c.category || 'General') === cat));
  }, [channels, currentCatIdx, categories, deadChannelIds]);

  // --- Views ---
  if (route === 'admin-login') {
    return (
      <div className="min-h-screen bg-dark flex items-center justify-center p-4 font-sans">
        <div className="w-full max-w-sm bg-header p-8 sm:p-12 rounded-[40px] border border-white/5 shadow-2xl space-y-8">
          <div className="text-center">
            <h2 className="text-3xl font-black text-rose-500 uppercase tracking-tight italic">ADMIN</h2>
            <p className="text-[9px] text-gray-600 font-bold tracking-[0.3em] uppercase mt-1">SECURE ACCESS ONLY</p>
          </div>
          <div className="space-y-4">
            <input type="text" placeholder="USERNAME" className="w-full bg-black border border-white/10 p-4 rounded-2xl text-white outline-none focus:border-rose-500 text-xs tracking-widest" value={loginUser} onChange={e => setLoginUser(e.target.value)} />
            <input type="password" placeholder="PASSWORD" className="w-full bg-black border border-white/10 p-4 rounded-2xl text-white outline-none focus:border-rose-500 text-xs tracking-widest" value={loginPass} onChange={e => setLoginPass(e.target.value)} />
            <button onClick={handleLogin} className="w-full bg-rose-500 py-4 rounded-2xl font-black text-xs tracking-widest uppercase active:scale-95 transition-transform">LOGIN</button>
            <button onClick={() => { window.location.hash = ''; setRoute('player'); }} className="w-full text-gray-600 font-bold text-[10px] uppercase">CANCEL</button>
          </div>
        </div>
      </div>
    );
  }

  if (route === 'admin-panel') {
    return (
      <div className="min-h-screen bg-dark text-white p-4 sm:p-10 font-sans overflow-y-auto">
        <div className="max-w-4xl mx-auto space-y-8">
          <header className="flex flex-col sm:flex-row justify-between items-center gap-4 border-b border-white/10 pb-6">
            <h1 className="text-2xl font-black text-rose-500 uppercase italic">COMMAND CENTER</h1>
            <button onClick={() => { window.location.hash = ''; setRoute('player'); }} className="bg-white text-black px-8 py-2 rounded-full font-black text-[10px] tracking-widest">LOGOUT</button>
          </header>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-header p-6 sm:p-8 rounded-[40px] border border-white/5 space-y-6">
              <h2 className="text-sm font-black text-rose-500 uppercase tracking-widest">M3U8 DATA</h2>
              <div className="space-y-4">
                 <input type="text" placeholder="FEED URL (HTTPS)" className="w-full bg-black border border-white/10 p-4 rounded-xl text-xs outline-none focus:border-rose-500" value={m3uUrl} onChange={e => setM3uUrl(e.target.value)} />
                 <button onClick={() => loadFromUrl(m3uUrl)} className="w-full bg-white text-black py-3 rounded-xl font-black text-[10px] uppercase">LOAD FROM URL</button>
              </div>
              <div className="relative">
                <textarea value={manualM3U} onChange={e => setManualM3U(e.target.value)} className="w-full h-40 bg-black border border-white/10 rounded-2xl p-4 text-[10px] font-mono text-gray-500 outline-none focus:border-rose-500" placeholder="PASTE M3U RAW TEXT..." />
              </div>
              <button onClick={() => { if(parseM3U(manualM3U)) setManualM3U(''); }} className="w-full bg-rose-500 py-4 rounded-xl font-black text-[10px] tracking-widest uppercase">SYNC RAW TEXT</button>
            </div>

            <div className="bg-header p-6 sm:p-8 rounded-[40px] border border-white/5 space-y-6">
              <h2 className="text-sm font-black text-rose-500 uppercase tracking-widest">BRANDING</h2>
              <div className="space-y-4">
                <input type="text" value={watermark.url} onChange={e => setWatermark({...watermark, url: e.target.value})} className="w-full bg-black border border-white/10 p-4 rounded-xl outline-none text-xs focus:border-rose-500" placeholder="WATERMARK IMAGE URL" />
                <div className="flex items-center gap-4">
                  <span className="text-[9px] font-bold text-gray-600 uppercase">OPACITY</span>
                  <input type="range" min="0" max="1" step="0.1" value={watermark.opacity} onChange={e => setWatermark({...watermark, opacity: parseFloat(e.target.value)})} className="flex-1 accent-rose-500 h-1" />
                </div>
              </div>
              <button onClick={() => { localStorage.setItem('ultra_iptv_watermark', JSON.stringify(watermark)); showToast("Settings Saved"); }} className="w-full bg-white text-black py-4 rounded-xl font-black text-[10px] tracking-widest uppercase">SAVE OVERLAY</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-dark text-white font-sans overflow-x-hidden">
      <header className="h-[80px] flex items-center justify-center bg-header border-b border-white/5 sticky top-0 z-[100] backdrop-blur-xl">
        {/* Branding Slot */}
      </header>

      <div className={`video-box w-full bg-black relative flex items-center justify-center transition-all duration-700 ${isLandscape ? 'full-rotate' : 'h-[240px] sm:h-[400px] border-b border-white/5'}`}>
        {!isPowerOn ? (
           <div className="absolute inset-0 bg-black flex flex-col items-center justify-center p-6 text-center">
              <p className="text-rose-500 font-black text-[11px] tracking-[1em] animate-pulse">SYSTEM IDLE</p>
              <button onClick={() => handlePlayChannel(currentIdx >= 0 ? currentIdx : 0)} className="mt-8 text-[9px] font-black border border-rose-500/30 text-rose-500 px-12 py-4 rounded-full hover:bg-rose-500 hover:text-white transition-all tracking-[0.3em]">START FEED</button>
           </div>
        ) : (
          <>
            <video ref={videoRef} className="w-full h-full object-contain" onLoadStart={() => setIsLoading(true)} onCanPlay={() => setIsLoading(false)} onEnded={() => changeCh(1)} onError={() => currentIdx >= 0 && setDeadChannelIds(p => new Set(p).add(channels[currentIdx].id))} playsInline />
            {watermark.url && <img src={watermark.url} className="absolute pointer-events-none" style={{ opacity: watermark.opacity, top: `${watermark.top}%`, left: `${watermark.left}%`, height: '30px' }} />}
            {isLoading && <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-md"><div className="w-10 h-10 border-2 border-white/10 border-t-rose-500 rounded-full animate-spin"></div></div>}
          </>
        )}
      </div>

      <div className="px-6 py-4 bg-card border-b border-white/5 flex justify-between items-center">
        <div className="text-[10px] font-black tracking-widest text-gray-500 uppercase truncate pr-4">
          {currentIdx >= 0 && isPowerOn ? channels[currentIdx].name : "STANDBY"}
        </div>
        <div className="text-rose-500 text-[8px] font-bold uppercase tracking-widest bg-rose-500/10 px-3 py-1 rounded border border-rose-500/20">ULTRA HD</div>
      </div>

      <div className="p-6 flex flex-col items-center transition-all duration-700" style={{ maxHeight: isRemoteMinimized ? '60px' : '1000px', overflow: 'hidden' }}>
        <button onClick={() => setIsRemoteMinimized(!isRemoteMinimized)} className="text-[8px] font-black text-gray-700 tracking-widest uppercase mb-4">{isRemoteMinimized ? 'Expand Remote' : 'Minimize Remote'}</button>
        
        {!isRemoteMinimized && (
          <div className="w-full max-w-[360px] space-y-8 animate-in slide-in-from-top">
             <div className="flex justify-between items-center">
                <button className={`btn-circle ${isPowerOn ? 'text-green-500' : 'text-red-500'}`} onClick={() => setIsPowerOn(!isPowerOn)}><i className="fa-solid fa-power-off text-xl"></i></button>
                <button className="btn-circle text-gray-500" onClick={() => setIsMuted(!isMuted)}><i className={`fa-solid ${isMuted ? 'fa-volume-xmark' : 'fa-volume-high'} text-lg`}></i></button>
                <button className="btn-circle text-gray-500" onClick={() => setActiveModal('list')}><i className="fa-solid fa-list-ul text-lg"></i></button>
             </div>

             <div className="grid grid-cols-3 gap-3">
                {[1,2,3,4,5,6,7,8,9].map(n => (
                  <button key={n} onClick={() => handleNumberDial(n.toString())} className="btn-circle w-full h-12 text-lg font-black text-gray-500 bg-header/60">{n}</button>
                ))}
                <button className="btn-circle w-full h-12 text-lg text-gray-600 bg-header/60" onClick={() => setIsLandscape(!isLandscape)}><i className="fa-solid fa-expand"></i></button>
                <button onClick={() => handleNumberDial('0')} className="btn-circle w-full h-12 text-lg font-black text-gray-500 bg-header/60">0</button>
                <button className="btn-circle w-full h-12 text-gray-600 bg-header/60" onClick={() => loadData(true)}><i className="fa-solid fa-rotate"></i></button>
             </div>

             <div className="grid grid-cols-[80px_1fr_80px] gap-4 h-[160px]">
                <div className="bg-header border border-white/5 rounded-3xl flex flex-col justify-between items-center py-6">
                   <button className="text-white active:text-rose-500" onClick={() => setVolume(v => Math.min(100, v+10))}><i className="fa-solid fa-plus"></i></button>
                   <span className="text-[8px] font-black text-gray-800 uppercase">VOL</span>
                   <button className="text-white active:text-rose-500" onClick={() => setVolume(v => Math.max(0, v-10))}><i className="fa-solid fa-minus"></i></button>
                </div>
                <div className="flex items-center justify-center">
                   <button className="btn-circle scale-125 border-rose-500/30 text-rose-500" onClick={() => videoRef.current?.paused ? videoRef.current.play() : videoRef.current?.pause()}><i className={`fa-solid ${videoRef.current?.paused ? 'fa-play pl-1' : 'fa-pause'} text-xl`}></i></button>
                </div>
                <div className="bg-header border border-white/5 rounded-3xl flex flex-col justify-between items-center py-6">
                   <button className="text-white active:text-rose-500" onClick={() => changeCh(1)}><i className="fa-solid fa-chevron-up"></i></button>
                   <span className="text-[8px] font-black text-gray-800 uppercase">CH</span>
                   <button className="text-white active:text-rose-500" onClick={() => changeCh(-1)}><i className="fa-solid fa-chevron-down"></i></button>
                </div>
             </div>
          </div>
        )}
      </div>

      <div className="px-6 mb-8">
        <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
            {categories.map((cat, idx) => (
                <button key={cat} onClick={() => setCurrentCatIdx(idx)} className={`whitespace-nowrap px-6 py-2 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${currentCatIdx === idx ? 'bg-rose-500 text-white' : 'bg-header text-gray-600 border border-white/5'}`}>{cat}</button>
            ))}
        </div>
      </div>

      <section className="px-6 pb-32">
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-y-10 gap-x-4">
          {filteredChannels.map(ch => {
            const realIdx = channels.indexOf(ch);
            const isActive = realIdx === currentIdx;
            return (
              <div key={ch.id} className="flex flex-col items-center gap-3 cursor-pointer group" onClick={() => handlePlayChannel(realIdx)}>
                <div className={`w-[70px] h-[70px] rounded-full flex items-center justify-center overflow-hidden border-2 transition-all duration-500 bg-white p-2 ${isActive ? 'border-rose-500 scale-110 shadow-lg shadow-rose-500/20' : 'border-transparent opacity-40'}`}>
                  <img src={ch.logo || `https://via.placeholder.com/100?text=${ch.name[0]}`} className="w-full h-full object-contain" alt={ch.name} onError={e => e.currentTarget.src=`https://via.placeholder.com/100?text=${ch.name[0]}`} />
                </div>
                <span className={`text-[8px] font-bold text-center uppercase tracking-tight line-clamp-2 w-full leading-tight ${isActive ? 'text-rose-500' : 'text-gray-600'}`}>{ch.name}</span>
              </div>
            );
          })}
        </div>
      </section>

      {activeModal === 'list' && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 backdrop-blur-xl bg-black/80">
          <div className="bg-header border border-white/10 rounded-[40px] w-full max-w-sm p-8 space-y-6">
             <h3 className="text-center font-black text-rose-500 uppercase tracking-widest text-xs">STATION INDEX</h3>
             <div className="grid grid-cols-4 gap-4 max-h-[300px] overflow-y-auto no-scrollbar">
                {channels.map((ch, idx) => (
                   <div key={idx} onClick={() => { handlePlayChannel(idx); setActiveModal(null); }} className={`aspect-square bg-white rounded-full p-2 border-2 ${currentIdx === idx ? 'border-rose-500' : 'border-transparent opacity-60'}`}>
                      <img src={ch.logo || `https://via.placeholder.com/100`} className="w-full h-full object-contain" />
                   </div>
                ))}
             </div>
             <button onClick={() => setActiveModal(null)} className="w-full py-4 bg-white/5 rounded-2xl text-[10px] font-black uppercase">CLOSE</button>
          </div>
        </div>
      )}

      <div className={`fixed bottom-10 left-1/2 -translate-x-1/2 bg-white text-black px-10 py-4 rounded-full text-[10px] font-black shadow-2xl transition-all duration-500 z-[10000] uppercase tracking-widest flex items-center gap-4 ${toast.show ? 'translate-y-0 opacity-100' : 'translate-y-40 opacity-0'}`}>
        <div className="w-2 h-2 bg-rose-500 rounded-full animate-ping"></div>
        {toast.msg}
      </div>
    </div>
  );
};

const startApp = () => {
  const container = document.getElementById('app-root');
  if (container) createRoot(container).render(<App />);
};
document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', startApp) : startApp();
