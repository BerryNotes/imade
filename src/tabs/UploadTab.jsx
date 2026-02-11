import React, { useState, useRef } from 'react';

function UploadTab({ onRefresh, genres, songs, uploadFiles, setUploadFiles, uploading, uploadDone, setUploadDone, uploadProgress, startUpload, showToast }) {
  const [dragging, setDragging] = useState(false);
  const [dupes, setDupes] = useState([]);
  const inputRef = useRef(null);

  const existingNames = new Set(songs.map(s => (s.audioName || "").toLowerCase()));

  const handleFiles = (fileList) => {
    const audioFiles = Array.from(fileList).filter(f => f.type.startsWith("audio/"));
    if (!audioFiles.length) return;

    const newDupes = [];
    const newFiles = [];
    for (const f of audioFiles) {
      if (existingNames.has(f.name.toLowerCase())) {
        newDupes.push(f.name);
      } else {
        newFiles.push(f);
      }
    }

    if (newFiles.length) {
      setUploadFiles(prev => {
        const existing = new Set(prev.map(f=>f.name));
        return [...prev, ...newFiles.filter(f=>!existing.has(f.name))];
      });
    }
    if (newDupes.length) {
      setDupes(newDupes);
    }
    setUploadDone(false);
  };

  const handleDrop = (e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); };
  const handleDragOver = (e) => { e.preventDefault(); setDragging(true); };
  const handleDragLeave = () => setDragging(false);
  const removeFile = (name) => setUploadFiles(prev=>prev.filter(f=>f.name!==name));

  const uploadPct = uploadProgress.total > 0 ? uploadProgress.done / uploadProgress.total : 0;

  return (
    <div>
      <div
        onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}
        onClick={()=>inputRef.current?.click()}
        style={{
          border: dragging ? "2px solid #818cf8" : "2px dashed #2a2a45",
          borderRadius:20, padding:"60px 40px", textAlign:"center",
          cursor:"pointer", transition:"all 0.3s",
          background: dragging ? "#4338ca11" : "#12121f44",
          marginBottom:24,
        }}
        onMouseEnter={e=>e.currentTarget.style.borderColor="#4338ca55"}
        onMouseLeave={e=>{if(!dragging)e.currentTarget.style.borderColor="#2a2a45"}}
      >
        <input ref={inputRef} type="file" accept="audio/mpeg,audio/wav,audio/ogg,audio/flac,audio/aac,audio/mp4,audio/webm,audio/x-m4a" multiple onChange={e=>handleFiles(e.target.files)} style={{display:"none"}} />
        <div style={{fontSize:48,marginBottom:16,opacity:0.6}}>{ dragging ? "⬇" : "♪" }</div>
        <p style={{color:"#818cf8",fontSize:18,marginBottom:8}}>
          {dragging ? "Drop your songs here" : "Drag & drop audio files here"}
        </p>
        <p style={{color:"#6b6b80",fontSize:13}}>or click to browse · mp3, wav, flac, m4a, ogg, etc.</p>
      </div>

      {dupes.length > 0 && (
        <div style={{background:"#2d1f00",border:"1px solid #f59e0b44",borderRadius:12,padding:"14px 18px",marginBottom:16,animation:"fadeUp 0.3s ease-out"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
            <span style={{color:"#f59e0b",fontSize:14,fontWeight:600}}>⚠ {dupes.length} duplicate{dupes.length!==1?"s":""} skipped</span>
            <button onClick={()=>setDupes([])} style={{background:"none",border:"none",color:"#f59e0b88",cursor:"pointer",fontSize:14,padding:0}}
              onMouseEnter={e=>e.target.style.color="#f59e0b"} onMouseLeave={e=>e.target.style.color="#f59e0b88"}>✕</button>
          </div>
          <div style={{color:"#f59e0baa",fontSize:12,maxHeight:100,overflowY:"auto"}}>
            {dupes.map(d=><div key={d} style={{padding:"2px 0",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{d}</div>)}
          </div>
          <div style={{color:"#f59e0b66",fontSize:11,marginTop:6}}>These files already exist in your library</div>
        </div>
      )}

      {uploadFiles.length > 0 && !uploading && (
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <span style={{color:"#6b7280",fontSize:14}}>{uploadFiles.length} file{uploadFiles.length!==1?"s":""} ready</span>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setUploadFiles([])} style={{background:"none",border:"1px solid #2a2a45",borderRadius:10,padding:"8px 16px",color:"#6b7280",fontSize:13,cursor:"pointer",}}
                onMouseEnter={e=>e.target.style.color="#ef4444"} onMouseLeave={e=>e.target.style.color="#6b7280"}>clear all</button>
              <button onClick={()=>startUpload(uploadFiles)} style={{background:"linear-gradient(135deg,#4338ca,#6366f1)",border:"none",borderRadius:10,padding:"8px 24px",color:"#fff",fontSize:13,cursor:"pointer",fontWeight:600}}>
                upload all</button>
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:400,overflowY:"auto",paddingRight:4}}>
            {uploadFiles.map((f,i) => (
              <div key={f.name} style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"#16162a",border:"1px solid #2a2a40",borderRadius:10,padding:"10px 16px",animation:"slideIn 0.2s ease-out "+(i*0.03)+"s both"}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{color:"#e2e8f0",fontSize:14,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{f.name.replace(/\.[^/.]+$/,"").replace(/[-_]/g," ")}</div>
                  <div style={{color:"#6b6b80",fontSize:11,marginTop:2}}>
                    {new Date(f.lastModified).toLocaleDateString()} · {(f.size/1024/1024).toFixed(1)} MB
                  </div>
                </div>
                <button onClick={()=>removeFile(f.name)} style={{background:"none",border:"none",color:"#6b6b80",cursor:"pointer",fontSize:16,padding:"4px 8px",marginLeft:8}}
                  onMouseEnter={e=>e.target.style.color="#ef4444"} onMouseLeave={e=>e.target.style.color="#6b6b80"}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {uploading && (
        <div style={{background:"#16162a",border:"1px solid #2a2a45",borderRadius:14,padding:20,textAlign:"center"}}>
          <div style={{marginBottom:12}}>
            <span style={{color:"#818cf8",fontSize:15}}>Uploading {uploadProgress.done} / {uploadProgress.total} songs</span>
          </div>
          <div style={{height:8,background:"#1a1a2e",borderRadius:4,overflow:"hidden",marginBottom:8}}>
            <div style={{width:(uploadPct*100)+"%",height:"100%",background:"linear-gradient(90deg,#4338ca,#818cf8)",borderRadius:4,transition:"width 0.3s ease"}} />
          </div>
          <span style={{color:"#6b7280",fontSize:12}}>{Math.round(uploadPct*100)}% · You can switch tabs, upload will continue</span>
        </div>
      )}

      {uploadDone && uploadFiles.length === 0 && !uploading && (
        <div style={{textAlign:"center",padding:40,animation:"fadeUp 0.4s ease-out"}}>
          <div style={{fontSize:40,marginBottom:12}}>✓</div>
          <p style={{color:"#818cf8",fontSize:16,}}>Songs uploaded successfully!</p>
          <p style={{color:"#6b6b80",fontSize:13,marginTop:4}}>Check the Library tab to see them</p>
        </div>
      )}
    </div>
  );
}

export default UploadTab;
