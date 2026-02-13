import React, { useState, useRef, useCallback, useEffect, createContext, useContext } from 'react';

const AudioCtx = createContext();

function AudioProvider({ children }) {
  const audioRef = useRef(null);
  const [playingSrc, setPlayingSrc] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(false);
  const [volume, setVolumeState] = useState(1);
  const listenersRef = useRef(new Set());
  const snapshotsRef = useRef({});

  const notify = useCallback(() => {
    listenersRef.current.forEach(fn => fn());
  }, []);

  const getSrcKey = useCallback((elSrc) => {
    if (!elSrc) return null;
    try { return new URL(elSrc).pathname; } catch { return elSrc; }
  }, []);

  const getSnapshot = useCallback((src) => snapshotsRef.current[src] || null, []);

  const playAttemptRef = useRef(0);

  const play = useCallback((src) => {
    const el = audioRef.current;
    if (!el) return;
    const currentKey = getSrcKey(el.src);
    if (currentKey && currentKey !== src && el.duration) {
      snapshotsRef.current[currentKey] = { time: el.currentTime, duration: el.duration };
    }
    const attemptId = ++playAttemptRef.current;
    if (currentKey !== src) {
      el.src = src;
    }
    // Resume Web Audio context before playing — must complete first or audio is silent
    const ctxReady = (webAudioCtxRef.current && webAudioCtxRef.current.state === 'suspended')
      ? webAudioCtxRef.current.resume() : Promise.resolve();
    ctxReady.catch(() => {}).then(() => {
      el.play().then(() => {
        if (playAttemptRef.current !== attemptId) return;
        setIsPlaying(true); isPlayingRef.current = true; setPlayingSrc(src); notify();
      }).catch((err) => {
        console.warn("[iMade] audio play failed:", err?.message || err);
      });
    });
  }, [notify, getSrcKey]);

  const pause = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    el.pause();
    setIsPlaying(false); isPlayingRef.current = false;
    notify();
  }, [notify]);

  const toggle = useCallback((src) => {
    const el = audioRef.current;
    if (!el) return;
    const currentKey = getSrcKey(el.src);
    const isSameSrc = currentKey === src;
    if (isSameSrc && isPlayingRef.current) { pause(); }
    else { play(src); }
  }, [play, pause, getSrcKey]);

  const seek = useCallback((time) => {
    const el = audioRef.current;
    if (!el || !el.duration) return;
    el.currentTime = Math.max(0, Math.min(el.duration, time));
    setCurrentTime(el.currentTime);
  }, []);

  const skip = useCallback((secs) => {
    const el = audioRef.current;
    if (!el || !el.duration) return;
    el.currentTime = Math.max(0, Math.min(el.duration, el.currentTime + secs));
  }, []);

  const stop = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    playAttemptRef.current++;
    el.pause();
    setIsPlaying(false); isPlayingRef.current = false;
    setPlayingSrc(null);
    setCurrentTime(0);
    setDuration(0);
    notify();
  }, [notify]);

  const subscribe = useCallback((fn) => {
    listenersRef.current.add(fn);
    return () => listenersRef.current.delete(fn);
  }, []);

  const setVolume = useCallback((v) => {
    const clamped = Math.max(0, Math.min(1, v));
    setVolumeState(clamped);
    if (audioRef.current) audioRef.current.volume = clamped;
  }, []);

  const onEndedRef = useRef(null);
  const webAudioCtxRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const analyserRef = useRef(null);

  const setOnEnded = useCallback((fn) => { onEndedRef.current = fn; }, []);

  const resumeAudioContext = useCallback(() => {
    if (webAudioCtxRef.current && webAudioCtxRef.current.state === 'suspended') {
      webAudioCtxRef.current.resume();
    }
  }, []);

  const ensureWebAudioCtx = useCallback(() => {
    if (webAudioCtxRef.current) return webAudioCtxRef.current;
    const WACtx = window.AudioContext || window.webkitAudioContext;
    if (!WACtx) return null;
    const ctx = new WACtx();
    webAudioCtxRef.current = ctx;
    return ctx;
  }, []);

  const getAudioContext = useCallback(() => {
    const ctx = ensureWebAudioCtx();
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }, [ensureWebAudioCtx]);

  const getAnalyser = useCallback(() => {
    const el = audioRef.current;
    if (!el) return null;
    if (analyserRef.current) {
      resumeAudioContext();
      return analyserRef.current;
    }
    const ctx = ensureWebAudioCtx();
    if (!ctx) return null;
    const source = ctx.createMediaElementSource(el);
    sourceNodeRef.current = source;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.92;
    source.connect(analyser);
    analyser.connect(ctx.destination);
    analyserRef.current = analyser;
    if (ctx.state === 'suspended') ctx.resume();
    return analyser;
  }, [resumeAudioContext, ensureWebAudioCtx]);

  // --- Global waveform recording (runs regardless of which tab is open) ---
  const WAVEFORM_SIZE = 2048;
  const waveformRef = useRef(null);    // { buffer, songSrc }
  const waveformTmpRef = useRef(null); // Uint8Array for getByteTimeDomainData

  useEffect(() => {
    if (!isPlaying) return;
    const el = audioRef.current;
    if (!el) return;

    const iv = setInterval(() => {
      const analyser = analyserRef.current;
      if (!analyser || !el.duration) return;

      const src = getSrcKey(el.src);
      // Reset buffer on song change
      if (!waveformRef.current || waveformRef.current.songSrc !== src) {
        waveformRef.current = { buffer: new Float32Array(WAVEFORM_SIZE), songSrc: src };
      }

      // Sample one time-domain value at the position matching current progress
      if (!waveformTmpRef.current || waveformTmpRef.current.length !== analyser.fftSize) {
        waveformTmpRef.current = new Uint8Array(analyser.fftSize);
      }
      analyser.getByteTimeDomainData(waveformTmpRef.current);
      const sample = (waveformTmpRef.current[Math.floor(analyser.fftSize / 2)] - 128) / 128;

      const progress = el.currentTime / el.duration;
      const idx = Math.min(Math.floor(progress * WAVEFORM_SIZE), WAVEFORM_SIZE - 1);
      waveformRef.current.buffer[idx] = sample;
    }, 16); // ~60fps sampling

    return () => clearInterval(iv);
  }, [isPlaying, getSrcKey]);

  const getWaveformBuffer = useCallback(() => waveformRef.current, []);

  const audioEl = React.createElement("audio", {
    ref: audioRef,
    preload: "auto",
    onTimeUpdate: () => { setCurrentTime(audioRef.current?.currentTime || 0); },
    onLoadedMetadata: () => { setDuration(audioRef.current?.duration || 0); },
    onEnded: () => { setIsPlaying(false); isPlayingRef.current = false; notify(); if (onEndedRef.current) onEndedRef.current(); },
    onError: (e) => { console.warn("[iMade] audio load error:", audioRef.current?.error?.message || e.type, "src:", audioRef.current?.src); },
    style: { display: "none" },
  });

  const value = { play, pause, toggle, seek, skip, stop, subscribe, playingSrc, currentTime, duration, isPlaying, setOnEnded, getSnapshot, volume, setVolume, getAnalyser, getAudioContext, resumeAudioContext, getWaveformBuffer };
  return React.createElement(AudioCtx.Provider, { value }, audioEl, children);
}

function useGlobalAudio() { return useContext(AudioCtx); }

export { AudioCtx as AudioContext, AudioProvider, useGlobalAudio };
