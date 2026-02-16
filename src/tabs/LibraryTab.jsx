import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useGlobalAudio } from '../components/AudioProvider';
import api from '../api';
import Modal from '../components/Modal';
import SongRow from '../components/SongRow';
import VirtualList from '../components/VirtualList';
import SongEditForm from '../components/SongEditForm';
import ScrollToTop from '../components/ScrollToTop';

function LibraryTab({ songs, genres, onRefresh, filterGenre, setFilterGenre, selectMode, setSelectMode, selectedIds, setSelectedIds, stickyTop, listenTimes, setPlayerQueue, setPlayerQueueIdx, switchTab, playlists, showToast, rowDensity, audioAvailable, onDeleteSong }) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("date-desc");
  const [editingSong, setEditingSong] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [showBulkGenre, setShowBulkGenre] = useState(false);
  const [showBulkPlaylist, setShowBulkPlaylist] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notesSong, setNotesSong] = useState(null);
  const [notesText, setNotesText] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const [genreSong, setGenreSong] = useState(null);
  const [genreValue, setGenreValue] = useState("");
  const [genreSaving, setGenreSaving] = useState(false);
  const { play, playingSrc } = useGlobalAudio();
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 640);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const handleSave = async (fd, id) => {
    try {
      if (id) await api.put("/api/songs/"+id, fd);
      else await api.post("/api/songs", fd);
      setModalOpen(false); setEditingSong(null); onRefresh();
    } catch (e) { showToast("Failed to save song"); }
  };
  const handleDelete = useCallback(async (id) => {
    try {
      if (onDeleteSong) await onDeleteSong(id);
      else { await api.del("/api/songs/"+id); onRefresh(); }
    } catch (e) { showToast("Failed to delete song"); }
  }, [onRefresh, showToast, onDeleteSong]);
  const openEdit = useCallback((s) => { setEditingSong(s); setModalOpen(true); }, []);
  const openNotes = useCallback((s) => { setNotesSong(s); setNotesText(s.notes || ""); }, []);
  const openGenre = useCallback((s) => { setGenreSong(s); setGenreValue(s.genre || ""); }, []);
  const saveGenre = async () => {
    if (!genreSong || genreSaving) return;
    setGenreSaving(true);
    try {
      await api.patch("/api/songs/batch-genre", { ids: [genreSong.id], genre: genreValue });
      setGenreSong(null);
      await onRefresh();
    } catch (e) { showToast("Failed to update genre"); }
    setGenreSaving(false);
  };

  const toggleSelect = useCallback((id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, [setSelectedIds]);

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
    setShowBulkGenre(false);
    setShowBulkPlaylist(false);
    setConfirmDelete(false);
  };

  const bulkSetGenre = async (genre) => {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      await api.patch("/api/songs/batch-genre", { ids: [...selectedIds], genre });
      await onRefresh();
      exitSelectMode();
      showToast("Genre updated for " + selectedIds.size + " songs");
    } catch (e) { showToast("Failed to update genres"); }
    setBulkBusy(false);
  };

  const bulkAddToPlaylist = async (plId) => {
    if (selectedIds.size === 0) return;
    const pl = playlists.find(p => p.id === plId);
    if (!pl) return;
    setBulkBusy(true);
    try {
      const ids = [...(pl.songIds || [])];
      let added = 0;
      for (const sid of selectedIds) {
        if (!ids.includes(sid)) { ids.push(sid); added++; }
      }
      await api.put("/api/playlists/" + plId, { ...pl, songIds: ids });
      await onRefresh();
      exitSelectMode();
      showToast("Added " + added + " to " + pl.name);
    } catch (e) { showToast("Failed to add to playlist"); }
    setBulkBusy(false);
  };

  const bulkAddToQueue = () => {
    if (selectedIds.size === 0) return;
    const selected = songs.filter(s => selectedIds.has(s.id) && s.audioFile);
    if (selected.length === 0) { showToast("No playable songs selected"); return; }
    setPlayerQueue(prev => [...(prev || []), ...selected]);
    showToast("Added " + selected.length + " to queue");
    exitSelectMode();
  };

  const bulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      await api.post("/api/songs/batch-delete", { ids: [...selectedIds] });
      await onRefresh();
      showToast("Deleted " + selectedIds.size + " songs");
      exitSelectMode();
    } catch (e) { showToast("Failed to delete songs"); }
    setBulkBusy(false);
  };

  const usedGenres = useMemo(() => {
    const hasNoGenreSongs = songs.some(s => !s.genre);
    return ["All", ...(hasNoGenreSongs ? ["No Genre"] : []), ...new Set(songs.map(s=>s.genre).filter(Boolean))];
  }, [songs]);

  const filtered = useMemo(() => songs
    .filter(s => {
      if (search && !s.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterGenre === "No Genre" && s.genre) return false;
      if (filterGenre !== "All" && filterGenre !== "No Genre" && s.genre !== filterGenre) return false;
      return true;
    })
    .sort((a,b) => {
      switch(sortBy){
        case "date-desc": return (b.date||"").localeCompare(a.date||"");
        case "date-asc": return (a.date||"").localeCompare(b.date||"");
        case "title": return (a.title||"").localeCompare(b.title||"");
        case "listened": return (listenTimes[b.id]||0) - (listenTimes[a.id]||0);
        default: return 0;
      }
    }), [songs, search, filterGenre, sortBy, listenTimes]);

  const searchInput = (
    <div style={{position:"relative",flex:isMobile?1:undefined,minWidth:isMobile?0:undefined}}>
      <span style={{position:"absolute",left:10,top:10,color:"#6b6b80",fontSize:12,pointerEvents:"none",zIndex:1}}>⌕</span>
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="search..."
        style={{width:"100%",background:"#14142a",border:"1px solid #2a2a45",borderRadius:10,padding:"9px 10px 9px 28px",color:"#e2e8f0",fontSize:12,outline:"none",transition:"border-color 0.2s, box-shadow 0.2s",boxSizing:"border-box"}}
        onFocus={e=>{e.target.style.borderColor="#4338ca";e.target.style.boxShadow="0 0 0 3px rgba(67,56,202,0.15)"}}
        onBlur={e=>{e.target.style.borderColor="#2a2a45";e.target.style.boxShadow="none"}} />
    </div>
  );
  const genreSelect = (
    <select value={filterGenre} onChange={e=>setFilterGenre(e.target.value)} style={{background:"#14142a",border:"1px solid #2a2a45",borderRadius:10,padding:"9px 10px",color:"#e2e8f0",fontSize:12,cursor:"pointer",appearance:"none",flex:isMobile?1:undefined,minWidth:isMobile?0:undefined,width:isMobile?undefined:"100%"}}>
      {usedGenres.map(g=><option key={g} value={g}>{g==="All"?"Any":g==="No Genre"?"No genre":g}</option>)}
    </select>
  );
  const sortSelect = (
    <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{background:"#14142a",border:"1px solid #2a2a45",borderRadius:10,padding:"9px 10px",color:"#e2e8f0",fontSize:12,cursor:"pointer",appearance:"none",flex:isMobile?1:undefined,minWidth:isMobile?0:undefined,width:isMobile?undefined:"100%"}}>
      <option value="date-desc">Newest</option>
      <option value="date-asc">Oldest</option>
      <option value="title">A → Z</option>
      <option value="listened">Most listened</option>
    </select>
  );
  const bulkTagBtn = (
    <button onClick={selectMode ? exitSelectMode : ()=>setSelectMode(true)}
      style={{background:selectMode?"#4338ca20":"#4338ca10",border:"1px solid "+(selectMode?"#4338ca":"#4338ca50"),borderRadius:10,padding:"9px 10px",color:"#818cf8",fontSize:11,cursor:"pointer",width:isMobile?"auto":"100%",textAlign:"left",fontWeight:500,whiteSpace:"nowrap"}}>
      {selectMode ? "✕ cancel" : "☐ select"}
    </button>
  );
  const bulkActions = selectMode && (
    <div style={{display:"flex",flexDirection:"column",gap:6,background:"#12121f",border:"1px solid #1e1e35",borderRadius:8,padding:"8px 10px",animation:"fadeUp 0.2s ease-out",position:"relative"}}>
      <div style={{display:"flex",alignItems:"center",gap:6}}>
        <button onClick={()=>setSelectedIds(new Set(filtered.map(s=>s.id)))} style={{background:"none",border:"1px solid #2a2a45",borderRadius:6,padding:"4px 8px",color:"#6b7280",fontSize:9,cursor:"pointer"}}
          onMouseEnter={e=>e.target.style.color="#818cf8"} onMouseLeave={e=>e.target.style.color="#6b7280"}>all</button>
        <button onClick={()=>setSelectedIds(new Set())} style={{background:"none",border:"1px solid #2a2a45",borderRadius:6,padding:"4px 8px",color:"#6b7280",fontSize:9,cursor:"pointer"}}
          onMouseEnter={e=>e.target.style.color="#818cf8"} onMouseLeave={e=>e.target.style.color="#6b7280"}>none</button>
        <span style={{color:"#6b6b80",fontSize:10}}>{selectedIds.size} sel</span>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:4}}>
        {/* Set Genre */}
        <div style={{position:"relative"}}>
          <button onClick={()=>{setShowBulkGenre(!showBulkGenre);setShowBulkPlaylist(false);setConfirmDelete(false)}} disabled={selectedIds.size===0||bulkBusy}
            style={{background:"none",border:"1px solid #2a2a45",borderRadius:6,padding:"5px 8px",color:selectedIds.size>0?"#818cf8":"#555",fontSize:10,cursor:selectedIds.size>0?"pointer":"default",width:"100%",textAlign:"left"}}
            onMouseEnter={e=>{if(selectedIds.size>0)e.target.style.background="#1e1e35"}} onMouseLeave={e=>e.target.style.background="none"}>
            Genre ▾
          </button>
          {showBulkGenre && (
            <div style={{position:"absolute",top:"100%",left:0,marginTop:4,background:"#12121f",border:"1px solid #2a2a45",borderRadius:8,padding:4,zIndex:20,minWidth:120,maxHeight:200,overflowY:"auto",boxShadow:"0 8px 24px rgba(0,0,0,0.5)"}}>
              <div onClick={()=>bulkSetGenre("")} style={{padding:"6px 10px",fontSize:10,color:"#8a8aa0",cursor:"pointer",borderRadius:4}}
                onMouseEnter={e=>e.target.style.background="#1e1e35"} onMouseLeave={e=>e.target.style.background="none"}>No genre</div>
              {genres.map(g=>(
                <div key={g} onClick={()=>bulkSetGenre(g)} style={{padding:"6px 10px",fontSize:10,color:"#e2e8f0",cursor:"pointer",borderRadius:4,whiteSpace:"nowrap"}}
                  onMouseEnter={e=>e.target.style.background="#1e1e35"} onMouseLeave={e=>e.target.style.background="none"}>{g}</div>
              ))}
            </div>
          )}
        </div>
        {/* Add to Playlist */}
        <div style={{position:"relative"}}>
          <button onClick={()=>{setShowBulkPlaylist(!showBulkPlaylist);setShowBulkGenre(false);setConfirmDelete(false)}} disabled={selectedIds.size===0||bulkBusy||playlists.length===0}
            style={{background:"none",border:"1px solid #2a2a45",borderRadius:6,padding:"5px 8px",color:selectedIds.size>0&&playlists.length>0?"#818cf8":"#555",fontSize:10,cursor:selectedIds.size>0&&playlists.length>0?"pointer":"default",width:"100%",textAlign:"left"}}
            onMouseEnter={e=>{if(selectedIds.size>0&&playlists.length>0)e.target.style.background="#1e1e35"}} onMouseLeave={e=>e.target.style.background="none"}>
            Playlist ▾
          </button>
          {showBulkPlaylist && (
            <div style={{position:"absolute",top:"100%",left:0,marginTop:4,background:"#12121f",border:"1px solid #2a2a45",borderRadius:8,padding:4,zIndex:20,minWidth:120,maxHeight:200,overflowY:"auto",boxShadow:"0 8px 24px rgba(0,0,0,0.5)"}}>
              {playlists.map(p=>(
                <div key={p.id} onClick={()=>bulkAddToPlaylist(p.id)} style={{padding:"6px 10px",fontSize:10,color:"#e2e8f0",cursor:"pointer",borderRadius:4,whiteSpace:"nowrap"}}
                  onMouseEnter={e=>e.target.style.background="#1e1e35"} onMouseLeave={e=>e.target.style.background="none"}>{p.name}</div>
              ))}
            </div>
          )}
        </div>
        {/* Add to Queue */}
        <button onClick={bulkAddToQueue} disabled={selectedIds.size===0||bulkBusy}
          style={{background:"none",border:"1px solid #2a2a45",borderRadius:6,padding:"5px 8px",color:selectedIds.size>0?"#818cf8":"#555",fontSize:10,cursor:selectedIds.size>0?"pointer":"default",width:"100%",textAlign:"left"}}
          onMouseEnter={e=>{if(selectedIds.size>0)e.target.style.background="#1e1e35"}} onMouseLeave={e=>e.target.style.background="none"}>
          Queue
        </button>
        {/* Delete */}
        <button onClick={()=>{
          if(confirmDelete){bulkDelete();}
          else{setConfirmDelete(true);setShowBulkGenre(false);setShowBulkPlaylist(false);}
        }} disabled={selectedIds.size===0||bulkBusy}
          style={{background:confirmDelete?"#7f1d1d":"none",border:"1px solid "+(confirmDelete?"#ef4444":"#2a2a45"),borderRadius:6,padding:"5px 8px",color:confirmDelete?"#fca5a5":(selectedIds.size>0?"#f87171":"#555"),fontSize:10,cursor:selectedIds.size>0?"pointer":"default",fontWeight:confirmDelete?600:400,transition:"all 0.15s",width:"100%",textAlign:"left"}}
          onMouseEnter={e=>{if(selectedIds.size>0&&!confirmDelete)e.target.style.background="#1e1e35"}} onMouseLeave={e=>{if(!confirmDelete)e.target.style.background="none"}}>
          {bulkBusy ? "..." : confirmDelete ? "Delete "+selectedIds.size+"?" : "Delete"}
        </button>
      </div>
    </div>
  );

  return (
    <div style={{display:"flex",flexDirection:isMobile?"column":"row",gap:isMobile?0:16,alignItems:isMobile?"stretch":"flex-start"}}>
      {/* Controls — top bar on mobile, sidebar on desktop */}
      {isMobile ? (
        <div style={{display:"flex",flexDirection:"column",gap:8,zIndex:10,position:"sticky",top:(stickyTop||0),background:"#13102a",padding:"8px 0 6px",borderBottom:"1px solid #1e1e35"}}>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            {searchInput}
            {bulkTagBtn}
          </div>
          <div style={{display:"flex",gap:8}}>
            {genreSelect}
            {sortSelect}
          </div>
          {bulkActions}
        </div>
      ) : (
        <div style={{position:"sticky",top:(stickyTop||0),width:170,flexShrink:0,display:"flex",flexDirection:"column",gap:10,paddingTop:8,zIndex:10}}>
          {searchInput}
          <div style={{color:"#8a8aa0",fontSize:10,textTransform:"uppercase",letterSpacing:"0.06em",marginTop:4}}>Genre</div>
          {genreSelect}
          <div style={{color:"#8a8aa0",fontSize:10,textTransform:"uppercase",letterSpacing:"0.06em",marginTop:4}}>Sorting</div>
          {sortSelect}
          <div style={{marginTop:10}}>{bulkTagBtn}</div>
          {bulkActions}
        </div>
      )}

      {/* Song list — takes remaining space */}
      <div style={{flex:1,minWidth:0}}>
        {/* Action bar above songs */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10,gap:8,flexWrap:"wrap"}}>
          <div style={{flex:1,minWidth:0}} />
          <div style={{display:"flex",gap:6,flexShrink:0}}>
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
        </div>
        {filtered.length === 0 ? (
          <div style={{textAlign:"center",padding:"60px 20px",animation:"fadeUp 0.5s ease-out"}}>
            <div style={{fontSize:64,marginBottom:16,animation:"float 3s ease-in-out infinite"}}>♪</div>
            <p style={{color:"#6b7280",fontSize:18}}>{songs.length===0?"Your library is empty":"No songs match your filters"}</p>
            {songs.length===0 && <p style={{color:"#6b6b80",fontSize:14,marginTop:4}}>Drop some files in the Upload tab</p>}
          </div>
        ) : (
          <VirtualList
            items={filtered}
            rowHeight={rowDensity === "compact" ? 32 : 86}
            gap={rowDensity === "compact" ? 4 : 6}
            overScan={6}
            renderRow={(s) => (
              <SongRow key={s.id} song={s}
                onDelete={selectMode ? undefined : handleDelete}
                onEdit={selectMode ? undefined : openEdit}
                onChangeGenre={selectMode ? undefined : openGenre}
                onNotes={selectMode ? undefined : openNotes}
                selectable={selectMode}
                selected={selectedIds.has(s.id)}
                onToggleSelect={toggleSelect}
                listenTime={listenTimes[s.id]}
                compact={rowDensity === "compact"}
                playlists={playlists}
                audioMissing={audioAvailable && !audioAvailable.has(s.id)}
                onAddToPlaylist={async (songId, plId) => {
                  const pl = playlists.find(p => p.id === plId);
                  if (!pl) return;
                  const ids = [...(pl.songIds || [])];
                  if (ids.includes(songId)) { showToast("Already in " + pl.name); return; }
                  ids.push(songId);
                  await api.put("/api/playlists/" + plId, { ...pl, songIds: ids });
                  onRefresh();
                  showToast("Added to " + pl.name);
                }}
                onAddToQueue={(song) => {
                  if (!playingSrc) {
                    setPlayerQueue([song]);
                    setPlayerQueueIdx(0);
                    play(song.audioFile);
                    showToast("Now playing");
                  } else {
                    setPlayerQueue(prev => [...(prev || []), song]);
                    showToast("Added to queue");
                  }
                }}
                onPlayNext={(song) => {
                  if (!playingSrc) {
                    setPlayerQueue([song]);
                    setPlayerQueueIdx(0);
                    play(song.audioFile);
                    showToast("Now playing");
                  } else {
                    setPlayerQueue(prev => {
                      if (!prev || prev.length === 0) return [song];
                      return [...prev.slice(0, 1), song, ...prev.slice(1)];
                    });
                    showToast("Playing next");
                  }
                }}
              />
            )}
          />
        )}
      </div>

      <Modal open={modalOpen} onClose={()=>{setModalOpen(false);setEditingSong(null)}}>
        <SongEditForm song={editingSong} onSave={handleSave} onCancel={()=>{setModalOpen(false);setEditingSong(null)}} />
      </Modal>

      <Modal open={!!notesSong} onClose={()=>setNotesSong(null)}>
        {notesSong && (
          <div style={{display:"flex",flexDirection:"column",gap:14,minWidth:340}}>
            <h3 style={{color:"#e2e8f0",fontSize:16,fontWeight:600,margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{notesSong.title}</h3>
            <textarea
              value={notesText}
              onChange={e=>setNotesText(e.target.value)}
              placeholder="Add notes about this song..."
              rows={6}
              style={{width:"100%",background:"#0d0d1a",border:"1px solid #2a2a45",borderRadius:8,padding:12,color:"#e2e8f0",fontSize:13,resize:"vertical",outline:"none",fontFamily:"inherit",lineHeight:1.5}}
              onFocus={e=>{e.target.style.borderColor="#4338ca";e.target.style.boxShadow="0 0 0 3px rgba(67,56,202,0.15)"}}
              onBlur={e=>{e.target.style.borderColor="#2a2a45";e.target.style.boxShadow="none"}}
            />
            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              <button onClick={()=>setNotesSong(null)}
                style={{background:"none",border:"1px solid #2a2a45",borderRadius:8,padding:"8px 16px",color:"#8a8aa0",fontSize:12,cursor:"pointer"}}
                onMouseEnter={e=>e.target.style.borderColor="#4338ca"} onMouseLeave={e=>e.target.style.borderColor="#2a2a45"}>
                Cancel
              </button>
              <button
                disabled={notesSaving}
                onClick={async ()=>{
                  setNotesSaving(true);
                  try {
                    const fd = new FormData();
                    fd.append("notes", notesText);
                    await api.put("/api/songs/"+notesSong.id, fd);
                    await onRefresh();
                    setNotesSong(null);
                  } catch(e) { showToast("Failed to save notes"); }
                  setNotesSaving(false);
                }}
                style={{background:"linear-gradient(135deg,#4338ca,#6366f1)",border:"none",borderRadius:8,padding:"8px 20px",color:"#fff",fontSize:12,cursor:"pointer",fontWeight:600,opacity:notesSaving?0.6:1}}>
                {notesSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        )}
      </Modal>
      <Modal open={!!genreSong} onClose={()=>setGenreSong(null)}>
        {genreSong && (
          <div style={{display:"flex",flexDirection:"column",gap:14,minWidth:300}}>
            <h3 style={{color:"#e2e8f0",fontSize:16,fontWeight:600,margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{genreSong.title}</h3>
            <div>
              <label style={{color:"#6b7280",fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:6,display:"block"}}>Genre</label>
              <select value={genreValue} onChange={e=>setGenreValue(e.target.value)}
                style={{width:"100%",background:"#12121f",border:"1px solid #2a2a45",borderRadius:10,padding:"12px 16px",color:"#e2e8f0",fontSize:15,outline:"none",cursor:"pointer",appearance:"none"}}>
                <option value="">No genre</option>
                {genres.map(g=><option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              <button onClick={()=>setGenreSong(null)}
                style={{background:"none",border:"1px solid #2a2a45",borderRadius:8,padding:"8px 16px",color:"#8a8aa0",fontSize:12,cursor:"pointer"}}
                onMouseEnter={e=>e.target.style.borderColor="#4338ca"} onMouseLeave={e=>e.target.style.borderColor="#2a2a45"}>
                Cancel
              </button>
              <button
                disabled={genreSaving}
                onClick={saveGenre}
                style={{background:"linear-gradient(135deg,#4338ca,#6366f1)",border:"none",borderRadius:8,padding:"8px 20px",color:"#fff",fontSize:12,cursor:"pointer",fontWeight:600,opacity:genreSaving?0.6:1}}>
                {genreSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <ScrollToTop />
    </div>
  );
}

export default LibraryTab;
