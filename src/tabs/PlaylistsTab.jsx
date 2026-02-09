import React, { useState, useRef } from 'react';
import { useGlobalAudio } from '../components/AudioProvider';
import { useRanking } from '../hooks/useRanking';
import api from '../api';

// ========== TAB: Playlists ==========
function PlaylistsTab({ songs, playlists, genres, comparisons, onRefresh, showToast, setPlayerQueue, setPlayerQueueIdx }) {
  const [view, setView] = useState("list"); // "list" or "detail"
  const [activeId, setActiveId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  // Smart playlist creation
  const [smartOpen, setSmartOpen] = useState(false);
  const [smartGenre, setSmartGenre] = useState("");
  const [smartCount, setSmartCount] = useState(20);
  const [smartName, setSmartName] = useState("");
  // Add songs
  const [addSearch, setAddSearch] = useState("");
  // Drag state
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const plDragMouseY = useRef(0);
  const plScrollRef = useRef(null);
  const { play, toggle, playingSrc, isPlaying } = useGlobalAudio();
  const ranking = useRanking(songs, comparisons);

  const activePl = playlists.find(p => p.id === activeId);

  const createPlaylist = async () => {
    if (!newName.trim()) return;
    await api.post("/api/playlists", { name: newName.trim(), songIds: [] });
    setNewName("");
    setCreating(false);
    await onRefresh();
  };

  const createSmartPlaylist = async () => {
    if (smartCount < 1) { showToast("Enter a number"); return; }
    const name = smartName.trim() || ("Top " + smartCount + (smartGenre ? " " + smartGenre : ""));
    await api.post("/api/playlists", { name, songIds: [], smart: { count: smartCount, genre: smartGenre || "" } });
    setSmartOpen(false);
    setSmartName("");
    await onRefresh();
    showToast("Created: " + name);
  };

  // Compute live song IDs for smart playlists
  const getSmartSongIds = (pl, rank) => {
    if (!pl.smart) return pl.songIds;
    const pool = pl.smart.genre ? rank.standings.filter(s => s.genre === pl.smart.genre) : rank.standings;
    return pool.slice(0, pl.smart.count).map(s => s.id);
  };

  const deletePlaylist = async (id) => {
    if (!confirm("Delete this playlist?")) return;
    await api.del("/api/playlists/" + id);
    if (activeId === id) { setActiveId(null); setView("list"); }
    await onRefresh();
  };

  const addSong = async (songId) => {
    if (!activePl) return;
    if (activePl.songIds.includes(songId)) return;
    await api.put("/api/playlists/" + activePl.id, { songIds: [...activePl.songIds, songId] });
    await onRefresh();
  };

  const removeSong = async (songId) => {
    if (!activePl) return;
    await api.put("/api/playlists/" + activePl.id, { songIds: activePl.songIds.filter(id => id !== songId) });
    await onRefresh();
  };

  const startPlScroll = () => {
    if (plScrollRef.current) return;
    const trackMouse = (e) => { plDragMouseY.current = e.clientY; };
    document.addEventListener("dragover", trackMouse);
    plScrollRef.current = setInterval(() => {
      const y = plDragMouseY.current;
      const th = 120, sp = 20;
      if (y < th) window.scrollBy(0, -sp * (1 - y/th));
      else if (y > window.innerHeight - th) window.scrollBy(0, sp * (1 - (window.innerHeight - y)/th));
    }, 16);
    plScrollRef.current._trackMouse = trackMouse;
  };
  const stopPlScroll = () => {
    if (plScrollRef.current) {
      if (plScrollRef.current._trackMouse) document.removeEventListener("dragover", plScrollRef.current._trackMouse);
      clearInterval(plScrollRef.current);
      plScrollRef.current = null;
    }
  };

  const handleDragEnd = async (e) => {
    stopPlScroll();
    if (dragIdx === null || dragOverIdx === null || dragIdx === dragOverIdx || !activePl) {
      setDragIdx(null); setDragOverIdx(null); return;
    }
    const ids = [...activePl.songIds];
    const [moved] = ids.splice(dragIdx, 1);
    ids.splice(dragOverIdx, 0, moved);
    setDragIdx(null); setDragOverIdx(null);
    await api.put("/api/playlists/" + activePl.id, { songIds: ids });
    await onRefresh();
  };

  const playPlaylist = (plSongs, startIdx) => {
    const withAudio = plSongs.filter(s => s.audioFile);
    if (withAudio.length === 0) return;
    setPlayerQueue(withAudio);
    const idx = Math.max(0, startIdx || 0);
    setPlayerQueueIdx(idx);
    play(withAudio[idx].audioFile);
  };

  const allGenres = [...new Set(songs.map(s => s.genre).filter(Boolean))];

  if (view === "detail" && activePl) {
    const isSmart = !!activePl.smart;
    const effectiveIds = isSmart ? getSmartSongIds(activePl, ranking) : activePl.songIds;
    const plSongs = effectiveIds.map(id => songs.find(s => s.id === id)).filter(Boolean);
    const searchResults = !isSmart && addSearch ? songs.filter(s => s.title.toLowerCase().includes(addSearch.toLowerCase()) && !effectiveIds.includes(s.id)).slice(0, 8) : [];

    return (
      <div>
        <button onClick={()=>{setView("list");setAddSearch("")}} style={{background:"none",border:"none",color:"#818cf8",fontSize:12,cursor:"pointer",marginBottom:16}}>← back to playlists</button>
        <h2 style={{color:"#e2e8f0",fontSize:20,fontWeight:400,marginBottom:16}}>
          {activePl.name}
          <span style={{color:"#6b6b80",fontSize:12,marginLeft:8}}>({plSongs.length} songs)</span>
        </h2>

        {/* Add songs — only for static playlists */}
        {!isSmart && (
        <div style={{marginBottom:16,position:"relative"}}>
          <input value={addSearch} onChange={e=>setAddSearch(e.target.value)} placeholder="search to add songs..."
            style={{width:"100%",background:"#0d0d1a",border:"1px solid #1e1e35",borderRadius:8,padding:"8px 12px",color:"#e2e8f0",fontSize:13,outline:"none"}}
            onFocus={e=>e.target.style.borderColor="#4338ca"} onBlur={e=>setTimeout(()=>{e.target.style.borderColor="#1e1e35"},200)} />
          {searchResults.length > 0 && (
            <div style={{position:"absolute",top:"100%",left:0,right:0,background:"#16162a",border:"1px solid #2a2a45",borderRadius:8,zIndex:10,maxHeight:240,overflowY:"auto",marginTop:4}}>
              {searchResults.map(s => (
                <div key={s.id} onMouseDown={()=>{addSong(s.id);setAddSearch("")}} style={{padding:"8px 12px",cursor:"pointer",color:"#e2e8f0",fontSize:13,borderBottom:"1px solid #1e1e35"}}
                  onMouseEnter={e=>e.currentTarget.style.background="#1e1e35"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  {s.title} {s.genre && <span style={{color:"#818cf8",fontSize:10}}>· {s.genre}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
        )}

        {/* Play buttons */}
        {plSongs.length > 0 && (
          <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
            <button onClick={()=>playPlaylist(plSongs, 0)} style={{background:"linear-gradient(135deg,#4338ca,#6366f1)",border:"none",borderRadius:10,padding:"8px 20px",color:"#fff",fontSize:13,cursor:"pointer",fontWeight:600}}>{"\u25B6\uFE0E"} Play</button>
            <button onClick={()=>{ const shuffled = [...plSongs].sort(()=>Math.random()-0.5); playPlaylist(shuffled, 0); }}
              style={{background:"none",border:"1px solid #2a2a45",borderRadius:10,padding:"8px 20px",color:"#818cf8",fontSize:13,cursor:"pointer"}}>Shuffle</button>
          </div>
        )}

        {/* Song list with drag-drop */}
        {plSongs.map((s, i) => {
          const isSongPlaying = playingSrc === s.audioFile && isPlaying;
          return (
          <div key={s.id}
            draggable={!isSmart}
            onDragStart={!isSmart ? ()=>{setDragIdx(i);startPlScroll()} : undefined}
            onDragOver={!isSmart ? e=>{e.preventDefault();setDragOverIdx(i);plDragMouseY.current=e.clientY} : undefined}
            onDragEnd={!isSmart ? handleDragEnd : undefined}
            style={{
              display:"flex",alignItems:"center",gap:8,padding:"8px 4px",borderBottom:"1px solid #1e1e35",
              cursor:isSmart?"default":"grab",
              background: !isSmart && dragOverIdx===i && dragIdx!==null && dragIdx!==i ? "#1e1e35" : "transparent",
              opacity: !isSmart && dragIdx===i ? 0.4 : 1,
              transition:"background 0.15s, opacity 0.15s",
              borderTop: !isSmart && dragOverIdx===i && dragIdx!==null && dragIdx > i ? "2px solid #818cf8" : "2px solid transparent",
              borderBottomColor: !isSmart && dragOverIdx===i && dragIdx!==null && dragIdx < i ? "#818cf8" : "#1e1e35",
            }}>
            {!isSmart && <span style={{color:"#5a5a70",fontSize:10,cursor:"grab",padding:"2px 4px",userSelect:"none"}}>⠿</span>}
            <span style={{color:"#5a5a70",fontSize:11,minWidth:20,textAlign:"right"}}>{i+1}</span>
            <button onClick={()=>{if(s.audioFile){if(isSongPlaying)toggle(s.audioFile);else{playPlaylist(plSongs,i)}}}}
              style={{background:"none",border:"none",color:isSongPlaying?"#818cf8":"#6b6b80",fontSize:12,cursor:"pointer",padding:"2px 4px",flexShrink:0}}>
              {isSongPlaying ? "\u23F8\uFE0E" : "\u25B6\uFE0E"}
            </button>
            <span style={{flex:1,color:"#e2e8f0",fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.title}</span>
            {s.genre && <span style={{color:"#818cf8",fontSize:9,textTransform:"uppercase"}}>{s.genre}</span>}
            {!isSmart && <button onClick={()=>removeSong(s.id)} style={{background:"none",border:"none",color:"#2a2a40",cursor:"pointer",fontSize:12,padding:4}}
              onMouseEnter={e=>e.target.style.color="#ef4444"} onMouseLeave={e=>e.target.style.color="#2a2a40"}>✕</button>}
          </div>
          );
        })}
        {plSongs.length === 0 && <div style={{color:"#6b6b80",fontSize:14,textAlign:"center",padding:40}}>Empty playlist — search above to add songs</div>}
      </div>
    );
  }

  return (
    <div>
      <div style={{display:"flex",gap:10,marginBottom:20}}>
        <button onClick={()=>setCreating(true)} style={{background:"linear-gradient(135deg,#4338ca,#6366f1)",border:"none",borderRadius:10,padding:"10px 20px",color:"#fff",fontSize:13,cursor:"pointer",fontWeight:600}}>+ new playlist</button>
        <button onClick={()=>setSmartOpen(!smartOpen)} style={{background:"none",border:"1px solid #2a2a45",borderRadius:10,padding:"10px 20px",color:"#818cf8",fontSize:13,cursor:"pointer"}}>from rankings</button>
      </div>

      {creating && (
        <div style={{display:"flex",gap:10,marginBottom:16,animation:"fadeUp 0.2s ease-out"}}>
          <input value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")createPlaylist()}}
            placeholder="Playlist name..." autoFocus
            style={{flex:1,background:"#0d0d1a",border:"1px solid #4338ca",borderRadius:8,padding:"8px 12px",color:"#e2e8f0",fontSize:13,outline:"none"}} />
          <button onClick={createPlaylist} style={{background:"#4338ca",border:"none",borderRadius:8,padding:"8px 16px",color:"#fff",fontSize:12,cursor:"pointer"}}>create</button>
          <button onClick={()=>setCreating(false)} style={{background:"none",border:"1px solid #2a2a45",borderRadius:8,padding:"8px 12px",color:"#6b7280",fontSize:12,cursor:"pointer"}}>cancel</button>
        </div>
      )}

      {smartOpen && (
        <div style={{background:"#14142a",border:"1px solid #2a2a45",borderRadius:12,padding:16,marginBottom:16,animation:"fadeUp 0.2s ease-out"}}>
          <div style={{color:"#e2e8f0",fontSize:13,marginBottom:12}}>Create from rankings</div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
            <span style={{color:"#9a9ab0",fontSize:12}}>Top</span>
            <input type="number" value={smartCount === 0 ? "" : smartCount} onChange={e=>setSmartCount(e.target.value === "" ? 0 : Math.max(1, parseInt(e.target.value) || 0))} min="1"
              style={{width:60,background:"#0d0d1a",border:"1px solid #2a2a45",borderRadius:6,padding:"6px 8px",color:"#e2e8f0",fontSize:12,textAlign:"center",outline:"none"}} />
            <span style={{color:"#9a9ab0",fontSize:12}}>of</span>
            <select value={smartGenre} onChange={e=>setSmartGenre(e.target.value)}
              style={{background:"#0d0d1a",border:"1px solid #2a2a45",borderRadius:6,padding:"6px 10px",color:"#e2e8f0",fontSize:12,cursor:"pointer",appearance:"none"}}>
              <option value="">all genres</option>
              {allGenres.map(g=><option key={g} value={g}>{g}</option>)}
            </select>
            <input value={smartName} onChange={e=>setSmartName(e.target.value)} placeholder="name (optional)"
              style={{flex:1,minWidth:100,background:"#0d0d1a",border:"1px solid #2a2a45",borderRadius:6,padding:"6px 10px",color:"#e2e8f0",fontSize:12,outline:"none"}} />
            <button onClick={createSmartPlaylist} style={{background:"#4338ca",border:"none",borderRadius:6,padding:"6px 14px",color:"#fff",fontSize:12,cursor:"pointer",fontWeight:600}}>create</button>
          </div>
        </div>
      )}

      {/* Playlist list */}
      {playlists.length === 0 && !creating && (
        <div style={{textAlign:"center",padding:60}}>
          <div style={{fontSize:40,marginBottom:12}}>♪</div>
          <p style={{color:"#6b7280",fontSize:16}}>No playlists yet</p>
        </div>
      )}
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {playlists.map(pl => {
          const isSm = !!pl.smart;
          const effectiveIds = isSm ? getSmartSongIds(pl, ranking) : pl.songIds;
          const plSongsForPlay = effectiveIds.map(id => songs.find(s => s.id === id)).filter(Boolean);

          return (
          <div key={pl.id} style={{background:"#14142a",border:"1px solid #1e1e35",borderRadius:10,padding:"14px 16px",display:"flex",alignItems:"center",gap:12}}
            onMouseEnter={e=>e.currentTarget.style.borderColor="#2a2a45"} onMouseLeave={e=>e.currentTarget.style.borderColor="#1e1e35"}>
            <button onClick={()=>playPlaylist(plSongsForPlay, 0)}
              style={{width:40,height:40,background:"linear-gradient(135deg,#4338ca,#6366f1)",borderRadius:8,border:"none",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0,cursor:"pointer",color:"#fff"}}>{"\u25B6\uFE0E"}</button>
            <div style={{flex:1,minWidth:0,cursor:"pointer"}} onClick={()=>{setActiveId(pl.id);setView("detail")}}>
              <div style={{color:"#e2e8f0",fontSize:14}}>{pl.name}</div>
              <div style={{color:"#6b6b80",fontSize:11}}>{plSongsForPlay.length} songs</div>
            </div>
            <button onClick={()=>deletePlaylist(pl.id)} style={{background:"none",border:"none",color:"#2a2a40",cursor:"pointer",fontSize:12,padding:4}}
              onMouseEnter={e=>e.target.style.color="#ef4444"} onMouseLeave={e=>e.target.style.color="#2a2a40"}>✕</button>
          </div>
          );
        })}
      </div>
    </div>
  );
}

export default PlaylistsTab;
