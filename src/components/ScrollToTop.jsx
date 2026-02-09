import React, { useState, useEffect } from 'react';

function ScrollToTop() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  if (!visible) return null;
  return (
    <button onClick={() => {
      const start = window.scrollY;
      const duration = Math.min(200, start / 5);
      const startTime = performance.now();
      const step = (now) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 3);
        window.scrollTo(0, start * (1 - ease));
        if (progress < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }}
      style={{position:"fixed",bottom:24,right:24,width:40,height:40,borderRadius:"50%",background:"linear-gradient(135deg,#4338ca,#6366f1)",border:"none",color:"#fff",fontSize:18,cursor:"pointer",boxShadow:"0 4px 16px rgba(99,102,241,0.3)",zIndex:50,display:"flex",alignItems:"center",justifyContent:"center",animation:"fadeUp 0.2s ease-out"}}>
      ↑
    </button>
  );
}

export default ScrollToTop;
