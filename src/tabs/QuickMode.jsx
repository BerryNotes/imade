import React, { useState, useEffect, useCallback } from 'react';
import AudioPlayer from '../components/AudioPlayer';
import GenreTag from '../components/GenreTag';

function QuickMode({ songs, standings, compMap, compCount, submitComparison, onRefresh, showToast, stopAudio, onSessionAdvance, sessionMode }) {
  const SESSION_QUICK_LIMIT = 5;
  const [current, setCurrent] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [ratedIds, setRatedIds] = useState(new Set());
  const [sessionDone, setSessionDone] = useState(false);

  const getNextSong = useCallback((rated) => {
    // In session mode, stop after limit
    if (sessionMode && rated.size >= SESSION_QUICK_LIMIT) return null;
    const unrated = standings.filter(s => !rated.has(s.id));
    if (unrated.length === 0) return null;
    const unranked = unrated.filter(s => (compCount[s.id] || 0) < 3);
    // In session mode, only serve unranked songs
    if (sessionMode && unranked.length === 0) return null;
    const pool = unranked.length > 0 ? unranked : unrated;
    return pool[Math.floor(Math.random() * pool.length)];
  }, [standings, compCount, sessionMode]);

  useEffect(() => {
    if (!current && !sessionDone) {
      const next = getNextSong(ratedIds);
      if (next) setCurrent(next);
      else setSessionDone(true);
    }
  }, [current, sessionDone, getNextSong, ratedIds]);

  const rate = async (rating) => {
    if (!current || processing) return;
    setProcessing(true);
    stopAudio();
    const sorted = [...standings].sort((a,b) => b.elo - a.elo);
    const targetPct = rating === "top" ? 0.15 : rating === "good" ? 0.38 : rating === "mid" ? 0.62 : rating === "low" ? 0.82 : 0.95;
    const refIdx = Math.min(sorted.length - 1, Math.floor(sorted.length * targetPct));
    const refSong = sorted[refIdx];
    if (refSong && refSong.id !== current.id) {
      const winner = rating === "top" || rating === "good" ? current.id : refSong.id;
      const loser = winner === current.id ? refSong.id : current.id;
      await submitComparison(winner, loser, "quick");
    }
    await onRefresh();
    const newRated = new Set(ratedIds);
    newRated.add(current.id);
    setRatedIds(newRated);
    const next = getNextSong(newRated);
    if (next) setCurrent(next);
    else { setCurrent(null); setSessionDone(true); }
    setProcessing(false);
  };

  const resetSession = () => {
    setRatedIds(new Set());
    setSessionDone(false);
    setCurrent(null);
  };

  const remaining = standings.filter(s => !ratedIds.has(s.id)).length;
  const unrankedRemaining = standings.filter(s => !ratedIds.has(s.id) && (compCount[s.id] || 0) < 3).length;

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
        <p style={{color:"#e2e8f0",fontSize:18,fontWeight:600,margin:"12px 0 4px"}}>All songs rated</p>
        <p style={{color:"#6b6b80",fontSize:13,margin:"0 0 16px"}}>You've quick-rated every song.</p>
        <button onClick={resetSession}
          style={{padding:"12px 24px",borderRadius:10,background:"linear-gradient(135deg,#4338ca,#6366f1)",border:"none",color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer",
            transition:"transform 0.1s ease, box-shadow 0.15s ease"}}
          onMouseDown={e=>e.currentTarget.style.transform="scale(0.97)"}
          onMouseUp={e=>e.currentTarget.style.transform="scale(1)"}
          onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}>
          Start fresh round
        </button>
      </div>
    );
  }

  if (!current) return <div style={{textAlign:"center",padding:40,color:"#6b7280"}}>Loading...</div>;

  return (
    <div style={{maxWidth:400,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <span style={{color:"#6b6b80",fontSize:11}}>
          {sessionMode
            ? ratedIds.size + "/" + SESSION_QUICK_LIMIT + " this round"
            : (unrankedRemaining > 0 ? unrankedRemaining + " new" : "") + (unrankedRemaining > 0 && remaining > unrankedRemaining ? " · " : "") + (remaining > unrankedRemaining ? (remaining - unrankedRemaining) + " ranked" : "") + " remaining"
          }
        </span>
        <span style={{color:"#6b6b80",fontSize:11}}>{ratedIds.size} rated</span>
      </div>
      <div style={{background:"#14142a",border:"1px solid #2a2a45",borderRadius:16,padding:24,marginBottom:16}}>
        <h3 style={{margin:"0 0 12px",color:"#e2e8f0",fontSize:20,fontWeight:500,textAlign:"center"}}>{current.title}</h3>
        {current.genre && <div style={{textAlign:"center",marginBottom:12}}><GenreTag genre={current.genre} /></div>}
        {current.audioFile && <AudioPlayer src={current.audioFile} />}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:6}}>
        {[{id:"bad",label:"💀",sub:"Bad",color:"#ef4444"},{id:"low",label:"👎",sub:"Low",color:"#f97316"},{id:"mid",label:"😐",sub:"Mid",color:"#f59e0b"},{id:"good",label:"👍",sub:"Good",color:"#818cf8"},{id:"top",label:"🔥",sub:"Top",color:"#22c55e"}].map(r => (
          <button key={r.id} onClick={()=>rate(r.id)} disabled={processing}
            style={{padding:"12px 4px",borderRadius:10,background:"#0d0d1a",border:"2px solid "+r.color+"40",color:r.color,fontSize:11,fontWeight:600,cursor:processing?"default":"pointer",opacity:processing?0.5:1,transition:"all 0.15s",display:"flex",flexDirection:"column",alignItems:"center",gap:2}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor=r.color;e.currentTarget.style.background=r.color+"15"}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor=r.color+"40";e.currentTarget.style.background="#0d0d1a"}}>
            <span style={{fontSize:16}}>{r.label}</span>{r.sub}
          </button>
        ))}
      </div>
    </div>
  );
}

export default QuickMode;
