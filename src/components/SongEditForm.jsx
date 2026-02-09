import React, { useState } from 'react';

function SongEditForm({ song, genres, onSave, onCancel }) {
  const [title, setTitle] = useState(song?.title || "");
  const [date, setDate] = useState(song?.date || new Date().toISOString().split("T")[0]);
  const [genre, setGenre] = useState(song?.genre || "");
  const [audioFile, setAudioFile] = useState(null);
  const [audioName, setAudioName] = useState(song?.audioName || "");
  const [submitting, setSubmitting] = useState(false);

  const inputStyle = {width:"100%",boxSizing:"border-box",background:"#12121f",border:"1px solid #2a2a45",borderRadius:10,padding:"12px 16px",color:"#e2e8f0",fontSize:15,outline:"none",transition:"border-color 0.2s"};
  const labelStyle = {color:"#6b7280",fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:6,display:"block"};

  const handleSubmit = async () => {
    if (!title.trim()||submitting) return;
    setSubmitting(true);
    const fd = new FormData();
    fd.append("title",title.trim());
    fd.append("date",date);
    fd.append("genre",genre);
    if (audioFile) fd.append("audio",audioFile);
    try { await onSave(fd, song?.id); } finally { setSubmitting(false); }
  };

  return (
    <div>
      <h2 style={{margin:"0 0 24px",color:"#e2e8f0",fontSize:28,fontWeight:400}}>{song?"Edit Song":"Add Song"}</h2>
      <div style={{display:"flex",flexDirection:"column",gap:18}}>
        <div>
          <label style={labelStyle}>Title</label>
          <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Song name" style={inputStyle}
            onFocus={e=>e.target.style.borderColor="#4338ca"} onBlur={e=>e.target.style.borderColor="#2a2a45"} />
        </div>
        <div style={{display:"flex",gap:14}}>
          <div style={{flex:1}}>
            <label style={labelStyle}>Date</label>
            <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={inputStyle}/>
          </div>
          <div style={{flex:1}}>
            <label style={labelStyle}>Genre</label>
            <select value={genre} onChange={e=>setGenre(e.target.value)} style={{...inputStyle,cursor:"pointer",appearance:"none"}}>
              <option value="">No genre</option>
              {genres.map(g=><option key={g} value={g}>{g}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label style={labelStyle}>Audio File</label>
          <label style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,padding:16,background:"#12121f",border:"2px dashed #2a2a45",borderRadius:12,cursor:"pointer",color:(audioFile||song?.audioFile)?"#818cf8":"#6b7280",fontSize:14,transition:"all 0.2s"}}
            onMouseEnter={e=>e.currentTarget.style.borderColor="#4338ca"} onMouseLeave={e=>e.currentTarget.style.borderColor="#2a2a45"}>
            <input type="file" accept="audio/mpeg,audio/wav,audio/ogg,audio/flac,audio/aac,audio/mp4,audio/webm,audio/x-m4a" onChange={e=>{const f=e.target.files?.[0];if(f){if(f.type==="audio/midi"||f.type==="audio/x-midi"||f.name.toLowerCase().endsWith(".mid")||f.name.toLowerCase().endsWith(".midi")){return}setAudioFile(f);setAudioName(f.name)}}} style={{display:"none"}} />
            {audioFile?"♪ "+audioName:song?.audioName?"♪ "+song.audioName+" (keep)":"↑ Upload audio"}
          </label>
        </div>
        <div style={{display:"flex",gap:12,marginTop:8}}>
          <button onClick={onCancel} style={{flex:1,padding:14,borderRadius:12,background:"none",border:"1px solid #2a2a45",color:"#6b7280",fontSize:15,cursor:"pointer",}}
            onMouseEnter={e=>{e.target.style.borderColor="#6b7280";e.target.style.color="#e2e8f0"}} onMouseLeave={e=>{e.target.style.borderColor="#2a2a45";e.target.style.color="#6b7280"}}>cancel</button>
          <button onClick={handleSubmit} disabled={!title.trim()||submitting} style={{flex:2,padding:14,borderRadius:12,background:title.trim()?"linear-gradient(135deg,#4338ca,#6366f1)":"#2a2a40",border:"none",color:title.trim()?"#fff":"#555",fontSize:15,cursor:title.trim()?"pointer":"default",fontWeight:600,boxShadow:title.trim()?"0 4px 20px rgba(99,102,241,0.3)":"none",opacity:submitting?0.6:1}}>
            {submitting?"saving...":song?"save changes":"add song"}</button>
        </div>
      </div>
    </div>
  );
}

export default SongEditForm;
