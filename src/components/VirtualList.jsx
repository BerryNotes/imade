import React, { useState, useEffect, useRef } from 'react';

function VirtualList({ items, rowHeight, renderRow, overScan, gap }) {
  const containerRef = useRef(null);
  const os = overScan || 4;
  const g = gap || 6;
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 20 });
  const justMounted = useRef(true);

  useEffect(() => {
    const timer = setTimeout(() => { justMounted.current = false; }, 600);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const update = () => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const viewTop = -rect.top;
      const viewBottom = viewTop + window.innerHeight;
      const itemStep = rowHeight + g;
      const start = Math.max(0, Math.floor(viewTop / itemStep) - os);
      const end = Math.min(items.length, Math.ceil(viewBottom / itemStep) + os);
      setVisibleRange({ start, end });
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });
    return () => { window.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, [items.length, rowHeight, os, g]);

  const totalHeight = items.length * (rowHeight + g) - (items.length > 0 ? g : 0);
  const visibleItems = items.slice(visibleRange.start, visibleRange.end);
  const offsetY = visibleRange.start * (rowHeight + g);

  return (
    <div ref={containerRef} style={{position:"relative",height:totalHeight}}>
      <div style={{position:"absolute",top:offsetY,left:0,right:0,display:"flex",flexDirection:"column",gap:g}}>
        {visibleItems.map((item, i) => {
          const idx = visibleRange.start + i;
          const staggerStyle = justMounted.current && idx < 10
            ? {animation:"staggerFadeIn 0.25s ease-out both", animationDelay:(idx * 30)+"ms"}
            : undefined;
          return (
            <div key={item.id || idx} style={staggerStyle}>
              {renderRow(item, idx)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default VirtualList;
