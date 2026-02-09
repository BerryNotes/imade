import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useGlobalAudio } from '../components/AudioProvider';
import AudioPlayer from '../components/AudioPlayer';
import GenreTag from '../components/GenreTag';
import ScrollToTop from '../components/ScrollToTop';
import { useRanking } from '../hooks/useRanking';
import api from '../api';

function RankingsTab({ songs, comparisons, onRefresh, showToast, lastUpdateCompCount, setLastUpdateCompCount, setPlayerQueue, setPlayerQueueIdx, switchTab, showVariance, showWinLoss, rowDensity }) {
  const ranking = useRanking(songs, comparisons);
  const tournament = ranking;
  const [filterGenre, setFilterGenre] = useState("All");
  const [dragId, setDragId] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const [saving, setSaving] = useState(false);
  const { play } = useGlobalAudio();
  const [searchQuery, setSearchQuery] = useState("");
  const [propagating, setPropagating] = useState(false);
  const dragMouseY = useRef(0);
  const scrollIntervalRef = useRef(null);

  const startAutoScroll = () => {
    if (scrollIntervalRef.current) return;
    const trackMouse = (e) => { dragMouseY.current = e.clientY; };
    document.addEventListener("dragover", trackMouse);
    scrollIntervalRef.current = setInterval(() => {
      const y = dragMouseY.current;
      const threshold = 120;
      const maxSpeed = 20;
      if (y < threshold) {
        const speed = maxSpeed * (1 - y / threshold);
        window.scrollBy(0, -speed);
      } else if (y > window.innerHeight - threshold) {
        const speed = maxSpeed * (1 - (window.innerHeight - y) / threshold);
        window.scrollBy(0, speed);
      }
    }, 16);
    scrollIntervalRef.current._trackMouse = trackMouse;
  };

  const stopAutoScroll = () => {
    if (scrollIntervalRef.current) {
      if (scrollIntervalRef.current._trackMouse) document.removeEventListener("dragover", scrollIntervalRef.current._trackMouse);
      clearInterval(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }
  };

  const handleDragStart = (songId) => { setDragId(songId); startAutoScroll(); };
  const handleDragOver = (e, idx) => { e.preventDefault(); setDragOverIdx(idx); dragMouseY.current = e.clientY; };
  const handleDragEnd = () => { setDragId(null); setDragOverIdx(null); stopAutoScroll(); };

  useEffect(() => () => stopAutoScroll(), []);

  const runPropagation = async () => {
    if (!ranking.eloSnapshots || ranking.eloSnapshots.length === 0) return;
    setPropagating(true);

    const PROP_RATE = 0.15;
    const finalElo = ranking.finalElo;
    const adjustments = {};

    ranking.eloSnapshots.forEach(snap => {
      const { songA, songB, winner, eloA, eloB } = snap;
      const loser = winner === songA ? songB : songA;

      const loserEloAtTime = winner === songA ? eloB : eloA;
      const loserEloNow = finalElo[loser] || 500;
      const loserDelta = loserEloNow - loserEloAtTime;

      const winnerEloAtTime = winner === songA ? eloA : eloB;
      const winnerEloNow = finalElo[winner] || 500;
      const winnerDelta = winnerEloNow - winnerEloAtTime;

      adjustments[winner] = (adjustments[winner] || 0) + loserDelta * PROP_RATE;
      adjustments[loser] = (adjustments[loser] || 0) + winnerDelta * PROP_RATE;
    });

    const saves = [];
    for (const [songId, adj] of Object.entries(adjustments)) {
      if (Math.abs(adj) < 0.5) continue;
      const song = songs.find(s => s.id === songId);
      if (!song) continue;
      const currentElo = finalElo[songId] || 500;
      const newElo = Math.round(currentElo + adj);
      const fd = new FormData();
      fd.append("baseElo", String(newElo));
      saves.push(api.put("/api/songs/" + songId, fd));
    }

    try {
      await Promise.all(saves);
      await onRefresh();
      setLastUpdateCompCount(comparisons.length);
      const affected = Object.values(adjustments).filter(a => Math.abs(a) >= 0.5).length;
      const avgShift = affected > 0 ? Math.round(Object.values(adjustments).reduce((s, a) => s + Math.abs(a), 0) / affected) : 0;
      showToast("Updated " + affected + " songs (avg ±" + avgShift + " Elo)");
    } catch (e) {
      showToast("Failed to update rankings");
    }
    setPropagating(false);
  };

  const handleDrop = async (e, dropIdx) => {
    e.preventDefault();
    if (!dragId || saving) { handleDragEnd(); return; }
    const dragStanding = tournament.standings.find(s => s.id === dragId);
    if (!dragStanding) { handleDragEnd(); return; }
    const dragCurrentIdx = filtered.findIndex(s => s.id === dragId);
    if (dragCurrentIdx === -1 || dragCurrentIdx === dropIdx || dragCurrentIdx === dropIdx - 1) { handleDragEnd(); return; }

    let targetElo;
    const above = dropIdx > 0 ? filtered[dropIdx - 1] : null;
    const below = dropIdx < filtered.length ? filtered[dropIdx] : null;
    const realAbove = above && above.id === dragId ? (dropIdx > 1 ? filtered[dropIdx - 2] : null) : above;
    const realBelow = below && below.id === dragId ? (dropIdx + 1 < filtered.length ? filtered[dropIdx + 1] : null) : below;

    if (realAbove && realBelow) {
      targetElo = Math.round((realAbove.elo + realBelow.elo) / 2);
    } else if (realAbove) {
      targetElo = realAbove.elo - 15;
    } else if (realBelow) {
      targetElo = realBelow.elo + 15;
    } else {
      handleDragEnd(); return;
    }

    setSaving(true);

    const movedUp = dropIdx < dragCurrentIdx;
    const passedStart = movedUp ? dropIdx : dragCurrentIdx + 1;
    const passedEnd = movedUp ? dragCurrentIdx : dropIdx;
    const passedSongs = filtered.slice(passedStart, passedEnd).filter(s => s.id !== dragId);

    const nudge = movedUp ? -3 : 3;
    const updates = [];
    for (const ps of passedSongs) {
      const newElo = Math.max(0, Math.min(1000, ps.elo + nudge));
      if (newElo !== ps.elo) {
        const fd = new FormData();
        fd.append("baseElo", String(newElo));
        updates.push(api.put("/api/songs/" + ps.id, fd));
      }
    }

    const fd = new FormData();
    fd.append("baseElo", String(targetElo));
    updates.push(api.put("/api/songs/" + dragId, fd));

    await Promise.all(updates);
    await onRefresh();
    setSaving(false);
    handleDragEnd();
  };

  if (comparisons.length === 0) return (
    <div style={{textAlign:"center",padding:80}}>
      <p style={{color:"#6b7280",fontSize:18}}>No comparisons yet</p>
      <p style={{color:"#6b6b80",fontSize:14,marginTop:4}}>Head to Compare to start ranking your songs</p>
    </div>
  );

  const hasNoGenreSongs = songs.some(s => !s.genre);
  const usedGenres = ["All", ...(hasNoGenreSongs ? ["No Genre"] : []), ...new Set(songs.map(s=>s.genre).filter(Boolean))];
  const allFiltered = filterGenre === "All" ? tournament.standings
    : filterGenre === "No Genre" ? tournament.standings.filter(s => !s.genre)
    : tournament.standings.filter(s => s.genre === filterGenre);
  const filtered = allFiltered.filter(s => s.totalComparisons > 0);
  const unrankedInFilter = allFiltered.filter(s => s.totalComparisons === 0).length;
  const now = Date.now();
  const getStaleDays = (ts) => ts ? Math.floor((now - ts) / 86400000) : Infinity;
  const unrankedCount = tournament.unrankedCount || 0;

  const renderRankRow = (s, i) => {
    const isDragging = dragId === s.id;
    const showInsertAbove = dragOverIdx === i && dragId && dragId !== s.id;
    const staleDays = getStaleDays(s.lastComparedAt);
    const isStale = staleDays > 14;
    return (
      <div key={s.id} id={"rank-" + s.id} style={{position:"relative"}}>
        {showInsertAbove && (
          <div style={{position:"absolute",top:-2,left:0,right:0,height:3,background:"#818cf8",borderRadius:2,zIndex:5,boxShadow:"0 0 8px rgba(129,140,248,0.5)"}} />
        )}
        <div draggable onDragStart={()=>handleDragStart(s.id)} onDragOver={e=>handleDragOver(e,i)} onDrop={e=>handleDrop(e,i)} onDragEnd={handleDragEnd}
          style={{background:isDragging?"#1c1c3a":"#14142a",border:"1px solid #1e1e35",borderRadius:rowDensity==="compact"?6:10,padding:rowDensity==="compact"?"4px 10px":"10px 14px",opacity:isDragging?0.3:1,cursor:"grab",display:"flex",flexDirection:"column",gap:rowDensity==="compact"?2:6,transition:"opacity 0.15s"}}>
          <div style={{display:"flex",alignItems:"center",gap:rowDensity==="compact"?6:8}}>
            <span style={{color:"#2a2a40",fontSize:rowDensity==="compact"?10:12,cursor:"grab",flexShrink:0,userSelect:"none",letterSpacing:1}}>⋮⋮</span>
            <span style={{fontSize:rowDensity==="compact"?11:13,color:i+1<=3?"#f59e0b":"#6b6b80",fontWeight:700,minWidth:rowDensity==="compact"?22:28,textAlign:"right"}}>{i+1}</span>
            <span style={{flex:1,color:"#e2e8f0",fontSize:rowDensity==="compact"?12:14,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.title}</span>
            <GenreTag genre={s.genre} compact={rowDensity==="compact"} />
            {isStale && <span title={staleDays+" days since last comparison"} style={{color:"#f59e0b",fontSize:9,flexShrink:0}}>stale</span>}
            <span style={{color:"#818cf8",fontSize:rowDensity==="compact"?10:11,fontWeight:600,flexShrink:0}}>{s.elo}{showVariance && s.eloMin !== s.eloMax && <span style={{color:"#5a5a70",fontSize:9,fontWeight:400}}> ±{Math.round((s.eloMax - s.eloMin) / 10)}</span>}</span>
            {showWinLoss && <span style={{color:"#5a5a70",fontSize:rowDensity==="compact"?9:10,flexShrink:0}}>{s.wins}W {s.losses}L</span>}
          </div>
          {rowDensity !== "compact" && s.audioFile && <AudioPlayer src={s.audioFile} compact />}
        </div>
      </div>
    );
  };

  return (
    <div>
      {unrankedCount > 0 && (
        <div onClick={()=>switchTab("battle")} style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,padding:"12px 16px",background:"#1a1525",border:"1px solid #2a2a45",borderRadius:10,cursor:"pointer",transition:"border-color 0.2s"}}
          onMouseEnter={e=>e.currentTarget.style.borderColor="#f59e0b"} onMouseLeave={e=>e.currentTarget.style.borderColor="#2a2a45"}>
          <span style={{color:"#f59e0b",fontSize:28,fontWeight:700,lineHeight:1}}>{unrankedCount}</span>
          <span style={{color:"#6b7280",fontSize:13}}>song{unrankedCount!==1?"s":""} not yet ranked</span>
          <span style={{color:"#818cf8",fontSize:11,marginLeft:4}}>rank now →</span>
        </div>
      )}

      {/* Auto-propagate every 10 comparisons */}
      {(() => {
        const compsSinceUpdate = comparisons.length - lastUpdateCompCount;
        React.useEffect(() => {
          if (compsSinceUpdate >= 10 && !propagating && comparisons.length > 0) {
            runPropagation();
          }
        }, [compsSinceUpdate]);
        return null;
      })()}

      <div style={{display:"flex",gap:16,alignItems:"flex-start"}}>
        {/* Sidebar */}
        <div style={{position:"sticky",top:80,width:170,flexShrink:0,display:"flex",flexDirection:"column",gap:10,paddingTop:8,zIndex:10}}>
          <div style={{position:"relative"}}>
            <span style={{position:"absolute",left:10,top:10,color:"#6b6b80",fontSize:12,pointerEvents:"none",zIndex:1}}>⌕</span>
            <input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="search..."
              style={{width:"100%",background:"#14142a",border:"1px solid #2a2a45",borderRadius:10,padding:"9px 10px 9px 28px",color:"#e2e8f0",fontSize:12,outline:"none",transition:"border-color 0.2s, box-shadow 0.2s"}}
              onFocus={e=>{e.target.style.borderColor="#4338ca";e.target.style.boxShadow="0 0 0 3px rgba(67,56,202,0.15)"}}
              onBlur={e=>{e.target.style.borderColor="#2a2a45";e.target.style.boxShadow="none"}} />
          </div>

          <div style={{color:"#8a8aa0",fontSize:10,textTransform:"uppercase",letterSpacing:"0.06em",marginTop:4}}>Genre</div>
          <select value={filterGenre} onChange={e=>setFilterGenre(e.target.value)} style={{background:filterGenre !== "All" ? "#4338ca20" : "#14142a",border:"1px solid "+(filterGenre !== "All" ? "#818cf8" : "#2a2a45"),borderRadius:10,padding:"9px 10px",color:filterGenre !== "All" ? "#818cf8" : "#e2e8f0",fontSize:12,cursor:"pointer",appearance:"none",width:"100%",fontWeight:filterGenre !== "All" ? 600 : 400}}>
            {usedGenres.map(g=><option key={g} value={g}>{g==="All"?"Any":g==="No Genre"?"No genre":g}</option>)}
          </select>

          {saving && <span style={{color:"#818cf8",fontSize:11,marginTop:8}}>saving...</span>}
          <div style={{color:"#5a5a70",fontSize:10,marginTop:4}}>{filtered.length} song{filtered.length !== 1 ? "s" : ""}</div>
        </div>

        {/* Song list */}
        <div style={{flex:1,minWidth:0}}>
          {/* Action bar */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",marginBottom:10,gap:6}}>
            <button onClick={() => {
              const playable = filtered.filter(s => s.audioFile);
              if (playable.length === 0) return;
              const shuffled = [...playable].sort(() => Math.random() - 0.5);
              setPlayerQueue(shuffled);
              setPlayerQueueIdx(0);
              play(shuffled[0].audioFile);
              switchTab("player");
            }}
              style={{background:"none",border:"1px solid #2a2a45",borderRadius:8,padding:"6px 12px",color:"#8a8aa0",fontSize:11,cursor:"pointer"}}
              onMouseEnter={e=>e.target.style.borderColor="#4338ca"} onMouseLeave={e=>e.target.style.borderColor="#2a2a45"}>
              shuffle
            </button>
            <button onClick={() => {
              const playable = filtered.filter(s => s.audioFile);
              if (playable.length === 0) return;
              setPlayerQueue([...playable]);
              setPlayerQueueIdx(0);
              play(playable[0].audioFile);
              switchTab("player");
            }}
              style={{background:"none",border:"1px solid #2a2a45",borderRadius:8,padding:"6px 12px",color:"#8a8aa0",fontSize:11,cursor:"pointer"}}
              onMouseEnter={e=>e.target.style.borderColor="#4338ca"} onMouseLeave={e=>e.target.style.borderColor="#2a2a45"}>
              {"\u25B6\uFE0E"} play
            </button>
          </div>
          {/* Search results dropdown */}
          {searchQuery && (() => {
            const q = searchQuery.toLowerCase();
            const matches = filtered.map((s, i) => ({ s, rank: i + 1 })).filter(({ s }) => s.title.toLowerCase().includes(q));
            if (matches.length === 0) return <div style={{color:"#6b6b80",fontSize:12,padding:"8px 0",marginBottom:8}}>No matches</div>;
            return (
              <div style={{background:"#14142a",border:"1px solid #1e1e35",borderRadius:8,marginBottom:12,maxHeight:200,overflowY:"auto"}}>
                {matches.slice(0, 10).map(({ s, rank }) => (
                  <div key={s.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",borderBottom:"1px solid #1e1e35",cursor:"pointer"}}
                    onClick={() => { setSearchQuery(""); const el = document.getElementById("rank-" + s.id); if (el) el.scrollIntoView({ behavior: "smooth", block: "center" }); }}
                    onMouseEnter={e=>e.currentTarget.style.background="#1e1e35"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <span style={{color:rank<=3?"#f59e0b":"#6b6b80",fontWeight:700,fontSize:13,minWidth:28,textAlign:"right"}}>#{rank}</span>
                    <span style={{flex:1,color:"#e2e8f0",fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.title}</span>
                    {s.genre && <span style={{color:"#818cf8",fontSize:9,textTransform:"uppercase"}}>{s.genre}</span>}
                    <span style={{color:"#818cf8",fontSize:11,fontWeight:600}}>{s.elo}</span>
                  </div>
                ))}
                {matches.length > 10 && <div style={{color:"#6b6b80",fontSize:11,padding:"6px 12px"}}>+{matches.length - 10} more</div>}
              </div>
            );
          })()}

          {propagating && (
            <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",marginBottom:10,background:"#1a1535",border:"1px solid #2a2a45",borderRadius:10}}>
              <div style={{width:14,height:14,border:"2px solid #818cf8",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite"}} />
              <span style={{color:"#818cf8",fontSize:12}}>Updating rankings...</span>
              <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            </div>
          )}
          <div style={{display:"flex",flexDirection:"column",gap:6,opacity:propagating?0.5:1,pointerEvents:propagating?"none":"auto",transition:"opacity 0.2s"}}>
            {filtered.map((s, i) => renderRankRow(s, i))}
          </div>
          <ScrollToTop />
        </div>
      </div>
    </div>
  );
}

export default RankingsTab;
