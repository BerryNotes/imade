import React, { useState, useEffect, useCallback } from 'react';
import { useGlobalAudio } from '../components/AudioProvider';

function TierMode({ songs, standings, compMap, compCount, submitComparison, onRefresh, showToast, onSessionAdvance, sessionMode }) {
  const [pool, setPool] = useState([]);
  const [tiers, setTiers] = useState({ S: [], A: [], B: [], C: [], D: [], E: [] });
  const [submitting, setSubmitting] = useState(false);
  const [usedIds, setUsedIds] = useState(new Set());
  const [sessionDone, setSessionDone] = useState(false);
  const { play, toggle, stop, playingSrc, isPlaying, subscribe } = useGlobalAudio();
  const [, forceAudioUpdate] = useState(0);
  useEffect(() => subscribe(() => forceAudioUpdate(n => n + 1)), [subscribe]);

  const getBatch = useCallback((used) => {
    const available = standings.filter(s => !used.has(s.id));
    if (available.length === 0) return [];
    const unranked = available.filter(s => (compCount[s.id] || 0) < 3);
    // In session mode, only serve unranked songs
    if (sessionMode && unranked.length === 0) return [];
    const source = unranked.length > 0 ? unranked : available;
    const shuffled = [...source].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(8, shuffled.length));
  }, [standings, compCount, sessionMode]);

  useEffect(() => {
    const batch = getBatch(usedIds);
    if (batch.length > 0) {
      setPool(batch);
      setTiers({ S: [], A: [], B: [], C: [], D: [], E: [] });
      setSessionDone(false);
    } else {
      setSessionDone(true);
    }
  }, [standings.length]);

  const playSong = (song) => {
    if (!song.audioFile) return;
    toggle(song.audioFile);
  };

  const moveSong = (song, toTier) => {
    setPool(p => p.filter(s => s.id !== song.id));
    Object.keys(tiers).forEach(t => setTiers(prev => ({...prev, [t]: prev[t].filter(s => s.id !== song.id)})));
    if (toTier) setTiers(prev => ({...prev, [toTier]: [...prev[toTier], song]}));
    else setPool(p => [...p, song]);
  };

  const submitTiers = async () => {
    try {
    setSubmitting(true);
    const tierOrder = ["S", "A", "B", "C", "D", "E"];
    const allSorted = tierOrder.flatMap(t => tiers[t]);
    let submitted = 0;
    for (let i = 0; i < allSorted.length; i++) {
      for (let j = i + 1; j < allSorted.length; j++) {
        if (allSorted[i].id === allSorted[j].id) continue;
        const key = [allSorted[i].id, allSorted[j].id].sort().join("|");
        if (!compMap[key]) {
          await submitComparison(allSorted[i].id, allSorted[j].id, "tier");
          submitted++;
        }
      }
    }
    await onRefresh();
    showToast("Generated " + submitted + " comparisons");

    const newUsed = new Set(usedIds);
    [...pool, ...Object.values(tiers).flat()].forEach(s => newUsed.add(s.id));
    setUsedIds(newUsed);

    // In session mode, one batch is enough — advance
    if (sessionMode) {
      setPool([]);
      setTiers({ S: [], A: [], B: [], C: [], D: [], E: [] });
      setSessionDone(true);
      setSubmitting(false);
      return;
    }

    const nextBatch = getBatch(newUsed);
    if (nextBatch.length > 0) {
      setPool(nextBatch);
      setTiers({ S: [], A: [], B: [], C: [], D: [], E: [] });
    } else {
      setPool([]);
      setTiers({ S: [], A: [], B: [], C: [], D: [], E: [] });
      setSessionDone(true);
    }
    setSubmitting(false);
    } catch(err) { console.error("submitTiers error:", err); setSubmitting(false); showToast("Error: " + err.message); }
  };

  const loadNewBatch = () => {
    const newUsed = new Set(usedIds);
    [...pool, ...Object.values(tiers).flat()].forEach(s => newUsed.add(s.id));
    setUsedIds(newUsed);
    stop();
    const batch = getBatch(newUsed);
    if (batch.length > 0) {
      setPool(batch);
      setTiers({ S: [], A: [], B: [], C: [], D: [], E: [] });
    } else {
      setSessionDone(true);
    }
  };

  const resetSession = () => {
    setUsedIds(new Set());
    const batch = getBatch(new Set());
    setPool(batch);
    setTiers({ S: [], A: [], B: [], C: [], D: [], E: [] });
    setSessionDone(false);
  };

  const tierColors = { S: "#22c55e", A: "#818cf8", B: "#3b82f6", C: "#f59e0b", D: "#f97316", E: "#ef4444" };
  const tierLabels = { S: "Best", A: "Great", B: "Good", C: "Meh", D: "Poor", E: "Worst" };
  const totalPlaced = Object.values(tiers).reduce((s, t) => s + t.length, 0);
  const availableCount = standings.filter(s => !usedIds.has(s.id)).length;
  const unrankedCount = standings.filter(s => !usedIds.has(s.id) && (compCount[s.id] || 0) < 3).length;

  // Auto-advance in session mode when done (deferred to avoid setState-on-unmount)
  useEffect(() => {
    if (sessionDone && sessionMode && onSessionAdvance) {
      const t = setTimeout(onSessionAdvance, 0);
      return () => clearTimeout(t);
    }
  }, [sessionDone, sessionMode, onSessionAdvance]);

  if (sessionDone) {
    if (sessionMode) return <div style={{textAlign:"center",padding:40,color:"#6b7280"}}>Moving on...</div>;

    return (
      <div style={{textAlign:"center",padding:40}}>
        <span style={{fontSize:36}}>✅</span>
        <p style={{color:"#e2e8f0",fontSize:18,fontWeight:600,margin:"12px 0 4px"}}>All songs sorted</p>
        <p style={{color:"#6b6b80",fontSize:13,margin:"0 0 16px"}}>Every song has been through tier sort.</p>
        <button onClick={resetSession}
          style={{padding:"12px 24px",borderRadius:10,background:"linear-gradient(135deg,#4338ca,#6366f1)",border:"none",color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer"}}>
          Start fresh round
        </button>
      </div>
    );
  }

  const renderChip = (s, bgColor, borderColor) => {
    const isChipPlaying = isPlaying && playingSrc === s.audioFile;
    return (
      <div key={s.id} draggable
        onDragStart={e => { e.dataTransfer.setData("songId", s.id); }}
        onClick={e => { e.stopPropagation(); playSong(s); }}
        onDragEnd={e => { e.stopPropagation(); }}
        style={{background:bgColor,border:"1px solid "+borderColor,borderRadius:8,padding:"6px 12px",cursor:s.audioFile?"pointer":"grab",fontSize:12,color:"#e2e8f0",display:"flex",alignItems:"center",gap:6,userSelect:"none",WebkitUserDrag:"element"}}>
        {s.audioFile && <span style={{fontSize:10,opacity:isChipPlaying?1:0.5}}>{isChipPlaying?"\u23F8\uFE0E":"\u25B6\uFE0E"}</span>}
        {s.title}
      </div>
    );
  };

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <span style={{color:"#6b6b80",fontSize:11}}>
          {sessionMode
            ? pool.length + " song" + (pool.length !== 1 ? "s" : "") + " to sort"
            : (availableCount - pool.length) + " remaining" + (unrankedCount > 0 ? " (" + unrankedCount + " new)" : "")
          }
        </span>
      </div>

      <div onDragOver={e=>e.preventDefault()} onDrop={e=>{const id=e.dataTransfer.getData("songId");const song=Object.values(tiers).flat().find(s=>s.id===id);if(song)moveSong(song,null);}}
        style={{background:"#0d0d1a",border:"1px solid #1e1e35",borderRadius:12,padding:12,marginBottom:12,minHeight:60}}>
        <div style={{color:"#5a5a70",fontSize:10,marginBottom:8}}>UNSORTED</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
          {pool.map(s => renderChip(s, "#14142a", "#2a2a45"))}
        </div>
      </div>

      {Object.entries(tierColors).map(([tier, color]) => (
        <div key={tier} onDragOver={e=>e.preventDefault()} onDrop={e=>{const id=e.dataTransfer.getData("songId");const song=[...pool,...Object.values(tiers).flat()].find(s=>s.id===id);if(song)moveSong(song,tier);}}
          style={{display:"flex",gap:8,alignItems:"stretch",marginBottom:6}}>
          <div style={{width:40,background:color,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:700,fontSize:16,flexDirection:"column",gap:0}}>
            <span>{tier}</span>
          </div>
          <div style={{flex:1,background:"#14142a",border:"1px solid #2a2a45",borderRadius:8,padding:8,minHeight:40,display:"flex",flexWrap:"wrap",gap:6,alignContent:"flex-start"}}>
            {tiers[tier].length === 0 && <span style={{color:"#3a3a50",fontSize:10,padding:"4px 8px"}}>{tierLabels[tier]}</span>}
            {tiers[tier].map(s => renderChip(s, color+"20", color+"40"))}
          </div>
        </div>
      ))}
      <button onClick={submitTiers} disabled={pool.length > 0 || totalPlaced < 2 || submitting}
        style={{width:"100%",marginTop:12,padding:"16px",borderRadius:12,background:pool.length===0&&totalPlaced>=2?"linear-gradient(135deg,#4338ca,#6366f1)":"#1a1a2e",border:"none",color:pool.length===0&&totalPlaced>=2?"#fff":"#5a5a70",fontSize:16,fontWeight:700,cursor:pool.length===0&&totalPlaced>=2?"pointer":"default",opacity:submitting?0.5:1,boxShadow:pool.length===0&&totalPlaced>=2?"0 4px 20px rgba(99,102,241,0.3)":"none"}}>
        {submitting ? "Submitting..." : pool.length > 0 ? "Sort all songs to submit" : "Submit (" + totalPlaced + " songs)"}
      </button>
    </div>
  );
}

export default TierMode;
