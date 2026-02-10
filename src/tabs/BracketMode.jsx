import React, { useState, useEffect, useCallback, useRef } from 'react';
import AudioPlayer from '../components/AudioPlayer';
import GenreTag from '../components/GenreTag';

function BracketMode({ songs, standings, compMap, submitComparison, onRefresh, showToast, stopAudio, onBracketComplete, bracketSize }) {
  const bSize = bracketSize || 8;
  const [bracket, setBracket] = useState([]);
  const [round, setRound] = useState(0);
  const [matchIdx, setMatchIdx] = useState(0);
  const [winner, setWinner] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState([]);
  const [winnerSide, setWinnerSide] = useState(null);
  const matchKeyRef = useRef(null);

  const startBracket = useCallback(() => {
    // Prioritize unranked songs, fill remaining slots with ranked songs
    const unranked = standings.filter(s => s.totalComparisons < 3);
    const ranked = standings.filter(s => s.totalComparisons >= 3);
    let pool = [];
    if (unranked.length >= bSize) {
      pool = [...unranked].sort(() => Math.random() - 0.5).slice(0, bSize);
    } else if (unranked.length > 0) {
      const shuffledRanked = [...ranked].sort(() => Math.random() - 0.5);
      pool = [...unranked, ...shuffledRanked.slice(0, bSize - unranked.length)];
      pool.sort(() => Math.random() - 0.5);
    } else {
      pool = [...ranked].sort(() => Math.random() - 0.5).slice(0, bSize);
    }
    // Ensure pool is a power of 2 (trim if needed)
    const validSize = [4, 8, 16].filter(n => n <= pool.length).pop() || 4;
    pool = pool.slice(0, validSize);
    setBracket([pool]);
    setRound(0);
    setMatchIdx(0);
    setWinner(null);
    setResults([]);
  }, [standings, bSize]);

  useEffect(() => { if (bracket.length === 0) startBracket(); }, [startBracket]);

  const currentRound = bracket[round] || [];
  const match = currentRound.length >= 2 ? [currentRound[matchIdx * 2], currentRound[matchIdx * 2 + 1]] : null;
  const matchesInRound = Math.floor(currentRound.length / 2);

  const pick = async (winnerId, side) => {
    if (!match || processing) return;
    setProcessing(true);
    stopAudio();
    setWinnerSide(side);
    await new Promise(r => setTimeout(r, 350));
    const loserId = match[0].id === winnerId ? match[1].id : match[0].id;
    await submitComparison(winnerId, loserId, "bracket");
    await onRefresh();

    const winnerSong = match.find(s => s.id === winnerId);
    setResults(r => [...r, { round, match: matchIdx, winner: winnerSong, loser: match.find(s => s.id !== winnerId) }]);

    const nextRound = bracket[round + 1] || [];
    const newBracket = [...bracket];
    newBracket[round + 1] = [...nextRound, winnerSong];
    setBracket(newBracket);

    setWinnerSide(null);

    if (matchIdx + 1 < matchesInRound) {
      setMatchIdx(matchIdx + 1);
    } else if (newBracket[round + 1].length >= 2) {
      setRound(round + 1);
      setMatchIdx(0);
    } else {
      setWinner(winnerSong);
      if (onBracketComplete) onBracketComplete();
    }
    setProcessing(false);
  };

  const initial = bracket[0] || [];
  const actualSize = initial.length;
  const numRounds = Math.log2(actualSize) || 0;
  const roundLabels = actualSize === 4 ? ["Semis", "Final"]
    : actualSize === 8 ? ["Quarters", "Semis", "Final"]
    : actualSize === 16 ? ["R1", "Quarters", "Semis", "Final"]
    : ["Round"];

  // Generic visual bracket display
  const BracketVisual = () => {
    if (actualSize < 4) return null;
    const matchH = 46;
    const firstRoundGap = 8;
    const firstRoundMatches = actualSize / 2;
    const totalH = firstRoundMatches * matchH + (firstRoundMatches - 1) * firstRoundGap;

    const MatchBox = ({ s1, s2, res, isActive }) => (
      <div style={{padding:"6px 8px",background:"#14142a",borderRadius:6,border:isActive?"2px solid #f59e0b":"1px solid #2a2a45",height:matchH,boxSizing:"border-box",display:"flex",flexDirection:"column",justifyContent:"center"}}>
        <div style={{color:res?.winner?.id===s1?.id?"#22c55e":res?.loser?.id===s1?.id?"#ef4444":s1?"#c0c0d0":"#3a3a50",fontSize:11,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",marginBottom:3,lineHeight:"14px"}}>{s1?.title||"—"}</div>
        <div style={{color:res?.winner?.id===s2?.id?"#22c55e":res?.loser?.id===s2?.id?"#ef4444":s2?"#c0c0d0":"#3a3a50",fontSize:11,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",lineHeight:"14px"}}>{s2?.title||"—"}</div>
      </div>
    );

    return (
    <div style={{background:"#0d0d1a",borderRadius:12,padding:16,marginBottom:20,border:"1px solid #1e1e35",overflowX:"auto"}}>
      <div style={{display:"flex",gap:6,minWidth:actualSize > 8 ? 700 : undefined}}>
        {Array.from({ length: numRounds }, (_, r) => {
          const matchesThisRound = actualSize / Math.pow(2, r + 1);
          const advancers = bracket[r] || [];
          return (
            <div key={r} style={{flex:1,minWidth:0,display:"flex",flexDirection:"column"}}>
              <div style={{color:"#5a5a70",fontSize:10,marginBottom:6,fontWeight:600,textAlign:"center"}}>{roundLabels[r] || ("R" + (r+1))}</div>
              <div style={{display:"flex",flexDirection:"column",justifyContent:"space-around",height:totalH}}>
                {Array.from({ length: matchesThisRound }, (_, m) => {
                  const s1 = advancers[m * 2], s2 = advancers[m * 2 + 1];
                  const res = results.find(x => x.round === r && x.match === m);
                  const isActive = round === r && matchIdx === m && !winner;
                  return <MatchBox key={m} s1={s1} s2={s2} res={res} isActive={isActive} />;
                })}
              </div>
            </div>
          );
        })}
        {/* Champion */}
        <div style={{flex:0.7,minWidth:0,display:"flex",flexDirection:"column"}}>
          <div style={{color:"#5a5a70",fontSize:10,marginBottom:6,fontWeight:600,textAlign:"center"}}>🏆</div>
          <div style={{display:"flex",flexDirection:"column",justifyContent:"center",height:totalH}}>
            <div style={{padding:"6px 8px",background:winner?"#f59e0b20":"#14142a",borderRadius:6,border:winner?"2px solid #f59e0b":"1px solid #2a2a45",textAlign:"center"}}>
              <div style={{color:winner?"#f59e0b":"#3a3a50",fontSize:12,fontWeight:700}}>{winner?.title||"?"}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
    );
  };

  // Track match key for entrance animation
  const curMatchKey = match ? match[0].id + "|" + match[1].id : null;
  if (curMatchKey !== matchKeyRef.current) {
    matchKeyRef.current = curMatchKey;
  }

  const renderCard = (song, onPick, side) => {
    const isWinner = winnerSide === side;
    const isLoser = winnerSide && winnerSide !== side;
    return (
      <div style={{
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
        <button onClick={onPick} disabled={processing}
          style={{width:"100%",marginTop:10,padding:"12px",borderRadius:12,background:"linear-gradient(135deg,#4338ca,#6366f1)",border:"none",color:"#fff",fontSize:14,cursor:processing?"default":"pointer",fontWeight:600,opacity:processing?0.5:1,
            transition:"transform 0.1s ease, box-shadow 0.15s ease"}}
          onMouseDown={e=>e.currentTarget.style.transform="scale(0.97)"}
          onMouseUp={e=>e.currentTarget.style.transform="scale(1)"}
          onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}>
          Select
        </button>
      </div>
    );
  };

  if (winner) {
    const bracketComparisons = actualSize - 1;
    return (
      <div>
        <BracketVisual />
        <div style={{textAlign:"center",padding:20}}>
          <div style={{fontSize:48,marginBottom:16}}>🏆</div>
          <h3 style={{color:"#f59e0b",fontSize:20,marginBottom:8}}>{winner.title}</h3>
          <p style={{color:"#8a8aa0",fontSize:14,marginBottom:8}}>Tournament Champion!</p>
          <p style={{color:"#6b6b80",fontSize:12,marginBottom:24}}>≈ {bracketComparisons} classic comparisons</p>
          <button onClick={startBracket} style={{background:"linear-gradient(135deg,#4338ca,#6366f1)",border:"none",borderRadius:10,padding:"12px 24px",color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer"}}>New Bracket</button>
        </div>
      </div>
    );
  }

  if (!match) return <div style={{textAlign:"center",padding:40,color:"#6b7280"}}>Loading bracket...</div>;

  return (
    <div>
      <BracketVisual />
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <span style={{color:"#f59e0b",fontSize:13,fontWeight:600}}>{roundLabels[round] || ("Round " + (round+1))} — Match {matchIdx + 1}/{matchesInRound}</span>
        <button onClick={startBracket} style={{background:"none",border:"1px solid #2a2a45",borderRadius:8,padding:"6px 12px",color:"#6b7280",fontSize:11,cursor:"pointer"}}>restart</button>
      </div>
      <div key={matchKeyRef.current} style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:12,alignItems:"center"}}>
        {renderCard(match[0], ()=>pick(match[0].id, "left"), "left")}
        <div style={{textAlign:"center",padding:"0 4px"}}><span style={{fontSize:24,color:"#f59e0b"}}>vs</span></div>
        {renderCard(match[1], ()=>pick(match[1].id, "right"), "right")}
      </div>
    </div>
  );
}

export default BracketMode;
