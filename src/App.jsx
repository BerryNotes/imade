import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useGlobalAudio } from './components/AudioProvider';
import BattleTab from './tabs/BattleTab';
import AuthScreen from './components/AuthScreen';
import api from './api';

const LibraryTab = React.lazy(() => import('./tabs/LibraryTab'));
const UploadTab = React.lazy(() => import('./tabs/UploadTab'));
const RankingsTab = React.lazy(() => import('./tabs/RankingsTab'));
const StatsTab = React.lazy(() => import('./tabs/StatsTab'));
const SettingsTab = React.lazy(() => import('./tabs/SettingsTab'));
const PlayerTab = React.lazy(() => import('./tabs/PlayerTab'));
const PlaylistsTab = React.lazy(() => import('./tabs/PlaylistsTab'));
const VisualizerTab = React.lazy(() => import('./tabs/VisualizerTab'));

const BATCH_SIZE = 5;
const isElectron = !!window.electronAPI;

function App() {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [tab, setTab] = useState("library");
  const [songs, setSongs] = useState([]);
  const [genres, setGenres] = useState([]);
  const [comparisons, setComparisons] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [battlePair, setBattlePair] = useState(null);
  const [toast, setToast] = useState(null);
  const [lastUpdateCompCount, setLastUpdateCompCount] = useState(() => {
    const stored = localStorage.getItem("imade_lastUpdateCompCount");
    return stored ? parseInt(stored, 10) : Infinity;
  });

  useEffect(() => {
    if (lastUpdateCompCount !== Infinity) localStorage.setItem("imade_lastUpdateCompCount", String(lastUpdateCompCount));
  }, [lastUpdateCompCount]);
  useEffect(() => {
    if (lastUpdateCompCount !== Infinity && comparisons.length < lastUpdateCompCount) {
      setLastUpdateCompCount(0);
    }
  }, [comparisons.length]);
  const [hasSeenIntro, setHasSeenIntro] = useState(() => localStorage.getItem("imade_seenIntro") === "1");
  const [hasSeenPhase2, setHasSeenPhase2] = useState(() => localStorage.getItem("imade_seenPhase2") === "1");
  const [showVariance, setShowVariance] = useState(() => localStorage.getItem("imade_showVariance") !== "0");
  const [sessionLength, setSessionLength] = useState(() => localStorage.getItem("imade_sessionLength") || "medium");
  const [bracketSize, setBracketSize] = useState(() => parseInt(localStorage.getItem("imade_bracketSize") || "8"));
  const [showWinLoss, setShowWinLoss] = useState(() => localStorage.getItem("imade_showWinLoss") !== "0");
  const [rowDensity, setRowDensity] = useState(() => localStorage.getItem("imade_rowDensity") || "comfortable");

  // Auth check on mount
  useEffect(() => {
    api.getMe().then(data => {
      setUser(data.user);
      setAuthChecked(true);
    }).catch(() => {
      setAuthChecked(true);
    });
    // Redirect to login on 401
    api.setOnUnauthorized(() => { setUser(null); });
  }, []);

  const handleAuth = useCallback((userData) => {
    setUser(userData);
    // Reset app state for new session
    setSongs([]); setGenres([]); setComparisons([]); setPlaylists([]);
    setLoaded(false);
  }, []);

  const handleLogout = useCallback(async () => {
    // Flush listen times before logout
    if (listenTimesDirtyRef.current) {
      await api.put("/api/listen-times", listenTimesRef.current).catch(() => {});
      listenTimesDirtyRef.current = false;
    }
    await api.logout().catch(() => {});
    setUser(null);
    setSongs([]); setGenres([]); setComparisons([]); setPlaylists([]);
    setListenTimes({}); listenTimesRef.current = {};
    setLoaded(false);
  }, []);

  const persistSetting = useCallback((key, val, setter) => { setter(val); localStorage.setItem("imade_" + key, String(val)); }, []);

  const persistIntro = useCallback((v) => { setHasSeenIntro(v); if (v) localStorage.setItem("imade_seenIntro", "1"); }, []);
  const persistPhase2 = useCallback((v) => { setHasSeenPhase2(v); if (v) localStorage.setItem("imade_seenPhase2", "1"); }, []);
  const scrollPositions = useRef({});
  const [playerQueue, setPlayerQueue] = useState([]);
  const [playerQueueIdx, setPlayerQueueIdx] = useState(0);
  const [playerShuffle, setPlayerShuffle] = useState(false);
  const [playerLoop, setPlayerLoop] = useState("none");
  const [libFilterGenre, setLibFilterGenre] = useState("All");
  const [libSelectMode, setLibSelectMode] = useState(false);
  const [libSelectedIds, setLibSelectedIds] = useState(new Set());
  const [libBatchGenre, setLibBatchGenre] = useState("");

  const [focusedSessionSongs, setFocusedSessionSongs] = useState(null);

  const headerRef = useRef(null);
  const [headerHeight, setHeaderHeight] = useState(120);

  const [listenTimes, setListenTimes] = useState({});
  const listenTimesRef = useRef(listenTimes);
  const listenTimesDirtyRef = useRef(false);
  const lastTimeUpdateRef = useRef({ src: null, time: 0 });

  // Load listen times from server on login
  useEffect(() => {
    if (!user) return;
    api.get("/api/listen-times").then(data => {
      listenTimesRef.current = data;
      setListenTimes(data);
    }).catch(() => {});
  }, [user]);

  const [updateInfo, setUpdateInfo] = useState(null);

  const [uploadFiles, setUploadFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });
  const [uploadDone, setUploadDone] = useState(false);
  const uploadAbortRef = useRef(false);

  const switchTab = useCallback((newTab) => {
    scrollPositions.current[tab] = window.scrollY;
    setTab(newTab);
    requestAnimationFrame(() => {
      window.scrollTo(0, scrollPositions.current[newTab] || 0);
    });
  }, [tab]);

  const showToast = useCallback((msg, ms) => { setToast(msg); setTimeout(() => setToast(null), ms || 2500); }, []);

  const refresh = useCallback(async () => {
    try {
      const [s, g, c, p] = await Promise.all([
        api.get("/api/songs"),
        api.get("/api/genres"),
        api.get("/api/comparisons"),
        api.get("/api/playlists"),
      ]);
      setSongs(s); setGenres(g); setComparisons(c); setPlaylists(p);
    } catch (e) {
      console.error("Failed to load data:", e);
      showToast("Failed to connect to server");
    }
  }, [showToast]);

  useEffect(() => { if (user) refresh().then(()=>setLoaded(true)); }, [user]);

  // Auto-dismiss intro for returning users who already have songs
  useEffect(() => {
    if (loaded && songs.length > 0 && !hasSeenIntro) persistIntro(true);
  }, [loaded, songs.length, hasSeenIntro, persistIntro]);

  useEffect(() => {
    api.get("/api/update-check").then(data => {
      if (data.available) setUpdateInfo(data);
    }).catch(() => {});
  }, []);

  const audio = useGlobalAudio();

  // Global keyboard shortcuts: space=pause, left/right=skip songs
  useEffect(() => {
    const handler = (e) => {
      // Only active on visualizer tab, and not when typing in inputs
      if (tab !== 'visualizer') return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      if (e.key === ' ') {
        e.preventDefault();
        if (audio.playingSrc) audio.toggle(audio.playingSrc);
        else if (playerQueue.length > 0) audio.play(playerQueue[playerQueueIdx]?.audioFile);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (playerQueue.length > 0) {
          const next = (playerQueueIdx + 1) % playerQueue.length;
          setPlayerQueueIdx(next);
          audio.play(playerQueue[next].audioFile);
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (playerQueue.length > 0) {
          if (audio.currentTime > 3) { audio.seek(0); }
          else {
            const prev = (playerQueueIdx - 1 + playerQueue.length) % playerQueue.length;
            setPlayerQueueIdx(prev);
            audio.play(playerQueue[prev].audioFile);
          }
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [audio, playerQueue, playerQueueIdx, tab]);

  // Manage onEnded here so it persists across tab switches (not in PlayerTab which unmounts)
  useEffect(() => {
    const currentSong = playerQueue[playerQueueIdx] || null;
    audio.setOnEnded(() => {
      if (playerLoop === "one" && currentSong) { audio.play(currentSong.audioFile); return; }
      if (playerQueueIdx < playerQueue.length - 1) {
        const next = playerQueueIdx + 1;
        setPlayerQueueIdx(next);
        audio.play(playerQueue[next].audioFile);
      } else if (playerLoop === "all" && playerQueue.length > 0) {
        setPlayerQueueIdx(0);
        audio.play(playerQueue[0].audioFile);
      }
    });
  }, [playerQueueIdx, playerQueue, playerLoop, audio.play, audio.setOnEnded]);

  useEffect(() => {
    if (!audio.playingSrc) { lastTimeUpdateRef.current = { src: null, time: 0 }; return; }
    const srcKey = audio.playingSrc;
    const song = songs.find(s => s.audioFile === srcKey);
    if (!song) return;

    const last = lastTimeUpdateRef.current;
    if (last.src === srcKey && audio.currentTime > last.time) {
      const delta = Math.min(audio.currentTime - last.time, 2);
      if (delta > 0.1) {
        listenTimesRef.current = { ...listenTimesRef.current, [song.id]: (listenTimesRef.current[song.id] || 0) + delta };
        listenTimesDirtyRef.current = true;
      }
    }
    lastTimeUpdateRef.current = { src: srcKey, time: audio.currentTime };
  }, [audio.currentTime, audio.playingSrc, songs]);

  // Sync listen times ref to state every 5 seconds (instead of on every timeupdate)
  useEffect(() => {
    const interval = setInterval(() => {
      setListenTimes({ ...listenTimesRef.current });
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Persist listen times to server every 15 seconds (only if changed)
  useEffect(() => {
    const interval = setInterval(() => {
      if (!listenTimesDirtyRef.current) return;
      listenTimesDirtyRef.current = false;
      api.put("/api/listen-times", listenTimesRef.current).catch(() => {
        listenTimesDirtyRef.current = true; // retry next interval
      });
    }, 15000);
    // Flush on page unload
    const flush = () => {
      if (!listenTimesDirtyRef.current) return;
      const data = JSON.stringify(listenTimesRef.current);
      navigator.sendBeacon("/api/listen-times", new Blob([data], { type: "application/json" }));
    };
    window.addEventListener("beforeunload", flush);
    return () => { clearInterval(interval); window.removeEventListener("beforeunload", flush); };
  }, []);

  useEffect(() => {
    if (!loaded || songs.length === 0) return;
    const migrated = localStorage.getItem("imade_elo_migrated_v2");
    if (migrated) return;
    const oldScaleSongs = songs.filter(s => s.baseElo != null && s.baseElo > 1000);
    if (oldScaleSongs.length === 0) {
      const hasAnyBase = songs.filter(s => s.baseElo != null);
      if (hasAnyBase.length > 0) {
        const clearAll = async () => {
          for (const s of hasAnyBase) {
            const fd = new FormData();
            fd.append("baseElo", "");
            await api.put("/api/songs/" + s.id, fd);
          }
          localStorage.setItem("imade_elo_migrated_v2", "1");
          await refresh();
        };
        clearAll();
      } else {
        localStorage.setItem("imade_elo_migrated_v2", "1");
      }
      return;
    }
    const migrate = async () => {
      for (const s of oldScaleSongs) {
        const newElo = Math.max(0, Math.min(1000, s.baseElo - 1000));
        const fd = new FormData();
        fd.append("baseElo", String(newElo));
        await api.put("/api/songs/" + s.id, fd);
      }
      localStorage.setItem("imade_elo_migrated_v2", "1");
      await refresh();
    };
    migrate();
  }, [loaded, songs.length]);

  useEffect(() => {
    if (!headerRef.current) return;
    const measure = () => setHeaderHeight(headerRef.current.getBoundingClientRect().height);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(headerRef.current);
    return () => ro.disconnect();
  }, [uploading]);

  const startUpload = useCallback(async (filesToUpload) => {
    if (!filesToUpload.length || uploading) return;
    setUploading(true);
    setUploadDone(false);
    uploadAbortRef.current = false;
    const total = filesToUpload.length;
    setUploadProgress({ done: 0, total });
    let failedCount = 0;

    for (let i = 0; i < total; i += BATCH_SIZE) {
      if (uploadAbortRef.current) break;
      const batch = filesToUpload.slice(i, i + BATCH_SIZE);
      const fd = new FormData();
      const dates = {};
      for (const f of batch) {
        fd.append("audio", f);
        dates[f.name] = f.lastModified;
      }
      fd.append("dates", JSON.stringify(dates));
      try {
        await api.post("/api/songs/bulk", fd);
      } catch (e) {
        console.error("Batch upload error:", e);
        failedCount += batch.length;
      }
      setUploadProgress({ done: Math.min(i + BATCH_SIZE, total), total });
    }

    setUploadFiles([]);
    setUploading(false);
    setUploadDone(true);
    await refresh();
    if (failedCount > 0) {
      showToast(failedCount + " file" + (failedCount > 1 ? "s" : "") + " failed to upload");
    } else if (!uploadAbortRef.current) {
      showToast("Uploaded " + total + " song" + (total > 1 ? "s" : ""));
    }
  }, [uploading, refresh, showToast]);

  const cancelUpload = useCallback(() => { uploadAbortRef.current = true; }, []);

  // Auth gate
  if (!authChecked) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",color:"#6b7280"}}>Loading...</div>;
  if (!user) return <AuthScreen onAuth={handleAuth} />;
  if (!loaded) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",color:"#6b7280"}}>Loading...</div>;

  const tabs = [
    { id: "library", label: "Library", count: songs.length },
    { id: "upload", label: "Upload" },
    { id: "battle", label: "Compare" },
    { id: "rankings", label: "Rankings" },
    { id: "player", label: "Player" },
    { id: "visualizer", label: "Visualizer" },
    { id: "playlists", label: "Playlists", count: playlists.length },
    { id: "stats", label: "Stats" },
    { id: "genres", label: "Settings" },
  ];

  const uploadPct = uploadProgress.total > 0 ? uploadProgress.done / uploadProgress.total : 0;

  return (
    <div style={{minHeight:"100vh"}}>
      {/* Custom title bar — Electron only */}
      {isElectron && (
      <div style={{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        height:32, background:"#0c0a1a", borderBottom:"1px solid #1a1a2e",
        WebkitAppRegion:"drag", userSelect:"none", position:"sticky", top:0, zIndex:100,
        paddingLeft:12,
      }}>
        <span style={{fontSize:12,fontWeight:600,color:"#6b6b80",letterSpacing:"0.03em"}}>iMade</span>
        <div style={{display:"flex",WebkitAppRegion:"no-drag",height:"100%"}}>
          <button onClick={()=>window.electronAPI?.minimize()}
            style={{width:46,height:"100%",background:"none",border:"none",color:"#6b6b80",fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}
            onMouseEnter={e=>e.currentTarget.style.background="#1e1e35"}
            onMouseLeave={e=>e.currentTarget.style.background="none"}>
            <svg width="10" height="1" viewBox="0 0 10 1"><rect width="10" height="1" fill="currentColor"/></svg>
          </button>
          <button onClick={()=>window.electronAPI?.maximize()}
            style={{width:46,height:"100%",background:"none",border:"none",color:"#6b6b80",fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}
            onMouseEnter={e=>e.currentTarget.style.background="#1e1e35"}
            onMouseLeave={e=>e.currentTarget.style.background="none"}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1"><rect x="0.5" y="0.5" width="9" height="9"/></svg>
          </button>
          <button onClick={()=>window.electronAPI?.close()}
            style={{width:46,height:"100%",background:"none",border:"none",color:"#6b6b80",fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}
            onMouseEnter={e=>{e.currentTarget.style.background="#e81123";e.currentTarget.style.color="#fff"}}
            onMouseLeave={e=>{e.currentTarget.style.background="none";e.currentTarget.style.color="#6b6b80"}}>
            <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.2"><line x1="0" y1="0" x2="10" y2="10"/><line x1="10" y1="0" x2="0" y2="10"/></svg>
          </button>
        </div>
      </div>
      )}

      {/* Global upload progress bar - visible from any tab */}
      {uploading && (
        <div style={{position:"fixed",top:0,left:0,right:0,zIndex:2000}}>
          <div style={{height:4,background:"#1a1a2e"}}>
            <div style={{width:(uploadPct*100)+"%",height:"100%",background:"linear-gradient(90deg,#4338ca,#818cf8)",transition:"width 0.3s ease"}} />
          </div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:12,padding:"8px 16px",background:"#1a1535ee",backdropFilter:"blur(8px)",borderBottom:"1px solid #2a2a45"}}>
            <span style={{color:"#818cf8",fontSize:13}}>Uploading {uploadProgress.done} / {uploadProgress.total} songs...</span>
            <span style={{color:"#6b7280",fontSize:13}}>{Math.round(uploadPct*100)}%</span>
            <button onClick={cancelUpload} style={{background:"none",border:"1px solid #2a2a45",borderRadius:6,padding:"3px 10px",color:"#6b7280",fontSize:11,cursor:"pointer"}}
              onMouseEnter={e=>e.target.style.color="#ef4444"} onMouseLeave={e=>e.target.style.color="#6b7280"}>cancel</button>
          </div>
        </div>
      )}

      {/* Header */}
      <div ref={headerRef} style={{position:"sticky",top:isElectron?32:0,zIndex:20,background:"#13102a"}}>
      <div style={{padding: uploading ? "80px 24px 0" : "32px 24px 0",maxWidth:1200,margin:"0 auto",transition:"padding 0.3s"}}>
        <div style={{display:"flex",alignItems:"baseline",gap:12,marginBottom:0}}>
          <h1 style={{margin:0,fontSize:"clamp(28px,6vw,40px)",fontWeight:700,background:"linear-gradient(135deg,#e2e8f0,#818cf8)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",letterSpacing:"-0.02em",lineHeight:1.1}}>IMAde</h1>
        </div>

        {/* Tabs */}
        <div style={{display:"flex",gap:2,marginTop:16,borderBottom:"1px solid #1e1e35",overflowX:"auto"}}>
          {tabs.map(t => (
            <button key={t.id} onClick={()=>switchTab(t.id)} style={{
              background:"transparent",
              border:"none", borderBottom: tab===t.id ? "2px solid #818cf8" : "2px solid transparent",
              padding:"10px 18px", color: tab===t.id ? "#e2e8f0" : "#6b6b80",
              fontSize:13, cursor:"pointer", whiteSpace:"nowrap",
              transition:"color 0.15s ease, border-color 0.15s ease",
            }}
              onMouseEnter={e=>{if(tab!==t.id)e.target.style.color="#a0a0b0"}}
              onMouseLeave={e=>{if(tab!==t.id)e.target.style.color="#6b6b80"}}
            >
              {t.label}
              {t.count != null && <span style={{marginLeft:5,fontSize:10,color:tab===t.id?"#818cf8":"#5a5a70"}}>{t.count}</span>}
              {t.id === "upload" && uploading && <span style={{marginLeft:5,fontSize:8,color:"#818cf8",animation:"pulse 1.5s infinite"}}>●</span>}
            </button>
          ))}
        </div>
      </div>
      </div>

      {/* Toast */}
      {toast && <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:"#1e1e35",border:"1px solid #2a2a45",borderRadius:10,padding:"10px 20px",color:"#e2e8f0",fontSize:13,zIndex:100,animation:"fadeUp 0.2s ease-out",boxShadow:"0 4px 20px rgba(0,0,0,0.4)"}}>{toast}</div>}

      {/* Update available banner */}
      {updateInfo && (
        <div style={{position:"fixed",bottom:24,right:24,background:"#1e1e35",border:"1px solid #818cf8",borderRadius:10,padding:"12px 16px",color:"#e2e8f0",fontSize:13,zIndex:100,boxShadow:"0 4px 20px rgba(0,0,0,0.4)",maxWidth:280,animation:"fadeUp 0.2s ease-out"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"start",gap:8}}>
            <span>Update available: <strong style={{color:"#818cf8"}}>v{updateInfo.latest}</strong></span>
            <button onClick={() => setUpdateInfo(null)} style={{background:"none",border:"none",color:"#6b7280",cursor:"pointer",fontSize:16,lineHeight:1,padding:0}}>×</button>
          </div>
          <a href={updateInfo.url} target="_blank" rel="noopener noreferrer"
            style={{display:"inline-block",marginTop:8,color:"#818cf8",fontSize:12,textDecoration:"underline"}}>
            Download
          </a>
        </div>
      )}

      {/* Welcome modal for new users */}
      {!hasSeenIntro && loaded && songs.length === 0 && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={() => persistIntro(true)}>
          <div onClick={e => e.stopPropagation()} style={{background:"#14142a",border:"1px solid #2a2a45",borderRadius:20,padding:"40px 32px",maxWidth:440,width:"100%",animation:"fadeUp 0.3s ease-out",boxShadow:"0 20px 60px rgba(0,0,0,0.5)"}}>
            <div style={{textAlign:"center",marginBottom:28}}>
              <h2 style={{margin:"0 0 8px",color:"#e2e8f0",fontSize:24,fontWeight:700,background:"linear-gradient(135deg,#e2e8f0,#818cf8)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Welcome to iMade</h2>
              <p style={{color:"#8a8aa0",fontSize:14,margin:0}}>Rank your music library with head-to-head comparisons</p>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:16,marginBottom:28}}>
              {[
                { step: "1", title: "Upload", desc: "Add songs from your library" },
                { step: "2", title: "Compare", desc: "Pick winners in quick matchups" },
                { step: "3", title: "Rankings", desc: "See your personal top charts" },
              ].map(s => (
                <div key={s.step} style={{display:"flex",alignItems:"center",gap:14}}>
                  <span style={{width:32,height:32,borderRadius:8,background:"linear-gradient(135deg,#4338ca,#6366f1)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:14,fontWeight:700,flexShrink:0}}>{s.step}</span>
                  <div>
                    <div style={{color:"#e2e8f0",fontSize:14,fontWeight:600}}>{s.title}</div>
                    <div style={{color:"#6b6b80",fontSize:12}}>{s.desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => { persistIntro(true); switchTab("upload"); }}
              style={{width:"100%",padding:"13px",borderRadius:12,background:"linear-gradient(135deg,#4338ca,#6366f1)",border:"none",color:"#fff",fontSize:15,fontWeight:700,cursor:"pointer",boxShadow:"0 4px 20px rgba(99,102,241,0.3)"}}>
              Get Started
            </button>
          </div>
        </div>
      )}

      {/* Visualizer — full-width, outside constrained content */}
      {tab === "visualizer" && (
        <React.Suspense fallback={<div style={{textAlign:"center",padding:40,color:"#6b7280"}}>Loading...</div>}>
          <div key="visualizer" style={{padding:"8px 8px 0",animation:"tabFadeIn 0.2s ease-out"}}>
            <VisualizerTab songs={songs} comparisons={comparisons} />
          </div>
        </React.Suspense>
      )}

      {/* Content */}
      <div style={{maxWidth:1200,margin:"0 auto",padding: tab === "visualizer" ? "0" : "20px 24px 40px"}}>
        {/* BattleTab uses display:none/block to preserve session state */}
        <div style={{display: tab === "battle" ? "block" : "none"}}>
          {loaded && <BattleTab songs={songs} comparisons={comparisons} onRefresh={refresh} showToast={showToast} savedPair={battlePair} setSavedPair={setBattlePair}
            hasSeenIntro={hasSeenIntro} setHasSeenIntro={persistIntro} hasSeenPhase2={hasSeenPhase2} setHasSeenPhase2={persistPhase2}
            focusedSessionSongs={focusedSessionSongs} setFocusedSessionSongs={setFocusedSessionSongs} stopAudio={audio.stop}
            sessionLength={sessionLength} bracketSize={bracketSize} />}
        </div>
        {/* All other tabs get fade-in animation */}
        {tab !== "battle" && tab !== "visualizer" && (
          <React.Suspense fallback={<div style={{textAlign:"center",padding:40,color:"#6b7280"}}>Loading...</div>}>
          <div key={tab} style={{animation:"tabFadeIn 0.2s ease-out"}}>
            {tab === "player" && <PlayerTab songs={songs} genres={genres} comparisons={comparisons} onRefresh={refresh} showToast={showToast} switchTab={switchTab}
              queue={playerQueue} setQueue={setPlayerQueue} queueIdx={playerQueueIdx} setQueueIdx={setPlayerQueueIdx}
              shuffle={playerShuffle} setShuffle={setPlayerShuffle} loop={playerLoop} setLoop={setPlayerLoop} />}
            {tab === "library" && <LibraryTab songs={songs} genres={genres} onRefresh={refresh}
              filterGenre={libFilterGenre} setFilterGenre={setLibFilterGenre}
              selectMode={libSelectMode} setSelectMode={setLibSelectMode}
              selectedIds={libSelectedIds} setSelectedIds={setLibSelectedIds}
              batchGenre={libBatchGenre} setBatchGenre={setLibBatchGenre}
              stickyTop={headerHeight} listenTimes={listenTimes}
              setPlayerQueue={setPlayerQueue} setPlayerQueueIdx={setPlayerQueueIdx} switchTab={switchTab}
              playlists={playlists} showToast={showToast} rowDensity={rowDensity} />}
            {tab === "upload" && <UploadTab
              onRefresh={refresh} genres={genres} songs={songs}
              uploadFiles={uploadFiles} setUploadFiles={setUploadFiles}
              uploading={uploading} uploadDone={uploadDone} setUploadDone={setUploadDone}
              uploadProgress={uploadProgress} startUpload={startUpload} />}
            {tab === "playlists" && <PlaylistsTab songs={songs} playlists={playlists} genres={genres} comparisons={comparisons} onRefresh={refresh} showToast={showToast}
              setPlayerQueue={setPlayerQueue} setPlayerQueueIdx={setPlayerQueueIdx} />}
            {tab === "rankings" && <RankingsTab songs={songs} comparisons={comparisons} onRefresh={refresh} showToast={showToast}
              lastUpdateCompCount={lastUpdateCompCount} setLastUpdateCompCount={setLastUpdateCompCount} switchTab={switchTab}
              showVariance={showVariance} showWinLoss={showWinLoss} rowDensity={rowDensity}
              stickyTop={headerHeight}
              setPlayerQueue={setPlayerQueue} setPlayerQueueIdx={setPlayerQueueIdx} />}
            {tab === "stats" && <StatsTab songs={songs} comparisons={comparisons} listenTimes={listenTimes}
              setPlayerQueue={setPlayerQueue} setPlayerQueueIdx={setPlayerQueueIdx} switchTab={switchTab}
              onStartFocusedSession={(songIds) => { setFocusedSessionSongs(songIds); switchTab("battle"); }}
              playlists={playlists} onRefresh={refresh} showToast={showToast} />}
            {tab === "genres" && <SettingsTab genres={genres} songs={songs} comparisons={comparisons} playlists={playlists} onRefresh={refresh} showToast={showToast}
              showVariance={showVariance} setShowVariance={(v) => { setShowVariance(v); localStorage.setItem("imade_showVariance", v ? "1" : "0"); }}
              sessionLength={sessionLength} setSessionLength={(v) => persistSetting("sessionLength", v, setSessionLength)}
              bracketSize={bracketSize} setBracketSize={(v) => { const n = Number(v); setBracketSize(n); localStorage.setItem("imade_bracketSize", String(n)); }}
              showWinLoss={showWinLoss} setShowWinLoss={(v) => { setShowWinLoss(v); localStorage.setItem("imade_showWinLoss", v ? "1" : "0"); }}
              rowDensity={rowDensity} setRowDensity={(v) => persistSetting("rowDensity", v, setRowDensity)}
              listenTimes={listenTimes} setListenTimes={setListenTimes} listenTimesRef={listenTimesRef}
              user={user} onLogout={handleLogout}
              />}
          </div>
          </React.Suspense>
        )}
      </div>
    </div>
  );
}

export default App;
