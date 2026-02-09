import React from 'react';

function SessionSummary({ data, songs, compCount, placementMin, onNewSession, onDone }) {
  if (!data) return null;
  const d = data;
  const cardBg = {background:"#14142a",border:"1px solid #1e1e35",borderRadius:12,padding:16,marginBottom:12};
  const totalSongs = songs.length;
  const totalPlaced = songs.filter(s => (compCount[s.id] || 0) >= placementMin).length;

  return (
    <div>
      <div style={{textAlign:"center",marginBottom:24}}>
        <span style={{fontSize:36}}>📊</span>
        <h2 style={{margin:"8px 0 4px",color:"#e2e8f0",fontSize:22,fontWeight:700}}>Session Complete</h2>
        <p style={{color:"#6b6b80",fontSize:13,margin:0}}>{d.totalComps} comparisons · {d.songsAffected} songs ranked</p>
      </div>

      {/* Stats grid */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:16}}>
        {[
          { label: "placed", value: totalPlaced + "/" + totalSongs, color: "#818cf8" },
          { label: "comparisons", value: d.totalComps, color: "#22c55e" },
          { label: "elo spread", value: d.spread, color: "#f59e0b" },
        ].map(s => (
          <div key={s.label} style={{background:"#0d0d1a",border:"1px solid #1e1e35",borderRadius:10,padding:"10px",textAlign:"center"}}>
            <div style={{color:s.color,fontSize:18,fontWeight:700}}>{s.value}</div>
            <div style={{color:"#6b6b80",fontSize:9,textTransform:"uppercase",letterSpacing:"0.06em",marginTop:2}}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Highest and lowest */}
      {(d.highest || d.lowest) && (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
          {d.highest && (
            <div style={{...cardBg,marginBottom:0,textAlign:"center",padding:14}}>
              <div style={{color:"#22c55e",fontSize:9,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:6,fontWeight:700}}>🔥 highest rated</div>
              <div style={{color:"#e2e8f0",fontSize:14,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{d.highest.title}</div>
              <div style={{color:"#22c55e",fontSize:16,fontWeight:700,marginTop:4}}>{d.highest.elo}</div>
            </div>
          )}
          {d.lowest && d.lowest.id !== d.highest?.id && (
            <div style={{...cardBg,marginBottom:0,textAlign:"center",padding:14}}>
              <div style={{color:"#ef4444",fontSize:9,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:6,fontWeight:700}}>💀 lowest rated</div>
              <div style={{color:"#e2e8f0",fontSize:14,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{d.lowest.title}</div>
              <div style={{color:"#ef4444",fontSize:16,fontWeight:700,marginTop:4}}>{d.lowest.elo}</div>
            </div>
          )}
        </div>
      )}

      {/* Songs placed this session */}
      {d.placed.length > 0 && (
        <div style={cardBg}>
          <div style={{color:"#818cf8",fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10}}>Songs placed this session</div>
          {d.placed.map((s, i) => (
            <div key={s.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 0",borderBottom:i < d.placed.length - 1 ? "1px solid #1e1e3520" : "none"}}>
              <span style={{color:"#6b6b80",fontSize:11,minWidth:20,textAlign:"right"}}>{i+1}.</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{color:"#e2e8f0",fontSize:13,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.title}</div>
                {s.genre && <span style={{color:"#6b6b80",fontSize:10}}>{s.genre}</span>}
              </div>
              <span style={{color:"#818cf8",fontSize:13,fontWeight:600,flexShrink:0}}>{s.elo}</span>
            </div>
          ))}
        </div>
      )}

      {/* Genre breakdown */}
      {d.genres.length > 1 && (
        <div style={cardBg}>
          <div style={{color:"#f59e0b",fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10}}>By genre</div>
          {d.genres.map(g => (
            <div key={g.name} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #1e1e3520"}}>
              <span style={{color:"#e2e8f0",fontSize:12}}>{g.name}</span>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <span style={{color:"#6b6b80",fontSize:11}}>{g.count} song{g.count !== 1 ? "s" : ""}</span>
                <span style={{color:"#f59e0b",fontSize:12,fontWeight:600,minWidth:36,textAlign:"right"}}>{g.avgElo}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {d.songsAffected === 0 && (
        <div style={{...cardBg,textAlign:"center",padding:24}}>
          <span style={{fontSize:24}}>🎯</span>
          <p style={{color:"#a0a0b0",fontSize:14,margin:"8px 0 0"}}>No new rankings this session.</p>
        </div>
      )}

      <div style={{display:"flex",gap:10,marginTop:8}}>
        <button onClick={onNewSession}
          style={{flex:1,padding:"14px",borderRadius:12,background:"linear-gradient(135deg,#4338ca,#6366f1)",border:"none",color:"#fff",fontSize:15,fontWeight:600,cursor:"pointer"}}>
          New session
        </button>
        <button onClick={onDone}
          style={{padding:"14px 20px",borderRadius:12,background:"none",border:"1px solid #2a2a45",color:"#6b6b80",fontSize:14,cursor:"pointer"}}>
          Done
        </button>
      </div>
    </div>
  );
}

export default SessionSummary;
