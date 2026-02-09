import React, { useState, useCallback } from 'react';
import { useGlobalAudio } from '../components/AudioProvider';
import api from '../api';
import Modal from '../components/Modal';
import SongRow from '../components/SongRow';
import VirtualList from '../components/VirtualList';
import SongEditForm from '../components/SongEditForm';
import ScrollToTop from '../components/ScrollToTop';

function LibraryTab({ songs, genres, onRefresh, filterGenre, setFilterGenre, selectMode, setSelectMode, selectedIds, setSelectedIds, batchGenre, setBatchGenre, stickyTop, listenTimes, setPlayerQueue, setPlayerQueueIdx, switchTab, playlists, showToast, rowDensity }) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("date-desc");
  const [editingSong, setEditingSong] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [batchSaving, setBatchSaving] = useState(false);
  const { play } = useGlobalAudio();

  const handleSave = async (fd, id) => {
    if (id) await api.put("/api/songs/"+id, fd);
    else await api.post("/api/songs", fd);
    setModalOpen(false); setEditingSong(null); onRefresh();
  };
  const handleDelete = useCallback(async (id) => { await api.del("/api/songs/"+id); onRefresh(); }, [onRefresh]);
  const openEdit = useCallback((s) => { setEditingSong(s); setModalOpen(true); }, []);

  const toggleSelect = useCallback((id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, [setSelectedIds]);

  const applyBatchGenre = async () => {
    if (selectedIds.size === 0) return;
    setBatchSaving(true);
    await api.patch("/api/songs/batch-genre", { ids: [...selectedIds], genre: batchGenre });
    setSelectedIds(new Set());
    setSelectMode(false);
    setBatchGenre("");
    await onRefresh();
    setBatchSaving(false);
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
    setBatchGenre("");
  };

  const hasNoGenreSongs = songs.some(s => !s.genre);
  const usedGenres = ["All", ...(hasNoGenreSongs ? ["No Genre"] : []), ...new Set(songs.map(s=>s.genre).filter(Boolean))];
  const filtered = songs
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
    });

  return (
    <div style={{display:"flex",gap:16,alignItems:"flex-start"}}>
      {/* Sidebar — always visible on the left */}
      <div style={{position:"sticky",top:(stickyTop||0)+8,width:170,flexShrink:0,display:"flex",flexDirection:"column",gap:10,paddingTop:8,zIndex:10}}>
        <div style={{position:"relative"}}>
          <span style={{position:"absolute",left:10,top:10,color:"#6b6b80",fontSize:12,pointerEvents:"none",zIndex:1}}>⌕</span>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="search..."
            style={{width:"100%",background:"#14142a",border:"1px solid #2a2a45",borderRadius:10,padding:"9px 10px 9px 28px",color:"#e2e8f0",fontSize:12,outline:"none",transition:"border-color 0.2s, box-shadow 0.2s"}}
            onFocus={e=>{e.target.style.borderColor="#4338ca";e.target.style.boxShadow="0 0 0 3px rgba(67,56,202,0.15)"}}
            onBlur={e=>{e.target.style.borderColor="#2a2a45";e.target.style.boxShadow="none"}} />
        </div>
        <div style={{color:"#8a8aa0",fontSize:10,textTransform:"uppercase",letterSpacing:"0.06em",marginTop:4}}>Genre</div>
        <select value={filterGenre} onChange={e=>setFilterGenre(e.target.value)} style={{background:"#14142a",border:"1px solid #2a2a45",borderRadius:10,padding:"9px 10px",color:"#e2e8f0",fontSize:12,cursor:"pointer",appearance:"none",width:"100%"}}>
          {usedGenres.map(g=><option key={g} value={g}>{g==="All"?"Any":g==="No Genre"?"No genre":g}</option>)}
        </select>
        <div style={{color:"#8a8aa0",fontSize:10,textTransform:"uppercase",letterSpacing:"0.06em",marginTop:4}}>Sorting</div>
        <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{background:"#14142a",border:"1px solid #2a2a45",borderRadius:10,padding:"9px 10px",color:"#e2e8f0",fontSize:12,cursor:"pointer",appearance:"none",width:"100%"}}>
          <option value="date-desc">Newest first</option>
          <option value="date-asc">Oldest first</option>
          <option value="title">A → Z</option>
          <option value="listened">Most listened</option>
        </select>
        <button onClick={selectMode ? exitSelectMode : ()=>setSelectMode(true)}
          style={{background:selectMode?"#4338ca20":"#4338ca10",border:"1px solid "+(selectMode?"#4338ca":"#4338ca50"),borderRadius:10,padding:"9px 10px",color:selectMode?"#818cf8":"#818cf8",fontSize:11,cursor:"pointer",width:"100%",textAlign:"left",marginTop:10,fontWeight:500}}>
          {selectMode ? "✕ cancel select" : "☐ bulk tag"}
        </button>
      </div>

      {/* Song list — takes remaining space */}
      <div style={{flex:1,minWidth:0}}>
        {/* Action bar above songs */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10,gap:8}}>
          <div style={{display:"flex",alignItems:"center",gap:8,flex:1}}>
            {selectMode && (
              <div style={{display:"flex",alignItems:"center",gap:6,background:"#12121f",border:"1px solid #1e1e35",borderRadius:8,padding:"6px 10px",animation:"fadeUp 0.2s ease-out"}}>
                <button onClick={()=>setSelectedIds(new Set(filtered.map(s=>s.id)))} style={{background:"none",border:"1px solid #2a2a45",borderRadius:6,padding:"4px 8px",color:"#6b7280",fontSize:9,cursor:"pointer"}}
                  onMouseEnter={e=>e.target.style.color="#818cf8"} onMouseLeave={e=>e.target.style.color="#6b7280"}>all</button>
                <button onClick={()=>setSelectedIds(new Set())} style={{background:"none",border:"1px solid #2a2a45",borderRadius:6,padding:"4px 8px",color:"#6b7280",fontSize:9,cursor:"pointer"}}
                  onMouseEnter={e=>e.target.style.color="#818cf8"} onMouseLeave={e=>e.target.style.color="#6b7280"}>none</button>
                <span style={{color:"#6b6b80",fontSize:10}}>{selectedIds.size} selected</span>
                <select value={batchGenre} onChange={e=>setBatchGenre(e.target.value)}
                  style={{background:"#0d0d1a",border:"1px solid #2a2a45",borderRadius:6,padding:"5px 8px",color:"#e2e8f0",fontSize:10,cursor:"pointer",appearance:"none"}}>
                  <option value="">no genre</option>
                  {genres.map(g=><option key={g} value={g}>{g}</option>)}
                </select>
                <button onClick={applyBatchGenre} disabled={selectedIds.size===0 || batchSaving}
                  style={{background:selectedIds.size>0?"linear-gradient(135deg,#4338ca,#6366f1)":"#2a2a40",border:"none",borderRadius:6,padding:"5px 12px",color:selectedIds.size>0?"#fff":"#555",fontSize:10,cursor:selectedIds.size>0?"pointer":"default",fontWeight:600}}>
                  {batchSaving ? "..." : "apply"}
                </button>
              </div>
            )}
          </div>
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
                selectable={selectMode}
                selected={selectedIds.has(s.id)}
                onToggleSelect={toggleSelect}
                listenTime={listenTimes[s.id]}
                compact={rowDensity === "compact"}
                playlists={playlists}
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
                  setPlayerQueue(prev => [...(prev || []), song]);
                  showToast("Added to queue");
                }}
                onPlayNext={(song) => {
                  setPlayerQueue(prev => {
                    if (!prev || prev.length === 0) return [song];
                    return [...prev.slice(0, 1), song, ...prev.slice(1)];
                  });
                  showToast("Playing next");
                }}
              />
            )}
          />
        )}
      </div>

      <Modal open={modalOpen} onClose={()=>{setModalOpen(false);setEditingSong(null)}}>
        <SongEditForm song={editingSong} genres={genres} onSave={handleSave} onCancel={()=>{setModalOpen(false);setEditingSong(null)}} />
      </Modal>
      <ScrollToTop />
    </div>
  );
}

export default LibraryTab;
