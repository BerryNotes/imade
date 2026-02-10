import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useGlobalAudio } from '../components/AudioProvider';
import { useRanking } from '../hooks/useRanking';
import { formatTime } from '../utils';
import api from '../api';

function PlayerTab({ songs, genres, comparisons, onRefresh, showToast, queue, setQueue, queueIdx, setQueueIdx, shuffle, setShuffle, loop, setLoop, switchTab }) {
  const audio = useGlobalAudio();
  const { play, pause, stop, toggle, seek, skip, playingSrc, currentTime, duration, isPlaying, setOnEnded, getSnapshot, volume, setVolume } = audio;
  const [editingGenre, setEditingGenre] = useState(false);
  const genreBoxRef = useRef(null);
  const ranking = useRanking(songs, comparisons);

  // Progress bar hooks (must be top-level, not inside IIFEs)
  const scrubRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);

  // Volume slider hooks
  const volRef = useRef(null);
  const [volDrag, setVolDrag] = useState(false);

  // Click outside to close genre picker
  useEffect(() => {
    if (!editingGenre) return;
    const handleClickOutside = (e) => {
      if (genreBoxRef.current && !genreBoxRef.current.contains(e.target)) {
        setEditingGenre(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [editingGenre]);

  const playable = useMemo(() => songs.filter(s => s.audioFile), [songs]);

  useEffect(() => {
    if (playable.length === 0) {
      // All songs deleted — clear queue
      if (queue.length > 0) { setQueue([]); setQueueIdx(0); stop(); }
      return;
    }
    if (queue.length === 0) {
      const q = shuffle ? [...playable].sort(() => Math.random() - 0.5) : [...playable];
      setQueue(q);
    } else {
      // Remove stale songs from queue
      const songIds = new Set(songs.map(s => s.id));
      const validQueue = queue.filter(s => songIds.has(s.id));
      if (validQueue.length !== queue.length) {
        setQueue(validQueue);
        setQueueIdx(prev => Math.min(prev, Math.max(0, validQueue.length - 1)));
        if (validQueue.length === 0) stop();
      }
    }
  }, [playable]);

  const queueSong = queue[queueIdx] || null;
  const currentSong = queueSong ? (songs.find(s => s.id === queueSong.id) || queueSong) : null;
  const isCurrent = currentSong && playingSrc === currentSong.audioFile;

  const currentRank = useMemo(() => {
    if (!currentSong) return null;
    const idx = ranking.standings.findIndex(s => s.id === currentSong.id);
    return idx >= 0 ? idx + 1 : null;
  }, [ranking.standings, currentSong]);
  const isUnranked = currentSong && (ranking.compCount[currentSong.id] || 0) === 0;

  const snapshot = currentSong && !isCurrent ? getSnapshot(currentSong.audioFile) : null;
  const displayTime = isCurrent ? currentTime : (snapshot ? snapshot.time : 0);
  const displayDur = isCurrent ? duration : (snapshot ? snapshot.duration : 0);
  const pct = displayDur > 0 ? (displayTime / displayDur * 100) : 0;

  // Progress bar drag
  const seekTo = (e) => {
    if (!scrubRef.current) return;
    const rect = scrubRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, ((e.clientX || e.pageX) - rect.left) / rect.width));
    const d = isCurrent ? duration : (snapshot ? snapshot.duration : 0);
    if (!isCurrent && currentSong) play(currentSong.audioFile);
    if (d > 0) seek(d * ratio);
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => { e.preventDefault(); seekTo(e.touches ? e.touches[0] : e); };
    const onUp = () => setDragging(false);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.addEventListener("touchmove", onMove);
    document.addEventListener("touchend", onUp);
    return () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); document.removeEventListener("touchmove", onMove); document.removeEventListener("touchend", onUp); };
  }, [dragging]);

  // Volume drag
  const setVol = (e) => {
    if (!volRef.current) return;
    const rect = volRef.current.getBoundingClientRect();
    setVolume(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
  };

  useEffect(() => {
    if (!volDrag) return;
    const onMove = (e) => { e.preventDefault(); setVol(e); };
    const onUp = () => setVolDrag(false);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
  }, [volDrag]);

  // onEnded is now managed in App.jsx so it persists across tab switches

  const toggleShuffle = () => {
    const newShuffle = !shuffle; setShuffle(newShuffle);
    if (newShuffle) {
      const rest = queue.filter((s, i) => i !== queueIdx);
      const shuffled = rest.sort(() => Math.random() - 0.5);
      const q = currentSong ? [currentSong, ...shuffled] : shuffled;
      setQueue(q); setQueueIdx(0);
    } else {
      if (currentSong) { const idx = queue.findIndex(s => s.id === currentSong.id); if (idx !== -1) setQueueIdx(idx); }
    }
  };

  const cycleLoop = () => { setLoop(prev => prev === "none" ? "all" : prev === "all" ? "one" : "none"); };

  const skipNext = () => {
    if (queue.length === 0) return;
    const next = (queueIdx + 1) % queue.length;
    setQueueIdx(next); play(queue[next].audioFile);
  };

  const skipPrev = () => {
    if (queue.length === 0) return;
    if (currentTime > 3) { seek(0); return; }
    const prev = (queueIdx - 1 + queue.length) % queue.length;
    setQueueIdx(prev); play(queue[prev].audioFile);
  };

  const rateSong = async (delta) => {
    if (!currentSong) return;
    const standing = ranking.standings.find(s => s.id === currentSong.id);
    const currentElo = standing ? standing.elo : (currentSong.baseElo != null ? currentSong.baseElo : 500);
    const distFromCenter = Math.abs(currentElo - 500) / 500;
    const isReinforcing = (delta > 0 && currentElo > 500) || (delta < 0 && currentElo < 500);
    const dampening = isReinforcing ? (1 - distFromCenter) : 1;
    const adjustedDelta = Math.round(delta * dampening);
    if (adjustedDelta === 0) {
      showToast(delta > 0 ? "Already at top" : "Already at bottom");
      return;
    }
    const newElo = Math.max(0, Math.min(1000, currentElo + adjustedDelta));
    const fd = new FormData();
    fd.append("baseElo", String(newElo));
    await api.put("/api/songs/" + currentSong.id, fd);
    await onRefresh();
    showToast((delta > 0 ? "\u{1F44D}" : "\u{1F44E}") + " " + (adjustedDelta > 0 ? "+" : "") + adjustedDelta);
  };

  const saveGenre = async (newGenre) => {
    if (!currentSong) return;
    if (newGenre === (currentSong.genre || "")) { setEditingGenre(false); return; }
    const fd = new FormData();
    fd.append("genre", newGenre);
    await api.put("/api/songs/" + currentSong.id, fd);
    await onRefresh(); setEditingGenre(false);
    showToast("Genre updated");
  };

  if (playable.length === 0) return (
    <div style={{textAlign:"center",padding:80}}>
      <p style={{color:"#8a8aa0",fontSize:18}}>No songs with audio files in your library</p>
    </div>
  );

  const idle = !playingSrc && !isCurrent;

  if (idle) return (
    <div style={{textAlign:"center",padding:80}}>
      <div style={{fontSize:48,opacity:0.2,lineHeight:1,marginBottom:16}}>{"\u266A"}</div>
      <p style={{color:"#6b6b80",fontSize:15}}>No song playing</p>
      <p style={{color:"#5a5a70",fontSize:12,marginTop:4}}>Play a song from the library to get started</p>
    </div>
  );

  return (
    <div style={{maxWidth:500,margin:"0 auto",textAlign:"center"}}>
      {/* Song info */}
      <div style={{marginBottom:24}}>
        <div style={{fontSize:48,opacity:0.35,lineHeight:1,marginBottom:12}}>{"\u266A"}</div>
        <h2 style={{color:"#e2e8f0",fontSize:22,fontWeight:400,marginBottom:4}}>{currentSong?.title || "No song"}</h2>
        {currentSong && (
          <div style={{marginBottom:8}}>
            {isUnranked ? (
              <span onClick={()=>switchTab("battle")} style={{color:"#f59e0b",fontSize:11,cursor:"pointer",background:"#f59e0b15",padding:"3px 10px",borderRadius:8}}>not ranked yet — compare now</span>
            ) : currentRank ? (
              <span style={{color:currentRank<=3?"#f59e0b":"#6b6b80",fontSize:12,fontWeight:600}}>#{currentRank}</span>
            ) : null}
          </div>
        )}
        {editingGenre ? (
          <div ref={genreBoxRef} style={{maxHeight:80,overflowY:"auto",overflowX:"hidden",display:"flex",gap:4,justifyContent:"center",alignItems:"flex-start",flexWrap:"wrap",padding:"2px 0"}}>
            <button onClick={()=>saveGenre("")}
              style={{background:!currentSong?.genre?"#4338ca":"none",border:"1px solid #2a2a45",borderRadius:14,padding:"3px 10px",color:!currentSong?.genre?"#fff":"#6b7280",fontSize:10,cursor:"pointer",flexShrink:0}}>
              none
            </button>
            {genres.map(g=>(
              <button key={g} onClick={()=>saveGenre(g)}
                style={{background:currentSong?.genre===g?"#4338ca":"none",border:"1px solid "+(currentSong?.genre===g?"#4338ca":"#2a2a45"),borderRadius:14,padding:"3px 10px",color:currentSong?.genre===g?"#fff":"#818cf8",fontSize:10,cursor:"pointer",flexShrink:0}}>
                {g}
              </button>
            ))}
            <button onClick={()=>setEditingGenre(false)} style={{background:"none",border:"none",color:"#6b6b80",fontSize:10,cursor:"pointer",padding:"3px 6px",flexShrink:0}}>{"\u2715"}</button>
          </div>
        ) : (
          <span onClick={()=>setEditingGenre(true)} style={{color:"#818cf8",fontSize:12,textTransform:"uppercase",letterSpacing:"0.05em",cursor:"pointer",background:"#4338ca15",padding:"4px 12px",borderRadius:12}}>
            {currentSong?.genre || "no genre"} {"\u270E"}
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div style={{marginBottom:20,padding:"0 20px"}}>
        <div ref={scrubRef}
          onMouseDown={(e) => { seekTo(e); setDragging(true); }}
          onTouchStart={(e) => { seekTo(e.touches[0]); setDragging(true); }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => { if (!dragging) setHovered(false); }}
          style={{height:28,cursor:"pointer",position:"relative",display:"flex",alignItems:"center",touchAction:"none"}}>
          <div style={{position:"absolute",left:0,right:0,height: hovered||dragging ? 6 : 4,background:"#1a1a2e",borderRadius:3,transition:"height 0.15s"}} />
          <div style={{position:"absolute",left:0,width:pct+"%",height: hovered||dragging ? 6 : 4,background:"linear-gradient(90deg,#4338ca,#818cf8)",borderRadius:3,transition: dragging ? "none" : "height 0.15s, width 0.1s"}} />
          <div style={{
            position:"absolute",left:"calc("+pct+"% - 7px)",
            width:14,height:14,borderRadius:"50%",
            background:"#818cf8",boxShadow:"0 0 8px rgba(129,140,248,0.4)",
            opacity: hovered||dragging ? 1 : 0,
            transform: dragging ? "scale(1.2)" : "scale(1)",
            transition: dragging ? "none" : "opacity 0.15s, transform 0.15s",
            pointerEvents:"none",
          }} />
        </div>
        <div style={{display:"flex",justifyContent:"space-between",marginTop:0}}>
          <span style={{color:"#6b6b80",fontSize:10}}>{formatTime(displayTime)}</span>
          <span style={{color:"#6b6b80",fontSize:10}}>{formatTime(displayDur)}</span>
        </div>
      </div>

      {/* Controls */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:16,marginBottom:24}}>
        <button onClick={toggleShuffle} style={{background:"none",border:"none",color:shuffle?"#818cf8":"#6b6b80",fontSize:13,cursor:"pointer",padding:4,fontWeight:600,letterSpacing:"-0.05em"}} title="Shuffle">{"\u21C4"}</button>
        <button onClick={skipPrev} style={{background:"none",border:"none",color:"#e2e8f0",fontSize:22,cursor:"pointer",padding:4,display:"flex",alignItems:"center"}} title="Previous"><svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor"><rect x="2" y="3" width="2.5" height="12" rx="0.5"/><polygon points="15,3 15,15 5,9"/></svg></button>
        <button onClick={()=>skip(-10)} style={{background:"none",border:"none",color:"#9a9ab0",fontSize:14,cursor:"pointer",padding:4}} title="-10s">-10</button>
        <button onClick={()=>{ if (currentSong) toggle(currentSong.audioFile); else if (queue.length) { play(queue[0].audioFile); } }}
          style={{background:"linear-gradient(135deg,#4338ca,#6366f1)",border:"none",borderRadius:"50%",width:56,height:56,color:"#fff",fontSize:24,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 2px 16px rgba(99,102,241,0.3)",
            transition:"transform 0.1s ease, box-shadow 0.15s ease"}}
          onMouseDown={e=>e.currentTarget.style.transform="scale(0.95)"}
          onMouseUp={e=>e.currentTarget.style.transform="scale(1)"}
          onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}>
          {isCurrent && isPlaying ? React.createElement("svg",{width:24,height:24,viewBox:"0 0 24 24",fill:"currentColor"},React.createElement("rect",{x:"6",y:"4",width:"4",height:"16",rx:"1"}),React.createElement("rect",{x:"14",y:"4",width:"4",height:"16",rx:"1"})) : React.createElement("svg",{width:24,height:24,viewBox:"0 0 24 24",fill:"currentColor"},React.createElement("polygon",{points:"6,4 20,12 6,20"}))}
        </button>
        <button onClick={()=>skip(10)} style={{background:"none",border:"none",color:"#9a9ab0",fontSize:14,cursor:"pointer",padding:4}} title="+10s">+10</button>
        <button onClick={skipNext} style={{background:"none",border:"none",color:"#e2e8f0",fontSize:22,cursor:"pointer",padding:4,display:"flex",alignItems:"center"}} title="Next"><svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor"><polygon points="3,3 3,15 13,9"/><rect x="13.5" y="3" width="2.5" height="12" rx="0.5"/></svg></button>
        <button onClick={cycleLoop} style={{background:"none",border:"none",color:loop!=="none"?"#818cf8":"#6b6b80",fontSize:11,cursor:"pointer",padding:"4px 6px",fontWeight:700,position:"relative"}} title={"Loop: "+loop}>
          <span style={{letterSpacing:"-0.03em"}}>{"\u21BB"}</span>{loop === "one" && <span style={{position:"absolute",fontSize:7,bottom:0,right:0,color:"#818cf8"}}>1</span>}
        </button>
      </div>

      {/* Volume */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginBottom:20,padding:"0 40px"}}>
        <span style={{color:volume===0?"#ef4444":"#6b6b80",fontSize:12,cursor:"pointer",width:16,textAlign:"center"}} onClick={()=>setVolume(volume===0?1:0)}>{volume===0?"\u2715":"\u266A"}</span>
        <div ref={volRef} style={{flex:1,maxWidth:200,height:24,cursor:"pointer",position:"relative",display:"flex",alignItems:"center"}}
          onMouseDown={(e)=>{setVol(e);setVolDrag(true)}}>
          <div style={{position:"absolute",left:0,right:0,height:3,background:"#1a1a2e",borderRadius:2}} />
          <div style={{position:"absolute",left:0,width:(volume*100)+"%",height:3,background:"#4338ca",borderRadius:2}} />
          <div style={{position:"absolute",left:"calc("+(volume*100)+"% - 5px)",width:10,height:10,borderRadius:"50%",background:"#818cf8",boxShadow:"0 0 6px rgba(129,140,248,0.3)"}} />
        </div>
        <span style={{color:"#5a5a70",fontSize:9,minWidth:24,textAlign:"center"}}>{Math.round(volume*100)}</span>
      </div>

      {/* Like / Dislike */}
      <div style={{display:"flex",gap:10,justifyContent:"center",marginBottom:24}}>
        <button onClick={()=>rateSong(-5)} style={{background:"none",border:"1px solid #2a2a45",borderRadius:10,padding:"10px 20px",color:"#6b7280",fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",
            transition:"transform 0.1s ease, border-color 0.15s ease, color 0.15s ease"}}
          onMouseEnter={e=>{e.currentTarget.style.borderColor="#ef4444";e.currentTarget.style.color="#ef4444"}} onMouseLeave={e=>{e.currentTarget.style.borderColor="#2a2a45";e.currentTarget.style.color="#6b7280";e.currentTarget.style.transform="scale(1)"}}
          onMouseDown={e=>e.currentTarget.style.transform="scale(0.95)"} onMouseUp={e=>e.currentTarget.style.transform="scale(1)"}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{transform:"scaleY(-1)"}}><path d="M7 10v12"/><path d="M15 5.88L14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z"/></svg>
        </button>
        <button onClick={()=>rateSong(5)} style={{background:"none",border:"1px solid #2a2a45",borderRadius:10,padding:"10px 20px",color:"#6b7280",fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",
            transition:"transform 0.1s ease, border-color 0.15s ease, color 0.15s ease"}}
          onMouseEnter={e=>{e.currentTarget.style.borderColor="#22c55e";e.currentTarget.style.color="#22c55e"}} onMouseLeave={e=>{e.currentTarget.style.borderColor="#2a2a45";e.currentTarget.style.color="#6b7280";e.currentTarget.style.transform="scale(1)"}}
          onMouseDown={e=>e.currentTarget.style.transform="scale(0.95)"} onMouseUp={e=>e.currentTarget.style.transform="scale(1)"}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 10v12"/><path d="M15 5.88L14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z"/></svg>
        </button>
      </div>

      {/* Queue */}
      <div style={{textAlign:"left",borderTop:"1px solid #1e1e35",paddingTop:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <div style={{color:"#6b6b80",fontSize:10,textTransform:"uppercase",letterSpacing:"0.08em"}}>Queue ({queue.length - queueIdx - 1} remaining)</div>
          {queue.length > queueIdx + 1 && (
            <button onClick={() => { stop(); setQueue(currentSong ? [currentSong] : []); setQueueIdx(0); }}
              style={{background:"none",border:"1px solid #2a2a45",borderRadius:6,padding:"3px 10px",color:"#6b6b80",fontSize:10,cursor:"pointer"}}
              onMouseEnter={e=>e.target.style.color="#ef4444"} onMouseLeave={e=>e.target.style.color="#6b6b80"}>clear</button>
          )}
        </div>
        <div style={{maxHeight:210,overflowY:"auto"}}>
        {queue.slice(queueIdx + 1).map((s, i) => {
          const fresh = songs.find(x => x.id === s.id) || s;
          return (
            <div key={s.id + i} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:"1px solid #0d0d1a",cursor:"pointer",color:"#9a9ab0",fontSize:13}}
              onClick={() => { const idx = queueIdx + 1 + i; setQueueIdx(idx); play(queue[idx].audioFile); }}>
              <span style={{color:"#5a5a70",fontSize:10,minWidth:16}}>{i + 1}</span>
              <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{fresh.title}</span>
              {fresh.genre && <span style={{color:"#818cf8",fontSize:9,textTransform:"uppercase"}}>{fresh.genre}</span>}
            </div>
          );
        })}
        {queue.length <= queueIdx + 1 && <div style={{color:"#5a5a70",fontSize:12,textAlign:"center",padding:16}}>Queue empty</div>}
        </div>
      </div>
    </div>
  );
}

export default PlayerTab;
