import React, { useState, useRef } from 'react';
import { useRanking } from '../hooks/useRanking';
import api from '../api';

function SettingsTab({ genres, songs, comparisons, playlists, onRefresh, showToast, showVariance, setShowVariance,
  sessionLength, setSessionLength, bracketSize, setBracketSize, showWinLoss, setShowWinLoss,
  rowDensity, setRowDensity, listenTimes, setListenTimes, listenTimesRef, user, setUser, onLogout, planInfo }) {
  const [newGenre, setNewGenre] = useState("");
  const [editingGenre, setEditingGenre] = useState(null);
  const [editName, setEditName] = useState("");
  const [settingsTab, setSettingsTab] = useState("general");
  const [showDelModal, setShowDelModal] = useState(false);
  const [delSongs, setDelSongs] = useState(false);
  const [delComps, setDelComps] = useState(false);
  const [delPlaylists, setDelPlaylists] = useState(false);
  const [delGenres, setDelGenres] = useState(false);
  const [delListenHistory, setDelListenHistory] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showExportPlaylists, setShowExportPlaylists] = useState(false);
  const [saved, setSaved] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importDragging, setImportDragging] = useState(false);
  const importInputRef = useRef(null);
  const [editUsername, setEditUsername] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const ranking = useRanking(songs, comparisons);

  // Draft state — only committed to parent on Save
  const [draftVariance, setDraftVariance] = useState(showVariance);
  const [draftWinLoss, setDraftWinLoss] = useState(showWinLoss);
  const [draftSessionLength, setDraftSessionLength] = useState(sessionLength);
  const [draftBracketSize, setDraftBracketSize] = useState(bracketSize);
  const [draftRowDensity, setDraftRowDensity] = useState(rowDensity);

  const addGenre = async () => {
    if (!newGenre.trim()) return;
    try {
      await api.post("/api/genres", { name: newGenre.trim() });
      setNewGenre("");
      onRefresh();
    } catch (e) { showToast("Failed to add genre"); }
  };
  const deleteGenre = async (name) => {
    try {
      const affected = songs.filter(s => s.genre === name).map(s => s.id);
      if (affected.length > 0) {
        await api.patch("/api/songs/batch-genre", { ids: affected, genre: "" });
      }
      await api.del("/api/genres/" + encodeURIComponent(name));
      onRefresh();
    } catch (e) { showToast("Failed to delete genre"); }
  };
  const startEdit = (g) => { setEditingGenre(g); setEditName(g); };
  const saveEdit = async () => {
    if (!editName.trim() || editName.trim() === editingGenre) { setEditingGenre(null); return; }
    try {
      const affected = songs.filter(s => s.genre === editingGenre).map(s => s.id);
      if (affected.length > 0) {
        await api.patch("/api/songs/batch-genre", { ids: affected, genre: editName.trim() });
      }
      await api.put("/api/genres/" + encodeURIComponent(editingGenre), { name: editName.trim() });
      setEditingGenre(null);
      onRefresh();
    } catch (e) { showToast("Failed to rename genre"); }
  };

  const exportRankingsText = () => {
    const { standings } = ranking;
    const text = standings.map((s, i) => (i+1) + ". " + s.title + " (" + s.elo + ")").join("\n");
    navigator.clipboard.writeText(text);
    showToast("Rankings copied to clipboard");
  };

  const exportRankingsCSV = () => {
    const { standings } = ranking;
    const header = "Rank,Title,Genre,Elo,Wins,Losses\n";
    const rows = standings.map((s, i) => {
      const title = '"' + (s.title || "").replace(/"/g, '""') + '"';
      const genre = '"' + (s.genre || "") + '"';
      return (i+1) + "," + title + "," + genre + "," + s.elo + "," + s.wins + "," + s.losses;
    }).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "rankings.csv"; a.click();
    URL.revokeObjectURL(url);
    showToast("Rankings CSV downloaded");
  };

  const exportBackup = async () => {
    try {
      const data = {
        songs: await api.get("/api/songs"),
        comparisons: await api.get("/api/comparisons"),
        genres: await api.get("/api/genres"),
        playlists: await api.get("/api/playlists"),
        listenTimes: await api.get("/api/listen-times"),
        exportedAt: new Date().toISOString(),
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "imade-backup-" + new Date().toISOString().slice(0,10) + ".json"; a.click();
      URL.revokeObjectURL(url);
      showToast("Backup downloaded");
    } catch (e) { showToast("Failed to export backup"); }
  };

  const serverBackup = async () => {
    try {
      const r = await api.post("/api/backup");
      if (r.name) showToast("Server backup: " + r.name);
    } catch (e) { showToast("Failed to create server backup"); }
  };

  const importBackup = async (file) => {
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await api.post("/api/import", data);
      await onRefresh();
      showToast("Data imported successfully");
    } catch (e) { showToast("Import failed: " + (e.message || "unknown error")); }
    setImporting(false);
  };

  const sec = { background:"#14142a",border:"1px solid #2a2a45",borderRadius:14,padding:"20px 22px",marginBottom:16 };
  const secT = { color:"#e2e8f0",fontSize:14,fontWeight:600,marginBottom:14,display:"flex",alignItems:"center",gap:8 };

  const Toggle = ({ value, onChange, label, desc }) => (
    <label style={{display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer",padding:"8px 0"}}>
      <div>
        <div style={{color:"#e2e8f0",fontSize:13}}>{label}</div>
        {desc && <div style={{color:"#6b6b80",fontSize:11,marginTop:2}}>{desc}</div>}
      </div>
      <div onClick={()=>onChange(!value)}
        style={{width:40,height:22,borderRadius:11,background:value?"#818cf8":"#2a2a45",cursor:"pointer",position:"relative",transition:"background 0.2s",flexShrink:0}}>
        <div style={{width:16,height:16,borderRadius:8,background:"#fff",position:"absolute",top:3,left:value?21:3,transition:"left 0.2s"}} />
      </div>
    </label>
  );

  const SegmentPicker = ({ value, options, onChange }) => (
    <div style={{display:"flex",background:"#0d0d1a",borderRadius:10,border:"1px solid #2a2a45",overflow:"hidden"}}>
      {options.map(opt => (
        <button key={opt.value} onClick={()=>onChange(opt.value)}
          style={{flex:1,padding:"8px 12px",border:"none",background:value===opt.value?"#4338ca":"transparent",color:value===opt.value?"#fff":"#6b6b80",fontSize:12,cursor:"pointer",fontWeight:value===opt.value?600:400,transition:"all 0.15s"}}>
          {opt.label}
        </button>
      ))}
    </div>
  );

  const tabs = [
    { id: "general", label: "General", icon: "⚙️" },
    { id: "genres", label: "Genres", icon: "🏷️" },
    { id: "data", label: "Data", icon: "💾" },
  ];

  return (
    <div style={{maxWidth:600,margin:"0 auto"}}>
      {/* Account */}
      {user && (
        <div style={{...sec,marginBottom:20}}>
          {!editingProfile ? (
            <div>
              <div style={{display:"flex",alignItems:"center",gap:12,padding:"4px 0"}}>
                <div style={{width:40,height:40,borderRadius:10,background:"linear-gradient(135deg,#4338ca,#6366f1)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:16,fontWeight:700}}>
                  {user.username.charAt(0).toUpperCase()}
                </div>
                <div style={{flex:1}}>
                  <div style={{color:"#e2e8f0",fontSize:14,fontWeight:600}}>{user.username}</div>
                  <div style={{color:"#6b6b80",fontSize:12}}>
                    {planInfo ? (
                      <span>{planInfo.plan === "full" ? "Full" : "Trial"}{planInfo.version ? " \u00B7 v" + planInfo.version : ""}</span>
                    ) : "Logged in"}
                  </div>
                </div>
                <button onClick={() => { setEditUsername(user.username); setEditPassword(""); setEditingProfile(true); }}
                  style={{background:"none",border:"1px solid #2a2a45",borderRadius:8,padding:"7px 14px",color:"#8a8aa0",fontSize:12,cursor:"pointer"}}
                  onMouseEnter={e=>e.target.style.color="#818cf8"} onMouseLeave={e=>e.target.style.color="#8a8aa0"}>
                  edit
                </button>
                {onLogout && (
                  <button onClick={()=>{if(window.confirm("Are you sure you want to sign out?"))onLogout()}}
                    style={{background:"none",border:"1px solid #2a2a45",borderRadius:8,padding:"7px 14px",color:"#8a8aa0",fontSize:12,cursor:"pointer"}}
                    onMouseEnter={e=>{e.target.style.color="#ef4444";e.target.style.borderColor="#5a2a2a"}}
                    onMouseLeave={e=>{e.target.style.color="#8a8aa0";e.target.style.borderColor="#2a2a45"}}>
                    sign out
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div>
              <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
                <div style={{width:40,height:40,borderRadius:10,background:"linear-gradient(135deg,#4338ca,#6366f1)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:16,fontWeight:700}}>
                  {user.username.charAt(0).toUpperCase()}
                </div>
                <div style={{color:"#e2e8f0",fontSize:14,fontWeight:600}}>Edit Profile</div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:14}}>
                <div>
                  <div style={{color:"#6b6b80",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:4}}>Username</div>
                  <input value={editUsername} onChange={e=>setEditUsername(e.target.value)}
                    style={{width:"100%",background:"#0d0d1a",border:"1px solid #2a2a45",borderRadius:8,padding:"9px 12px",color:"#e2e8f0",fontSize:13,outline:"none"}}
                    onFocus={e=>e.target.style.borderColor="#4338ca"} onBlur={e=>e.target.style.borderColor="#2a2a45"} />
                </div>
                <div>
                  <div style={{color:"#6b6b80",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:4}}>New Password</div>
                  <input value={editPassword} onChange={e=>setEditPassword(e.target.value)} type="password" placeholder="Leave empty to keep current"
                    style={{width:"100%",background:"#0d0d1a",border:"1px solid #2a2a45",borderRadius:8,padding:"9px 12px",color:"#e2e8f0",fontSize:13,outline:"none"}}
                    onFocus={e=>e.target.style.borderColor="#4338ca"} onBlur={e=>e.target.style.borderColor="#2a2a45"} />
                </div>
              </div>
              <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                <button onClick={() => setEditingProfile(false)}
                  style={{background:"none",border:"1px solid #2a2a45",borderRadius:8,padding:"8px 16px",color:"#8a8aa0",fontSize:12,cursor:"pointer"}}>
                  cancel
                </button>
                <button disabled={profileSaving} onClick={async () => {
                  const body = {};
                  if (editUsername.trim() && editUsername.trim() !== user.username) body.username = editUsername.trim();
                  if (editPassword) body.password = editPassword;
                  if (Object.keys(body).length === 0) { setEditingProfile(false); return; }
                  setProfileSaving(true);
                  try {
                    const data = await api.updateProfile(body);
                    if (data.user) setUser(data.user);
                    setEditingProfile(false);
                    showToast("Profile updated");
                  } catch (e) { showToast(e.message || "Failed to update profile"); }
                  setProfileSaving(false);
                }}
                  style={{background:"linear-gradient(135deg,#4338ca,#6366f1)",border:"none",borderRadius:8,padding:"8px 16px",color:"#fff",fontSize:12,cursor:profileSaving?"default":"pointer",fontWeight:600,opacity:profileSaving?0.5:1}}>
                  {profileSaving ? "saving..." : "save"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab bar */}
      <div style={{display:"flex",gap:4,marginBottom:20,background:"#0d0d1a",borderRadius:12,padding:4}}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setSettingsTab(t.id)}
            style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"10px 14px",borderRadius:10,border:"none",
              background: settingsTab === t.id ? "#1e1e35" : "transparent",
              color: settingsTab === t.id ? "#e2e8f0" : "#6b6b80",
              fontSize:13,fontWeight: settingsTab === t.id ? 600 : 400,
              cursor:"pointer",transition:"all 0.15s"}}>
            <span style={{fontSize:13}}>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {/* ===== GENERAL TAB ===== */}
      {settingsTab === "general" && (
        <div>
          {/* Sessions */}
          <div style={sec}>
            <div style={secT}>🎯 Sessions</div>
            <div style={{marginBottom:16}}>
              <div style={{color:"#e2e8f0",fontSize:13,marginBottom:6}}>Session length</div>
              <div style={{color:"#6b6b80",fontSize:11,marginBottom:8}}>Controls classic comparisons per round ({draftSessionLength === "short" ? "2" : draftSessionLength === "medium" ? "3" : "5"} per round)</div>
              <SegmentPicker value={draftSessionLength} onChange={setDraftSessionLength}
                options={[{value:"short",label:"Short"},{value:"medium",label:"Medium"},{value:"long",label:"Long"}]} />
            </div>
            <div>
              <div style={{color:"#e2e8f0",fontSize:13,marginBottom:6}}>Bracket size</div>
              <div style={{color:"#6b6b80",fontSize:11,marginBottom:8}}>Number of songs in each bracket tournament</div>
              <SegmentPicker value={draftBracketSize} onChange={setDraftBracketSize}
                options={[{value:4,label:"4"},{value:8,label:"8"},{value:16,label:"16"}]} />
            </div>
          </div>

          {/* Display */}
          <div style={sec}>
            <div style={secT}>🎨 Display</div>
            <Toggle value={draftVariance} onChange={setDraftVariance} label="Show Elo variance" desc="Display ± range next to Elo scores in rankings" />
            <div style={{height:1,background:"#1e1e35",margin:"4px 0"}} />
            <Toggle value={draftWinLoss} onChange={setDraftWinLoss} label="Show win/loss record" desc="Display W/L next to songs in rankings" />
            <div style={{height:1,background:"#1e1e35",margin:"4px 0"}} />
            <div style={{padding:"8px 0"}}>
              <div style={{color:"#e2e8f0",fontSize:13,marginBottom:6}}>Row density</div>
              <div style={{color:"#6b6b80",fontSize:11,marginBottom:8}}>Song row size in library and rankings</div>
              <SegmentPicker value={draftRowDensity} onChange={setDraftRowDensity}
                options={[{value:"compact",label:"Compact"},{value:"comfortable",label:"Comfortable"}]} />
            </div>
          </div>

          {/* Save button */}
          <div style={{display:"flex",justifyContent:"flex-end",marginTop:4}}>
            <button onClick={() => {
              setShowVariance(draftVariance);
              setShowWinLoss(draftWinLoss);
              setSessionLength(draftSessionLength);
              setBracketSize(draftBracketSize);
              setRowDensity(draftRowDensity);
              setSaved(true); showToast("Settings saved"); setTimeout(() => setSaved(false), 2000);
            }}
              style={{background: saved ? "linear-gradient(135deg,#22c55e,#16a34a)" : "linear-gradient(135deg,#4338ca,#6366f1)",border:"none",borderRadius:10,padding:"10px 24px",color:"#fff",fontSize:13,cursor:"pointer",fontWeight:600,transition:"background 0.2s"}}>
              {saved ? "Saved" : "Save"}
            </button>
          </div>
        </div>
      )}

      {/* ===== GENRES TAB ===== */}
      {settingsTab === "genres" && (
        <div style={sec}>
          <div style={secT}>🏷️ Genres</div>
          <p style={{color:"#6b6b80",fontSize:12,marginBottom:12,marginTop:-8}}>Organize your songs into categories. Click a genre name to rename it.</p>
          <div style={{display:"flex",gap:8,marginBottom:16}}>
            <input value={newGenre} onChange={e=>setNewGenre(e.target.value)}
              onKeyDown={e=>{if(e.key==="Enter")addGenre()}}
              placeholder="New genre..."
              style={{flex:1,background:"#0d0d1a",border:"1px solid #2a2a45",borderRadius:10,padding:"10px 14px",color:"#e2e8f0",fontSize:13,outline:"none",transition:"border-color 0.2s"}}
              onFocus={e=>e.target.style.borderColor="#4338ca"} onBlur={e=>e.target.style.borderColor="#2a2a45"} />
            <button onClick={addGenre} style={{background:"linear-gradient(135deg,#4338ca,#6366f1)",border:"none",borderRadius:10,padding:"10px 18px",color:"#fff",fontSize:13,cursor:"pointer",fontWeight:600,whiteSpace:"nowrap"}}>+ add</button>
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:8,maxHeight:300,overflowY:"auto",padding:"2px 0"}}>
            {genres.map(g => (
              <div key={g} style={{display:"flex",alignItems:"center",gap:6,background:"#0d0d1a",border:"1px solid #2a2a45",borderRadius:10,padding:"6px 12px"}}>
                {editingGenre === g ? (
                  <input value={editName} onChange={e=>setEditName(e.target.value)}
                    onKeyDown={e=>{if(e.key==="Enter")saveEdit();if(e.key==="Escape")setEditingGenre(null)}}
                    onBlur={saveEdit} autoFocus
                    style={{background:"transparent",border:"none",borderBottom:"1px solid #4338ca",padding:"0 2px",color:"#e2e8f0",fontSize:13,outline:"none",width:Math.max(50, editName.length * 8)}} />
                ) : (
                  <span style={{color:"#e2e8f0",fontSize:13,cursor:"pointer"}} onClick={()=>startEdit(g)}>{g}</span>
                )}
                {editingGenre !== g && (
                  <button onClick={()=>deleteGenre(g)} style={{background:"none",border:"none",color:"#6b6b80",cursor:"pointer",fontSize:12,padding:0,lineHeight:1}}
                    onMouseEnter={e=>e.target.style.color="#ef4444"} onMouseLeave={e=>e.target.style.color="#6b6b80"}>✕</button>
                )}
              </div>
            ))}
            {genres.length === 0 && <span style={{color:"#6b6b80",fontSize:13}}>No genres yet</span>}
          </div>
        </div>
      )}

      {/* ===== DATA TAB ===== */}
      {settingsTab === "data" && (
        <div>
          {/* Export */}
          <div style={sec}>
            <div style={secT}>📤 Export</div>
            <p style={{color:"#6b6b80",fontSize:12,marginBottom:12,marginTop:-8}}>Download your rankings or playlists to use in other apps.</p>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                <span style={{color:"#8a8aa0",fontSize:12,minWidth:80}}>Rankings</span>
                <button onClick={exportRankingsText} style={{background:"none",border:"1px solid #2a2a45",borderRadius:8,padding:"7px 14px",color:"#8a8aa0",fontSize:12,cursor:"pointer"}}
                  onMouseEnter={e=>e.target.style.color="#818cf8"} onMouseLeave={e=>e.target.style.color="#8a8aa0"}>copy as text</button>
                <button onClick={exportRankingsCSV} style={{background:"none",border:"1px solid #2a2a45",borderRadius:8,padding:"7px 14px",color:"#8a8aa0",fontSize:12,cursor:"pointer"}}
                  onMouseEnter={e=>e.target.style.color="#818cf8"} onMouseLeave={e=>e.target.style.color="#8a8aa0"}>download CSV</button>
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                <span style={{color:"#8a8aa0",fontSize:12,minWidth:80}}>Playlists</span>
                {playlists.length > 0 ? (
                  <div>
                    <button onClick={() => setShowExportPlaylists(!showExportPlaylists)}
                      style={{background:"none",border:"1px solid #2a2a45",borderRadius:8,padding:"7px 14px",color:"#8a8aa0",fontSize:12,cursor:"pointer"}}
                      onMouseEnter={e=>e.target.style.color="#818cf8"} onMouseLeave={e=>e.target.style.color="#8a8aa0"}>
                      {showExportPlaylists ? "hide" : "export as .m3u"} ({playlists.length})
                    </button>
                    {showExportPlaylists && (
                      <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:8}}>
                        {playlists.map(pl => (
                          <button key={pl.id} onClick={() => {
                            const plSongs = pl.songIds ? pl.songIds.map(id => songs.find(s=>s.id===id)).filter(Boolean) : [];
                            if (!plSongs.length) return;
                            const m3u = "#EXTM3U\n" + plSongs.filter(s=>s.audioFile).map(s => "#EXTINF:-1," + s.title + "\n" + (s.audioFile.startsWith("idb:") && s.audioName ? s.audioName : s.audioFile)).join("\n");
                            const blob = new Blob([m3u], { type: "audio/x-mpegurl" });
                            const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = pl.name + ".m3u"; a.click(); URL.revokeObjectURL(url);
                            showToast(pl.name + ".m3u downloaded");
                          }} style={{background:"none",border:"1px solid #2a2a45",borderRadius:8,padding:"7px 14px",color:"#8a8aa0",fontSize:12,cursor:"pointer"}}
                            onMouseEnter={e=>e.target.style.color="#818cf8"} onMouseLeave={e=>e.target.style.color="#8a8aa0"}>{pl.name}</button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : <span style={{color:"#6b6b80",fontSize:12}}>No playlists</span>}
              </div>
            </div>
          </div>

          {/* Backup */}
          <div style={sec}>
            <div style={secT}>💾 Backup</div>
            <p style={{color:"#6b6b80",fontSize:12,marginBottom:12,marginTop:-8}}>Save a snapshot of everything — songs, rankings, playlists, genres, and listening history.</p>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <button onClick={exportBackup} style={{background:"linear-gradient(135deg,#4338ca,#6366f1)",border:"none",borderRadius:10,padding:"10px 18px",color:"#fff",fontSize:13,cursor:"pointer",fontWeight:600}}>download full backup</button>
              <button onClick={serverBackup} style={{background:"none",border:"1px solid #2a2a45",borderRadius:10,padding:"10px 18px",color:"#8a8aa0",fontSize:13,cursor:"pointer"}}
                onMouseEnter={e=>e.target.style.color="#22c55e"} onMouseLeave={e=>e.target.style.color="#8a8aa0"}>server backup</button>
            </div>
          </div>

          {/* Import */}
          <div style={sec}>
            <div style={secT}>📥 Import</div>
            <p style={{color:"#6b6b80",fontSize:12,marginBottom:12,marginTop:-8}}>Restore from a backup file. This replaces all your current data.</p>
            <div
              onDrop={e=>{e.preventDefault();setImportDragging(false);const f=e.dataTransfer.files[0];if(f&&f.name.endsWith('.json'))importBackup(f);}}
              onDragOver={e=>{e.preventDefault();setImportDragging(true);}}
              onDragLeave={()=>setImportDragging(false)}
              onClick={()=>importInputRef.current?.click()}
              style={{
                border:importDragging?"2px solid #818cf8":"2px dashed #2a2a45",
                borderRadius:14,padding:"28px 20px",textAlign:"center",
                cursor:importing?"default":"pointer",transition:"all 0.3s",
                background:importDragging?"#4338ca11":"#0d0d1a",
                opacity:importing?0.5:1,
              }}
            >
              <input ref={importInputRef} type="file" accept=".json" onChange={e=>{importBackup(e.target.files[0]);e.target.value="";}} style={{display:"none"}} disabled={importing} />
              <div style={{fontSize:28,marginBottom:8,opacity:0.5}}>{importing?"⏳":"📂"}</div>
              <p style={{color:importing?"#818cf8":"#8a8aa0",fontSize:13,marginBottom:4}}>
                {importing?"Importing...":"Drag & drop a backup file here"}
              </p>
              <p style={{color:"#5a5a70",fontSize:11}}>or click to browse · .json files only</p>
            </div>
          </div>

          {/* Delete Data */}
          <div style={{...sec,borderColor:"#3a1a1a"}}>
            <div style={{...secT,color:"#ef4444"}}>🗑️ Delete Data</div>
            <p style={{color:"#6b6b80",fontSize:12,marginBottom:12,marginTop:-8}}>Permanently remove selected data from your account.</p>
          {(() => {
            const effectiveComps = delSongs || delComps;
            const effectivePlaylists = delSongs || delPlaylists;
            const nothingSelected = !delSongs && !delComps && !delPlaylists && !delGenres && !delListenHistory;

            const summaryParts = [];
            if (delSongs) summaryParts.push(songs.length + " songs");
            if (effectiveComps) summaryParts.push(comparisons.length + " comparisons");
            if (effectivePlaylists) summaryParts.push(playlists.length + " playlists");
            if (delGenres) summaryParts.push(genres.length + " genres");
            if (delListenHistory) summaryParts.push("listening history");

            const runDelete = async () => {
              setDeleting(true);
              try {
                if (effectiveComps) await api.del("/api/comparisons");
                if (effectivePlaylists) for (const pl of playlists) await api.del("/api/playlists/" + pl.id);
                if (delSongs) for (const s of songs) await api.del("/api/songs/" + s.id);
                if (delGenres) for (const g of genres) await api.del("/api/genres/" + encodeURIComponent(g));
                if (delListenHistory) { await api.del("/api/listen-times"); setListenTimes({}); listenTimesRef.current = {}; }
                if (delSongs) localStorage.clear();
                await onRefresh();
                showToast("Deleted " + summaryParts.join(", "));
              } catch (e) { showToast("Error during deletion"); }
              setDeleting(false);
              setShowDelModal(false);
              setConfirmDel(false);
              setDelSongs(false); setDelComps(false); setDelPlaylists(false); setDelGenres(false); setDelListenHistory(false);
            };

            const openModal = () => {
              setShowDelModal(true);
              setConfirmDel(false);
              setDelSongs(false); setDelComps(false); setDelPlaylists(false); setDelGenres(false); setDelListenHistory(false);
            };

            const CheckRow = ({ checked, onChange, label, count, note, disabled }) => (
              <label style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:"1px solid #1e1e35",cursor:disabled?"default":"pointer",opacity:disabled?0.5:1}}>
                <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled}
                  style={{accentColor:"#ef4444",width:16,height:16,cursor:disabled?"default":"pointer"}} />
                <div style={{flex:1}}>
                  <span style={{color:"#e2e8f0",fontSize:13}}>{label}</span>
                  {note && <span style={{color:"#6b6b80",fontSize:11,marginLeft:6}}>{note}</span>}
                </div>
                <span style={{color:"#6b6b80",fontSize:12}}>{count}</span>
              </label>
            );

            return (
              <div>
                <button onClick={openModal} style={{background:"none",border:"1px solid #5a2a2a",borderRadius:10,padding:"10px 18px",color:"#8a8aa0",fontSize:13,cursor:"pointer"}}
                  onMouseEnter={e=>{e.target.style.color="#ef4444";e.target.style.borderColor="#ef4444"}}
                  onMouseLeave={e=>{e.target.style.color="#8a8aa0";e.target.style.borderColor="#5a2a2a"}}>delete data</button>

                {showDelModal && (
                  <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}
                    onClick={()=>{if(!deleting){setShowDelModal(false);setConfirmDel(false)}}}>
                    <div onClick={e=>e.stopPropagation()} style={{background:"#14142a",border:"1px solid #2a2a45",borderRadius:20,padding:"28px 28px 24px",maxWidth:440,width:"100%",animation:"fadeUp 0.3s ease-out",boxShadow:"0 20px 60px rgba(0,0,0,0.5)"}}>

                      {!confirmDel ? (
                        <div>
                          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
                            <span style={{fontSize:22}}>🗑</span>
                            <h2 style={{margin:0,color:"#e2e8f0",fontSize:18,fontWeight:600}}>Delete Data</h2>
                          </div>
                          <p style={{color:"#8a8aa0",fontSize:12,marginBottom:16}}>Select what you want to delete. This cannot be undone.</p>

                          <div style={{marginBottom:16}}>
                            <CheckRow checked={delSongs} onChange={e=>setDelSongs(e.target.checked)}
                              label="Songs" count={songs.length} note="(also deletes comparisons & playlists)" />
                            <CheckRow checked={effectiveComps} onChange={e=>setDelComps(e.target.checked)}
                              label="Comparisons" count={comparisons.length} disabled={delSongs} />
                            <CheckRow checked={effectivePlaylists} onChange={e=>setDelPlaylists(e.target.checked)}
                              label="Playlists" count={playlists.length} disabled={delSongs} />
                            <CheckRow checked={delGenres} onChange={e=>setDelGenres(e.target.checked)}
                              label="Genres" count={genres.length} />
                            <CheckRow checked={delListenHistory} onChange={e=>setDelListenHistory(e.target.checked)}
                              label="Listening history" count={Object.keys(listenTimes).filter(id => listenTimes[id] > 0).length + " songs"} />
                          </div>

                          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                            <button onClick={()=>setShowDelModal(false)} style={{background:"none",border:"1px solid #2a2a45",borderRadius:10,padding:"10px 18px",color:"#8a8aa0",fontSize:13,cursor:"pointer"}}>cancel</button>
                            <button onClick={()=>setConfirmDel(true)} disabled={nothingSelected}
                              style={{background:nothingSelected?"#1a1a2e":"none",border:"1px solid "+(nothingSelected?"#2a2a45":"#ef4444"),borderRadius:10,padding:"10px 18px",color:nothingSelected?"#5a5a70":"#ef4444",fontSize:13,cursor:nothingSelected?"default":"pointer",fontWeight:600}}>
                              continue
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
                            <span style={{fontSize:22}}>⚠️</span>
                            <h2 style={{margin:0,color:"#ef4444",fontSize:18,fontWeight:600}}>Are you sure?</h2>
                          </div>
                          <p style={{color:"#8a8aa0",fontSize:13,marginBottom:12}}>You are about to permanently delete:</p>
                          <div style={{background:"#0d0d1a",border:"1px solid #1e1e35",borderRadius:10,padding:"12px 16px",marginBottom:20}}>
                            {summaryParts.map((s,i) => (
                              <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 0",color:"#e2e8f0",fontSize:13}}>
                                <span style={{color:"#ef4444"}}>✕</span> {s}
                              </div>
                            ))}
                          </div>
                          <p style={{color:"#ef4444",fontSize:12,marginBottom:16}}>This action cannot be undone.</p>
                          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                            <button onClick={()=>setConfirmDel(false)} style={{background:"none",border:"1px solid #2a2a45",borderRadius:10,padding:"10px 18px",color:"#8a8aa0",fontSize:13,cursor:"pointer"}}>go back</button>
                            <button onClick={runDelete} disabled={deleting}
                              style={{background:"#ef4444",border:"none",borderRadius:10,padding:"10px 18px",color:"#fff",fontSize:13,cursor:deleting?"default":"pointer",fontWeight:600,opacity:deleting?0.5:1}}>
                              {deleting ? "deleting..." : "permanently delete"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
          </div>
        </div>
      )}
    </div>
  );
}

export default SettingsTab;
