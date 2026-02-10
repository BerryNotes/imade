import React, { useState, useEffect, useMemo, useRef } from 'react';
import AudioPlayer from '../components/AudioPlayer';
import GenreTag from '../components/GenreTag';
import { getPlacementPair, getRefinementPair } from '../hooks/useRanking';

function ClassicMode({ songs, standings, compMap, compCount, ranking, submitComparison, onRefresh, showToast, picking, setPicking, savedPair, setSavedPair, stopAudio, undoLast, undoing, comparisons }) {
  const [winnerSide, setWinnerSide] = useState(null); // "left" | "right" | null
  const pairKeyRef = useRef(null);

  const computedPair = useMemo(() => {
    const hasUnranked = songs.some(s => (compCount[s.id] || 0) < 3);
    if (hasUnranked) return getPlacementPair(standings, compMap, compCount, null, ranking.compPairCount);
    return getRefinementPair(standings, compMap, null, compCount);
  }, [standings, compMap, compCount, songs]);

  const isSavedPairValid = savedPair && savedPair[0] && savedPair[1] &&
    songs.find(s => s.id === savedPair[0].id) && songs.find(s => s.id === savedPair[1].id) &&
    !compMap[[savedPair[0].id, savedPair[1].id].sort().join("|")];
  const currentPair = (() => {
    const pair = isSavedPairValid ? savedPair : computedPair;
    if (pair && pair[0] && pair[1] && pair[0].id === pair[1].id) return null;
    return pair;
  })();

  // Track pair key for entrance animation
  const newPairKey = currentPair ? currentPair[0].id + "|" + currentPair[1].id : null;
  if (newPairKey !== pairKeyRef.current) {
    pairKeyRef.current = newPairKey;
    if (winnerSide) setWinnerSide(null);
  }

  useEffect(() => {
    if (currentPair && (!savedPair || currentPair[0]?.id !== savedPair[0]?.id || currentPair[1]?.id !== savedPair[1]?.id)) {
      setSavedPair(currentPair);
    }
  }, [currentPair]);

  const pick = async (winnerId, loserId, side) => {
    if (picking) return;
    setPicking(true);
    stopAudio();
    setWinnerSide(side);
    await new Promise(r => setTimeout(r, 350));
    await submitComparison(winnerId, loserId);
    setSavedPair(null);
    setWinnerSide(null);
    await onRefresh();
    setPicking(false);
  };

  const renderCard = (song, onPick, side) => {
    const isWinner = winnerSide === side;
    const isLoser = winnerSide && winnerSide !== side;
    return (
      <div key={song.id} style={{
        animation: !winnerSide ? "cardEntrance 0.25s ease-out both" : undefined,
        animationDelay: side === "right" ? "0.08s" : "0s",
        ...(isWinner ? {animation:"winPulse 0.4s ease-out",borderRadius:16} : {}),
        ...(isLoser ? {animation:"loseShrink 0.35s ease-out forwards"} : {}),
      }}>
        <div style={{background:"#14142a",border: isWinner ? "1px solid #22c55e" : "1px solid #2a2a45",borderRadius:16,padding:20,transition:"border-color 0.2s ease"}}>
          <h3 style={{margin:"0 0 10px",color:"#e2e8f0",fontSize:18,fontWeight:400,textAlign:"center"}}>{song.title}</h3>
          {song.genre && <div style={{textAlign:"center",marginBottom:10}}><GenreTag genre={song.genre} /></div>}
          {song.audioFile && <AudioPlayer src={song.audioFile} compact />}
        </div>
        <button onClick={onPick} disabled={picking}
          style={{width:"100%",marginTop:10,padding:"12px",borderRadius:12,background:"linear-gradient(135deg,#4338ca,#6366f1)",border:"none",color:"#fff",fontSize:14,cursor:picking?"default":"pointer",fontWeight:600,opacity:picking?0.5:1,
            transition:"transform 0.1s ease, box-shadow 0.15s ease"}}
          onMouseDown={e=>e.currentTarget.style.transform="scale(0.97)"}
          onMouseUp={e=>e.currentTarget.style.transform="scale(1)"}
          onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}>
          Select
        </button>
      </div>
    );
  };

  const lastComp = comparisons.length > 0 ? comparisons[comparisons.length - 1] : null;

  return (
    <div>
      <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginBottom:12}}>
        {lastComp && <button onClick={undoLast} disabled={undoing} style={{background:"none",border:"1px solid #2a2a45",borderRadius:8,padding:"8px 16px",color:"#8a8aa0",fontSize:12,cursor:undoing?"default":"pointer"}}>{undoing?"...":"undo"}</button>}
      </div>
      {currentPair ? (
        <div key={pairKeyRef.current} style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:12,alignItems:"center"}}>
          {renderCard(currentPair[0], ()=>pick(currentPair[0].id, currentPair[1].id, "left"), "left")}
          <div style={{textAlign:"center"}}><span style={{fontSize:24,color:"#f59e0b"}}>vs</span></div>
          {renderCard(currentPair[1], ()=>pick(currentPair[1].id, currentPair[0].id, "right"), "right")}
        </div>
      ) : (
        <div style={{textAlign:"center",padding:60}}>
          <div style={{fontSize:36,marginBottom:12}}>✓</div>
          <p style={{color:"#22c55e",fontSize:16}}>All pairs compared!</p>
        </div>
      )}
    </div>
  );
}

export default ClassicMode;
