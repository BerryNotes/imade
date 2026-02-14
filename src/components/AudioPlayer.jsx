import React, { useState, useEffect, useRef } from 'react';
import { useGlobalAudio } from './AudioProvider';
import { formatTime } from '../utils';

function AudioPlayer({ src, compact }) {
  const progRef = useRef(null);
  const draggingRef = useRef(false);
  const narrow = typeof window !== 'undefined' && window.innerWidth < 640;
  const { toggle, skip, seek, playingSrc, currentTime, duration, isPlaying, subscribe } = useGlobalAudio();
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    return subscribe(() => forceUpdate(n => n + 1));
  }, [subscribe]);

  const isMine = playingSrc === src;
  const playing = isMine && isPlaying;
  const ct = isMine ? currentTime : 0;
  const dur = isMine ? duration : 0;

  const handleToggle = (e) => {
    if (e) { e.stopPropagation(); e.preventDefault(); }
    toggle(src);
  };

  const handleSkip = (e, secs) => {
    e.stopPropagation();
    if (!isMine) return;
    skip(secs);
  };

  const seekTo = (e) => {
    if (!progRef.current || !isMine || !dur) return;
    const rect = progRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seek(pct * dur);
  };

  const onPointerDown = (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (!isMine && !playing) { toggle(src); return; }
    draggingRef.current = true;
    seekTo(e);
    const onMove = (ev) => { if (draggingRef.current) seekTo(ev); };
    const onUp = () => { draggingRef.current = false; window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const pct = dur ? (ct / dur * 100) : 0;
  const btnStyle = {background:"none",border:"none",cursor:"pointer",color:"#6b7280",fontSize:13,padding:"0 2px",display:"flex",alignItems:"center",transition:"color 0.15s"};

  return (
    <div onClick={e=>e.stopPropagation()} style={{display:"flex",alignItems:"center",gap:narrow?4:8,background:"#1a1a2e",borderRadius:10,padding:compact?"6px 10px":narrow?"6px 8px":"8px 14px"}}>
      {!narrow && <button onClick={(e)=>handleSkip(e,-10)} style={btnStyle}
        onMouseEnter={e=>e.target.style.color="#818cf8"} onMouseLeave={e=>e.target.style.color="#6b7280"}>⟲</button>}
      <button onClick={handleToggle} style={{background:"none",border:"none",cursor:"pointer",color:playing?"#f59e0b":"#818cf8",padding:0,display:"flex",alignItems:"center"}}>
        {playing?React.createElement("svg",{width:compact?18:22,height:compact?18:22,viewBox:"0 0 24 24",fill:"currentColor"},React.createElement("rect",{x:"6",y:"4",width:"4",height:"16",rx:"1"}),React.createElement("rect",{x:"14",y:"4",width:"4",height:"16",rx:"1"})):React.createElement("svg",{width:compact?18:22,height:compact?18:22,viewBox:"0 0 24 24",fill:"currentColor"},React.createElement("polygon",{points:"6,4 20,12 6,20"}))}</button>
      {!narrow && <button onClick={(e)=>handleSkip(e,10)} style={btnStyle}
        onMouseEnter={e=>e.target.style.color="#818cf8"} onMouseLeave={e=>e.target.style.color="#6b7280"}>⟳</button>}
      <span style={{color:"#6b7280",fontSize:narrow?10:12,minWidth:narrow?28:36}}>{formatTime(ct)}</span>
      <div ref={progRef} onPointerDown={onPointerDown}
        style={{flex:1,height:16,display:"flex",alignItems:"center",cursor:"pointer",position:"relative",minWidth:narrow?40:60,touchAction:"none"}}>
        <div style={{position:"absolute",left:0,right:0,height:6,background:"#2a2a3e",borderRadius:3}}>
          <div style={{width:pct+"%",height:"100%",background:playing?"linear-gradient(90deg,#f59e0b,#fbbf24)":"linear-gradient(90deg,#818cf8,#a78bfa)",borderRadius:3,transition:"width 0.15s linear"}} />
        </div>
        <div style={{position:"absolute",left:"calc("+pct+"% - 7px)",width:14,height:14,borderRadius:"50%",background:playing?"#f59e0b":"#818cf8",boxShadow:playing?"0 0 6px rgba(245,158,11,0.5)":"0 0 6px rgba(129,140,248,0.5)",transition:draggingRef.current?"none":"left 0.1s linear"}} />
      </div>
      <span style={{color:"#6b7280",fontSize:narrow?10:12,minWidth:narrow?28:36}}>{formatTime(dur)}</span>
    </div>
  );
}

export default AudioPlayer;
