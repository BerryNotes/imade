import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useGlobalAudio } from '../components/AudioProvider';

const MODES = [
  { id: 'bars', label: 'EQ' },
  { id: 'radial', label: 'Radial' },
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
  // Store audio values in refs to avoid re-renders from context changes (currentTime fires ~4x/sec)
  const audioRef = useRef(audio);
  audioRef.current = audio;
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
  const fxRef = useRef(false); // special effect toggle (Shift key)

  const currentSong = audio.playingSrc ? songs.find(s => s.audioFile === audio.playingSrc) : null;

  // Number keys 1-9,0 switch visualizer mode; Shift toggles special effect
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      if (e.repeat) return; // ignore held keys — single press only
      if (e.key === 'Shift') { fxRef.current = !fxRef.current; return; }
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
    const a = audioRef.current.getAnalyser();
    if (a) analyserRef.current = a;
    return a;
  }, []);

  const sphereTimeRef = useRef(0);
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
  const lastFreqDataRef = useRef(null);  // cached freq data for freeze frame
  const lastTimeDataRef = useRef(null);  // cached time data for freeze frame
  const waveHistoryRef = useRef([]);     // ring buffer of past waveform snapshots for 3D wave
  const freqBufRef = useRef(null);       // reusable freq data buffer
  const timeBufRef = useRef(null);       // reusable time data buffer
  const bgFreqBufRef = useRef(null);     // reusable buffer for background gradient
  // Init analyser when playback starts
  useEffect(() => {
    if (audio.isPlaying) {
      try {
        audioRef.current.resumeAudioContext();
        ensureAnalyser();
      } catch (e) {
        console.warn('[Visualizer] analyser init failed:', e);
      }
    }
  }, [audio.isPlaying, ensureAnalyser]);

  // Animation loop — always runs so visualizations can linger after song ends
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let running = true;
    let cssW = 0, cssH = 0; // cached CSS dimensions — updated on resize only

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      cssW = rect.width;
      cssH = rect.height;
      if (cssW === 0 || cssH === 0) return;
      canvas.width = cssW * dpr;
      canvas.height = cssH * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const fsResize = () => setTimeout(resize, 50);
    document.addEventListener('fullscreenchange', fsResize);

    let lastFrameTime = 0;
    let errorCount = 0;
    const FRAME_INTERVAL = 1000 / 30; // 30fps target
    const draw = () => {
      if (!running || errorCount > 10) return; // stop loop if too many errors
      rafRef.current = requestAnimationFrame(draw);
      const now = performance.now();
      if (now - lastFrameTime < FRAME_INTERVAL) return;
      lastFrameTime = now;
      try { drawInner(); errorCount = 0; } catch (e) { errorCount++; console.warn('[Visualizer] draw error:', e); }
    };

    const drawInner = () => {
      const w = cssW;
      const h = cssH;
      if (w === 0 || h === 0) return;
      // Read live audio state from ref (avoids stale closures)
      const curAudio = audioRef.current;
      const playingSrc = curAudio.playingSrc;
      const isAudioPlaying = curAudio.isPlaying;

      // No song playing — clear canvas, no visualization
      if (!playingSrc) {
        ctx.clearRect(0, 0, w, h);
        particlesRef.current = [];
        orbitParticlesRef.current = [];
        laserCanvasRef.current = null;
        ringIndexRef.current = 0;
        particleSpawnedRef.current = 0;
        prevSongRef.current = null;
        prevDimsRef.current = { w, h };
        return;
      }

      // New song — old strip particles rise up and exit, new ones spawn fresh
      if (playingSrc !== prevSongRef.current) {
        for (const p of particlesRef.current) { p.exiting = true; }
        particleSpawnedRef.current = 0;
        waveBufferRef.current = null;
        waveWriteRef.current = 0;
        spectroCanvasRef.current = null;
        spectroWriteRef.current = 0;
        waveHistoryRef.current = [];
        prevSongRef.current = playingSrc;
      }

      // Track accumulated viz time (freezes when paused)
      let dt = 0;
      if (isAudioPlaying) {
        const realNow = performance.now() / 1000;
        dt = lastRealTimeRef.current > 0 ? Math.min(realNow - lastRealTimeRef.current, 0.1) : 0.016;
        lastRealTimeRef.current = realNow;
        vizTimeRef.current += dt;
      } else {
        lastRealTimeRef.current = 0;
      }

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
        lctx.clearRect(0, 0, cw, ch);
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);
      } else {
        ctx.clearRect(0, 0, w, h);
        // Simple dark background — no per-frame gradient creation
        ctx.fillStyle = '#0f0d1a';
        ctx.fillRect(0, 0, w, h);
      }

      // Ensure analyser is connected — may not exist yet if tab opened mid-song
      if (!analyserRef.current) {
        try {
          curAudio.resumeAudioContext();
          ensureAnalyser();
        } catch (e) { /* retry next frame */ }
      }
      const analyser = analyserRef.current;
      if (!analyser) return;

      // Use high-res FFT only for spectrograph; keep small for other modes
      const desiredFft = mode === 'spectrograph' ? 8192 : 512;
      if (analyser.fftSize !== desiredFft) analyser.fftSize = desiredFft;

      const bufLen = analyser.frequencyBinCount;
      let freqData, timeData;
      if (isAudioPlaying) {
        if (!freqBufRef.current || freqBufRef.current.length !== bufLen) {
          freqBufRef.current = new Uint8Array(bufLen);
        }
        if (!timeBufRef.current || timeBufRef.current.length !== analyser.fftSize) {
          timeBufRef.current = new Uint8Array(analyser.fftSize);
        }
        freqData = freqBufRef.current;
        timeData = timeBufRef.current;
        analyser.getByteFrequencyData(freqData);
        analyser.getByteTimeDomainData(timeData);
        lastFreqDataRef.current = freqData;
        lastTimeDataRef.current = timeData;
      } else {
        // Freeze frame — reuse last captured data so FX toggles still redraw
        freqData = lastFreqDataRef.current || new Uint8Array(bufLen);
        timeData = lastTimeDataRef.current || new Uint8Array(analyser.fftSize);
      }

      sphereTimeRef.current += dt;

      if (mode === 'bars') drawBars(ctx, w, h, freqData);
      else if (mode === 'radial') drawRadial(ctx, w, h, freqData);
      else if (mode === 'wave') drawWaveSingle(ctx, w, h, timeData);
      else if (mode === 'spectrograph') drawSpectrograph(ctx, w, h, freqData, canvas);
      else if (mode === 'particles') drawParticles(ctx, w, h, freqData, vizTimeRef.current);
      else if (mode === 'orbit') drawOrbit(ctx, w, h, freqData, vizTimeRef.current, dt);
      else if (mode === 'sphere') drawSphere(ctx, w, h, freqData);
      else if (mode === 'grid') drawGrid(ctx, w, h, freqData, vizTimeRef.current);
      else if (mode === 'laser') drawLaser(ctx, w, h, timeData, freqData, vizTimeRef.current);
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
    const t = performance.now() / 1000;

    const maxBin = Math.floor(data.length * 0.68);
    const vals = [];
    for (let i = 0; i < barCount; i++) {
      const center = Math.floor(i * maxBin / barCount);
      const span = Math.max(1, Math.floor(maxBin / barCount / 2));
      let sum = 0, count = 0;
      for (let j = Math.max(0, center - span); j <= Math.min(data.length - 1, center + span); j++) { sum += data[j]; count++; }
      vals.push(Math.pow((sum / count) / 255, 0.75));
    }

    // FX: subtle color shifting — hue slowly cycles and reacts to frequency
    const colorShift = fxRef.current;

    for (let i = 0; i < barCount; i++) {
      const val = vals[i];
      const barH = val * h * 0.85;
      const x = margin + gap + i * (barW + gap);
      const pct = i / barCount;

      if (colorShift) {
        const hue = (t * 25 + pct * 120 + val * 60) % 360;
        const sat = 65 + val * 20;
        const light = 50 + val * 15;
        ctx.fillStyle = `hsla(${hue}, ${sat}%, ${light}%, 0.85)`;
      } else {
        const rC = Math.floor(80 + pct * 120);
        const gC = Math.floor(60 + pct * 130);
        const bC = Math.floor(200 + pct * 55);
        ctx.fillStyle = `rgba(${rC},${gC},${bC},0.85)`;
      }

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
  };

  const drawRadial = (ctx, w, h, data) => {
    if (fxRef.current) { drawRadialSphere(ctx, w, h, data); return; }

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
    ctx.lineCap = 'butt';
  };

  const drawRadialSphere = (ctx, w, h, data) => {
    const cx = w / 2;
    const cy = h / 2;
    const sphereR = Math.min(w, h) * 0.18;
    const maxBarLen = Math.min(w, h) * 0.24;
    const maxBin = Math.floor(data.length * 0.68);
    const t = vizTimeRef.current;

    // 3D rotation — all three axes at different speeds
    const rotX = t * 0.15;
    const rotY = t * 0.22;
    const rotZ = t * 0.08;
    const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
    const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
    const cosZ = Math.cos(rotZ), sinZ = Math.sin(rotZ);

    const project = (x3, y3, z3) => {
      // Rotate X
      const y1 = y3 * cosX - z3 * sinX;
      const z1 = y3 * sinX + z3 * cosX;
      // Rotate Y
      const x2 = x3 * cosY + z1 * sinY;
      const z2 = -x3 * sinY + z1 * cosY;
      // Rotate Z
      const xf = x2 * cosZ - y1 * sinZ;
      const yf = x2 * sinZ + y1 * cosZ;
      const perspective = 600;
      const scale = perspective / (perspective + z2);
      return { x: cx + xf * scale, y: cy + yf * scale, z: z2, scale };
    };

    // Distribute bars across sphere surface using latitude bands
    // Latitude maps to frequency: equator = bass, poles = highs
    const latBands = 10;
    const bars = [];
    let freqCursor = 0;

    for (let lat = 1; lat < latBands; lat++) {
      const theta = (lat / latBands) * Math.PI;
      const ny = Math.cos(theta);
      const ringR = Math.sin(theta);
      // More bars near equator (larger ring), fewer near poles
      const lonCount = Math.max(6, Math.round(14 * ringR));

      for (let lon = 0; lon < lonCount; lon++) {
        const phi = (lon / lonCount) * Math.PI * 2;
        const nx = ringR * Math.cos(phi);
        const nz = ringR * Math.sin(phi);

        // Map this bar to a frequency bin
        const binIdx = Math.min(Math.floor(freqCursor), maxBin - 1);
        freqCursor += maxBin / 120; // ~120 total bars across all bands
        const raw = data[binIdx] / 255;
        const val = Math.pow(raw, 0.75);

        // Project base (on sphere) and tip (extended outward)
        const base = project(nx * sphereR, ny * sphereR, nz * sphereR);
        const tipR = sphereR + val * maxBarLen;
        const tip = project(nx * tipR, ny * tipR, nz * tipR);

        bars.push({ base, tip, val, lat, phi });
      }
    }

    // Sort by depth — draw far bars first
    bars.sort((a, b) => a.base.z - b.base.z);

    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    const avg = sum / data.length / 255;

    // Draw frequency bars extending from sphere surface
    ctx.lineCap = 'round';
    for (const b of bars) {
      const depth = (b.base.z + sphereR) / (2 * sphereR); // 0=far, 1=near
      const alpha = 0.15 + depth * 0.55 + b.val * 0.3;
      const hue = 240 + (b.lat / latBands) * 40;
      const lightness = 50 + b.val * 30 + depth * 10;
      ctx.strokeStyle = `hsla(${hue}, 65%, ${lightness}%, ${Math.min(1, alpha)})`;
      ctx.lineWidth = Math.max(1.5, 3 * b.base.scale);
      ctx.beginPath();
      ctx.moveTo(b.base.x, b.base.y);
      ctx.lineTo(b.tip.x, b.tip.y);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
  };

  // Wave — default: oscilloscope; FX: 3D plane scrolling through time
  const drawWaveSingle = (ctx, w, h, timeData) => {
    const cx = w / 2;
    const cy = h / 2;
    const t = vizTimeRef.current;
    const fx = fxRef.current;

    if (fx) {
      // FX: 3D plane where Z axis scrolls through time (waveform history)
      const cols = 64;
      const rows = 12;
      const historySize = 48; // keep many snapshots, sample 12 rows from them
      const planeW = Math.min(w, h) * 0.75;
      const planeD = planeW * 1.6;

      const history = waveHistoryRef.current;
      if (audioRef.current.isPlaying) {
        const snapshot = [];
        for (let c = 0; c <= cols; c++) {
          const idx = Math.floor((c / cols) * (timeData.length - 1));
          snapshot.push((timeData[idx] - 128) / 128);
        }
        history.unshift(snapshot);
        if (history.length > historySize) history.length = historySize;
      }

      const rotX = 0.45 + Math.sin(t * 0.04) * 0.1;
      const rotY = t * 0.1;
      const cosRX = Math.cos(rotX), sinRX = Math.sin(rotX);
      const cosRY = Math.cos(rotY), sinRY = Math.sin(rotY);

      const project = (x3, y3, z3) => {
        const x1 = x3 * cosRY + z3 * sinRY;
        const z1 = -x3 * sinRY + z3 * cosRY;
        const y1 = y3 * cosRX - z1 * sinRX;
        const z2 = y3 * sinRX + z1 * cosRX;
        const perspective = 500;
        const denom = Math.max(perspective + z2, 50); // clamp to prevent behind-camera glitch
        const scale = perspective / denom;
        return { x: cx + x1 * scale, y: cy + y1 * scale, z: z2 };
      };

      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      for (let r = 0; r <= rows; r++) {
        const rz = (r / rows - 0.5) * planeD;
        // Sample evenly from the full history buffer
        const histIdx = Math.floor((rows - r) / rows * (historySize - 1));
        const waveVals = histIdx < history.length ? history[histIdx] : (history[history.length - 1] || []);
        ctx.beginPath();
        for (let c = 0; c <= cols; c++) {
          const rx = (c / cols - 0.5) * planeW;
          const raw = waveVals[c] || 0;
          const clamped = Math.max(-1, Math.min(1, raw));
          const waveH = clamped * planeW * 0.12;
          const p = project(rx, -waveH, rz);
          if (c === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        }
        const freshness = r / rows;
        const alpha = 0.15 + freshness * 0.65;
        ctx.strokeStyle = `rgba(129,140,248,${alpha})`;
        ctx.stroke();
      }

    } else {
      // Default: classic oscilloscope waveform
      const margin = w * 0.08;
      const waveW = w - margin * 2;
      const amplitude = h * 0.35;

      // Glow layer
      ctx.beginPath();
      for (let i = 0; i < timeData.length; i++) {
        const x = margin + (i / (timeData.length - 1)) * waveW;
        const val = (timeData[i] - 128) / 128;
        const y = cy + val * amplitude;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(129,140,248,0.15)';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();

      // Bright core
      ctx.beginPath();
      for (let i = 0; i < timeData.length; i++) {
        const x = margin + (i / (timeData.length - 1)) * waveW;
        const val = (timeData[i] - 128) / 128;
        const y = cy + val * amplitude;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(129,140,248,0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  };

  // EQ — frequency domain as a smooth curve (amplitude vs frequency)
  // Spectrograph — scrolling frequency-vs-time heatmap
  const drawSpectrograph = (ctx, w, h, freqData, canvas) => {
    const dpr = window.devicePixelRatio || 1;
    const cw = Math.round(w * dpr);
    const ch = Math.round(h * dpr);

    // Init or resize offscreen spectrograph canvas — preserve history on resize
    let sc = spectroCanvasRef.current;
    if (!sc || sc.width !== cw || sc.height !== ch) {
      const newSc = document.createElement('canvas');
      newSc.width = cw;
      newSc.height = ch;
      if (sc && sc.width > 0 && sc.height > 0) {
        // Scale old history onto the new canvas so it isn't lost
        const nctx = newSc.getContext('2d');
        nctx.drawImage(sc, 0, 0, sc.width, sc.height, 0, 0, cw, ch);
      }
      sc = newSc;
      spectroCanvasRef.current = sc;
    }
    const sctx = sc.getContext('2d');

    // Write one column of frequency data — 10Hz to 16kHz (log scale)
    const col = spectroWriteRef.current % Math.round(w);
    const sampleRate = 44100;
    const fftSize = analyserRef.current ? analyserRef.current.fftSize : 8192;
    const binHz = sampleRate / fftSize;
    const minFreq = 20, maxFreq = 10000;
    const logMin = Math.log(minFreq), logMax = Math.log(maxFreq);

    // Draw each pixel row, mapping log-frequency to the correct FFT bin
    for (let py = 0; py < h; py++) {
      // py=0 is top (high freq), py=h-1 is bottom (low freq)
      const t = 1 - py / h; // 0 at bottom, 1 at top
      const freq = Math.exp(logMin + t * (logMax - logMin));
      const bin = freq / binHz;
      // Linearly interpolate between adjacent bins
      const binLow = Math.floor(bin), binHigh = Math.min(binLow + 1, freqData.length - 1);
      const frac = bin - binLow;
      const val = ((1 - frac) * (freqData[binLow] || 0) + frac * (freqData[binHigh] || 0)) / 255;

      // Color palette based on FX toggle
      let r, g, b;
      if (fxRef.current) {
        // FX: ocean palette — deep blue → cyan → yellow → white
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
      } else if (val < 0.25) {
        // Default: purple palette — black → deep purple → violet → magenta → lavender
        const t = val / 0.25;
        r = Math.round(t * 45); g = 0; b = Math.round(t * 80);
      } else if (val < 0.5) {
        const t = (val - 0.25) / 0.25;
        r = Math.round(45 + t * 75); g = 0; b = Math.round(80 + t * 100);
      } else if (val < 0.75) {
        const t = (val - 0.5) / 0.25;
        r = Math.round(120 + t * 100); g = Math.round(t * 40); b = Math.round(180 + t * 50);
      } else {
        const t = (val - 0.75) / 0.25;
        r = Math.round(220 + t * 35); g = Math.round(40 + t * 140); b = Math.round(230 + t * 25);
      }

      sctx.fillStyle = `rgb(${r},${g},${b})`;
      sctx.fillRect(col * dpr, py * dpr, dpr, dpr);
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
    const labels = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
    for (const freq of labels) {
      if (freq > maxFreq || freq < minFreq) continue;
      const t = (Math.log(freq) - logMin) / (logMax - logMin);
      const y = (1 - t) * h;
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

    // Spawn from random positions across the canvas
    const PARTICLE_CAP = 800;
    if (particleSpawnedRef.current < PARTICLE_CAP) {
      const spawnCount = Math.min(
        Math.floor(Math.pow(volume, 0.4) * 55),
        PARTICLE_CAP - particleSpawnedRef.current
      );
      for (let i = 0; i < spawnCount && particles.length < MAX_PARTICLES; i++) {
        const fg = Math.random() > 0.45;
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.8 + Math.random() * 1.5;
        particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: fg ? 1.2 + Math.random() * 2.5 : 0.3 + Math.random() * 1,
          opacity: fg ? 0.35 + Math.random() * 0.35 : 0.12 + Math.random() * 0.18,
          wobbleOffset: Math.random() * Math.PI * 2,
          birthTime: now,
          sizePhase: Math.random() * Math.PI * 2,
          fg,
        });
        particleSpawnedRef.current++;
      }
    }

    // Update — particles move freely, wrap around edges
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      if (p.exiting) {
        p.x += (p.vx || 0) * 3;
        p.y += (p.vy || 0) * 3;
        p.opacity *= 0.98;
        if (p.opacity < 0.01) { particles.splice(i, 1); continue; }
      } else {
        p.x += p.vx + Math.sin(now * 2 + p.wobbleOffset) * 0.3;
        p.y += p.vy + Math.cos(now * 2 + p.wobbleOffset) * 0.3;
        // Wrap around edges
        if (p.x < -10) p.x = w + 10;
        else if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10;
        else if (p.y > h + 10) p.y = -10;
      }
    }

    // FX: constellation — draw connecting lines between nearby foreground particles
    if (fxRef.current) {
      const connectDist = 110;
      const connectDistSq = connectDist * connectDist;
      const fgParticles = particles.filter(p => p.fg && !p.exiting);
      ctx.lineWidth = 1.6;
      for (let i = 0; i < fgParticles.length; i++) {
        for (let j = i + 1; j < fgParticles.length; j++) {
          const dx = fgParticles[i].x - fgParticles[j].x;
          const dy = fgParticles[i].y - fgParticles[j].y;
          const distSq = dx * dx + dy * dy;
          if (distSq < connectDistSq) {
            const alpha = (1 - Math.sqrt(distSq) / connectDist) * 0.5;
            ctx.strokeStyle = `rgba(129,140,248,${alpha})`;
            ctx.beginPath();
            ctx.moveTo(fgParticles[i].x, fgParticles[i].y);
            ctx.lineTo(fgParticles[j].x, fgParticles[j].y);
            ctx.stroke();
          }
        }
      }
    }

    // Draw background layer first, then foreground
    const volScale = 1 + volume * 5; // dots grow noticeably with louder audio
    for (let pass = 0; pass < 2; pass++) {
      const isFgPass = pass === 1;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        if (p.fg !== isFgPass) continue;
        const alpha = p.opacity;
        const drawSize = p.size * volScale;
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
    const perRingCapacity = 140;
    const ringCount = fxRef.current ? 3 : 1; // default: 1 ring, FX: 3 rings
    const totalCapacity = perRingCapacity * ringCount;

    // Gradually spawn from all edges until rings are full
    if (particles.length < totalCapacity) {
      const spawnRate = Math.max(1, Math.floor(Math.pow(volume, 0.3) * 8));
      for (let i = 0; i < spawnRate && particles.length < totalCapacity; i++) {
        const edge = Math.floor(Math.random() * 4);
        let sx, sy;
        if (edge === 0) { sx = Math.random() * w; sy = -10; }
        else if (edge === 1) { sx = Math.random() * w; sy = h + 10; }
        else if (edge === 2) { sx = -10; sy = Math.random() * h; }
        else { sx = w + 10; sy = Math.random() * h; }
        const ring = ringIndexRef.current % ringCount; // 0, or 0/1/2 in FX
        const ringIdx = Math.floor(ringIndexRef.current / ringCount);
        const angle = (ringIdx / perRingCapacity) * Math.PI * 2 + (Math.random() - 0.5) * 0.08;
        const fg = Math.random() > 0.45;
        particles.push({
          x: sx, y: sy,
          vx: 0, vy: 0,
          ringAngle: angle,
          ring, // 0=XY, 1=XZ, 2=YZ
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
    // ringType: 0=XY plane, 1=XZ plane, 2=YZ plane
    const project3D = (angle, r, ringType = 0) => {
      let x3, y3, z3;
      if (ringType === 1) { x3 = Math.cos(angle) * r; y3 = 0; z3 = Math.sin(angle) * r; }
      else if (ringType === 2) { x3 = 0; y3 = Math.cos(angle) * r; z3 = Math.sin(angle) * r; }
      else { x3 = Math.cos(angle) * r; y3 = Math.sin(angle) * r; z3 = 0; }
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
      const fxActive = fxRef.current;
      const baseSpeed = p.fg ? 0.06 : -0.04;
      const orbitSpeed = fxActive ? baseSpeed * 3 : baseSpeed;
      p.ringAngle += orbitSpeed * dt;
      // Vibrate each particle radially based on waveform intensity
      const vibrate = waveIntensity * 8 * Math.sin(now * 25 + p.ringAngle * 5);
      const targetR = pulseR + vibrate;
      const proj = project3D(p.ringAngle, targetR, p.ring || 0);
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

    // In default mode, remove extra ring particles that were spawned in FX mode
    const orbitFx = fxRef.current;
    if (!orbitFx) {
      for (let i = particles.length - 1; i >= 0; i--) {
        if (particles[i].ring > 0) particles.splice(i, 1);
      }
    }

    // Sort by depth (z stored during update) — draw far particles first
    const sorted = particles.map((p, i) => {
      const proj = project3D(p.ringAngle, ringR, p.ring || 0);
      return { idx: i, z: proj.z };
    });
    sorted.sort((a, b) => a.z - b.z);

    for (const { idx } of sorted) {
      const p = particles[idx];
      const proj = project3D(p.ringAngle, ringR, p.ring || 0);
      const depthScale = proj.scale;
      const depthAlpha = 0.4 + 0.6 * ((proj.z + ringR) / (2 * ringR)); // dimmer when further
      const age = now - p.birthTime;
      const sizeMultiplier = 0.7 + 0.3 * Math.sin(age * 2.5 + p.sizePhase);
      const drawSize = p.size * sizeMultiplier * (1 + volume * 0.15) * depthScale;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.5, drawSize), 0, Math.PI * 2);
      if (orbitFx) {
        // FX: rainbow trail — hue based on ring angle
        const hue = (p.ringAngle * 180 / Math.PI + now * 30) % 360;
        ctx.fillStyle = `hsla(${hue}, 70%, 65%, ${(p.opacity * Math.max(0.2, depthAlpha)).toFixed(2)})`;
      } else {
        ctx.fillStyle = `rgba(129,140,248,${(p.opacity * Math.max(0.2, depthAlpha)).toFixed(2)})`;
      }
      ctx.fill();
    }
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

    const gridFx = fxRef.current;

    // FX: full mesh with rainbow shockwave coloring + diagonals
    if (gridFx) {
      // Shockwave rings expand from center with bass
      const centerX = w / 2, centerY = h / 2;
      const maxDist = Math.sqrt(centerX * centerX + centerY * centerY);
      const pulseSpeed = 300; // px per second
      const pulsePhase = (now * pulseSpeed) % maxDist;

      // Draw mesh connections — horizontal, vertical, and diagonal
      ctx.lineWidth = 0.8;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const idx = r * cols + c;
          const p = grid[idx];
          const distFromCenter = Math.sqrt((p.x - centerX) ** 2 + (p.y - centerY) ** 2);
          const angle = Math.atan2(p.y - centerY, p.x - centerX);
          const hue = ((angle / Math.PI * 180 + 180) + now * 30) % 360;
          // Shockwave brightness — bright ring expanding from center
          const pulseDist = Math.abs(distFromCenter - pulsePhase);
          const pulseGlow = Math.max(0, 1 - pulseDist / 60) * bass * 2;
          const lineAlpha = (0.06 + boostedVol * 0.18 + pulseGlow * 0.3).toFixed(2);

          const drawLine = (other) => {
            ctx.strokeStyle = `hsla(${hue}, 70%, 60%, ${lineAlpha})`;
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(other.x, other.y); ctx.stroke();
          };
          if (c < cols - 1) drawLine(grid[idx + 1]);
          if (r < rows - 1) drawLine(grid[idx + cols]);
          if (c < cols - 1 && r < rows - 1) drawLine(grid[idx + cols + 1]);
          if (c > 0 && r < rows - 1) drawLine(grid[idx + cols - 1]);
        }
      }

      // Draw dots with rainbow coloring and shockwave glow
      for (let i = 0; i < grid.length; i++) {
        const p = grid[i];
        const dx = p.x - p.homeX, dy = p.y - p.homeY;
        const displacement = Math.sqrt(dx * dx + dy * dy) / maxDisplace;
        const distFromCenter = Math.sqrt((p.x - centerX) ** 2 + (p.y - centerY) ** 2);
        const angle = Math.atan2(p.y - centerY, p.x - centerX);
        const hue = ((angle / Math.PI * 180 + 180) + now * 30) % 360;
        const pulseDist = Math.abs(distFromCenter - pulsePhase);
        const pulseGlow = Math.max(0, 1 - pulseDist / 60) * bass * 2;
        const size = 2 + boostedVol * 4.5 + displacement * 2 + pulseGlow * 3;
        const alpha = Math.min(1, 0.3 + boostedVol * 0.5 + displacement * 0.2 + pulseGlow * 0.4);
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${hue}, 70%, ${55 + pulseGlow * 20}%, ${alpha.toFixed(2)})`;
        ctx.fill();
      }
    } else {
      // Default: dots only — no connecting lines
      for (let i = 0; i < grid.length; i++) {
        const p = grid[i];
        const dx = p.x - p.homeX, dy = p.y - p.homeY;
        const displacement = Math.sqrt(dx * dx + dy * dy) / maxDisplace;
        const size = 1.5 + boostedVol * 3.5 + displacement * 1.5;
        const alpha = 0.25 + boostedVol * 0.45 + displacement * 0.15;
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(129,140,248,${Math.min(1, alpha).toFixed(2)})`;
        ctx.fill();
      }
    }
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
    const radius = Math.max(Math.min(w, h) * 0.2 * amp, 25);

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
    lctx.stroke();

    // Mid glow
    drawSmooth();
    lctx.strokeStyle = `hsla(${laserHue - 5}, 80%, 70%, ${brightness * 0.6})`;
    lctx.lineWidth = 2.5 + amp * 2;
    lctx.stroke();

    // Bright core
    drawSmooth();
    lctx.strokeStyle = `hsla(${laserHue + 10}, 40%, 92%, ${brightness * 0.9})`;
    lctx.lineWidth = 1 + amp * 0.8;
    lctx.stroke();

    // Draw bright dot at the "head" of the laser
    const headIdx = Math.floor((now * 80) % pts.length);
    const head = pts[headIdx];
    lctx.beginPath();
    lctx.arc(head.x, head.y, 2 + amp * 3, 0, Math.PI * 2);
    lctx.fillStyle = `hsla(${laserHue + 10}, 30%, 95%, ${brightness})`;
    lctx.fill();

    // Grid echo copies — toggled with Shift key
    if (fxRef.current) {
      const gridIntensity = 1;
      const copyScale = 0.4;
      const spacing = Math.min(w, h) * (0.28 + amp * 0.1);

      const drawSmoothAt = (ox, oy, sc) => {
        lctx.beginPath();
        const p0x = cx + ox + (pts[0].x - cx) * sc;
        const p0y = cy + oy + (pts[0].y - cy) * sc;
        lctx.moveTo(p0x, p0y);
        for (let i = 0; i < pts.length - 1; i++) {
          const px = cx + ox + (pts[i].x - cx) * sc;
          const py = cy + oy + (pts[i].y - cy) * sc;
          const nx = cx + ox + (pts[i + 1].x - cx) * sc;
          const ny = cy + oy + (pts[i + 1].y - cy) * sc;
          lctx.quadraticCurveTo(px, py, (px + nx) / 2, (py + ny) / 2);
        }
        const lx = cx + ox + (pts[pts.length - 1].x - cx) * sc;
        const ly = cy + oy + (pts[pts.length - 1].y - cy) * sc;
        lctx.quadraticCurveTo(lx, ly, p0x, p0y);
      };

      for (let gx = -2; gx <= 2; gx++) {
        for (let gy = -2; gy <= 2; gy++) {
          if (gx === 0 && gy === 0) continue;
          const dist = Math.sqrt(gx * gx + gy * gy);
          const alpha = gridIntensity * Math.max(0, 1 - dist / 3) * 0.5;
          if (alpha < 0.01) continue;

          const ox = gx * spacing;
          const oy = gy * spacing;

          // Glow stroke
          drawSmoothAt(ox, oy, copyScale);
          lctx.strokeStyle = `hsla(${laserHue}, 80%, 65%, ${alpha * brightness})`;
          lctx.lineWidth = (3 + amp * 3) * copyScale;
          lctx.stroke();

          // Bright core
          drawSmoothAt(ox, oy, copyScale);
          lctx.strokeStyle = `hsla(${laserHue + 10}, 40%, 92%, ${alpha * brightness * 0.7})`;
          lctx.lineWidth = (0.8 + amp * 0.5) * copyScale;
          lctx.stroke();
        }
      }
    }

    lctx.restore();

    // When silent, draw a still dot at center
    if (amp < 0.05) {
      lctx.save();
      lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      lctx.beginPath();
      lctx.arc(cx, cy, 3, 0, Math.PI * 2);
      lctx.fillStyle = `hsla(${laserHue}, 80%, 75%, 0.8)`;
      lctx.fill();
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
    const sphereFx = fxRef.current;
    const rotX = sphereFx ? t * 0.09 : 0;  // FX: add X-axis rotation
    const rotY = t * (sphereFx ? 0.2 : 0.12);  // FX: faster Y spin
    const rotZ = t * 0.07;

    // Average amplitude for glow intensity
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    const avg = sum / data.length / 255;

    // Sphere glow — simple circle, no gradient
    ctx.beginPath();
    ctx.arc(cx, cy, baseR * (1.1 + avg * 0.3), 0, Math.PI * 2);
    ctx.fillStyle = `rgba(99,102,241,${(0.06 + avg * 0.08).toFixed(2)})`;
    ctx.fill();

    // 3D rotation helper: rotate around X (FX only) then Y then Z
    const cosRX = Math.cos(rotX), sinRX = Math.sin(rotX);
    const cosRY = Math.cos(rotY), sinRY = Math.sin(rotY);
    const cosRZ = Math.cos(rotZ), sinRZ = Math.sin(rotZ);
    const project = (x3, y3, z3) => {
      // X-axis rotation (FX adds tumble)
      let ya = y3 * cosRX - z3 * sinRX;
      let za = y3 * sinRX + z3 * cosRX;
      // Y-axis rotation
      let x1 = x3 * cosRY + za * sinRY;
      let z1 = -x3 * sinRY + za * cosRY;
      // Z-axis rotation
      let x2 = x1 * cosRZ - ya * sinRZ;
      let y2 = x1 * sinRZ + ya * cosRZ;
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

    if (sphereFx) {
      // FX: Cube wireframe with frequency-reactive distortion
      const s = baseR * (1 + avg * 0.15); // half-size, pulses with volume
      const verts = [
        [-s,-s,-s],[s,-s,-s],[s,s,-s],[-s,s,-s], // back face
        [-s,-s,s],[s,-s,s],[s,s,s],[-s,s,s],      // front face
      ];
      const edges = [
        [0,1],[1,2],[2,3],[3,0], // back
        [4,5],[5,6],[6,7],[7,4], // front
        [0,4],[1,5],[2,6],[3,7], // connecting
      ];
      const segs = 20; // subdivisions per edge for frequency displacement
      for (let e = 0; e < edges.length; e++) {
        const [a, b] = edges[e];
        const va = verts[a], vb = verts[b];
        ctx.beginPath();
        for (let i = 0; i <= segs; i++) {
          const frac = i / segs;
          let ex = va[0] + (vb[0] - va[0]) * frac;
          let ey = va[1] + (vb[1] - va[1]) * frac;
          let ez = va[2] + (vb[2] - va[2]) * frac;
          // Displace outward from center based on frequency data
          const len = Math.sqrt(ex * ex + ey * ey + ez * ez) || 1;
          const freqIdx = Math.floor((e * segs + i) / (edges.length * segs + 1) * maxBin);
          const pointVal = data[Math.min(freqIdx, maxBin - 1)] / 255;
          const ripple = rippleStrength * Math.sin(frac * 12 + t * 4 + e * 2);
          const disp = 1 + pointVal * baseDistort * 0.3 + ripple;
          ex *= disp; ey *= disp; ez *= disp;
          const { sx, sy } = project(ex, ey, ez);
          if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
        }
        const hue = (e / edges.length * 360 + t * 25) % 360;
        const edgeAlpha = 0.25 + avg * 0.45;
        ctx.strokeStyle = `hsla(${hue}, 70%, 60%, ${edgeAlpha})`;
        ctx.stroke();
      }
      // Draw cube face diagonals for extra detail
      const faceDiags = [[0,6],[1,7],[2,4],[3,5]];
      for (let d = 0; d < faceDiags.length; d++) {
        const [a, b] = faceDiags[d];
        const va = verts[a], vb = verts[b];
        ctx.beginPath();
        for (let i = 0; i <= segs; i++) {
          const frac = i / segs;
          let ex = va[0] + (vb[0] - va[0]) * frac;
          let ey = va[1] + (vb[1] - va[1]) * frac;
          let ez = va[2] + (vb[2] - va[2]) * frac;
          const freqIdx = Math.floor(frac * maxBin);
          const pointVal = data[Math.min(freqIdx, maxBin - 1)] / 255;
          const ripple = rippleStrength * Math.sin(frac * 10 + t * 3 + d);
          const disp = 1 + pointVal * baseDistort * 0.2 + ripple;
          ex *= disp; ey *= disp; ez *= disp;
          const { sx, sy } = project(ex, ey, ez);
          if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
        }
        const hue = (d / faceDiags.length * 360 + t * 20 + 180) % 360;
        ctx.strokeStyle = `hsla(${hue}, 60%, 55%, ${0.12 + avg * 0.2})`;
        ctx.stroke();
      }
    } else {
      // Default: Sphere wireframe
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
          const halfPts = lonPts / 2;
          const mirrorI = i <= halfPts ? i : lonPts - i;
          const freqIdx = Math.floor((mirrorI / halfPts) * maxBin);
          const pointVal = data[Math.min(freqIdx, maxBin - 1)] / 255;
          const combined = bandVal * 0.6 + pointVal * 0.4;
          const ripple = rippleStrength * Math.sin(theta * 8 + phi * 6 + t * 4) * Math.sin(phi * 4 - t * 3);
          const r = baseR * (1 + combined * baseDistort * 0.5 + ripple);
          const x3 = r * Math.sin(theta) * Math.cos(phi);
          const y3 = r * Math.cos(theta);
          const z3 = r * Math.sin(theta) * Math.sin(phi);
          const { sx, sy } = project(x3, y3, z3);
          if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
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
        const vertPos = Math.abs(Math.cos(theta));
        const latBandVal = bassAvg * (1 - vertPos) + highAvg * vertPos + midAvg * 0.5;
        ctx.beginPath();
        for (let i = 0; i <= latPts; i++) {
          const phi = (i / latPts) * Math.PI * 2;
          const halfPts = latPts / 2;
          const mirrorI = i <= halfPts ? i : latPts - i;
          const freqIdx = Math.floor((mirrorI / halfPts) * maxBin);
          const pointVal = data[Math.min(freqIdx, maxBin - 1)] / 255;
          const combined = latBandVal * 0.6 + pointVal * 0.4;
          const ripple = rippleStrength * Math.sin(theta * 8 + phi * 6 + t * 4) * Math.sin(phi * 4 - t * 3);
          const r = latR * (1 + combined * baseDistort * 0.5 + ripple);
          const x3 = r * Math.cos(phi);
          const z3 = r * Math.sin(phi);
          const { sx, sy } = project(x3, latY, z3);
          if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
        }
        const alpha = 0.1 + avg * 0.35;
        ctx.strokeStyle = `rgba(167,139,250,${alpha})`;
        ctx.stroke();
      }
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
        cursor: mouseActive ? (audio.playingSrc ? 'pointer' : 'default') : 'none',
      }}>
      {/* Full-bleed canvas */}
      <canvas
        ref={canvasRef}
        onClick={() => {
          audioRef.current.resumeAudioContext();
          ensureAnalyser();
          const src = audioRef.current.playingSrc;
          if (src) audioRef.current.toggle(src);
        }}
        onMouseMove={(e) => {
          const rect = canvasRef.current?.getBoundingClientRect();
          if (rect) mousePosRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        }}
        onMouseLeave={() => { mousePosRef.current = null; }}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', cursor: 'inherit' }}
      />

      {/* No audio notice */}
      {!audio.playingSrc && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5, pointerEvents: 'none' }}>
          <div style={{ textAlign: 'center', opacity: 0.5 }}>
            <div style={{ fontSize: 28, marginBottom: 8, color: '#818cf8' }}>♪</div>
            <div style={{ fontSize: 13, color: '#6b7280' }}>Play a song to see visualizations</div>
          </div>
        </div>
      )}

      {/* Song info overlay — top-left, auto-hide */}
      {currentSong && (
        <div style={{ position: 'absolute', top: 12, left: 16, zIndex: 10, opacity: mouseActive ? 1 : 0, transition: 'opacity 0.3s ease', pointerEvents: 'none' }}>
          <span style={{
            fontSize: 15,
            fontWeight: 600,
            color: '#e2e8f0',
            textShadow: '0 2px 8px rgba(0,0,0,0.6)',
            maxWidth: 360,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            display: 'block',
          }}>{currentSong.title}</span>
        </div>
      )}

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
