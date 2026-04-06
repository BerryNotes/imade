"use client";

import { useEffect, useRef } from "react";

function AnimatedBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let time = 0;

    const colors = [
      "129, 140, 248",
      "245, 158, 11",
      "167, 139, 250",
      "99, 102, 241",
      "34, 197, 94",
      "244, 114, 182",
    ];

    interface Dot {
      x: number;
      y: number;
      vy: number;
      vx: number;
      r: number;
      color: string;
      alpha: number;
    }

    const dots: Dot[] = [];
    const GRID_SPACING = 60;

    const resize = () => {
      canvas.width = window.innerWidth * 2;
      canvas.height = window.innerHeight * 2;
      canvas.style.width = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";
      ctx.scale(2, 2);
    };
    resize();
    window.addEventListener("resize", resize);

    // Initialize scatter dots
    for (let i = 0; i < 35; i++) {
      dots.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vy: -(0.12 + Math.random() * 0.3),
        vx: (Math.random() - 0.5) * 0.25,
        r: 2 + Math.random() * 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 0.12 + Math.random() * 0.18,
      });
    }

    const draw = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);
      time += 0.012;

      // ---- Grid Pulse ----
      const cols = Math.ceil(w / GRID_SPACING) + 1;
      const rows = Math.ceil(h / GRID_SPACING) + 1;

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const x = col * GRID_SPACING;
          const y = row * GRID_SPACING;
          const dist = Math.sqrt(
            Math.pow(x - w * 0.5, 2) + Math.pow(y - h * 0.5, 2)
          );
          const pulse = Math.sin(dist * 0.008 - time) * 0.5 + 0.5;
          const alpha = 0.025 + pulse * 0.055;
          const radius = 1 + pulse * 0.8;

          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(129, 140, 248, ${alpha})`;
          ctx.fill();
        }
      }

      // ---- Rising Scatter Dots ----
      for (const dot of dots) {
        dot.y += dot.vy;
        dot.x += dot.vx;
        if (dot.y < -20) {
          dot.y = h + 20;
          dot.x = Math.random() * w;
        }
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${dot.color}, ${dot.alpha})`;
        ctx.fill();
      }

      // ---- Audio Waveform (top third only) ----
      const waveHeight = h * 0.33;
      const waves = [
        { amp: 28, freq: 0.008, speed: 1, alpha: 0.09, color: "129, 140, 248" },
        { amp: 18, freq: 0.012, speed: 1.4, alpha: 0.06, color: "129, 140, 248" },
        { amp: 12, freq: 0.006, speed: 0.7, alpha: 0.05, color: "245, 158, 11" },
      ];

      for (const wave of waves) {
        ctx.beginPath();
        ctx.strokeStyle = `rgba(${wave.color}, ${wave.alpha})`;
        ctx.lineWidth = 1.5;
        const centerY = waveHeight * 0.6;
        for (let x = 0; x < w; x += 2) {
          const y =
            centerY +
            Math.sin(x * wave.freq + time * wave.speed) * wave.amp +
            Math.sin(x * wave.freq * 2.3 + time * wave.speed * 1.5) * wave.amp * 0.4;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      animationId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        zIndex: 0,
        pointerEvents: "none",
      }}
    />
  );
}

export function BackgroundEffects() {
  return <AnimatedBackground />;
}
