import React, { useState, useEffect, useRef } from 'react';
import AudioPlayer from './AudioPlayer';
import GenreTag from './GenreTag';

function SongRow({ song, onDelete, onEdit, onNotes, onChangeGenre, rank, showElo, showWinLoss: showWL, selectable, selected, onToggleSelect, listenTime, playlists, onAddToPlaylist, onAddToQueue, onPlayNext, compact, audioMissing }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [playlistSub, setPlaylistSub] = useState(false);
  const menuRef = useRef(null);
  const fmtTime = (secs) => { if (!secs || secs < 60) return null; const m = Math.floor(secs / 60); return m + "m"; };
  const narrow = typeof window !== 'undefined' && window.innerWidth < 640;

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) { setMenuOpen(false); setPlaylistSub(false); } };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const menuItemStyle = {display:"flex",alignItems:"center",gap:8,padding:"8px 14px",color:"#c8c8d8",fontSize:12,cursor:"pointer",background:"none",border:"none",width:"100%",textAlign:"left",whiteSpace:"nowrap"};
  const manualPlaylists = (playlists || []).filter(pl => !pl.smart);

  return (
    <div onClick={selectable ? ()=>onToggleSelect(song.id) : undefined} style={{background:"#14142a",border:"1px solid "+(selectable&&selected?"#4338ca":"#1e1e35"),borderRadius:compact?6:8,padding:compact?"4px 10px":narrow?"8px 10px":"10px 14px",display:"flex",flexDirection:"column",gap:compact?2:6,minWidth:0,cursor:selectable?"pointer":undefined,transition:"border-color 0.15s"}}>
      <div style={{display:"flex",alignItems:"center",gap:compact?6:narrow?6:8,minWidth:0}}>
        {selectable && (
          <input type="checkbox" checked={!!selected} onChange={()=>onToggleSelect(song.id)} onClick={e=>e.stopPropagation()}
            style={{accentColor:"#818cf8",cursor:"pointer",flexShrink:0,width:compact?14:16,height:compact?14:16}} />
        )}
        {rank != null && <span style={{fontSize:compact?11:13,color:rank<=3?"#f59e0b":"#6b6b80",fontWeight:700,minWidth:compact?22:28,textAlign:"right"}}>{rank}</span>}
        <span style={{flex:1,color:"#e2e8f0",fontSize:compact?12:narrow?13:14,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",minWidth:0}}>{song.title}</span>
        {listenTime && fmtTime(listenTime) && <span style={{color:"#22c55e80",fontSize:9,flexShrink:0}}>♪{fmtTime(listenTime)}</span>}
        {song.notes && onNotes && <svg onClick={e=>{e.stopPropagation();onNotes(song)}} title="Has notes" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="#818cf8" strokeWidth="1.5" strokeLinecap="round" style={{flexShrink:0,opacity:0.5,cursor:"pointer",transition:"opacity 0.15s"}} onMouseEnter={e=>e.currentTarget.style.opacity="1"} onMouseLeave={e=>e.currentTarget.style.opacity="0.5"}><path d="M3 2h7l3 3v9H3z"/><path d="M6 8h4M6 11h2"/></svg>}
        <GenreTag genre={song.genre} compact={compact} />
        {!compact && !narrow && <span style={{color:"#5a5a70",fontSize:11,flexShrink:0}}>{song.date}</span>}
        {showElo && song.elo != null && <span style={{color:"#818cf8",fontSize:11,fontWeight:600,flexShrink:0}}>{song.elo}</span>}
        {showElo && showWL !== false && song.elo != null && <span style={{color:"#5a5a70",fontSize:10,flexShrink:0}}>{song.wins}W {song.losses}L</span>}
        {(onEdit || onDelete) && !selectable && (
          <div ref={menuRef} style={{position:"relative",flexShrink:0}}>
            <button onClick={e=>{e.stopPropagation();setMenuOpen(!menuOpen);setPlaylistSub(false)}}
              style={{background:"none",border:"none",color:menuOpen?"#818cf8":"#6b6b80",cursor:"pointer",fontSize:16,padding:"2px 6px",lineHeight:1,letterSpacing:2}}
              onMouseEnter={e=>e.target.style.color="#818cf8"} onMouseLeave={e=>{if(!menuOpen)e.target.style.color="#6b6b80"}}>
              ⋯
            </button>
            {menuOpen && (
              <div style={{position:"absolute",right:0,top:"100%",marginTop:4,background:"#1a1a2e",border:"1px solid #2a2a45",borderRadius:10,overflow:"visible",zIndex:50,minWidth:170,boxShadow:"0 8px 24px rgba(0,0,0,0.5)",animation:"fadeUp 0.15s ease-out"}}>
                {onEdit && (
                  <button onClick={e=>{e.stopPropagation();setMenuOpen(false);onEdit(song)}} style={{...menuItemStyle,borderRadius:"10px 10px 0 0"}}
                    onMouseEnter={e=>e.currentTarget.style.background="#2a2a45"} onMouseLeave={e=>e.currentTarget.style.background="none"}>
                    <span style={{fontSize:13}}>✏️</span> Edit
                  </button>
                )}
                {onChangeGenre && (
                  <button onClick={e=>{e.stopPropagation();setMenuOpen(false);onChangeGenre(song)}} style={menuItemStyle}
                    onMouseEnter={e=>e.currentTarget.style.background="#2a2a45"} onMouseLeave={e=>e.currentTarget.style.background="none"}>
                    <span style={{fontSize:13}}>🏷️</span> Change Genre
                  </button>
                )}
                {onNotes && (
                  <button onClick={e=>{e.stopPropagation();setMenuOpen(false);onNotes(song)}} style={menuItemStyle}
                    onMouseEnter={e=>e.currentTarget.style.background="#2a2a45"} onMouseLeave={e=>e.currentTarget.style.background="none"}>
                    <span style={{fontSize:13}}>📝</span> Notes
                  </button>
                )}
                {onAddToQueue && song.audioFile && (
                  <button onClick={e=>{e.stopPropagation();setMenuOpen(false);onAddToQueue(song)}} style={menuItemStyle}
                    onMouseEnter={e=>e.currentTarget.style.background="#2a2a45"} onMouseLeave={e=>e.currentTarget.style.background="none"}>
                    <span style={{fontSize:13}}>📋</span> Add to queue
                  </button>
                )}
                {onPlayNext && song.audioFile && (
                  <button onClick={e=>{e.stopPropagation();setMenuOpen(false);onPlayNext(song)}} style={menuItemStyle}
                    onMouseEnter={e=>e.currentTarget.style.background="#2a2a45"} onMouseLeave={e=>e.currentTarget.style.background="none"}>
                    <span style={{fontSize:13}}>⏭️</span> Play next
                  </button>
                )}
                {onAddToPlaylist && manualPlaylists.length > 0 && (
                  <div style={{position:"relative"}}>
                    <div style={{height:1,background:"#2a2a45",margin:"2px 0"}} />
                    <button onClick={e=>{e.stopPropagation();setPlaylistSub(!playlistSub)}} style={{...menuItemStyle,justifyContent:"space-between"}}
                      onMouseEnter={e=>e.currentTarget.style.background="#2a2a45"} onMouseLeave={e=>e.currentTarget.style.background="none"}>
                      <span style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:13}}>🎵</span> Add to playlist</span>
                      <span style={{color:"#6b6b80",fontSize:10,transform:playlistSub?"rotate(180deg)":"none",transition:"transform 0.15s"}}>▸</span>
                    </button>
                    {playlistSub && (
                      <div style={{position:"absolute",right:"100%",top:0,marginRight:4,background:"#1a1a2e",border:"1px solid #2a2a45",borderRadius:10,overflow:"hidden",minWidth:150,boxShadow:"0 8px 24px rgba(0,0,0,0.5)",animation:"fadeUp 0.1s ease-out"}}>
                        {manualPlaylists.map(pl => (
                          <button key={pl.id} onClick={e=>{e.stopPropagation();setMenuOpen(false);setPlaylistSub(false);onAddToPlaylist(song.id, pl.id)}} style={menuItemStyle}
                            onMouseEnter={e=>e.currentTarget.style.background="#2a2a45"} onMouseLeave={e=>e.currentTarget.style.background="none"}>
                            {pl.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {onDelete && (
                  <>
                    <div style={{height:1,background:"#2a2a45",margin:"2px 0"}} />
                    <button onClick={e=>{e.stopPropagation();setMenuOpen(false);onDelete(song.id)}} style={{...menuItemStyle,color:"#ef4444",borderRadius:"0 0 10px 10px"}}
                      onMouseEnter={e=>e.currentTarget.style.background="#2a2a45"} onMouseLeave={e=>e.currentTarget.style.background="none"}>
                      <span style={{fontSize:13}}>🗑️</span> Delete
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      {!compact && song.audioFile && !audioMissing && <AudioPlayer src={song.audioFile} compact />}
      {!compact && audioMissing && (
        <div style={{color:"#6b6b80",fontSize:11,fontStyle:"italic",padding:"4px 0"}}>audio not on this device</div>
      )}
    </div>
  );
}

export default React.memo(SongRow);
