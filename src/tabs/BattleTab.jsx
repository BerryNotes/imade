import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRanking } from '../hooks/useRanking';
import api from '../api';
import ClassicMode from './ClassicMode';
import QuickMode from './QuickMode';
import TierMode from './TierMode';
import BracketMode from './BracketMode';
import SessionSummary from '../components/SessionSummary';

const REFINE_TARGET = 3;

function BattleTab({ songs, comparisons, onRefresh, showToast, savedPair, setSavedPair, hasSeenIntro, setHasSeenIntro, hasSeenPhase2, setHasSeenPhase2, focusedSessionSongs, setFocusedSessionSongs, stopAudio, sessionLength, bracketSize: bracketSizeProp }) {
  const refineTarget = sessionLength === "short" ? 2 : sessionLength === "long" ? 5 : REFINE_TARGET;
  const bracketSize = bracketSizeProp || 8;
  const [picking, setPicking] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const ranking = useRanking(songs, comparisons);
  const { standings, compMap, compCount, compPairCount } = ranking;

  // Guided session state: null = landing, "tier" | "quick" | "refine" | "summary"
  const [sessionPhase, setSessionPhase] = useState(null);
  const [refineCompCount, setRefineCompCount] = useState(0);
  const refineCompRef = useRef(0);
  const [refineSubPhase, setRefineSubPhase] = useState("classic"); // "classic" → "bracket" cycles
  const [refineRound, setRefineRound] = useState(0); // which round we're on (0-indexed)
  const totalRounds = sessionLength === "short" ? 1 : sessionLength === "long" ? 3 : 2;
  const classicsPerRound = 3;

  // Session tracking (Elo snapshots for summary)
  const [sessionStartElos, setSessionStartElos] = useState({});
  const [sessionStartComps, setSessionStartComps] = useState({});
  const [sessionSummaryData, setSessionSummaryData] = useState(null);
  const sessionTotalRef = useRef(0);
  const [sessionCompTotal, setSessionCompTotal] = useState(0);
  const sessionHadUnranked = useRef(false);

  // Focused session (subset of songs from chart selection)
  const [focusedSongIds, setFocusedSongIds] = useState(null);
  const focusedRefineTarget = useRef(refineTarget);

  // Derived
  const PLACEMENT_MIN = 3;
  const unrankedCount = songs.filter(s => (compCount[s.id] || 0) < PLACEMENT_MIN).length;
  const allPlaced = songs.length >= 2 && unrankedCount === 0;

  // Phase 2 popup (all songs placed for the first time)
  const [showPhase2, setShowPhase2] = useState(false);
  const prevAllPlaced = useRef(allPlaced);
  useEffect(() => {
    const justCompleted = allPlaced && !prevAllPlaced.current;
    if ((justCompleted || (allPlaced && !hasSeenPhase2 && comparisons.length > 0)) && !hasSeenPhase2) {
      setShowPhase2(true);
      setHasSeenPhase2(true);
    }
    prevAllPlaced.current = allPlaced;
  }, [allPlaced, hasSeenPhase2, comparisons.length]);

  // Snapshot Elo state for session summary
  const snapshotSession = useCallback(() => {
    const snap = {};
    const compSnap = {};
    // Use ranking-derived Elo for accurate session deltas
    standings.forEach(s => { snap[s.id] = s.elo; });
    songs.forEach(s => { if (!(s.id in snap)) snap[s.id] = 500; compSnap[s.id] = 0; });
    comparisons.forEach(c => { compSnap[c.songA] = (compSnap[c.songA]||0)+1; compSnap[c.songB] = (compSnap[c.songB]||0)+1; });
    setSessionStartElos(snap);
    setSessionStartComps(compSnap);
    sessionTotalRef.current = 0;
    refineCompRef.current = 0;
    setRefineCompCount(0);
    setSessionCompTotal(0);
    setRefineSubPhase("classic");
    setRefineRound(0);
  }, [songs, comparisons, standings]);

  // Auto-start focused session when focusedSessionSongs is set from StatsTab
  useEffect(() => {
    if (focusedSessionSongs && focusedSessionSongs.length >= 8) {
      setFocusedSongIds(focusedSessionSongs);
      focusedRefineTarget.current = Math.min(15, refineTarget + Math.floor((focusedSessionSongs.length - 8) / 4));
      snapshotSession();
      setSessionSummaryData(null);
      sessionHadUnranked.current = false;
      setSessionPhase("refine");
      setRefineSubPhase("classic");
      setRefineRound(0);
      setFocusedSessionSongs(null);
    }
  }, [focusedSessionSongs]);

  // Build session summary
  const buildSessionSummary = useCallback(() => {
    const touched = [];
    standings.forEach(s => {
      const startElo = sessionStartElos[s.id] ?? 500;
      const delta = s.elo - startElo;
      const startComps = sessionStartComps[s.id] || 0;
      const nowComps = compCount[s.id] || 0;
      const sessionComps = nowComps - startComps;
      if (sessionComps > 0) {
        touched.push({ id: s.id, title: s.title, genre: s.genre, elo: s.elo, delta, startElo, sessionComps, totalComps: nowComps, isNewlyPlaced: startComps < 3 && nowComps >= 3 });
      }
    });

    // Sort by final Elo for placement list
    const placed = touched.filter(m => m.isNewlyPlaced).sort((a, b) => b.elo - a.elo);
    const allTouched = [...touched].sort((a, b) => b.elo - a.elo);

    // Highest and lowest rated songs in the session
    const highest = allTouched.length > 0 ? allTouched[0] : null;
    const lowest = allTouched.length > 0 ? allTouched[allTouched.length - 1] : null;

    // Genre breakdown
    const genreMap = {};
    allTouched.forEach(s => {
      const g = s.genre || "Uncategorized";
      if (!genreMap[g]) genreMap[g] = { count: 0, totalElo: 0 };
      genreMap[g].count++;
      genreMap[g].totalElo += s.elo;
    });
    const genres = Object.entries(genreMap).map(([name, data]) => ({
      name, count: data.count, avgElo: Math.round(data.totalElo / data.count)
    })).sort((a, b) => b.avgElo - a.avgElo);

    // Elo spread
    const elos = allTouched.map(s => s.elo);
    const spread = elos.length >= 2 ? Math.max(...elos) - Math.min(...elos) : 0;

    return {
      placed,
      allTouched,
      highest,
      lowest,
      genres,
      spread,
      totalComps: sessionTotalRef.current,
      songsAffected: allTouched.length,
      newlyPlacedCount: placed.length,
    };
  }, [standings, sessionStartElos, sessionStartComps, compCount, comparisons]);

  // Start a guided session
  const startSession = () => {
    snapshotSession();
    setSessionSummaryData(null);
    setFocusedSongIds(null);
    focusedRefineTarget.current = refineTarget;
    sessionHadUnranked.current = unrankedCount > 0;
    if (unrankedCount >= 2) {
      setSessionPhase("tier");
    } else if (unrankedCount === 1) {
      // Skip tier mode for a single song — tier needs at least 2 to generate pairs
      setSessionPhase("quick");
    } else {
      setSessionPhase("refine");
    }
  };

  // Phase transitions
  const advanceFromTier = () => {
    // After tier sort batch, check if there are still unranked songs for quick rate
    const stillUnranked = songs.filter(s => (compCount[s.id] || 0) < PLACEMENT_MIN).length;
    if (stillUnranked > 0) {
      setSessionPhase("quick");
    } else {
      setSessionPhase("refine");
    }
  };

  const advanceFromQuick = () => {
    setSessionPhase("refine");
  };

  const triggerSummary = () => {
    stopAudio();
    setSessionSummaryData(buildSessionSummary());
    setSessionPhase("summary");
  };

  // Submit comparison helper (used by all modes)
  const submitComparison = async (winnerId, loserId, source = "classic") => {
    if (winnerId === loserId) return false;
    const key = [winnerId, loserId].sort().join("|");
    if (compMap[key]) return false;
    await api.post("/api/comparisons", { songA: winnerId, songB: loserId, winner: winnerId, source });
    sessionTotalRef.current++;
    setSessionCompTotal(prev => prev + 1);

    // Track refine-phase classic comparisons for auto-trigger
    if (sessionPhase === "refine" && refineSubPhase === "classic") {
      refineCompRef.current++;
      setRefineCompCount(refineCompRef.current);
    }
    return true;
  };

  // Auto-switch to bracket when classic refine target is hit
  useEffect(() => {
    if (sessionPhase !== "refine" || refineSubPhase !== "classic") return;
    const targetForThisRound = classicsPerRound * (refineRound + 1);
    if (refineCompCount >= targetForThisRound) {
      stopAudio();
      setRefineSubPhase("bracket");
    }
  }, [refineCompCount, sessionPhase, refineSubPhase, refineRound]);

  const undoLast = async () => {
    if (!comparisons.length || undoing) return;
    setUndoing(true);
    stopAudio();
    await api.del("/api/comparisons/last");
    setSavedPair(null);
    if (sessionTotalRef.current > 0) {
      sessionTotalRef.current--;
      setSessionCompTotal(prev => Math.max(0, prev - 1));
    }
    if (sessionPhase === "refine" && refineCompRef.current > 0) {
      refineCompRef.current--;
      setRefineCompCount(refineCompRef.current);
    }
    await onRefresh();
    setUndoing(false);
    showToast("Undone");
  };

  // ========== RENDERING ==========
  if (songs.length < 2) return (
    <div style={{textAlign:"center",padding:"60px 20px",animation:"fadeUp 0.5s ease-out"}}>
      <div style={{fontSize:48,marginBottom:16}}>🎯</div>
      <p style={{color:"#e2e8f0",fontSize:18,fontWeight:600,marginBottom:6}}>
        {songs.length === 0 ? "No songs uploaded yet" : "Just one more song needed"}
      </p>
      <p style={{color:"#6b6b80",fontSize:13,lineHeight:1.6,maxWidth:360,margin:"0 auto"}}>
        {songs.length === 0
          ? "Upload at least 2 songs to start comparing them head-to-head and building your personal rankings."
          : "Add one more song to your library and you can start ranking them with quick head-to-head matchups."}
      </p>
    </div>
  );

  // Session phase indicator bar
  // Session progress: phase-based (each phase = a chunk of progress)
  const getSessionProgress = () => {
    if (!sessionPhase || sessionPhase === "summary") return 100;
    const hasPlacement = sessionHadUnranked.current;
    // Estimate: each round = classicsPerRound + (bracketSize-1) comparisons
    const compsPerRound = classicsPerRound + (bracketSize - 1);
    const refineTotal = totalRounds * compsPerRound;
    const estimatedTotal = hasPlacement ? refineTotal + 20 : refineTotal;
    return Math.min(99, Math.round(sessionCompTotal / estimatedTotal * 99));
  };
  const sessionPct = getSessionProgress();

  const ProgressBar = () => {
    if (!sessionPhase || sessionPhase === "summary") return null;
    return (
      <div style={{marginBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
          <span style={{color:"#818cf8",fontSize:12,fontWeight:700}}>{sessionPct}%</span>
          <button onClick={() => { stopAudio(); setSessionPhase(null); }}
            style={{background:"#ef444420",border:"1px solid #ef444440",borderRadius:8,color:"#ef4444",fontSize:11,fontWeight:600,cursor:"pointer",padding:"5px 12px"}}>✕ end session</button>
        </div>
        <div style={{height:5,background:"#1a1a2e",borderRadius:3,overflow:"hidden"}}>
          <div style={{width:sessionPct+"%",height:"100%",background:"linear-gradient(90deg,#4338ca,#818cf8)",borderRadius:3,transition:"width 0.4s ease"}} />
        </div>
      </div>
    );
  };


  // ========== MAIN RETURN ==========
  return (
    <div>
      {/* Phase 2 Popup */}
      {showPhase2 && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setShowPhase2(false)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#14142a",border:"1px solid #2a2a45",borderRadius:20,padding:"36px 32px",maxWidth:440,width:"100%",animation:"fadeUp 0.3s ease-out",boxShadow:"0 20px 60px rgba(0,0,0,0.5)"}}>
            <div style={{textAlign:"center",marginBottom:24}}>
              <span style={{fontSize:40}}>🏆</span>
              <h2 style={{margin:"12px 0 0",color:"#e2e8f0",fontSize:22,fontWeight:600}}>All Songs Placed</h2>
            </div>
            <p style={{color:"#a0a0b0",fontSize:14,lineHeight:1.7,textAlign:"center"}}>Every song has initial rankings. Future sessions will focus on refining.</p>
            <button onClick={()=>setShowPhase2(false)}
              style={{width:"100%",padding:"12px",borderRadius:12,background:"linear-gradient(135deg,#22c55e,#16a34a)",border:"none",color:"#fff",fontSize:15,fontWeight:600,cursor:"pointer",marginTop:16}}>
              Continue
            </button>
          </div>
        </div>
      )}

      {/* ========== LANDING (no active session) ========== */}
      {!sessionPhase && (
        <div style={{animation:"fadeUp 0.2s ease-out"}}>
          {/* Session launcher */}
          <div style={{background:"linear-gradient(135deg,#14142a,#1a1535)",border:"1px solid #2a2a45",borderRadius:16,padding:"32px 24px",textAlign:"center",marginBottom:20}}>
            <span style={{fontSize:36}}>🎯</span>
            <h2 style={{margin:"12px 0 6px",color:"#e2e8f0",fontSize:20,fontWeight:700}}>Ranking Session</h2>
            <p style={{color:"#6b6b80",fontSize:13,margin:"0 0 20px",lineHeight:1.6}}>
              {unrankedCount > 0
                ? unrankedCount + " unranked song" + (unrankedCount !== 1 ? "s" : "")
                : "A few quick comparisons to sharpen your rankings"
              }
            </p>

            <button onClick={startSession}
              style={{padding:"14px 48px",borderRadius:14,background:"linear-gradient(135deg,#4338ca,#6366f1)",border:"none",color:"#fff",fontSize:16,fontWeight:700,cursor:"pointer",boxShadow:"0 4px 20px rgba(99,102,241,0.3)",
                transition:"transform 0.1s ease, box-shadow 0.15s ease"}}
              onMouseDown={e=>e.currentTarget.style.transform="scale(0.97)"}
              onMouseUp={e=>e.currentTarget.style.transform="scale(1)"}
              onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}>
              Start Session
            </button>
          </div>

          {/* Quick stats */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:20}}>
            {[
              { label: "songs", value: songs.length, color: "#818cf8" },
              { label: "compared", value: comparisons.length, color: "#22c55e" },
              { label: "unranked", value: unrankedCount, color: unrankedCount > 0 ? "#f59e0b" : "#22c55e" },
            ].map((s, i) => (
              <div key={s.label} style={{background:"#14142a",border:"1px solid #1e1e35",borderRadius:10,padding:"12px",textAlign:"center",animation:"statPanelIn 0.3s ease-out both",animationDelay:(i*80)+"ms"}}>
                <div style={{color:s.color,fontSize:20,fontWeight:700}}>{s.value}</div>
                <div style={{color:"#6b6b80",fontSize:10,textTransform:"uppercase",letterSpacing:"0.06em",marginTop:2}}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========== GUIDED SESSION PHASES ========== */}
      {sessionPhase && sessionPhase !== "summary" && <ProgressBar />}

      {/* Tier Sort phase */}
      {sessionPhase === "tier" && (
        <TierMode songs={songs} standings={standings} compMap={compMap} compCount={compCount}
          submitComparison={submitComparison} onRefresh={onRefresh} showToast={showToast}
          onSessionAdvance={advanceFromTier} sessionMode={true} />
      )}

      {/* Quick Rate phase */}
      {sessionPhase === "quick" && (
        <QuickMode songs={songs} standings={standings} compMap={compMap} compCount={compCount}
          submitComparison={submitComparison} onRefresh={onRefresh} showToast={showToast} stopAudio={stopAudio}
          onSessionAdvance={advanceFromQuick} sessionMode={true} />
      )}

      {/* Refine phase */}
      {sessionPhase === "refine" && (() => {
        const focusSet = focusedSongIds ? new Set(focusedSongIds) : null;
        const refineSongs = focusSet ? songs.filter(s => focusSet.has(s.id)) : songs;
        const refineStandings = focusSet ? standings.filter(s => focusSet.has(s.id)) : standings;
        return (
          <div>
            {focusedSongIds && <div style={{background:"#4338ca10",border:"1px solid #4338ca30",borderRadius:8,padding:"6px 12px",marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{color:"#818cf8",fontSize:11}}>🎯 Focused session: {focusedSongIds.length} songs</span>
              <button onClick={() => { setFocusedSongIds(null); focusedRefineTarget.current = refineTarget; }} style={{background:"none",border:"none",color:"#6b7280",fontSize:10,cursor:"pointer"}}>✕ unfocus</button>
            </div>}
            {refineSubPhase === "classic" && <ClassicMode songs={refineSongs} standings={refineStandings} compMap={compMap} compCount={compCount} ranking={ranking}
              submitComparison={submitComparison} onRefresh={onRefresh} showToast={showToast} picking={picking} setPicking={setPicking}
              savedPair={savedPair} setSavedPair={setSavedPair} stopAudio={stopAudio} undoLast={undoLast} undoing={undoing} comparisons={comparisons} />}
            {refineSubPhase === "bracket" && <BracketMode songs={refineSongs} standings={refineStandings} compMap={compMap}
              submitComparison={submitComparison} onRefresh={onRefresh} showToast={showToast} stopAudio={stopAudio} bracketSize={bracketSize}
              onBracketComplete={() => {
                if (refineRound + 1 >= totalRounds) { triggerSummary(); }
                else { setRefineRound(r => r + 1); setRefineSubPhase("classic"); }
              }} />}
          </div>
        );
      })()}

      {/* Summary phase */}
      {sessionPhase === "summary" && (
        <SessionSummary
          data={sessionSummaryData}
          songs={songs}
          compCount={compCount}
          placementMin={PLACEMENT_MIN}
          onNewSession={startSession}
          onDone={() => setSessionPhase(null)}
        />
      )}

    </div>
  );
}

export default BattleTab;
