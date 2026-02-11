import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useGlobalAudio } from '../components/AudioProvider';

const MODES = [
  { id: 'bars', label: 'Bars' },
  { id: 'radial', label: 'Radial' },
  { id: 'waveform', label: 'Waveform' },
  { id: 'wave', label: 'Wave' },
  { id: 'spectrograph', label: 'Spectrograph' },
  { id: 'particles', label: 'Particles' },
  { id: 'orbit', label: 'Orbit' },
  { id: 'sphere', label: 'Sphere' },
  { id: 'grid', label: 'Grid' },
  { id: 'laser', label: 'Laser' },
];

const MAX_PARTICLES = 1500;

function VisualizerTab({ songs, onFullscreen }) {
  const audio = useGlobalAudio();
  const { playingSrc, isPlaying, getAnalyser, resumeAudioContext, toggle, pause, currentTime, duration, getWaveformBuffer } = audio;
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const particlesRef = useRef([]);
  const orbitParticlesRef = useRef([]);
  const gridParticlesRef = useRef(null); // lazy-init grid of dots
  const laserCanvasRef = useRef(null);  // offscreen canvas for laser trail persistence
  const mousePosRef = useRef(null); // { x, y } or null
  const [mode, setModeState] = useState(() => {
    const stored = localStorage.getItem('imade_vizMode');
    return MODES.some(m => m.id === stored) ? stored : 'bars';
  });
  const setMode = (m) => { setModeState(m); localStorage.setItem('imade_vizMode', m); };
  const analyserRef = useRef(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef(null);
  const [mouseActive, setMouseActive] = useState(true);
  const mouseTimerRef = useRef(null);

  const currentSong = playingSrc ? songs.find(s => s.audioFile === playingSrc) : null;

  // Number keys 1-9,0 switch visualizer mode (0 = mode 10)
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      const raw = parseInt(e.key, 10);
      if (isNaN(raw)) return;
      const num = raw === 0 ? 10 : raw; // 0 key → mode 10
      if (num >= 1 && num <= MODES.length) {
        e.preventDefault();
        const m = MODES[num - 1];
        setMode(m.id);
        particlesRef.current = [];
        orbitParticlesRef.current = [];
        ringIndexRef.current = 0;
        particleSpawnedRef.current = 0;
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownOpen]);

  // Track fullscreen changes
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else if (containerRef.current) {
      containerRef.current.requestFullscreen();
    }
  };

  // Init analyser on first interaction / when playing
  const ensureAnalyser = useCallback(() => {
    if (analyserRef.current) return analyserRef.current;
    const a = getAnalyser();
    if (a) analyserRef.current = a;
    return a;
  }, [getAnalyser]);

  useEffect(() => {
    if (isPlaying) {
      resumeAudioContext();
      ensureAnalyser();
    }
  }, [isPlaying, resumeAudioContext, ensureAnalyser]);

  const sphereTimeRef = useRef(0);
  const isPlayingRef = useRef(false);
  const playingSrcRef = useRef(null);
  const prevDimsRef = useRef({ w: 0, h: 0 });
  const vizTimeRef = useRef(0);       // accumulated viz time (pauses when song pauses)
  const lastRealTimeRef = useRef(0);  // last real timestamp we drew a frame
  const ringIndexRef = useRef(0);     // counter for evenly distributing orbit particles
  const prevSongRef = useRef(null);   // detect song changes to reset particles
  const particleSpawnedRef = useRef(0); // total particles spawned this song (cap for one-round)
  const waveBufferRef = useRef(null);  // legacy — kept for compat
  const waveWriteRef = useRef(0);
  const spectroCanvasRef = useRef(null); // offscreen spectrograph history canvas
  const spectroWriteRef = useRef(0);     // write column position
  const currentTimeRef = useRef(0);
  const durationRef = useRef(0);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { playingSrcRef.current = playingSrc; }, [playingSrc]);
  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);
  useEffect(() => { durationRef.current = duration; }, [duration]);

  // Animation loop — always runs so visualizations can linger after song ends
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let running = true;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const fsResize = () => setTimeout(resize, 50);
    document.addEventListener('fullscreenchange', fsResize);

    const draw = () => {
      if (!running) return;
      const w = canvas.getBoundingClientRect().width;
      const h = canvas.getBoundingClientRect().height;

      // No song playing — clear canvas, no visualization
      if (!playingSrcRef.current) {
        ctx.clearRect(0, 0, w, h);
        particlesRef.current = [];
        orbitParticlesRef.current = [];
        laserCanvasRef.current = null;
        ringIndexRef.current = 0;
        particleSpawnedRef.current = 0;
        prevSongRef.current = null;
        prevDimsRef.current = { w, h };
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      // New song — old strip particles rise up and exit, new ones spawn fresh
      if (playingSrcRef.current !== prevSongRef.current) {
        for (const p of particlesRef.current) { p.exiting = true; }
        particleSpawnedRef.current = 0;
        waveBufferRef.current = null;
        waveWriteRef.current = 0;
        spectroCanvasRef.current = null;
        spectroWriteRef.current = 0;
        prevSongRef.current = playingSrcRef.current;
      }

      // Paused — freeze (keep last frame as-is)
      if (!isPlayingRef.current) {
        lastRealTimeRef.current = 0; // reset so next frame doesn't get a huge delta
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      // Track accumulated viz time (freezes when paused)
      const realNow = performance.now() / 1000;
      const dt = lastRealTimeRef.current > 0 ? Math.min(realNow - lastRealTimeRef.current, 0.1) : 0.016;
      lastRealTimeRef.current = realNow;
      vizTimeRef.current += dt;

      // Rescale particles if canvas dimensions changed (e.g. fullscreen toggle)
      const prev = prevDimsRef.current;
      if (prev.w > 0 && prev.h > 0 && (prev.w !== w || prev.h !== h)) {
        const xScale = w / prev.w;
        const yScale = h / prev.h;
        for (const p of particlesRef.current) {
          p.x *= xScale;
          p.y *= yScale;
        }
      }
      prevDimsRef.current = { w, h };

      // Laser mode uses trail persistence instead of full clear
      if (mode === 'laser') {
        // Ensure offscreen trail canvas exists and matches size
        let lc = laserCanvasRef.current;
        const dpr = window.devicePixelRatio || 1;
        const cw = canvas.width;
        const ch = canvas.height;
        if (!lc || lc.width !== cw || lc.height !== ch) {
          lc = document.createElement('canvas');
          lc.width = cw; lc.height = ch;
          laserCanvasRef.current = lc;
        }
        const lctx = lc.getContext('2d');
        // Clear fully each frame — no trail/shadow aftereffect
        lctx.clearRect(0, 0, cw, ch);
        // Draw onto trail canvas, then composite to main
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);
        // Trail canvas will be drawn after laser draws onto it
      } else {
        ctx.clearRect(0, 0, w, h);

        // Frequency-reactive purple background — low freq darkens, high freq lightens
        const bgT = vizTimeRef.current;
        const hue1 = 262 + Math.sin(bgT * 0.2) * 8;
        const hue2 = 268 + Math.sin(bgT * 0.15 + 1) * 6;

        // Compute low vs high frequency balance from analyser if available
        let freqShift = 0; // -1 (all low) to +1 (all high)
        const tmpAnalyser = analyserRef.current;
        if (tmpAnalyser) {
          const tmpBuf = new Uint8Array(tmpAnalyser.frequencyBinCount);
          tmpAnalyser.getByteFrequencyData(tmpBuf);
          const half = Math.floor(tmpBuf.length / 2);
          let lowSum = 0, highSum = 0;
          for (let i = 0; i < half; i++) lowSum += tmpBuf[i];
          for (let i = half; i < tmpBuf.length; i++) highSum += tmpBuf[i];
          const lowAvg = lowSum / half / 255;
          const highAvg = highSum / (tmpBuf.length - half) / 255;
          freqShift = (highAvg - lowAvg); // roughly -1 to +1
        }
        const baseLightCenter = 11 + freqShift * 6;  // 5-17%
        const baseLightMid = 7 + freqShift * 4;      // 3-11%
        const baseLightEdge = 5 + freqShift * 3;     // 2-8%

        const bgGrad = ctx.createRadialGradient(w * 0.3, h * 0.3, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.8);
        bgGrad.addColorStop(0, `hsla(${hue1}, 28%, ${baseLightCenter}%, 1)`);
        bgGrad.addColorStop(0.5, `hsla(${hue2}, 22%, ${baseLightMid}%, 1)`);
        bgGrad.addColorStop(1, `hsla(${hue1 + 5}, 18%, ${baseLightEdge}%, 1)`);
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, w, h);
      }

      // Ensure analyser is connected — may not exist yet if tab opened mid-song
      if (!analyserRef.current) {
        resumeAudioContext();
        ensureAnalyser();
      }
      const analyser = analyserRef.current;
      if (!analyser) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const bufLen = analyser.frequencyBinCount;
      const freqData = new Uint8Array(bufLen);
      const timeData = new Uint8Array(analyser.fftSize);
      analyser.getByteFrequencyData(freqData);
      analyser.getByteTimeDomainData(timeData);

      sphereTimeRef.current += dt;

      if (mode === 'bars') drawBars(ctx, w, h, freqData);
      else if (mode === 'radial') drawRadial(ctx, w, h, freqData);
      else if (mode === 'waveform') drawWaveform(ctx, w, h, timeData);
      else if (mode === 'wave') drawWave(ctx, w, h, freqData);
      else if (mode === 'spectrograph') drawSpectrograph(ctx, w, h, freqData, canvas);
      else if (mode === 'particles') drawParticles(ctx, w, h, freqData, vizTimeRef.current);
      else if (mode === 'orbit') drawOrbit(ctx, w, h, freqData, vizTimeRef.current, dt);
      else if (mode === 'sphere') drawSphere(ctx, w, h, freqData);
      else if (mode === 'grid') drawGrid(ctx, w, h, freqData, vizTimeRef.current);
      else if (mode === 'laser') drawLaser(ctx, w, h, timeData, freqData, vizTimeRef.current);

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      running = false;
      window.removeEventListener('resize', resize);
      document.removeEventListener('fullscreenchange', fsResize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [mode]);

  // --- Drawing functions ---

  const drawBars = (ctx, w, h, data) => {
    const barCount = 48;
    const margin = w * 0.08;
    const usableW = w - margin * 2;
    const totalGap = usableW * 0.15;
    const gap = totalGap / (barCount + 1);
    const barW = (usableW - totalGap) / barCount;
    ctx.shadowColor = 'rgba(129,140,248,0.35)';
    ctx.shadowBlur = 16;
    for (let i = 0; i < barCount; i++) {
      const maxBin = Math.floor(data.length * 0.68); // ~15kHz, skip 15k-20k range
      const center = Math.floor(i * maxBin / barCount);
      const span = Math.max(1, Math.floor(maxBin / barCount / 2));
      let sum = 0, count = 0;
      for (let j = Math.max(0, center - span); j <= Math.min(data.length - 1, center + span); j++) { sum += data[j]; count++; }
      const val = Math.pow((sum / count) / 255, 0.75); // power curve for more dramatic movement
      const barH = val * h * 0.85;
      const x = margin + gap + i * (barW + gap);
      const pct = i / barCount;
      // Dark indigo at low freq → bright lavender at high freq
      const rC = Math.floor(80 + pct * 120);
      const gC = Math.floor(60 + pct * 130);
      const bC = Math.floor(200 + pct * 55);
      const topR = Math.min(255, rC + 40);
      const topG = Math.min(255, gC + 50);
      const topB = Math.min(255, bC + 20);
      const grad = ctx.createLinearGradient(x, h, x, h - barH);
      grad.addColorStop(0, `rgba(${rC},${gC},${bC},0.9)`);
      grad.addColorStop(1, `rgba(${topR},${topG},${topB},0.7)`);
      ctx.fillStyle = grad;
      const r = Math.min(barW / 2, 6);
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.lineTo(x, h - barH + r);
      ctx.quadraticCurveTo(x, h - barH, x + r, h - barH);
      ctx.lineTo(x + barW - r, h - barH);
      ctx.quadraticCurveTo(x + barW, h - barH, x + barW, h - barH + r);
      ctx.lineTo(x + barW, h);
      ctx.closePath();
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  };

  const drawRadial = (ctx, w, h, data) => {
    const cx = w / 2;
    const cy = h / 2;
    const innerR = Math.min(w, h) * 0.12;
    const maxR = Math.min(w, h) * 0.42;
    const barCount = 96;
    const maxBin = Math.floor(data.length * 0.68); // ~15kHz

    ctx.beginPath();
    ctx.arc(cx, cy, innerR - 1, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(26,21,53,0.4)';
    ctx.fill();

    ctx.shadowColor = 'rgba(129,140,248,0.25)';
    ctx.shadowBlur = 10;
    const lineW = Math.max(2, (Math.PI * 2 * innerR / barCount) * 0.7);
    for (let i = 0; i < barCount; i++) {
      const center = Math.floor(i * maxBin / barCount);
      const span = Math.max(1, Math.floor(maxBin / barCount));
      let sum = 0, count = 0;
      for (let j = Math.max(0, center - span); j <= Math.min(data.length - 1, center + span); j++) { sum += data[j]; count++; }
      const raw = Math.pow((sum / count) / 255, 0.75);
      const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2;
      // Scale by frequency: lows dampened (0.6x), highs boosted (1.4x)
      const freqScale = 0.6 + (i / barCount) * 0.8;
      const val = Math.min(1, raw * freqScale);
      const barLen = val * (maxR - innerR);
      const pct = i / barCount;
      // Dark indigo at low freq → bright lavender at high freq
      const lightness = 55 + pct * 30;
      ctx.strokeStyle = `hsla(${240 + pct * 40}, 65%, ${lightness}%, ${0.35 + val * 0.55})`;
      ctx.lineWidth = lineW;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * innerR, cy + Math.sin(angle) * innerR);
      ctx.lineTo(cx + Math.cos(angle) * (innerR + barLen), cy + Math.sin(angle) * (innerR + barLen));
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.lineCap = 'butt';
  };

  const drawWaveform = (ctx, w, h, data) => {
    const mid = h / 2;
    const BUFFER_SIZE = 4096; // visible samples across the screen

    // Init scrolling buffer on first call
    if (!waveBufferRef.current || waveBufferRef.current.length !== BUFFER_SIZE) {
      waveBufferRef.current = new Float32Array(BUFFER_SIZE);
      waveWriteRef.current = 0;
    }
    const buf = waveBufferRef.current;

    // Write rate synced to song duration — fills the screen by end of song
    const dur = durationRef.current;
    const time = currentTimeRef.current;
    const progress = dur > 0 ? Math.min(time / dur, 1) : 0;
    const targetWrite = Math.floor(progress * BUFFER_SIZE);
    const srcIdx = Math.floor(data.length / 2);
    const sample = (data[srcIdx] - 128) / 128;
    // Fill from current position to target (usually 0-2 samples per frame)
    while (waveWriteRef.current < targetWrite && waveWriteRef.current < BUFFER_SIZE) {
      buf[waveWriteRef.current] = sample;
      waveWriteRef.current++;
    }

    // Read the buffer as a scrolling window
    const writePos = waveWriteRef.current;
    const numPts = Math.min(BUFFER_SIZE, writePos);
    const pts = [];
    for (let i = 0; i < numPts; i++) {
      const bufIdx = ((writePos - numPts + i) % BUFFER_SIZE + BUFFER_SIZE) % BUFFER_SIZE;
      const x = (i / (BUFFER_SIZE - 1)) * w;
      const val = buf[bufIdx];
      pts.push({ x, y: mid + val * mid * 0.7 });
    }

    if (pts.length < 2) return;

    // Draw smooth curve
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const cpx = (pts[i].x + pts[i + 1].x) / 2;
      const cpy = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, cpx, cpy);
    }
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);

    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, '#22c55e');
    grad.addColorStop(0.5, '#818cf8');
    grad.addColorStop(1, '#f59e0b');
    ctx.shadowColor = 'rgba(129,140,248,0.3)';
    ctx.shadowBlur = 12;
    ctx.strokeStyle = grad;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Fill under curve
    ctx.lineTo(w, mid);
    ctx.lineTo(0, mid);
    ctx.closePath();
    const fillGrad = ctx.createLinearGradient(0, 0, w, 0);
    fillGrad.addColorStop(0, 'rgba(34,197,94,0.1)');
    fillGrad.addColorStop(0.5, 'rgba(129,140,248,0.12)');
    fillGrad.addColorStop(1, 'rgba(245,158,11,0.1)');
    ctx.fillStyle = fillGrad;
    ctx.fill();
  };

  // Fourier wave — frequency domain as a smooth curve (amplitude vs frequency)
  const drawWave = (ctx, w, h, freqData) => {
    const len = freqData.length;
    const mid = h / 2;

    // Build points from frequency data
    const pts = [];
    for (let i = 0; i < len; i++) {
      const x = (i / (len - 1)) * w;
      const val = freqData[i] / 255;
      pts.push({ x, y: mid - val * mid * 0.85 });
    }

    // Mirror below center line for symmetry
    const ptsBottom = pts.map(p => ({ x: p.x, y: mid + (mid - p.y) }));

    // Draw top curve
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const cpx = (pts[i].x + pts[i + 1].x) / 2;
      const cpy = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, cpx, cpy);
    }
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);

    // Continue to bottom curve (mirrored) to close the shape
    ctx.lineTo(ptsBottom[ptsBottom.length - 1].x, ptsBottom[ptsBottom.length - 1].y);
    for (let i = ptsBottom.length - 2; i >= 1; i--) {
      const cpx = (ptsBottom[i].x + ptsBottom[i - 1].x) / 2;
      const cpy = (ptsBottom[i].y + ptsBottom[i - 1].y) / 2;
      ctx.quadraticCurveTo(ptsBottom[i].x, ptsBottom[i].y, cpx, cpy);
    }
    ctx.lineTo(ptsBottom[0].x, ptsBottom[0].y);
    ctx.closePath();

    // Fill gradient
    const fillGrad = ctx.createLinearGradient(0, 0, w, 0);
    fillGrad.addColorStop(0, 'rgba(99,102,241,0.15)');
    fillGrad.addColorStop(0.4, 'rgba(168,85,247,0.12)');
    fillGrad.addColorStop(1, 'rgba(236,72,153,0.08)');
    ctx.fillStyle = fillGrad;
    ctx.fill();

    // Stroke top curve
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const cpx = (pts[i].x + pts[i + 1].x) / 2;
      const cpy = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, cpx, cpy);
    }
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, '#6366f1');
    grad.addColorStop(0.5, '#a855f7');
    grad.addColorStop(1, '#ec4899');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = 'rgba(139,92,246,0.4)';
    ctx.shadowBlur = 10;
    ctx.stroke();

    // Stroke bottom curve (mirrored)
    ctx.beginPath();
    ctx.moveTo(ptsBottom[0].x, ptsBottom[0].y);
    for (let i = 1; i < ptsBottom.length - 1; i++) {
      const cpx = (ptsBottom[i].x + ptsBottom[i + 1].x) / 2;
      const cpy = (ptsBottom[i].y + ptsBottom[i + 1].y) / 2;
      ctx.quadraticCurveTo(ptsBottom[i].x, ptsBottom[i].y, cpx, cpy);
    }
    ctx.lineTo(ptsBottom[ptsBottom.length - 1].x, ptsBottom[ptsBottom.length - 1].y);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Center line
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(w, mid);
    ctx.strokeStyle = 'rgba(148,163,184,0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();
  };

  // Spectrograph — scrolling frequency-vs-time heatmap
  const drawSpectrograph = (ctx, w, h, freqData, canvas) => {
    const dpr = window.devicePixelRatio || 1;
    const cw = Math.round(w * dpr);
    const ch = Math.round(h * dpr);

    // Init or resize offscreen spectrograph canvas
    let sc = spectroCanvasRef.current;
    if (!sc || sc.width !== cw || sc.height !== ch) {
      sc = document.createElement('canvas');
      sc.width = cw;
      sc.height = ch;
      spectroCanvasRef.current = sc;
      spectroWriteRef.current = 0;
    }
    const sctx = sc.getContext('2d');

    // Write one column of frequency data
    const col = spectroWriteRef.current % Math.round(w);
    const binCount = freqData.length;

    for (let i = 0; i < binCount; i++) {
      const val = freqData[i] / 255;
      // Map frequency bin to y (low freq at bottom, high at top)
      const y = Math.round((1 - i / binCount) * h);
      const barH = Math.max(Math.ceil(h / binCount), 1);

      // Color: dark blue → cyan → yellow → white based on intensity
      let r, g, b;
      if (val < 0.25) {
        const t = val / 0.25;
        r = 0; g = Math.round(t * 40); b = Math.round(30 + t * 120);
      } else if (val < 0.5) {
        const t = (val - 0.25) / 0.25;
        r = 0; g = Math.round(40 + t * 180); b = Math.round(150 + t * 60);
      } else if (val < 0.75) {
        const t = (val - 0.5) / 0.25;
        r = Math.round(t * 255); g = Math.round(220 + t * 35); b = Math.round(210 - t * 160);
      } else {
        const t = (val - 0.75) / 0.25;
        r = 255; g = 255; b = Math.round(50 + t * 205);
      }

      sctx.fillStyle = `rgb(${r},${g},${b})`;
      sctx.fillRect(col * dpr, y * dpr, dpr, barH * dpr);
    }

    spectroWriteRef.current++;

    // Draw the spectrograph onto the main canvas, scrolled so newest column is at the right
    ctx.save();
    const colPx = (col + 1) % Math.round(w);
    // Draw right portion (older data) on left side
    if (colPx < Math.round(w)) {
      ctx.drawImage(sc, colPx * dpr, 0, (Math.round(w) - colPx) * dpr, ch, 0, 0, w - colPx, h);
    }
    // Draw left portion (newer data) on right side
    if (colPx > 0) {
      ctx.drawImage(sc, 0, 0, colPx * dpr, ch, w - colPx, 0, colPx, h);
    }
    ctx.restore();

    // Frequency axis labels
    ctx.fillStyle = 'rgba(148,163,184,0.5)';
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    const sampleRate = 44100;
    const labels = [100, 500, 1000, 2000, 5000, 10000, 20000];
    for (const freq of labels) {
      if (freq > sampleRate / 2) continue;
      const bin = Math.round(freq / (sampleRate / 2) * binCount);
      const y = (1 - bin / binCount) * h;
      if (y < 15 || y > h - 5) continue;
      ctx.fillText(freq >= 1000 ? `${freq / 1000}k` : `${freq}`, 6, y + 4);
      ctx.fillRect(0, y, 3, 1);
    }

    // Playhead line at right edge
    ctx.strokeStyle = 'rgba(129,140,248,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(w - 1, 0);
    ctx.lineTo(w - 1, h);
    ctx.stroke();
  };

  const drawParticles = (ctx, w, h, data, now) => {
    const particles = particlesRef.current;

    // Compute volume and frequency
    let sum = 0, freqWeightedSum = 0, totalWeight = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i];
      freqWeightedSum += data[i] * i;
      totalWeight += data[i];
    }
    const volume = sum / data.length / 255;
    const avgFreqBin = totalWeight > 0 ? freqWeightedSum / totalWeight / data.length : 0.3;
    const activity = 0.3 + avgFreqBin * 2.5;

    // Spawn from a central strip — one round per song
    const PARTICLE_CAP = 800;
    if (particleSpawnedRef.current < PARTICLE_CAP) {
      const spawnCount = Math.min(
        Math.floor(Math.pow(volume, 0.4) * 55),
        PARTICLE_CAP - particleSpawnedRef.current
      );
      const stripCenter = w * 0.5;
      const stripSpread = w * 0.18;
      for (let i = 0; i < spawnCount && particles.length < MAX_PARTICLES; i++) {
        const fg = Math.random() > 0.45;
        particles.push({
          x: stripCenter + (Math.random() - 0.5) * stripSpread,
          y: h + Math.random() * 8,
          baseVy: -(0.15 + Math.random() * 0.35),
          size: fg ? 2.5 + Math.random() * 4.5 : 0.6 + Math.random() * 2,
          opacity: fg ? 0.35 + Math.random() * 0.35 : 0.12 + Math.random() * 0.18,
          wobbleOffset: Math.random() * Math.PI * 2,
          birthTime: now,
          sizePhase: Math.random() * Math.PI * 2,
          fg,
          drift: (Math.random() - 0.5) * 0.8,
        });
        particleSpawnedRef.current++;
      }
    }

    // Ceiling — normal particles fade out around 40% from top
    const ceiling = h * 0.35;

    // Update and remove
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      if (p.exiting) {
        // Exiting particles accelerate upward and out
        p.y -= 2.5;
        p.opacity *= 0.985;
        if (p.y < -20 || p.opacity < 0.01) { particles.splice(i, 1); continue; }
      } else {
        p.x += p.drift * activity * 0.4 + Math.sin(p.y * 0.006 + p.wobbleOffset) * 0.3;
        p.y += p.baseVy * activity;
        // Remove when past ceiling
        if (p.y < ceiling) { particles.splice(i, 1); continue; }
      }
    }

    // Draw background layer first, then foreground
    for (let pass = 0; pass < 2; pass++) {
      const isFgPass = pass === 1;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        if (p.fg !== isFgPass) continue;
        let alpha;
        if (p.exiting) {
          alpha = p.opacity;
        } else {
          // Fade as they approach the ceiling
          const fadeStart = h * 0.55;
          const fadeRange = fadeStart - ceiling;
          const fadeFactor = p.y < fadeStart ? Math.max(0, (p.y - ceiling) / fadeRange) : 1;
          alpha = p.opacity * fadeFactor;
        }
        const age = now - p.birthTime;
        const sizeMultiplier = 0.7 + 0.3 * Math.sin(age * 2.5 + p.sizePhase);
        const drawSize = p.size * sizeMultiplier;
        ctx.beginPath();
        ctx.arc(p.x, p.y, drawSize, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(129,140,248,${alpha})`;
        ctx.fill();
      }
    }
  };

  const drawOrbit = (ctx, w, h, data, now, dt) => {
    const particles = orbitParticlesRef.current;
    const mouse = mousePosRef.current;

    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    const volume = sum / data.length / 255;

    // Compute waveform amplitude for ring vibration
    let waveMax = 0;
    for (let i = 0; i < data.length; i++) {
      const v = Math.abs(data[i] - 128);
      if (v > waveMax) waveMax = v;
    }
    const waveIntensity = waveMax / 128; // 0-1

    const cx = w / 2;
    const cy = h / 2;
    const ringR = Math.min(w, h) * 0.25;
    const ringCapacity = 140;

    // Gradually spawn from all edges until ring is full
    if (particles.length < ringCapacity) {
      const spawnRate = Math.max(1, Math.floor(Math.pow(volume, 0.3) * 6));
      for (let i = 0; i < spawnRate && particles.length < ringCapacity; i++) {
        const edge = Math.floor(Math.random() * 4);
        let sx, sy;
        if (edge === 0) { sx = Math.random() * w; sy = -10; }
        else if (edge === 1) { sx = Math.random() * w; sy = h + 10; }
        else if (edge === 2) { sx = -10; sy = Math.random() * h; }
        else { sx = w + 10; sy = Math.random() * h; }
        const angle = (ringIndexRef.current / ringCapacity) * Math.PI * 2 + (Math.random() - 0.5) * 0.08;
        const fg = Math.random() > 0.45;
        particles.push({
          x: sx, y: sy,
          vx: 0, vy: 0,
          ringAngle: angle,
          size: fg ? 2 + Math.random() * 3.5 : 0.8 + Math.random() * 1.8,
          opacity: fg ? 0.45 + Math.random() * 0.3 : 0.18 + Math.random() * 0.2,
          sizePhase: Math.random() * Math.PI * 2,
          birthTime: now,
          fg,
          settled: false,
        });
        ringIndexRef.current++;
      }
    }

    // 3D rotation angles — slow spin in all three axes
    const rotX = now * 0.06;
    const rotY = now * 0.045;
    const rotZ = now * 0.03;
    const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
    const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
    const cosZ = Math.cos(rotZ), sinZ = Math.sin(rotZ);

    // Project a 3D ring point to 2D with perspective
    const project3D = (angle, r) => {
      let x3 = Math.cos(angle) * r;
      let y3 = Math.sin(angle) * r;
      let z3 = 0;
      // Rotate X
      const y1 = y3 * cosX - z3 * sinX;
      const z1 = y3 * sinX + z3 * cosX;
      // Rotate Y
      const x2 = x3 * cosY + z1 * sinY;
      const z2 = -x3 * sinY + z1 * cosY;
      // Rotate Z
      const xf = x2 * cosZ - y1 * sinZ;
      const yf = x2 * sinZ + y1 * cosZ;
      // Perspective — particles further away appear smaller
      const perspective = 600;
      const scale = perspective / (perspective + z2);
      return { x: cx + xf * scale, y: cy + yf * scale, z: z2, scale };
    };

    // Update particles
    const mouseRepelRadius = 80;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      // Target position on ring with vibration from sound wave
      const pulseR = ringR * (1 + volume * 0.12);
      const orbitSpeed = p.fg ? 0.025 : -0.018;
      p.ringAngle += orbitSpeed * dt;
      // Vibrate each particle radially based on waveform intensity
      const vibrate = waveIntensity * 8 * Math.sin(now * 25 + p.ringAngle * 5);
      const targetR = pulseR + vibrate;
      const proj = project3D(p.ringAngle, targetR);
      let tx = proj.x;
      let ty = proj.y;

      // Mouse repulsion — inverse square: closer = exponentially stronger push
      if (mouse) {
        const mdx = p.x - mouse.x;
        const mdy = p.y - mouse.y;
        const mDistSq = mdx * mdx + mdy * mdy;
        const mDist = Math.sqrt(mDistSq);
        if (mDist < mouseRepelRadius && mDist > 1) {
          const proximity = 1 - mDist / mouseRepelRadius;
          const force = proximity * proximity * 40;
          const nx = mdx / mDist;
          const ny = mdy / mDist;
          p.vx += nx * force;
          p.vy += ny * force;
        }
      }

      // Slow spring toward ring target + velocity
      const springForce = p.settled ? 0.012 : 0.02;
      p.vx += (tx - p.x) * springForce;
      p.vy += (ty - p.y) * springForce;
      p.vx *= 0.94; // gentle damping — slow snap-back
      p.vy *= 0.94;
      p.x += p.vx;
      p.y += p.vy;

      if (!p.settled) {
        const dx = p.x - tx, dy = p.y - ty;
        if (dx * dx + dy * dy < 25) p.settled = true;
      }
    }

    // Sort by depth (z stored during update) — draw far particles first
    const sorted = particles.map((p, i) => {
      const proj = project3D(p.ringAngle, ringR);
      return { idx: i, z: proj.z };
    });
    sorted.sort((a, b) => a.z - b.z);

    // Draw with glow
    ctx.shadowColor = 'rgba(129,140,248,0.2)';
    ctx.shadowBlur = 6;
    for (const { idx } of sorted) {
      const p = particles[idx];
      const proj = project3D(p.ringAngle, ringR);
      const depthScale = proj.scale;
      const depthAlpha = 0.4 + 0.6 * ((proj.z + ringR) / (2 * ringR)); // dimmer when further
      const age = now - p.birthTime;
      const sizeMultiplier = 0.7 + 0.3 * Math.sin(age * 2.5 + p.sizePhase);
      const drawSize = p.size * sizeMultiplier * (1 + volume * 0.15) * depthScale;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.5, drawSize), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(129,140,248,${(p.opacity * Math.max(0.2, depthAlpha)).toFixed(2)})`;
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  };

  const drawGrid = (ctx, w, h, data, now) => {
    const mouse = mousePosRef.current;
    const cols = 24;
    const rows = 14;
    const marginX = w * 0.08;
    const marginY = h * 0.08;
    const spacingX = (w - marginX * 2) / (cols - 1);
    const spacingY = (h - marginY * 2) / (rows - 1);

    // Init grid on first call or if dimensions changed
    let grid = gridParticlesRef.current;
    if (!grid || grid.length !== cols * rows || grid._w !== w || grid._h !== h) {
      grid = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          grid.push({
            homeX: marginX + c * spacingX,
            homeY: marginY + r * spacingY,
            x: marginX + c * spacingX,
            y: marginY + r * spacingY,
            vx: 0, vy: 0,
            col: c, row: r,
          });
        }
      }
      grid._w = w;
      grid._h = h;
      gridParticlesRef.current = grid;
    }

    // Compute volume and frequency bands for distortion
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    const volume = sum / data.length / 255;
    const boostedVol = Math.pow(volume, 0.6); // boost low volumes for visibility

    // Separate bass, mid, high for different grid effects
    const third = Math.floor(data.length / 3);
    let bassSum = 0, midSum = 0, highSum = 0;
    for (let i = 0; i < third; i++) bassSum += data[i];
    for (let i = third; i < third * 2; i++) midSum += data[i];
    for (let i = third * 2; i < data.length; i++) highSum += data[i];
    const bass = bassSum / third / 255;
    const mid = midSum / third / 255;
    const high = highSum / (data.length - third * 2) / 255;

    // Update grid dots
    const mouseRepelRadius = 80;
    const maxDisplace = Math.min(spacingX, spacingY) * 0.8; // up to 80% of spacing
    for (let i = 0; i < grid.length; i++) {
      const p = grid[i];
      // Normalized position in grid (0-1)
      const nx = p.col / (cols - 1);
      const ny = p.row / (rows - 1);

      // Bass → large slow wave from left, Mid → diagonal ripple, High → fast shimmer
      const bassWave = bass * maxDisplace * 0.7 * Math.sin(now * 1.5 + nx * Math.PI * 2);
      const midWave = mid * maxDisplace * 0.5 * Math.sin(now * 3 + (nx + ny) * Math.PI * 3);
      const highShimmer = high * maxDisplace * 0.3 * Math.sin(now * 8 + p.col * 1.2 + p.row * 0.9);

      // Combine — bass pushes Y, mid pushes both, high pushes X
      const vibX = midWave * 0.7 + highShimmer + boostedVol * 4 * Math.sin(now * 2.5 + p.col * 0.6);
      const vibY = bassWave + midWave * 0.5 + boostedVol * 3 * Math.cos(now * 1.8 + p.row * 0.7);
      const targetX = p.homeX + vibX;
      const targetY = p.homeY + vibY;

      // Mouse repulsion — inverse square, velocity-based
      if (mouse) {
        const mdx = p.x - mouse.x;
        const mdy = p.y - mouse.y;
        const mDist = Math.sqrt(mdx * mdx + mdy * mdy);
        if (mDist < mouseRepelRadius && mDist > 1) {
          const proximity = 1 - mDist / mouseRepelRadius;
          const force = proximity * proximity * 30;
          p.vx += (mdx / mDist) * force;
          p.vy += (mdy / mDist) * force;
        }
      }

      // Spring back to target — stronger spring for more reactive movement
      p.vx += (targetX - p.x) * 0.04;
      p.vy += (targetY - p.y) * 0.04;
      p.vx *= 0.88;
      p.vy *= 0.88;
      p.x += p.vx;
      p.y += p.vy;
    }

    // Draw dots — size and brightness scale with volume
    ctx.shadowColor = `rgba(129,140,248,${(0.1 + boostedVol * 0.25).toFixed(2)})`;
    ctx.shadowBlur = 4 + boostedVol * 6;
    for (let i = 0; i < grid.length; i++) {
      const p = grid[i];
      // Displacement from home = brightness boost
      const dx = p.x - p.homeX, dy = p.y - p.homeY;
      const displacement = Math.sqrt(dx * dx + dy * dy) / maxDisplace;
      const size = 1.5 + boostedVol * 3.5 + displacement * 1.5;
      const alpha = 0.25 + boostedVol * 0.45 + displacement * 0.15;
      ctx.beginPath();
      ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(129,140,248,${Math.min(1, alpha).toFixed(2)})`;
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  };

  const drawLaser = (ctx, w, h, timeData, freqData, now) => {
    const cx = w / 2;
    const cy = h / 2;
    const lc = laserCanvasRef.current;
    if (!lc) return;
    const dpr = window.devicePixelRatio || 1;
    const lctx = lc.getContext('2d');
    lctx.save();
    lctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Compute volume for intensity
    let sum = 0;
    for (let i = 0; i < freqData.length; i++) sum += freqData[i];
    const volume = sum / freqData.length / 255;
    const rawAmp = Math.pow(volume, 0.3); // steeper curve → quiet sounds register more
    const amp = Math.min(Math.max(rawAmp, 0.35), 0.85); // floor 0.35, cap 0.85

    // Lissajous X-Y mode: sample[i] → X, sample[i + offset] → Y
    // The offset creates the phase difference that produces circles/figures
    const len = timeData.length;
    const offset = Math.floor(len * 0.25); // 90° phase offset → circles
    const radius = Math.max(Math.min(w, h) * 0.45 * amp, 50);

    // Slow rotation of the whole figure
    const rot = now * 0.3;
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);

    // Collect raw points with neighbor averaging for smoothing
    const raw = [];
    const step = 2;
    const avgW = 4; // average this many neighbors on each side
    for (let i = 0; i < len; i += step) {
      let xSum = 0, ySum = 0, count = 0;
      for (let j = -avgW; j <= avgW; j++) {
        const idx = ((i + j) % len + len) % len;
        const oIdx = ((i + j + offset) % len + len) % len;
        xSum += (timeData[idx] - 128) / 128;
        ySum += (timeData[oIdx] - 128) / 128;
        count++;
      }
      const xi = xSum / count;
      const yi = ySum / count;
      const rx = xi * cosR - yi * sinR;
      const ry = xi * sinR + yi * cosR;
      raw.push({ x: cx + rx * radius, y: cy + ry * radius });
    }

    // Extra smoothing pass — weighted average of neighbors
    const pts = raw.map((p, i) => {
      const prev = raw[(i - 1 + raw.length) % raw.length];
      const next = raw[(i + 1) % raw.length];
      return { x: prev.x * 0.2 + p.x * 0.6 + next.x * 0.2, y: prev.y * 0.2 + p.y * 0.6 + next.y * 0.2 };
    });

    if (pts.length < 2) { lctx.restore(); return; }

    // Helper: draw smooth curve through points using quadratic bezier
    const drawSmooth = () => {
      lctx.beginPath();
      lctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 0; i < pts.length - 1; i++) {
        const mx = (pts[i].x + pts[i + 1].x) / 2;
        const my = (pts[i].y + pts[i + 1].y) / 2;
        lctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
      }
      lctx.quadraticCurveTo(pts[pts.length - 1].x, pts[pts.length - 1].y, pts[0].x, pts[0].y);
    };

    // Purple/indigo color — hue shifts between 260 and 280
    const laserHue = 268 + Math.sin(now * 0.4) * 12;
    const brightness = 0.4 + amp * 0.6;

    // Outer glow
    drawSmooth();
    lctx.strokeStyle = `hsla(${laserHue}, 85%, 55%, ${brightness * 0.3})`;
    lctx.lineWidth = 6 + amp * 4;
    lctx.lineCap = 'round';
    lctx.lineJoin = 'round';
    lctx.shadowColor = `hsla(${laserHue}, 90%, 65%, ${brightness * 0.5})`;
    lctx.shadowBlur = 20 + amp * 15;
    lctx.stroke();

    // Mid glow
    drawSmooth();
    lctx.strokeStyle = `hsla(${laserHue - 5}, 80%, 70%, ${brightness * 0.6})`;
    lctx.lineWidth = 2.5 + amp * 2;
    lctx.shadowBlur = 8 + amp * 8;
    lctx.stroke();

    // Bright core
    drawSmooth();
    lctx.strokeStyle = `hsla(${laserHue + 10}, 40%, 92%, ${brightness * 0.9})`;
    lctx.lineWidth = 1 + amp * 0.8;
    lctx.shadowColor = `hsla(${laserHue}, 70%, 85%, ${brightness})`;
    lctx.shadowBlur = 4;
    lctx.stroke();

    // Draw bright dot at the "head" of the laser
    const headIdx = Math.floor((now * 80) % pts.length);
    const head = pts[headIdx];
    lctx.beginPath();
    lctx.arc(head.x, head.y, 2 + amp * 3, 0, Math.PI * 2);
    lctx.fillStyle = `hsla(${laserHue + 10}, 30%, 95%, ${brightness})`;
    lctx.shadowColor = `hsla(${laserHue}, 80%, 75%, 1)`;
    lctx.shadowBlur = 15 + amp * 10;
    lctx.fill();

    lctx.shadowBlur = 0;
    lctx.restore();

    // When silent, draw a still dot at center
    if (amp < 0.05) {
      lctx.save();
      lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      lctx.beginPath();
      lctx.arc(cx, cy, 3, 0, Math.PI * 2);
      lctx.fillStyle = `hsla(${laserHue}, 80%, 75%, 0.8)`;
      lctx.shadowColor = `hsla(${laserHue}, 90%, 65%, 0.6)`;
      lctx.shadowBlur = 12;
      lctx.fill();
      lctx.shadowBlur = 0;
      lctx.restore();
    }

    // Composite trail canvas onto main canvas
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(lc, 0, 0);
    ctx.restore();
  };

  const drawSphere = (ctx, w, h, data) => {
    const cx = w / 2;
    const cy = h / 2;
    const baseR = Math.min(w, h) * 0.24;
    const t = sphereTimeRef.current;
    const rotY = t * 0.12;  // slow Y-axis rotation
    const rotZ = t * 0.07;  // slow Z-axis rotation

    // Average amplitude for glow intensity
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    const avg = sum / data.length / 255;

    // Sphere glow
    const glowR = baseR * (1.1 + avg * 0.3);
    const glow = ctx.createRadialGradient(cx, cy, baseR * 0.2, cx, cy, glowR);
    glow.addColorStop(0, `rgba(99,102,241,${0.12 + avg * 0.15})`);
    glow.addColorStop(0.6, `rgba(129,140,248,${0.04 + avg * 0.06})`);
    glow.addColorStop(1, 'rgba(67,56,202,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
    ctx.fill();

    // 3D rotation helper: rotate around Y then Z
    const project = (x3, y3, z3) => {
      // Y-axis rotation
      let x1 = x3 * Math.cos(rotY) + z3 * Math.sin(rotY);
      let z1 = -x3 * Math.sin(rotY) + z3 * Math.cos(rotY);
      let y1 = y3;
      // Z-axis rotation
      let x2 = x1 * Math.cos(rotZ) - y1 * Math.sin(rotZ);
      let y2 = x1 * Math.sin(rotZ) + y1 * Math.cos(rotZ);
      let z2 = z1;
      const scale = 1 / (1 + z2 / (baseR * 4));
      return { sx: cx + x2 * scale, sy: cy + y2 * scale, z: z2 };
    };

    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';

    // Frequency bands for different sphere regions
    const maxBin = Math.floor(data.length * 0.68); // ~15kHz
    const bassEnd = Math.floor(maxBin * 0.2);
    const midEnd = Math.floor(maxBin * 0.55);
    // Pre-compute band averages
    let bassSum = 0, midSum = 0, highSum = 0;
    for (let i = 0; i < bassEnd; i++) bassSum += data[i];
    for (let i = bassEnd; i < midEnd; i++) midSum += data[i];
    for (let i = midEnd; i < maxBin; i++) highSum += data[i];
    const bassAvg = bassSum / bassEnd / 255;
    const midAvg = midSum / (midEnd - bassEnd) / 255;
    const highAvg = highSum / (maxBin - midEnd) / 255;
    // Volume-scaled base distortion + ripple
    const baseDistort = 0.3 + avg * 0.8;
    const rippleStrength = avg * 0.15; // ripples increase with volume

    // Longitude lines (vertical great circles)
    const lonLines = 16;
    const lonPts = 48;
    for (let l = 0; l < lonLines; l++) {
      const phi = (l / lonLines) * Math.PI;
      ctx.beginPath();
      for (let i = 0; i <= lonPts; i++) {
        const theta = (i / lonPts) * Math.PI * 2;
        const vertPos = Math.abs(Math.cos(theta));
        const bandVal = bassAvg * (1 - vertPos) + highAvg * vertPos + midAvg * 0.5;
        const freqIdx = Math.floor((i / lonPts) * maxBin);
        const pointVal = data[freqIdx] / 255;
        const combined = pointVal * 0.6 + bandVal * 0.4;
        // Surface ripple — waves travel across the sphere
        const ripple = rippleStrength * Math.sin(theta * 8 + phi * 6 + t * 4) * Math.sin(phi * 4 - t * 3);
        const r = baseR * (1 + combined * baseDistort + ripple);
        const x3 = r * Math.sin(theta) * Math.cos(phi);
        const y3 = r * Math.cos(theta);
        const z3 = r * Math.sin(theta) * Math.sin(phi);
        const { sx, sy } = project(x3, y3, z3);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      const depthPt = project(Math.cos(phi) * baseR, 0, Math.sin(phi) * baseR);
      const depth = depthPt.z / baseR;
      const alpha = 0.15 + depth * 0.2 + avg * 0.3;
      ctx.strokeStyle = `rgba(129,140,248,${Math.max(0.05, alpha)})`;
      ctx.stroke();
    }

    // Latitude lines (horizontal circles)
    const latLines = 10;
    const latPts = 64;
    for (let l = 1; l < latLines; l++) {
      const theta = (l / latLines) * Math.PI;
      const latR = baseR * Math.sin(theta);
      const latY = baseR * Math.cos(theta);
      // Latitude band: poles get highs, equator gets bass
      const vertPos = Math.abs(Math.cos(theta));
      const latBandVal = bassAvg * (1 - vertPos) + highAvg * vertPos + midAvg * 0.5;
      ctx.beginPath();
      for (let i = 0; i <= latPts; i++) {
        const phi = (i / latPts) * Math.PI * 2;
        const freqIdx = Math.floor((i / latPts) * maxBin);
        const pointVal = data[freqIdx] / 255;
        const combined = pointVal * 0.6 + latBandVal * 0.4;
        const ripple = rippleStrength * Math.sin(theta * 8 + phi * 6 + t * 4) * Math.sin(phi * 4 - t * 3);
        const r = latR * (1 + combined * baseDistort + ripple);
        const x3 = r * Math.cos(phi);
        const z3 = r * Math.sin(phi);
        const { sx, sy } = project(x3, latY, z3);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      const alpha = 0.1 + avg * 0.35;
      ctx.strokeStyle = `rgba(167,139,250,${alpha})`;
      ctx.stroke();
    }
  };

  const selectedMode = MODES.find(m => m.id === mode);

  return (
    <div ref={containerRef}
      onMouseMove={() => {
        setMouseActive(true);
        if (mouseTimerRef.current) clearTimeout(mouseTimerRef.current);
        mouseTimerRef.current = setTimeout(() => { if (!dropdownOpen) setMouseActive(false); }, 2000);
      }}
      onMouseLeave={() => {
        if (mouseTimerRef.current) clearTimeout(mouseTimerRef.current);
        setMouseActive(false);
      }}
      style={{
        position: 'relative',
        width: '100%',
        height: isFullscreen ? '100vh' : 'calc(100vh - 160px)',
        minHeight: 400,
        background: isFullscreen ? 'radial-gradient(ellipse at 20% 0%,#2d1f6e 0%,#1a1535 50%,#13102a 100%)' : 'transparent',
        borderRadius: isFullscreen ? 0 : 12,
        overflow: 'hidden',
        cursor: mouseActive ? (playingSrc ? 'pointer' : 'default') : 'none',
      }}>
      {/* Full-bleed canvas */}
      <canvas
        ref={canvasRef}
        onClick={() => {
          resumeAudioContext();
          ensureAnalyser();
          if (playingSrc) toggle(playingSrc);
        }}
        onMouseMove={(e) => {
          const rect = canvasRef.current?.getBoundingClientRect();
          if (rect) mousePosRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        }}
        onMouseLeave={() => { mousePosRef.current = null; }}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', cursor: 'inherit' }}
      />

      {/* Controls overlay — top-right, auto-hide */}
      <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 6, zIndex: 10, opacity: mouseActive ? 1 : 0, transition: 'opacity 0.3s ease', pointerEvents: mouseActive ? 'auto' : 'none' }}>
        {/* Mode dropdown */}
        <div ref={dropdownRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            style={{
              background: 'rgba(20,20,42,0.8)',
              backdropFilter: 'blur(8px)',
              border: '1px solid #2a2a45',
              borderRadius: 8,
              padding: '6px 12px',
              color: '#9a9ab0',
              fontSize: 12,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: 'color 0.15s ease',
            }}
            onMouseEnter={e => e.currentTarget.style.color = '#e2e8f0'}
            onMouseLeave={e => e.currentTarget.style.color = '#9a9ab0'}
          >
            {selectedMode.label}
            <span style={{ fontSize: 8, opacity: 0.6 }}>{dropdownOpen ? '\u25B2' : '\u25BC'}</span>
          </button>

          {dropdownOpen && (
            <div style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: 4,
              background: 'rgba(20,20,42,0.95)',
              backdropFilter: 'blur(12px)',
              border: '1px solid #2a2a45',
              borderRadius: 10,
              padding: 4,
              minWidth: 120,
              animation: 'fadeIn 0.12s ease-out',
            }}>
              {MODES.map(m => (
                <button
                  key={m.id}
                  onClick={() => { setMode(m.id); particlesRef.current = []; orbitParticlesRef.current = []; ringIndexRef.current = 0; particleSpawnedRef.current = 0; setDropdownOpen(false); }}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    background: mode === m.id ? '#4338ca30' : 'transparent',
                    border: 'none',
                    borderRadius: 6,
                    padding: '8px 12px',
                    color: mode === m.id ? '#818cf8' : '#9a9ab0',
                    fontSize: 12,
                    cursor: 'pointer',
                    transition: 'background 0.1s ease',
                  }}
                  onMouseEnter={e => { if (mode !== m.id) e.currentTarget.style.background = '#ffffff08'; }}
                  onMouseLeave={e => { if (mode !== m.id) e.currentTarget.style.background = 'transparent'; }}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Fullscreen button */}
        <button
          onClick={toggleFullscreen}
          style={{
            background: 'rgba(20,20,42,0.8)',
            backdropFilter: 'blur(8px)',
            border: '1px solid #2a2a45',
            borderRadius: 8,
            padding: '6px 10px',
            color: '#9a9ab0',
            fontSize: 14,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            transition: 'color 0.15s ease',
          }}
          onMouseEnter={e => e.currentTarget.style.color = '#e2e8f0'}
          onMouseLeave={e => e.currentTarget.style.color = '#9a9ab0'}
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {isFullscreen
            ? React.createElement('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
                React.createElement('polyline', { points: '4 14 4 20 10 20' }),
                React.createElement('polyline', { points: '20 10 20 4 14 4' }),
                React.createElement('line', { x1: '14', y1: '10', x2: '21', y2: '3' }),
                React.createElement('line', { x1: '3', y1: '21', x2: '10', y2: '14' })
              )
            : React.createElement('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
                React.createElement('polyline', { points: '15 3 21 3 21 9' }),
                React.createElement('polyline', { points: '9 21 3 21 3 15' }),
                React.createElement('line', { x1: '21', y1: '3', x2: '14', y2: '10' }),
                React.createElement('line', { x1: '3', y1: '21', x2: '10', y2: '14' })
              )
          }
        </button>
      </div>
    </div>
  );
}

export default VisualizerTab;
