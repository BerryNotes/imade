import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useGlobalAudio } from '../components/AudioProvider';
import { useRanking } from '../hooks/useRanking';
import { formatDuration } from '../utils';
import api from '../api';

const TIER_RANGES = [
  { label: "S", min: 800, color: "#22c55e" },
  { label: "A", min: 650, color: "#818cf8" },
  { label: "B", min: 500, color: "#3b82f6" },
  { label: "C", min: 350, color: "#f59e0b" },
  { label: "D", min: 200, color: "#f97316" },
  { label: "E", min: 0, color: "#ef4444" },
];

function getTier(elo) {
  for (const t of TIER_RANGES) { if (elo >= t.min) return t; }
  return TIER_RANGES[TIER_RANGES.length - 1];
}

function getQuarterKey(dateStr) {
  const d = new Date(dateStr);
  return `${d.getFullYear()} Q${Math.floor(d.getMonth() / 3) + 1}`;
}

function drawChart(canvas, stats, standings, chartZoom, chartPan, showFitLine, chartGenre, selectedSongs, chartViewRef, chartPointsRef, fitLineRef) {
  if (!stats || !canvas || stats.dateEloPoints.length === 0) return;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const W = rect.width;
  const H = rect.height;

  const pad = { top: 20, right: 20, bottom: 50, left: 50 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const allPts = stats.dateEloPoints;
  const pts = chartGenre ? allPts.filter(p => p.genre === chartGenre) : allPts;
  if (allPts.length === 0) { ctx.fillStyle = "#14142a"; ctx.fillRect(0,0,W,H); ctx.fillStyle = "#6b6b80"; ctx.font = "13px sans-serif"; ctx.textAlign = "center"; ctx.fillText("No data yet", W/2, H/2); return; }
  if (pts.length === 0) { ctx.fillStyle = "#14142a"; ctx.fillRect(0,0,W,H); ctx.fillStyle = "#6b6b80"; ctx.font = "13px sans-serif"; ctx.textAlign = "center"; ctx.fillText("No songs in this genre", W/2, H/2); return; }

  const allDates = allPts.map(p => new Date(p.date).getTime());
  const rawMinDate = Math.min(...allDates);
  const rawMaxDate = Math.max(...allDates);
  const ONE_MONTH = 30 * 24 * 60 * 60 * 1000;
  const fullMinDate = rawMinDate - ONE_MONTH;
  const fullMaxDate = rawMaxDate + ONE_MONTH;
  const fullRange = fullMaxDate - fullMinDate || 1;

  const sortedByElo = [...standings].sort((a, b) => a.elo - b.elo);
  const lowestSongElo = sortedByElo.length > 0 ? sortedByElo[0].elo : 400;
  const highestSongElo = sortedByElo.length > 0 ? sortedByElo[sortedByElo.length - 1].elo : 600;
  const eloPadding = Math.max(20, Math.round((highestSongElo - lowestSongElo) * 0.08));
  const globalMinElo = lowestSongElo - eloPadding;
  const globalMaxElo = highestSongElo + eloPadding;

  chartViewRef.current = { fullMinDate, fullMaxDate, pad, plotW };

  const visibleRange = fullRange / chartZoom;
  const maxPan = fullRange - visibleRange;
  const panOffset = maxPan * chartPan;
  const minDate = fullMinDate + panOffset;
  const maxDate = minDate + visibleRange;

  const visiblePts = pts.filter(p => {
    const t = new Date(p.date).getTime();
    return t >= minDate && t <= maxDate;
  });

  const minElo = globalMinElo;
  const maxElo = globalMaxElo;
  const dateRange = maxDate - minDate || 1;
  const eloRange = maxElo - minElo || 1;

  // Background
  ctx.fillStyle = "#14142a";
  ctx.fillRect(0, 0, W, H);

  // Grid lines
  ctx.strokeStyle = "#1e1e35";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (plotH / 4) * i;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
    const eloLabel = Math.round(maxElo - (eloRange / 4) * i);
    ctx.fillStyle = "#6b6b80";
    ctx.font = "10px -apple-system, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(eloLabel, pad.left - 8, y + 4);
  }

  // X axis labels
  ctx.fillStyle = "#6b6b80";
  ctx.font = "10px -apple-system, sans-serif";
  ctx.textAlign = "center";
  const startYear = new Date(minDate).getFullYear();
  const endYear = new Date(maxDate).getFullYear();

  if (chartZoom <= 2) {
    for (let y = startYear; y <= endYear; y++) {
      const t = new Date(y, 0, 1).getTime();
      if (t < minDate || t > maxDate) continue;
      const x = pad.left + ((t - minDate) / dateRange) * plotW;
      if (x >= pad.left && x <= W - pad.right) {
        ctx.fillText(y.toString(), x, H - pad.bottom + 20);
        ctx.strokeStyle = "#1e1e3580";
        ctx.beginPath(); ctx.moveTo(x, pad.top); ctx.lineTo(x, pad.top + plotH); ctx.stroke();
      }
    }
  } else if (chartZoom <= 6) {
    for (let y = startYear; y <= endYear; y++) {
      for (let m = 0; m < 12; m++) {
        const t = new Date(y, m, 1).getTime();
        if (t < minDate || t > maxDate) continue;
        const x = pad.left + ((t - minDate) / dateRange) * plotW;
        if (x >= pad.left && x <= W - pad.right) {
          const label = new Date(y, m, 1).toLocaleDateString("en", { month: "short", year: "numeric" });
          ctx.fillText(label, x, H - pad.bottom + 20);
        }
      }
    }
  } else {
    const labelCount = Math.min(8, visiblePts.length);
    for (let i = 0; i < labelCount; i++) {
      const t = minDate + (dateRange / Math.max(labelCount - 1, 1)) * i;
      const x = pad.left + (plotW / Math.max(labelCount - 1, 1)) * i;
      const d = new Date(t);
      ctx.fillText(d.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" }), x, H - pad.bottom + 20);
    }
  }

  const genreColor = stats.genreColorMap;

  // Draw points
  const drawnPoints = [];
  ctx.save();
  ctx.beginPath();
  ctx.rect(pad.left, pad.top, plotW, plotH);
  ctx.clip();
  visiblePts.forEach(p => {
    const t = new Date(p.date).getTime();
    const x = pad.left + ((t - minDate) / dateRange) * plotW;
    const y = pad.top + ((maxElo - p.elo) / eloRange) * plotH;
    drawnPoints.push({ x, y, point: p });
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    const color = genreColor[p.genre] || "#818cf8";
    if (p.totalComparisons === 0) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.6;
      ctx.stroke();
    } else {
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.7;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  });
  ctx.restore();
  chartPointsRef.current = drawnPoints;

  // Best fit line
  fitLineRef.current = null;
  if (showFitLine && visiblePts.length >= 2) {
    const xs = visiblePts.map(p => new Date(p.date).getTime());
    const ys = visiblePts.map(p => p.elo);
    const n = xs.length;
    const sumX = xs.reduce((a,b) => a+b, 0);
    const sumY = ys.reduce((a,b) => a+b, 0);
    const sumXY = xs.reduce((a, x, i) => a + x * ys[i], 0);
    const sumX2 = xs.reduce((a, x) => a + x * x, 0);
    const denom = n * sumX2 - sumX * sumX;
    if (Math.abs(denom) > 0) {
      const slope = (n * sumXY - sumX * sumY) / denom;
      const intercept = (sumY - slope * sumX) / n;
      const sortedByDate = [...visiblePts].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const t1 = new Date(sortedByDate[0].date).getTime();
      const t2 = new Date(sortedByDate[sortedByDate.length - 1].date).getTime();
      const elo1 = slope * t1 + intercept;
      const elo2 = slope * t2 + intercept;
      const clampedElo1 = Math.max(globalMinElo, Math.min(globalMaxElo, elo1));
      const clampedElo2 = Math.max(globalMinElo, Math.min(globalMaxElo, elo2));
      const x1 = pad.left + ((t1 - minDate) / dateRange) * plotW;
      const x2 = pad.left + ((t2 - minDate) / dateRange) * plotW;
      const y1 = pad.top + ((maxElo - clampedElo1) / eloRange) * plotH;
      const y2 = pad.top + ((maxElo - clampedElo2) / eloRange) * plotH;
      fitLineRef.current = {
        x1, y1, x2, y2,
        elo1: Math.round(clampedElo1), elo2: Math.round(clampedElo2),
        date1: new Date(t1), date2: new Date(t2),
        change: Math.round(clampedElo2 - clampedElo1),
      };
      ctx.save();
      ctx.beginPath();
      ctx.rect(pad.left, pad.top, plotW, plotH);
      ctx.clip();
      ctx.strokeStyle = "#ef444488";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  // Highlight selected songs
  if (selectedSongs && selectedSongs.length > 0) {
    const selSet = new Set(selectedSongs);
    ctx.save();
    ctx.beginPath();
    ctx.rect(pad.left, pad.top, plotW, plotH);
    ctx.clip();
    drawnPoints.forEach(dp => {
      if (selSet.has(dp.point.id)) {
        ctx.beginPath();
        ctx.arc(dp.x, dp.y, 7, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(99,102,241,0.2)";
        ctx.fill();
      }
    });
    ctx.restore();
  }
}

function handleChartMouseMove(e, chartRef, isDraggingRef, setDragEnd, setChartTooltip, fitLineRef, showFitLine, chartPointsRef) {
  const rect = chartRef.current.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  if (isDraggingRef.current) {
    setDragEnd({ x: mx, y: my });
    setChartTooltip(null);
    return;
  }
  // Check if hovering near the best fit line
  const fl = fitLineRef.current;
  if (fl && showFitLine) {
    const dx = fl.x2 - fl.x1, dy = fl.y2 - fl.y1;
    const len = Math.sqrt(dx*dx + dy*dy);
    if (len > 0) {
      const t = Math.max(0, Math.min(1, ((mx - fl.x1)*dx + (my - fl.y1)*dy) / (len*len)));
      const px = fl.x1 + t*dx, py = fl.y1 + t*dy;
      const dist = Math.sqrt((mx-px)**2 + (my-py)**2);
      if (dist < 12) {
        setChartTooltip({ x: mx, y: my, fitLine: fl });
        return;
      }
    }
  }
  let closest = null;
  let closestDist = 20;
  for (const dp of chartPointsRef.current) {
    const dist = Math.sqrt((dp.x - mx) ** 2 + (dp.y - my) ** 2);
    if (dist < closestDist) { closestDist = dist; closest = dp; }
  }
  setChartTooltip(closest ? { x: closest.x, y: closest.y, point: closest.point } : null);
}

function StatsTab({ songs, comparisons, listenTimes, onStartFocusedSession, setPlayerQueue, setPlayerQueueIdx, switchTab, playlists, onRefresh, showToast }) {
  const ranking = useRanking(songs, comparisons);
  const { standings } = ranking;
  const tournament = ranking; // alias
  const [statsSubTab, setStatsSubTab] = useState("improvement");
  const chartRef = useRef(null);
  const chartAudio = useGlobalAudio();
  const [, forceAudioUpdate] = useState(0);
  useEffect(() => chartAudio.subscribe(() => forceAudioUpdate(n => n + 1)), [chartAudio.subscribe]);

  // Number key shortcuts — scroll to Nth card in active tab
  const cardRefsMap = useRef({});
  const cardRef = (tab, idx) => (el) => {
    if (!cardRefsMap.current[tab]) cardRefsMap.current[tab] = [];
    cardRefsMap.current[tab][idx] = el;
  };
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
      const num = parseInt(e.key);
      if (num >= 1 && num <= 9) {
        const cards = cardRefsMap.current[statsSubTab];
        if (cards && cards[num - 1]) {
          cards[num - 1].scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [statsSubTab]);
  const [chartZoom, setChartZoom] = useState(1);
  const [chartPan, setChartPan] = useState(0);
  const [chartTooltip, setChartTooltip] = useState(null);
  const [showFitLine, setShowFitLine] = useState(false);
  const [chartGenre, setChartGenre] = useState("");
  const [hoveredBucket, setHoveredBucket] = useState(null);
  const chartPointsRef = useRef([]);
  const fitLineRef = useRef(null);
  const chartViewRef = useRef({ fullMinDate: 0, fullMaxDate: 1, pad: { left: 50, right: 20 }, plotW: 100 });

  // Chart drag selection
  const [dragStart, setDragStart] = useState(null);
  const [dragEnd, setDragEnd] = useState(null);
  const [selectedSongs, setSelectedSongs] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef(null);


  const stats = useMemo(() => {
    if (comparisons.length === 0) return null;

    // Genre distribution
    const genreCounts = {};
    songs.forEach(s => { const g = s.genre || "untagged"; genreCounts[g] = (genreCounts[g] || 0) + 1; });

    // Average Elo by genre
    const genreElo = {};
    const genreEloCount = {};
    standings.forEach(s => {
      const g = s.genre || "untagged";
      genreElo[g] = (genreElo[g] || 0) + s.elo;
      genreEloCount[g] = (genreEloCount[g] || 0) + 1;
    });
    const avgEloByGenre = Object.keys(genreElo).map(g => ({
      genre: g, avgElo: Math.round(genreElo[g] / genreEloCount[g]), count: genreEloCount[g],
    })).sort((a, b) => b.avgElo - a.avgElo);


    // Date vs Elo data points (all songs with dates)
    const dateEloPoints = standings
      .filter(s => s.date)
      .map(s => ({ id: s.id, date: s.date, elo: s.elo, title: s.title, genre: s.genre || "untagged", wins: s.wins, losses: s.losses, audioFile: s.audioFile || null, totalComparisons: s.totalComparisons }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // All genres with colors for the legend — stable hash-based colors
    const allChartGenres = [...new Set(dateEloPoints.map(p => p.genre))].sort();
    const colorPalette = ["#818cf8","#f59e0b","#22c55e","#ef4444","#06b6d4","#ec4899","#8b5cf6","#f97316","#14b8a6","#64748b","#a3e635","#fb7185"];
    const genreColorMap = {};
    const hashStr = (s) => { let h = 0; for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; } return Math.abs(h); };
    allChartGenres.forEach(g => genreColorMap[g] = colorPalette[hashStr(g) % colorPalette.length]);

    return { genreCounts, avgEloByGenre, dateEloPoints, allChartGenres, genreColorMap };
  }, [songs, comparisons, standings]);

  // === Win Rate Trends ===
  const winRateTrends = useMemo(() => {
    if (!stats || standings.length === 0) return null;
    const rankedWithDates = standings.filter(s => s.date && s.totalComparisons > 0);
    if (rankedWithDates.length === 0) return null;

    // Group by quarter
    const quarters = {};
    rankedWithDates.forEach(s => {
      const qk = getQuarterKey(s.date);
      if (!quarters[qk]) quarters[qk] = [];
      quarters[qk].push(s);
    });

    const sortedKeys = Object.keys(quarters).sort();
    if (sortedKeys.length < 2) return null;

    // For each pair of quarters, compute cross-quarter win rate
    // "Win rate" = fraction of songs in this quarter that beat the overall average
    const overallAvg = rankedWithDates.reduce((s, x) => s + x.elo, 0) / rankedWithDates.length;

    const qData = sortedKeys.map(qk => {
      const qSongs = quarters[qk];
      const winsVsAvg = qSongs.filter(s => s.elo > overallAvg).length;
      const winRate = qSongs.length > 0 ? winsVsAvg / qSongs.length : 0;
      const avgElo = qSongs.reduce((s, x) => s + x.elo, 0) / qSongs.length;
      return { quarter: qk, count: qSongs.length, winRate, avgElo: Math.round(avgElo) };
    });

    // Compare newest half vs oldest half
    const mid = Math.floor(qData.length / 2);
    const olderSongs = sortedKeys.slice(0, mid).flatMap(k => quarters[k]);
    const newerSongs = sortedKeys.slice(mid).flatMap(k => quarters[k]);
    const olderWinRate = olderSongs.length > 0 ? olderSongs.filter(s => s.elo > overallAvg).length / olderSongs.length : 0;
    const newerWinRate = newerSongs.length > 0 ? newerSongs.filter(s => s.elo > overallAvg).length / newerSongs.length : 0;

    return { quarters: qData, newerWinRate, olderWinRate };
  }, [stats, standings]);

  // === Confidence Data ===
  const confidenceData = useMemo(() => {
    if (!stats || standings.length < 3) return null;
    const ranked = standings.filter(s => s.totalComparisons > 0);
    if (ranked.length < 3) return null;

    // Per-song confidence: lower variance (eloMax - eloMin) = higher confidence
    // Score = max(0, 100 - Math.round((eloMax - eloMin) / 3))
    const songConfidence = ranked.map(s => {
      const variance = s.eloMax - s.eloMin;
      const confidence = Math.max(0, 100 - Math.round(variance / 3));
      return { id: s.id, title: s.title, variance, confidence, elo: s.elo };
    });

    // Overall = average of per-song confidence
    const score = Math.round(songConfidence.reduce((s, x) => s + x.confidence, 0) / songConfidence.length);

    // Per-genre confidence = average confidence within genre
    const genreGroups = {};
    ranked.forEach((s, i) => {
      const g = s.genre || "untagged";
      if (!genreGroups[g]) genreGroups[g] = [];
      genreGroups[g].push(songConfidence[i].confidence);
    });
    const genreConfidence = Object.entries(genreGroups)
      .filter(([, scores]) => scores.length >= 2)
      .map(([genre, scores]) => ({
        genre,
        confidence: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
        count: scores.length,
      }))
      .sort((a, b) => b.confidence - a.confidence);

    const sorted = [...songConfidence].sort((a, b) => a.confidence - b.confidence);
    const leastConfident = sorted.slice(0, 5);
    const mostConfident = sorted.filter(s => s.confidence > 0).sort((a, b) => b.confidence - a.confidence).slice(0, 5);

    return { score, genreConfidence, leastConfident, mostConfident };
  }, [stats, standings]);

  // === Weakness Data ===
  const weaknessData = useMemo(() => {
    if (!stats || standings.length < 5) return null;
    const ranked = standings.filter(s => s.totalComparisons > 0);
    if (ranked.length < 5) return null;

    const overallAvg = ranked.reduce((s, x) => s + x.elo, 0) / ranked.length;

    // Genres below average
    const genreAvg = {};
    const genreCount = {};
    ranked.forEach(s => {
      const g = s.genre || "untagged";
      genreAvg[g] = (genreAvg[g] || 0) + s.elo;
      genreCount[g] = (genreCount[g] || 0) + 1;
    });
    const weakGenres = Object.entries(genreAvg)
      .map(([g, total]) => ({ genre: g, avgElo: Math.round(total / genreCount[g]), deficit: Math.round(overallAvg - total / genreCount[g]), count: genreCount[g] }))
      .filter(x => x.deficit > 0)
      .sort((a, b) => b.deficit - a.deficit);

    // Bottom 5 songs
    const bottom5 = [...ranked].sort((a, b) => a.elo - b.elo).slice(0, 5);

    return { weakGenres, bottom5, overallAvg: Math.round(overallAvg) };
  }, [stats, standings]);

  // === Creative Streaks ===
  const creativeStreaks = useMemo(() => {
    if (!stats || standings.length < 5) return null;
    const ranked = standings.filter(s => s.date && s.totalComparisons > 0).sort((a, b) => a.date.localeCompare(b.date));
    if (ranked.length < 5) return null;

    const sortedElos = ranked.map(s => s.elo).sort((a, b) => a - b);
    const p75 = sortedElos[Math.floor(sortedElos.length * 0.75)];
    const p25 = sortedElos[Math.floor(sortedElos.length * 0.25)];
    const overallAvg = ranked.reduce((s, x) => s + x.elo, 0) / ranked.length;

    // Classify each song
    const classified = ranked.map(s => ({
      ...s,
      tier: s.elo >= p75 ? "hot" : s.elo <= p25 ? "cold" : "neutral",
    }));

    // Find streaks of 3+
    const findStreaks = (type) => {
      const streaks = [];
      let current = [];
      for (const s of classified) {
        if (s.tier === type) {
          current.push(s);
        } else {
          if (current.length >= 3) streaks.push([...current]);
          current = [];
        }
      }
      if (current.length >= 3) streaks.push([...current]);
      return streaks.map(songs => ({
        songs,
        avgElo: Math.round(songs.reduce((s, x) => s + x.elo, 0) / songs.length),
        startDate: songs[0].date,
        endDate: songs[songs.length - 1].date,
      }));
    };

    // Month grid data
    const monthMap = {};
    ranked.forEach(s => {
      const d = new Date(s.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!monthMap[key]) monthMap[key] = [];
      monthMap[key].push(s);
    });
    const allDates = ranked.map(s => new Date(s.date));
    const minDate = new Date(Math.min(...allDates));
    const maxDate = new Date(Math.max(...allDates));
    const months = [];
    const cur = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    while (cur <= maxDate) {
      const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`;
      const songs = monthMap[key] || [];
      const avgElo = songs.length > 0 ? songs.reduce((s, x) => s + x.elo, 0) / songs.length : null;
      months.push({ key, year: cur.getFullYear(), month: cur.getMonth(), count: songs.length, avgElo: avgElo !== null ? Math.round(avgElo) : null });
      cur.setMonth(cur.getMonth() + 1);
    }

    return { timeline: classified, hotStreaks: findStreaks("hot"), coldStreaks: findStreaks("cold"), p75, p25, months, overallAvg };
  }, [stats, standings]);


  // === Auto Albums ===
  const autoAlbums = useMemo(() => {
    const ranked = standings.filter(s => s.totalComparisons > 0).sort((a, b) => b.elo - a.elo);
    if (ranked.length < 3) return null;

    // Genre groups for reuse
    const genreGroups = {};
    ranked.forEach(s => { const g = s.genre || "untagged"; if (!genreGroups[g]) genreGroups[g] = []; genreGroups[g].push(s); });
    const genreNames = Object.keys(genreGroups).sort((a, b) => genreGroups[b].length - genreGroups[a].length);

    // Your Best — top 10 by Elo
    const yourBest = ranked.slice(0, 10);
    const bestIds = new Set(yourBest.map(s => s.id));

    // Best of [Top Genre] — top 10 in the most popular genre (excluding overall top to diversify)
    const topGenre = genreNames[0] || "untagged";
    const bestOfGenre1 = (genreGroups[topGenre] || []).slice(0, 10);

    // Best of [2nd Genre] — top 10 in the second most popular genre
    const secondGenre = genreNames.length > 1 ? genreNames[1] : null;
    const bestOfGenre2 = secondGenre ? (genreGroups[secondGenre] || []).slice(0, 10) : [];

    // Hidden Gems — high Elo + low listen time, skip songs already in "Your Best"
    const ltEntries = Object.entries(listenTimes || {});
    const maxLT = ltEntries.length > 0 ? Math.max(...ltEntries.map(([, t]) => t)) : 1;
    const hiddenGems = ranked
      .filter(s => !bestIds.has(s.id))
      .map(s => ({ ...s, ltRatio: maxLT > 0 ? ((listenTimes || {})[s.id] || 0) / maxLT : 0 }))
      .filter(s => s.ltRatio < 0.3)
      .slice(0, 10);

    // Rising Stars — biggest positive Elo shift, >=5 comparisons, skip "Your Best"
    const risingStars = ranked
      .filter(s => s.totalComparisons >= 5 && !bestIds.has(s.id))
      .map(s => ({ ...s, shift: s.elo - 500 }))
      .sort((a, b) => b.shift - a.shift)
      .slice(0, 10);

    // Deep Cuts — 40th-60th percentile
    const total = ranked.length;
    const p40 = Math.floor(total * 0.4);
    const p60 = Math.floor(total * 0.6);
    const deepCuts = ranked.slice(p40, p60 + 1).slice(0, 10);

    const albums = [
      { id: "best", title: "Your Best", desc: "Top 10 by rating", songs: yourBest },
      { id: "genre1", title: `Best of ${topGenre}`, desc: `Top ${topGenre} songs`, songs: bestOfGenre1 },
    ];
    if (secondGenre && bestOfGenre2.length > 0) {
      albums.push({ id: "genre2", title: `Best of ${secondGenre}`, desc: `Top ${secondGenre} songs`, songs: bestOfGenre2 });
    }
    albums.push(
      { id: "gems", title: "Hidden Gems", desc: "High rating, low listen time", songs: hiddenGems },
      { id: "rising", title: "Rising Stars", desc: "Biggest Elo gains (5+ comparisons)", songs: risingStars },
      { id: "deep", title: "Deep Cuts", desc: "40th\u201360th percentile", songs: deepCuts },
    );
    return albums;
  }, [standings, listenTimes]);

  const [portfolioSaving, setPortfolioSaving] = useState(false);

  const saveAlbumAsPlaylist = async (album) => {
    if (!album || album.songs.length === 0) return;
    setPortfolioSaving(true);
    const name = `Album: ${album.title}`;
    try {
      await api.post("/api/playlists", { name, songIds: album.songs.map(s => s.id) });
      await onRefresh();
      showToast("Playlist saved: " + name);
    } catch (e) {
      showToast("Failed to save playlist");
    }
    setPortfolioSaving(false);
  };

  // Non-passive wheel handler to prevent page scroll and zoom toward cursor
  useEffect(() => {
    const canvas = chartRef.current;
    if (!canvas) return;
    const handler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const view = chartViewRef.current;

      if (e.shiftKey) {
        // Shift+scroll = pan
        setChartPan(p => Math.max(0, Math.min(1, p + e.deltaY * 0.002)));
      } else {
        // Scroll = zoom toward cursor
        const zoomIn = e.deltaY < 0;
        const factor = zoomIn ? 1.18 : 0.85;

        // Where is the cursor in the date range? (0..1 within plot area)
        const cursorFrac = Math.max(0, Math.min(1, (mx - view.pad.left) / view.plotW));

        setChartZoom(oldZoom => {
          const newZoom = Math.max(1, Math.min(20, oldZoom * factor));
          if (newZoom === 1) { setChartPan(0); return 1; }
          // Adjust pan so the date under cursor stays in place
          const oldVisibleFrac = 1 / oldZoom;
          const newVisibleFrac = 1 / newZoom;
          setChartPan(oldPan => {
            const oldStart = oldZoom > 1 ? oldPan * (1 - oldVisibleFrac) : 0;
            const cursorDateFrac = oldStart + cursorFrac * oldVisibleFrac;
            const newStart = cursorDateFrac - cursorFrac * newVisibleFrac;
            const maxStart = 1 - newVisibleFrac;
            return maxStart > 0 ? Math.max(0, Math.min(1, newStart / maxStart)) : 0;
          });
          return newZoom;
        });
      }
    };
    canvas.addEventListener("wheel", handler, { passive: false });
    return () => canvas.removeEventListener("wheel", handler);
  }, [stats]);

  // Draw the date-vs-elo chart on canvas
  useEffect(() => {
    drawChart(chartRef.current, stats, standings, chartZoom, chartPan, showFitLine, chartGenre, selectedSongs, chartViewRef, chartPointsRef, fitLineRef);
  }, [stats, standings, chartZoom, chartPan, showFitLine, chartGenre, selectedSongs]);

  if (!stats) return (
    <div style={{textAlign:"center",padding:80}}>
      <p style={{color:"#6b7280",fontSize:18}}>No comparisons yet</p>
      <p style={{color:"#6b6b80",fontSize:14,marginTop:4}}>Complete some comparisons first</p>
    </div>
  );

  const cardStyle = {background:"#14142a",border:"1px solid #1e1e35",borderRadius:12,padding:16};
  const headStyle = {color:"#6b7280",fontSize:12,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:12};
  const maxGenreCount = Math.max(...Object.values(stats.genreCounts));

  const subTabs = [
    { id: "improvement", label: "Improvement", icon: "\u{1F4C8}" },
    { id: "breakdown", label: "Breakdown", icon: "\u{1F4CA}" },
    { id: "listening", label: "Listening", icon: "\u{1F3A7}" },
    { id: "growth", label: "Growth", icon: "\u{1F680}" },
    { id: "portfolio", label: "Portfolio", icon: "\u{1F3AF}" },
  ];

  return (
    <div style={{display:"flex",gap:16}}>
      {/* Sidebar tabs */}
      <div style={{display:"flex",flexDirection:"column",gap:4,minWidth:110,flexShrink:0}}>
        {subTabs.map(t => (
          <button key={t.id} onClick={() => setStatsSubTab(t.id)}
            style={{
              display:"flex",alignItems:"center",gap:8,padding:"10px 14px",borderRadius:10,border:"none",
              background: statsSubTab === t.id ? "#1e1e35" : "transparent",
              color: statsSubTab === t.id ? "#e2e8f0" : "#6b6b80",
              fontSize:13,fontWeight: statsSubTab === t.id ? 600 : 400,
              cursor:"pointer",textAlign:"left",transition:"all 0.15s",
            }}
            onMouseEnter={e => { if (statsSubTab !== t.id) e.currentTarget.style.background = "#14142a"; }}
            onMouseLeave={e => { if (statsSubTab !== t.id) e.currentTarget.style.background = "transparent"; }}>
            <span style={{fontSize:14}}>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{flex:1,minWidth:0}}>
        {/* Summary cards — always visible */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:10,marginBottom:20}}>
          {[
            { label: "total songs", value: songs.length },
            { label: "comparisons", value: comparisons.length },
            { label: "progress", value: Math.round(songs.reduce((sum, s) => sum + Math.min(ranking.compCount[s.id] || 0, 3), 0) / Math.max(songs.length * 3, 1) * 100) + "%" },
            { label: "genres", value: Object.keys(stats.genreCounts).length },
          ].map(s => (
            <div key={s.label} style={{background:"#14142a",border:"1px solid #1e1e35",borderRadius:10,padding:"12px 14px",textAlign:"center"}}>
              <div style={{color:"#818cf8",fontSize:20,fontWeight:700}}>{s.value}</div>
              <div style={{color:"#6b6b80",fontSize:9,textTransform:"uppercase",letterSpacing:"0.08em",marginTop:3}}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* ===== IMPROVEMENT TAB ===== */}
        <div style={{display: statsSubTab === "improvement" ? "block" : "none"}}>
          {/* === Win Rate Ring === */}
          {winRateTrends && (
            <div ref={cardRef("improvement",0)} style={{...cardStyle,marginBottom:16,display:"flex",alignItems:"center",gap:20,flexWrap:"wrap"}}>
              <div style={{textAlign:"center",minWidth:100}}>
                <div style={{position:"relative",width:90,height:90,margin:"0 auto"}}>
                  <svg viewBox="0 0 100 100" style={{width:90,height:90}}>
                    <circle cx="50" cy="50" r="42" fill="none" stroke="#1e1e35" strokeWidth="8" />
                    <circle cx="50" cy="50" r="42" fill="none"
                      stroke="#22c55e" strokeWidth="8" strokeLinecap="round"
                      strokeDasharray={`${Math.round(winRateTrends.newerWinRate * 100) * 2.64} 264`}
                      transform="rotate(-90 50 50)" />
                  </svg>
                  <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",textAlign:"center"}}>
                    <div style={{color:"#22c55e",fontSize:22,fontWeight:700}}>{Math.round(winRateTrends.newerWinRate * 100)}%</div>
                  </div>
                </div>
              </div>
              <div style={{flex:1,minWidth:180}}>
                <div style={headStyle}>win rate</div>
                <div style={{fontSize:12}}>
                  <span style={{color:winRateTrends.newerWinRate > winRateTrends.olderWinRate ? "#22c55e" : "#f59e0b",fontWeight:600}}>
                    Your newer songs win {Math.round(winRateTrends.newerWinRate * 100)}% of the time
                  </span>
                  <span style={{color:"#6b7280"}}> vs {Math.round(winRateTrends.olderWinRate * 100)}% for older songs</span>
                </div>
              </div>
            </div>
          )}

            {/* Date vs Elo chart */}
            {stats.dateEloPoints.length > 0 && (
        <div ref={cardRef("improvement",1)} style={{...cardStyle,marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{...headStyle,marginBottom:0}}>rating by creation date</div>
              {chartGenre && <span style={{background:"#4338ca22",color:"#818cf8",padding:"2px 10px",borderRadius:12,fontSize:10}}>{chartGenre}</span>}
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              {chartZoom > 1 && <button onClick={()=>{setChartZoom(1);setChartPan(0)}} style={{background:"none",border:"1px solid #2a2a45",borderRadius:4,padding:"2px 8px",color:"#6b6b80",fontSize:10,cursor:"pointer"}}
                onMouseEnter={e=>e.target.style.color="#818cf8"} onMouseLeave={e=>e.target.style.color="#6b6b80"}>reset</button>}
              <button onClick={()=>setShowFitLine(v=>!v)} style={{background:showFitLine?"#818cf820":"none",border:"1px solid "+(showFitLine?"#818cf8":"#2a2a45"),borderRadius:8,padding:"6px 14px",color:showFitLine?"#818cf8":"#6b6b80",fontSize:12,cursor:"pointer",fontWeight:showFitLine?600:400}}
                onMouseEnter={e=>{if(!showFitLine)e.target.style.color="#818cf8"}} onMouseLeave={e=>{if(!showFitLine)e.target.style.color="#6b6b80"}}>best fit</button>
            </div>
          </div>
          <div style={{position:"relative",overscrollBehavior:"contain"}}>
            <canvas ref={chartRef} style={{width:"100%",height:280,borderRadius:8,cursor:"crosshair",touchAction:"none"}}
              onMouseDown={e => {
                const rect = chartRef.current.getBoundingClientRect();
                const mx = e.clientX - rect.left;
                const my = e.clientY - rect.top;
                const start = { x: mx, y: my };
                dragStartRef.current = start;
                setDragStart(start);
                setDragEnd(start);
                isDraggingRef.current = true;
                setIsDragging(true);
                setSelectedSongs(null);
              }}
              onMouseMove={e => handleChartMouseMove(e, chartRef, isDraggingRef, setDragEnd, setChartTooltip, fitLineRef, showFitLine, chartPointsRef)}
              onMouseUp={e => {
                if (!isDraggingRef.current || !dragStartRef.current) { isDraggingRef.current = false; setIsDragging(false); return; }
                isDraggingRef.current = false;
                setIsDragging(false);
                const rect = chartRef.current.getBoundingClientRect();
                const mx = e.clientX - rect.left;
                const my = e.clientY - rect.top;
                const ds = dragStartRef.current;
                const x1 = Math.min(ds.x, mx), x2 = Math.max(ds.x, mx);
                const y1 = Math.min(ds.y, my), y2 = Math.max(ds.y, my);
                // If drag was tiny, treat as click
                if (x2 - x1 < 8 && y2 - y1 < 8) {
                  setDragStart(null); setDragEnd(null);
                  let closest = null, closestDist = 20;
                  for (const dp of chartPointsRef.current) {
                    const dist = Math.sqrt((dp.x - mx) ** 2 + (dp.y - my) ** 2);
                    if (dist < closestDist) { closestDist = dist; closest = dp; }
                  }
                  if (closest && closest.point.audioFile) chartAudio.toggle(closest.point.audioFile);
                  return;
                }
                // Find songs inside the selection box
                const selected = chartPointsRef.current.filter(dp => dp.x >= x1 && dp.x <= x2 && dp.y >= y1 && dp.y <= y2).map(dp => dp.point);
                const uniqueIds = [...new Set(selected.map(s => s.id))];
                if (uniqueIds.length > 0) {
                  setSelectedSongs(uniqueIds);
                } else {
                  setSelectedSongs(null);
                }
                setDragStart(null); setDragEnd(null);
              }}
              onMouseLeave={() => { setChartTooltip(null); if (isDraggingRef.current) { isDraggingRef.current = false; setIsDragging(false); setDragStart(null); setDragEnd(null); } }}
            />
            {chartTooltip && (
              <div style={{
                position:"absolute",
                left: Math.min(chartTooltip.x, (chartRef.current?.getBoundingClientRect().width || 300) - 200),
                top: Math.max(0, chartTooltip.y - 80),
                background:"#0d0d1aee",border:"1px solid #2a2a45",borderRadius:8,padding:"8px 12px",
                pointerEvents:"none",zIndex:10,minWidth:140,backdropFilter:"blur(8px)"
              }}>
                {chartTooltip.fitLine ? (
                  <div>
                    <div style={{color:"#ef4444",fontSize:12,fontWeight:600,marginBottom:6}}>Best Fit Trend</div>
                    <div style={{display:"flex",justifyContent:"space-between",gap:16,fontSize:11,marginBottom:4}}>
                      <div>
                        <div style={{color:"#6b7280"}}>start</div>
                        <div style={{color:"#e2e8f0",fontWeight:600}}>{chartTooltip.fitLine.elo1}</div>
                        <div style={{color:"#6b6b80",fontSize:10}}>{chartTooltip.fitLine.date1.toLocaleDateString("en",{month:"short",day:"numeric",year:"numeric"})}</div>
                      </div>
                      <div style={{color:"#6b6b80",alignSelf:"center"}}>{"\u2192"}</div>
                      <div>
                        <div style={{color:"#6b7280"}}>end</div>
                        <div style={{color:"#e2e8f0",fontWeight:600}}>{chartTooltip.fitLine.elo2}</div>
                        <div style={{color:"#6b6b80",fontSize:10}}>{chartTooltip.fitLine.date2.toLocaleDateString("en",{month:"short",day:"numeric",year:"numeric"})}</div>
                      </div>
                    </div>
                    <div style={{borderTop:"1px solid #1e1e35",paddingTop:4,marginTop:2,textAlign:"center"}}>
                      <span style={{color:chartTooltip.fitLine.change>=0?"#22c55e":"#ef4444",fontSize:12,fontWeight:700}}>
                        {chartTooltip.fitLine.change>=0?"+":""}{chartTooltip.fitLine.change}
                      </span>
                      <span style={{color:"#6b7280",fontSize:10,marginLeft:4}}>avg level change</span>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                      {chartTooltip.point.audioFile && <span style={{color:chartAudio.playingSrc===chartTooltip.point.audioFile&&chartAudio.isPlaying?"#f59e0b":"#818cf8",display:"flex",alignItems:"center"}}>
                        {chartAudio.playingSrc===chartTooltip.point.audioFile&&chartAudio.isPlaying
                          ? <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
                          : <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor"><polygon points="6,4 20,12 6,20"/></svg>}
                      </span>}
                      <span style={{color:"#e2e8f0",fontSize:13,fontWeight:600}}>{chartTooltip.point.title}</span>
                    </div>
                    <div style={{display:"flex",gap:12,fontSize:11}}>
                      <span style={{color:"#818cf8"}}>Elo {chartTooltip.point.elo}</span>
                      <span style={{color:"#6b7280"}}>{chartTooltip.point.wins}W {chartTooltip.point.losses}L</span>
                    </div>
                    {chartTooltip.point.genre && <div style={{color:"#6b7280",fontSize:10,marginTop:2}}>{chartTooltip.point.genre}</div>}
                    <div style={{color:"#6b6b80",fontSize:10,marginTop:2}}>{new Date(chartTooltip.point.date).toLocaleDateString("en", { month:"long", day:"numeric", year:"numeric" })}</div>
                  </div>
                )}
              </div>
            )}
            {/* Drag selection rectangle */}
            {isDragging && dragStart && dragEnd && (
              <div style={{
                position:"absolute",
                left: Math.min(dragStart.x, dragEnd.x),
                top: Math.min(dragStart.y, dragEnd.y),
                width: Math.abs(dragEnd.x - dragStart.x),
                height: Math.abs(dragEnd.y - dragStart.y),
                border:"2px dashed #818cf8",
                background:"rgba(99,102,241,0.08)",
                borderRadius:4,
                pointerEvents:"none",zIndex:5
              }} />
            )}
          </div>
          {/* Selected songs panel */}
          {selectedSongs && selectedSongs.length > 0 && (
            <div style={{background:"#0d0d1a",border:"1px solid #4338ca40",borderRadius:10,padding:"12px 16px",marginTop:8}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <span style={{color:"#818cf8",fontSize:12,fontWeight:600}}>{selectedSongs.length} song{selectedSongs.length !== 1 ? "s" : ""} selected</span>
                <button onClick={() => setSelectedSongs(null)} style={{background:"none",border:"none",color:"#6b7280",fontSize:11,cursor:"pointer"}}>{"\u2715"} clear</button>
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:10}}>
                {selectedSongs.slice(0, 20).map(id => {
                  const s = songs.find(x => x.id === id);
                  return s ? <span key={id} style={{background:"#14142a",border:"1px solid #2a2a45",borderRadius:6,padding:"2px 8px",fontSize:10,color:"#a0a0b0"}}>{s.title}</span> : null;
                })}
                {selectedSongs.length > 20 && <span style={{color:"#6b7280",fontSize:10}}>+{selectedSongs.length - 20} more</span>}
              </div>
              {selectedSongs.length >= 8 ? (
                <div style={{display:"flex",gap:8}}>
                  <button onClick={() => { onStartFocusedSession(selectedSongs); setSelectedSongs(null); }}
                    style={{flex:1,padding:"10px",borderRadius:10,background:"linear-gradient(135deg,#4338ca,#6366f1)",border:"none",color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer"}}>
                    Start session
                  </button>
                  <button onClick={() => {
                    const playable = selectedSongs.map(id => songs.find(s => s.id === id)).filter(s => s && s.audioFile).sort(() => Math.random() - 0.5);
                    if (playable.length === 0) return;
                    setPlayerQueue(playable);
                    setPlayerQueueIdx(0);
                    chartAudio.play(playable[0].audioFile);
                    switchTab("player");
                    setSelectedSongs(null);
                  }}
                    style={{padding:"10px 16px",borderRadius:10,background:"#4338ca10",border:"1px solid #4338ca50",color:"#818cf8",fontSize:13,fontWeight:600,cursor:"pointer"}}>
                    {"\u2926"} Play
                  </button>
                </div>
              ) : (
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  <div style={{color:"#6b7280",fontSize:11,textAlign:"center"}}>Need at least 8 songs to start a session (select {8 - selectedSongs.length} more)</div>
                  <button onClick={() => {
                    const playable = selectedSongs.map(id => songs.find(s => s.id === id)).filter(s => s && s.audioFile).sort(() => Math.random() - 0.5);
                    if (playable.length === 0) return;
                    setPlayerQueue(playable);
                    setPlayerQueueIdx(0);
                    chartAudio.play(playable[0].audioFile);
                    switchTab("player");
                    setSelectedSongs(null);
                  }}
                    style={{width:"100%",padding:"10px",borderRadius:10,background:"#4338ca10",border:"1px solid #4338ca50",color:"#818cf8",fontSize:13,fontWeight:600,cursor:"pointer"}}>
                    {"\u2926"} Shuffle play {selectedSongs.length} song{selectedSongs.length !== 1 ? "s" : ""}
                  </button>
                </div>
              )}
            </div>
          )}
          {/* Genre legend — clickable to filter */}
          {stats.allChartGenres.length > 1 && (
            <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:8,justifyContent:"center"}}>
              {stats.allChartGenres.map(g => (
                <button key={g} onClick={()=>setChartGenre(prev => prev === g ? "" : g)}
                  style={{display:"flex",alignItems:"center",gap:4,background:"none",border:"1px solid "+(chartGenre===g?"#818cf8":"#1e1e35"),borderRadius:6,padding:"3px 8px",cursor:"pointer",opacity:chartGenre&&chartGenre!==g?0.4:1,transition:"opacity 0.15s"}}>
                  <span style={{width:8,height:8,borderRadius:2,background:stats.genreColorMap[g],display:"inline-block",flexShrink:0}} />
                  <span style={{color:chartGenre===g?"#e2e8f0":"#6b7280",fontSize:10}}>{g}</span>
                </button>
              ))}
            </div>
          )}
          {chartZoom > 1 && <div style={{color:"#5a5a70",fontSize:10,textAlign:"center",marginTop:4}}>scroll to zoom {"\u00B7"} shift+scroll to pan</div>}
        </div>
      )}

          </div>

        {/* ===== BREAKDOWN TAB ===== */}
        <div style={{display: statsSubTab === "breakdown" ? "block" : "none"}}>
      <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
      <div ref={cardRef("breakdown",0)} style={{...cardStyle,flex:"1 1 240px",minWidth:200}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={{...headStyle,marginBottom:0}}>genres by rating</div>
        </div>
        {Object.entries(stats.genreCounts).sort((a,b) => {
          const avgA = stats.avgEloByGenre.find(x => x.genre === a[0]);
          const avgB = stats.avgEloByGenre.find(x => x.genre === b[0]);
          return (avgB ? avgB.avgElo : 0) - (avgA ? avgA.avgElo : 0);
        }).map(([g, count]) => {
          const avg = stats.avgEloByGenre.find(x => x.genre === g);
          return (
            <div key={g} style={{marginBottom:6}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:1}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{width:7,height:7,borderRadius:2,background:stats.genreColorMap[g]||"#818cf8",display:"inline-block",flexShrink:0}} />
                  <span style={{color:"#e2e8f0",fontSize:11}}>{g}</span>
                </div>
                <div style={{display:"flex",gap:10}}>
                  <span style={{color:"#6b6b80",fontSize:10}}>{count}</span>
                  {avg && <span style={{color:"#818cf8",fontSize:10,fontWeight:600}}>avg {avg.avgElo}</span>}
                </div>
              </div>
              <div style={{height:3,background:"#1e1e35",borderRadius:2,overflow:"hidden",width:"50%"}}>
                <div style={{width:(count/maxGenreCount*100)+"%",height:"100%",background:"linear-gradient(90deg,#4338ca,#818cf8)",borderRadius:2}} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Elo Distribution Histogram */}
      {ranking.standings.length > 0 && (() => {
        const bucketSize = 50;
        const buckets = {};
        for (let i = 0; i <= 1000; i += bucketSize) buckets[i] = 0;
        ranking.standings.forEach(s => {
          const b = Math.min(Math.floor(s.elo / bucketSize) * bucketSize, 1000 - bucketSize);
          buckets[b] = (buckets[b] || 0) + 1;
        });
        const maxCount = Math.max(...Object.values(buckets), 1);
        const getTierColor = (elo) => {
          for (const t of TIER_RANGES) { if (elo >= t.min) return t.color; }
          return "#ef4444";
        };
        return (
          <div ref={cardRef("breakdown",1)} style={{...cardStyle,flex:"1 1 240px",minWidth:200}}>
            <div style={{...headStyle}}>rating distribution</div>
            <div style={{display:"flex",alignItems:"flex-end",gap:2,height:120,position:"relative"}} onMouseLeave={() => setHoveredBucket(null)}>
              {Object.entries(buckets).sort((a,b) => Number(a[0]) - Number(b[0])).map(([elo, count]) => {
                const h = count > 0 ? Math.max(4, Math.round((count / maxCount) * 110)) : 0;
                const e = Number(elo);
                const isHovered = hoveredBucket === elo;
                return (
                  <div key={elo} style={{flex:1,display:"flex",flexDirection:"column",justifyContent:"flex-end",alignItems:"center",height:"100%",position:"relative",cursor:count > 0 ? "pointer" : "default"}}
                    onMouseEnter={() => count > 0 && setHoveredBucket(elo)}>
                    {isHovered && count > 0 && (
                      <div style={{position:"absolute",top:-22,background:"#2a2a45",color:"#e2e8f0",fontSize:10,fontWeight:600,padding:"2px 6px",borderRadius:4,whiteSpace:"nowrap",zIndex:10,pointerEvents:"none"}}>
                        {count} song{count !== 1 ? "s" : ""} {"\u00B7"} {e}{"\u2013"}{e + bucketSize}
                      </div>
                    )}
                    <div style={{width:"100%",background:count > 0 ? getTierColor(e + bucketSize/2) : "transparent",borderRadius:"3px 3px 0 0",height:h,opacity:isHovered ? 1 : 0.7,transition:"height 0.3s, opacity 0.15s"}} />
                  </div>
                );
              })}
            </div>
            <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
              <span style={{color:"#6b6b80",fontSize:9}}>0</span>
              <span style={{color:"#6b6b80",fontSize:9}}>500</span>
              <span style={{color:"#6b6b80",fontSize:9}}>1000</span>
            </div>
            <div style={{display:"flex",gap:6,justifyContent:"center",marginTop:10,flexWrap:"wrap"}}>
              {TIER_RANGES.map(t => {
                const count = ranking.standings.filter(s => {
                  const idx = TIER_RANGES.indexOf(t);
                  const upper = idx > 0 ? TIER_RANGES[idx - 1].min : 1001;
                  return s.elo >= t.min && s.elo < upper;
                }).length;
                return (
                  <div key={t.label} style={{display:"flex",alignItems:"center",gap:3}}>
                    <span style={{width:7,height:7,borderRadius:2,background:t.color,opacity:0.7}} />
                    <span style={{color:"#9a9ab0",fontSize:9}}>{t.label}: {count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
      </div>

          {/* === Confidence Score === */}
          {confidenceData && (
            <div ref={cardRef("breakdown",2)} style={{...cardStyle,marginTop:16}}>
              <div style={headStyle}>confidence</div>
              <div style={{display:"flex",gap:20,flexWrap:"wrap"}}>
                {/* Gauge */}
                <div style={{textAlign:"center",minWidth:120}}>
                  <div style={{position:"relative",width:100,height:100,margin:"0 auto"}}>
                    <svg viewBox="0 0 100 100" style={{width:100,height:100}}>
                      <circle cx="50" cy="50" r="42" fill="none" stroke="#1e1e35" strokeWidth="8" />
                      <circle cx="50" cy="50" r="42" fill="none"
                        stroke={confidenceData.score >= 70 ? "#22c55e" : confidenceData.score >= 40 ? "#f59e0b" : "#ef4444"}
                        strokeWidth="8" strokeLinecap="round"
                        strokeDasharray={`${confidenceData.score * 2.64} 264`}
                        transform="rotate(-90 50 50)" />
                    </svg>
                    <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",textAlign:"center"}}>
                      <div style={{color:"#e2e8f0",fontSize:22,fontWeight:700}}>{confidenceData.score}</div>
                      <div style={{color:"#6b6b80",fontSize:8,textTransform:"uppercase"}}>of 100</div>
                    </div>
                  </div>
                </div>

                {/* Per-genre confidence */}
                <div style={{flex:1,minWidth:180}}>
                  <div style={{color:"#9a9ab0",fontSize:10,fontWeight:600,marginBottom:6,textTransform:"uppercase"}}>by genre</div>
                  {confidenceData.genreConfidence.slice(0, 8).map(g => (
                    <div key={g.genre} style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                      <span style={{color:"#e2e8f0",fontSize:11,minWidth:80,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{g.genre}</span>
                      <div style={{flex:1,height:8,background:"#1e1e35",borderRadius:4,overflow:"hidden"}}>
                        <div style={{width:g.confidence+"%",height:"100%",background:g.confidence >= 70 ? "#22c55e" : g.confidence >= 40 ? "#f59e0b" : "#ef4444",borderRadius:4}} />
                      </div>
                      <span style={{color:"#6b6b80",fontSize:9,minWidth:24,textAlign:"right"}}>{g.confidence}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Most / Least Confident */}
              <div style={{display:"flex",gap:16,marginTop:14,flexWrap:"wrap"}}>
                <div style={{flex:1,minWidth:180}}>
                  <div style={{color:"#ef4444",fontSize:10,fontWeight:600,marginBottom:6,textTransform:"uppercase"}}>least confident</div>
                  {confidenceData.leastConfident.map(s => (
                    <div key={s.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
                      <span style={{color:"#e2e8f0",fontSize:11,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{s.title}</span>
                      <span style={{color:"#ef4444",fontSize:10,fontWeight:600,flexShrink:0,marginLeft:8}}>{"\u00B1"}{Math.round(s.variance / 10)}</span>
                    </div>
                  ))}
                </div>
                <div style={{flex:1,minWidth:180}}>
                  <div style={{color:"#22c55e",fontSize:10,fontWeight:600,marginBottom:6,textTransform:"uppercase"}}>most confident</div>
                  {confidenceData.mostConfident.map(s => (
                    <div key={s.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
                      <span style={{color:"#e2e8f0",fontSize:11,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{s.title}</span>
                      <span style={{color:"#22c55e",fontSize:10,fontWeight:600,flexShrink:0,marginLeft:8}}>{"\u00B1"}{Math.round(s.variance / 10)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* === Weakness Mapping === */}
          {weaknessData && (
            <div ref={cardRef("breakdown",3)} style={{...cardStyle,marginTop:16}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <div style={headStyle}>weakness mapping</div>
                <span style={{color:"#6b7280",fontSize:11}}>avg <span style={{color:"#818cf8",fontWeight:600}}>{weaknessData.overallAvg}</span></span>
              </div>

              {/* Weak genres */}
              {weaknessData.weakGenres.length > 0 && (
                <div style={{marginBottom:12}}>
                  <div style={{color:"#f59e0b",fontSize:10,fontWeight:600,marginBottom:6,textTransform:"uppercase"}}>weak genres</div>
                  {weaknessData.weakGenres.map(g => (
                    <div key={g.genre} style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
                      <span style={{color:"#e2e8f0",fontSize:11,minWidth:70,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{g.genre}</span>
                      <div style={{flex:1,height:8,background:"#1e1e35",borderRadius:4,overflow:"hidden",direction:"rtl"}}>
                        <div style={{width:Math.min(100, g.deficit / 2)+"%",height:"100%",background:"#ef4444",borderRadius:4,opacity:0.7}} />
                      </div>
                      <span style={{color:"#ef4444",fontSize:9,minWidth:30,textAlign:"right"}}>-{g.deficit}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Bottom 5 songs */}
              <div>
                <div style={{color:"#ef4444",fontSize:10,fontWeight:600,marginBottom:6,textTransform:"uppercase"}}>bottom 5</div>
                {weaknessData.bottom5.map((s, i) => (
                  <div key={s.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                    <span style={{color:"#5a5a70",fontSize:10,fontWeight:700,minWidth:16,textAlign:"right"}}>{i + 1}</span>
                    <span style={{color:"#e2e8f0",fontSize:11,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.title}</span>
                    <span style={{color:getTier(s.elo).color,fontSize:10,fontWeight:600}}>{s.elo}</span>
                    <span style={{color:"#5a5a70",fontSize:9}}>{s.wins}W {s.losses}L</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          </div>

        {/* ===== LISTENING TAB ===== */}
        <div style={{display: statsSubTab === "listening" ? "block" : "none"}}>
      {(() => {
        const entries = Object.entries(listenTimes || {}).filter(([id, t]) => t > 0 && songs.find(s => s.id === id));
        const totalListenSec = entries.reduce((sum, [, t]) => sum + t, 0);
        const topListened = entries
          .map(([id, t]) => ({ song: songs.find(s => s.id === id), time: t }))
          .filter(x => x.song)
          .sort((a, b) => b.time - a.time);
        const maxTime = topListened[0]?.time || 1;
        const genreTime = {};
        topListened.forEach(({ song, time }) => {
          const g = song.genre || "untagged";
          genreTime[g] = (genreTime[g] || 0) + time;
        });
        const genreTimeSorted = Object.entries(genreTime).sort((a,b) => b[1] - a[1]);
        const maxGenreTime = genreTimeSorted[0]?.[1] || 1;

        if (entries.length === 0) return (
          <div style={{...cardStyle,textAlign:"center",padding:40}}>
            <span style={{fontSize:32}}>{"\u{1F3A7}"}</span>
            <p style={{color:"#6b6b80",fontSize:14,marginTop:12}}>No listening data yet</p>
            <p style={{color:"#5a5a70",fontSize:12}}>Play songs in the app to start tracking</p>
          </div>
        );

        return (
          <div>
            <div ref={cardRef("listening",0)} style={{...cardStyle,marginBottom:16}}>
              <div style={headStyle}>overview</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                {[
                  { label: "total time", value: formatDuration(totalListenSec), color: "#22c55e" },
                  { label: "songs played", value: topListened.length, color: "#818cf8" },
                  { label: "coverage", value: (songs.length > 0 ? Math.round(topListened.length / songs.length * 100) : 0) + "%", color: "#f59e0b" },
                ].map(s => (
                  <div key={s.label} style={{background:"#0d0d1a",borderRadius:8,padding:"10px",textAlign:"center"}}>
                    <div style={{color:s.color,fontSize:18,fontWeight:700}}>{s.value}</div>
                    <div style={{color:"#6b6b80",fontSize:9,textTransform:"uppercase",marginTop:2}}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
              <div ref={cardRef("listening",1)} style={{...cardStyle,flex:"1 1 280px",minWidth:220}}>
                <div style={headStyle}>most listened</div>
                {topListened.slice(0, 10).map(({ song, time }, i) => (
                  <div key={song.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                    <span style={{color:i < 3 ? "#f59e0b" : "#5a5a70",fontSize:11,fontWeight:700,minWidth:20,textAlign:"right"}}>{i + 1}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <span style={{color:"#e2e8f0",fontSize:12,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{song.title}</span>
                        <span style={{color:"#22c55e",fontSize:10,flexShrink:0}}>{formatDuration(time)}</span>
                      </div>
                      <div style={{height:3,background:"#1e1e35",borderRadius:2,overflow:"hidden",marginTop:3}}>
                        <div style={{width:(time/maxTime*100)+"%",height:"100%",background:"linear-gradient(90deg,#22c55e,#4ade80)",borderRadius:2}} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {genreTimeSorted.length > 1 && (
                <div ref={cardRef("listening",2)} style={{...cardStyle,flex:"1 1 220px",minWidth:180}}>
                  <div style={headStyle}>time by genre</div>
                  {genreTimeSorted.slice(0, 10).map(([g, time]) => (
                    <div key={g} style={{marginBottom:6}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
                        <span style={{color:"#e2e8f0",fontSize:11}}>{g}</span>
                        <span style={{color:"#6b6b80",fontSize:10}}>{formatDuration(time)}</span>
                      </div>
                      <div style={{height:3,background:"#1e1e35",borderRadius:2,overflow:"hidden",width:"80%"}}>
                        <div style={{width:(time/maxGenreTime*100)+"%",height:"100%",background:stats.genreColorMap[g]||"#818cf8",borderRadius:2,opacity:0.7}} />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Per-song listening by genre */}
              {genreTimeSorted.length > 1 && (() => {
                const genreSongCount = {};
                topListened.forEach(({ song }) => {
                  const g = song.genre || "untagged";
                  genreSongCount[g] = (genreSongCount[g] || 0) + 1;
                });
                const perSong = genreTimeSorted
                  .map(([g, time]) => ({ genre: g, perSong: time / (genreSongCount[g] || 1) }))
                  .sort((a, b) => b.perSong - a.perSong);
                const maxPerSong = perSong[0]?.perSong || 1;
                return (
                  <div ref={cardRef("listening",3)} style={{...cardStyle,flex:"1 1 220px",minWidth:180}}>
                    <div style={headStyle}>most replayed genres</div>
                    {perSong.slice(0, 10).map(g => (
                      <div key={g.genre} style={{marginBottom:6}}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
                          <span style={{color:"#e2e8f0",fontSize:11}}>{g.genre}</span>
                          <span style={{color:"#6b6b80",fontSize:10}}>{formatDuration(Math.round(g.perSong))}/track</span>
                        </div>
                        <div style={{height:3,background:"#1e1e35",borderRadius:2,overflow:"hidden",width:"80%"}}>
                          <div style={{width:(g.perSong/maxPerSong*100)+"%",height:"100%",background:stats.genreColorMap[g.genre]||"#818cf8",borderRadius:2,opacity:0.7}} />
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        );
      })()}
          </div>

        {/* ===== GROWTH TAB ===== */}
        <div style={{display: statsSubTab === "growth" ? "block" : "none"}}>
          {creativeStreaks ? (
            <div>
              {/* Month Grid Calendar */}
              <div ref={cardRef("growth",0)} style={{...cardStyle,marginBottom:16}}>
                <div style={headStyle}>monthly output</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(56px,1fr))",gap:4}}>
                  {creativeStreaks.months.map(m => {
                    const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                    const bg = m.count === 0 ? "#1e1e35" : m.avgElo >= creativeStreaks.overallAvg ? `rgba(34,197,94,${Math.min(0.7, 0.2 + (m.avgElo - creativeStreaks.overallAvg) / 300)})` : `rgba(239,68,68,${Math.min(0.7, 0.2 + (creativeStreaks.overallAvg - m.avgElo) / 300)})`;
                    return (
                      <div key={m.key} title={`${monthNames[m.month]} ${m.year}: ${m.count} song${m.count !== 1 ? "s" : ""}${m.avgElo !== null ? ", avg " + m.avgElo : ""}`}
                        style={{background:bg,borderRadius:6,padding:"6px 4px",textAlign:"center",minHeight:40,display:"flex",flexDirection:"column",justifyContent:"center"}}>
                        <div style={{color:"#9a9ab0",fontSize:8}}>{monthNames[m.month]} {String(m.year).slice(2)}</div>
                        <div style={{color:m.count > 0 ? "#e2e8f0" : "#5a5a70",fontSize:13,fontWeight:700}}>{m.count || "-"}</div>
                        {m.avgElo !== null && <div style={{color:"#9a9ab0",fontSize:8}}>{m.avgElo}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Hot & Cold Streaks Side by Side */}
              <div ref={cardRef("growth",1)} style={{display:"flex",gap:16,flexWrap:"wrap"}}>
                <div style={{...cardStyle,flex:"1 1 240px",minWidth:200}}>
                  <div style={{color:"#22c55e",fontSize:10,fontWeight:600,marginBottom:8,textTransform:"uppercase"}}>
                    hot streaks ({creativeStreaks.hotStreaks.length})
                  </div>
                  {creativeStreaks.hotStreaks.length === 0 && (
                    <div style={{color:"#5a5a70",fontSize:11}}>No hot streaks yet</div>
                  )}
                  {creativeStreaks.hotStreaks.map((streak, si) => (
                    <div key={si} style={{background:"#22c55e08",border:"1px solid #22c55e20",borderRadius:8,padding:"8px 12px",marginBottom:6}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                        <span style={{color:"#22c55e",fontSize:10,fontWeight:600}}>{streak.songs.length} songs, avg {streak.avgElo}</span>
                        <span style={{color:"#5a5a70",fontSize:9}}>{new Date(streak.startDate).toLocaleDateString("en",{month:"short",year:"numeric"})} {"\u2013"} {new Date(streak.endDate).toLocaleDateString("en",{month:"short",year:"numeric"})}</span>
                      </div>
                      {streak.songs.map(s => (
                        <div key={s.id} style={{color:"#e2e8f0",fontSize:10,marginBottom:1}}>{s.title} <span style={{color:"#22c55e"}}>{s.elo}</span></div>
                      ))}
                    </div>
                  ))}
                </div>
                <div style={{...cardStyle,flex:"1 1 240px",minWidth:200}}>
                  <div style={{color:"#ef4444",fontSize:10,fontWeight:600,marginBottom:8,textTransform:"uppercase"}}>
                    cold streaks ({creativeStreaks.coldStreaks.length})
                  </div>
                  {creativeStreaks.coldStreaks.length === 0 && (
                    <div style={{color:"#5a5a70",fontSize:11}}>No cold streaks yet</div>
                  )}
                  {creativeStreaks.coldStreaks.map((streak, si) => (
                    <div key={si} style={{background:"#ef444408",border:"1px solid #ef444420",borderRadius:8,padding:"8px 12px",marginBottom:6}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                        <span style={{color:"#ef4444",fontSize:10,fontWeight:600}}>{streak.songs.length} songs, avg {streak.avgElo}</span>
                        <span style={{color:"#5a5a70",fontSize:9}}>{new Date(streak.startDate).toLocaleDateString("en",{month:"short",year:"numeric"})} {"\u2013"} {new Date(streak.endDate).toLocaleDateString("en",{month:"short",year:"numeric"})}</span>
                      </div>
                      {streak.songs.map(s => (
                        <div key={s.id} style={{color:"#e2e8f0",fontSize:10,marginBottom:1}}>{s.title} <span style={{color:"#ef4444"}}>{s.elo}</span></div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div style={{...cardStyle,textAlign:"center",padding:40}}>
              <p style={{color:"#6b6b80",fontSize:14}}>Need at least 5 ranked songs with dates for growth analysis</p>
            </div>
          )}
        </div>

        {/* ===== PORTFOLIO TAB ===== */}
        <div style={{display: statsSubTab === "portfolio" ? "block" : "none"}}>
          {autoAlbums ? (
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))",gap:16}}>
              {autoAlbums.map((album, ai) => (
                <div key={album.id} ref={cardRef("portfolio",ai)} style={{...cardStyle,display:"flex",flexDirection:"column"}}>
                  <div style={{marginBottom:10}}>
                    <div style={{color:"#e2e8f0",fontSize:14,fontWeight:600}}>{album.title}</div>
                    <div style={{color:"#6b7280",fontSize:11}}>{album.desc}</div>
                  </div>
                  {album.songs.length === 0 ? (
                    <div style={{color:"#5a5a70",fontSize:11,padding:"12px 0",textAlign:"center",flex:1}}>No songs match</div>
                  ) : (
                    <div style={{flex:1,marginBottom:10,maxHeight:260,overflowY:"auto"}}>
                      {album.songs.map((s, i) => {
                        const tier = getTier(s.elo);
                        return (
                          <div key={s.id} style={{display:"flex",alignItems:"center",gap:6,padding:"3px 0",borderBottom:"1px solid #1e1e3530"}}>
                            <span style={{color:"#5a5a70",fontSize:9,fontWeight:700,minWidth:16,textAlign:"right"}}>{i + 1}</span>
                            <span style={{background:tier.color+"20",color:tier.color,padding:"1px 5px",borderRadius:4,fontSize:8,fontWeight:700}}>{tier.label}</span>
                            <span style={{color:"#e2e8f0",fontSize:11,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.title}</span>
                            <span style={{color:"#818cf8",fontSize:9,fontWeight:600}}>{s.elo}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {album.songs.length > 0 && (
                    <div style={{display:"flex",gap:6}}>
                      <button onClick={() => saveAlbumAsPlaylist(album)} disabled={portfolioSaving}
                        style={{flex:1,padding:"7px",borderRadius:8,background:"#22c55e",border:"none",color:"#000",fontSize:11,fontWeight:600,cursor:portfolioSaving?"wait":"pointer",opacity:portfolioSaving?0.6:1}}>
                        Save as Playlist
                      </button>
                      <button onClick={() => {
                        const playable = album.songs.filter(s => s.audioFile);
                        if (playable.length === 0) return;
                        setPlayerQueue(playable);
                        setPlayerQueueIdx(0);
                        chartAudio.play(playable[0].audioFile);
                        switchTab("player");
                      }}
                        style={{padding:"7px 14px",borderRadius:8,background:"#4338ca10",border:"1px solid #4338ca50",color:"#818cf8",fontSize:11,fontWeight:600,cursor:"pointer"}}>
                        Play
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={{...cardStyle,textAlign:"center",padding:40}}>
              <p style={{color:"#6b6b80",fontSize:14}}>Need at least 3 ranked songs for auto albums</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default StatsTab;
