import React, { useState, useRef, useCallback, createContext, useContext } from 'react';

const AudioContext = createContext();

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
    el.play().then(() => {
      if (playAttemptRef.current !== attemptId) return;
      setIsPlaying(true); isPlayingRef.current = true; setPlayingSrc(src); notify();
    }).catch(() => {});
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

  const setOnEnded = useCallback((fn) => { onEndedRef.current = fn; }, []);

  const audioEl = React.createElement("audio", {
    ref: audioRef,
    preload: "auto",
    onTimeUpdate: () => { setCurrentTime(audioRef.current?.currentTime || 0); },
    onLoadedMetadata: () => { setDuration(audioRef.current?.duration || 0); },
    onEnded: () => { setIsPlaying(false); isPlayingRef.current = false; notify(); if (onEndedRef.current) onEndedRef.current(); },
    style: { display: "none" },
  });

  const value = { play, pause, toggle, seek, skip, stop, subscribe, playingSrc, currentTime, duration, isPlaying, setOnEnded, getSnapshot, volume, setVolume };
  return React.createElement(AudioContext.Provider, { value }, audioEl, children);
}

function useGlobalAudio() { return useContext(AudioContext); }

export { AudioContext, AudioProvider, useGlobalAudio };
