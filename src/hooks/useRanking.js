import { useMemo } from 'react';

function useRanking(songs, comparisons) {
  return useMemo(() => {
    if (songs.length < 2) return { standings: [], compMap: {}, compCount: {}, unrankedCount: 0, rankedCount: 0, phase: 1, placementPct: 0, eloSnapshots: [] };

    const compMap = {};
    const compPairCount = {};
    comparisons.forEach(c => {
      const key = [c.songA, c.songB].sort().join("|");
      compMap[key] = c.winner;
      compPairCount[key] = (compPairCount[key] || 0) + 1;
    });

    const elo = {}, wins = {}, losses = {};
    const eloMin = {}, eloMax = {};
    songs.forEach(s => { elo[s.id] = 500; wins[s.id] = 0; losses[s.id] = 0; eloMin[s.id] = 500; eloMax[s.id] = 500; });

    const eloSnapshots = [];

    const SOURCE_K = { tier: 24, quick: 32, classic: 48, bracket: 56 };

    const getDampedK = (currentElo, source) => {
      const baseK = SOURCE_K[source] || 40;
      const distFromCenter = Math.abs(currentElo - 500) / 500;
      const dampening = 1 - (distFromCenter * 0.4);
      return baseK * dampening;
    };

    comparisons.forEach((c, ci) => {
      const ra = elo[c.songA] || 500, rb = elo[c.songB] || 500;
      eloSnapshots.push({ songA: c.songA, songB: c.songB, winner: c.winner, eloA: ra, eloB: rb, index: ci });
      const ea = 1 / (1 + Math.pow(10, (rb - ra) / 400));
      const eb = 1 / (1 + Math.pow(10, (ra - rb) / 400));
      const src = c.source || "classic";
      const kA = getDampedK(ra, src);
      const kB = getDampedK(rb, src);
      if (c.winner === c.songA) {
        elo[c.songA] = Math.max(0, Math.min(1000, ra + kA * (1 - ea)));
        elo[c.songB] = Math.max(0, Math.min(1000, rb + kB * (0 - eb)));
        wins[c.songA] = (wins[c.songA]||0) + 1; losses[c.songB] = (losses[c.songB]||0) + 1;
      } else {
        elo[c.songB] = Math.max(0, Math.min(1000, rb + kB * (1 - eb)));
        elo[c.songA] = Math.max(0, Math.min(1000, ra + kA * (0 - ea)));
        wins[c.songB] = (wins[c.songB]||0) + 1; losses[c.songA] = (losses[c.songA]||0) + 1;
      }
      if (elo[c.songA] < eloMin[c.songA]) eloMin[c.songA] = elo[c.songA];
      if (elo[c.songA] > eloMax[c.songA]) eloMax[c.songA] = elo[c.songA];
      if (elo[c.songB] < eloMin[c.songB]) eloMin[c.songB] = elo[c.songB];
      if (elo[c.songB] > eloMax[c.songB]) eloMax[c.songB] = elo[c.songB];
    });

    const finalElo = { ...elo };

    const compCount = {};
    songs.forEach(s => compCount[s.id] = 0);
    comparisons.forEach(c => { compCount[c.songA]=(compCount[c.songA]||0)+1; compCount[c.songB]=(compCount[c.songB]||0)+1; });

    const lastCompared = {};
    comparisons.forEach(c => {
      const t = c.timestamp || 0;
      if (!lastCompared[c.songA] || t > lastCompared[c.songA]) lastCompared[c.songA] = t;
      if (!lastCompared[c.songB] || t > lastCompared[c.songB]) lastCompared[c.songB] = t;
    });

    const PLACEMENT_MIN = 3;
    const placedCount = songs.filter(s => compCount[s.id] >= PLACEMENT_MIN).length;
    const unrankedCount = songs.filter(s => compCount[s.id] < PLACEMENT_MIN).length;
    const phase = placedCount >= songs.length ? 2 : 1;
    const placementPct = songs.length > 0 ? placedCount / songs.length : 0;

    const standings = songs
      .map(s => ({
        ...s,
        elo: Math.round(s.baseElo > 0 ? s.baseElo : (elo[s.id] || 500)),
        eloRaw: Math.round(elo[s.id] || 500),
        eloMin: Math.round(eloMin[s.id] || 500),
        eloMax: Math.round(eloMax[s.id] || 500),
        wins: wins[s.id] || 0,
        losses: losses[s.id] || 0,
        lastComparedAt: lastCompared[s.id] || 0,
        totalComparisons: compCount[s.id] || 0,
      }))
      .sort((a, b) => b.elo - a.elo);

    return { standings, compMap, compPairCount, compCount, unrankedCount, rankedCount: songs.length - unrankedCount, phase, placementPct, eloSnapshots, finalElo };
  }, [songs, comparisons]);
}

function getPlacementPair(standings, compMap, compCount, genre, compPairCount) {
  const pool = genre ? standings.filter(s => s.genre === genre) : standings;
  if (pool.length < 2) return null;

  const allHaveBase = pool.every(s => (compCount[s.id] || 0) >= 3);
  const unrankedCount = pool.filter(s => (compCount[s.id] || 0) === 0).length;

  const getThreshold = (songId) => {
    if (!allHaveBase) return 3;
    const comps = compCount[songId] || 0;
    if (comps >= 3) return 3;
    return unrankedCount > 5 ? 4 : unrankedCount > 1 ? 5 : 7;
  };

  const needsPlacement = [...pool].filter(s => compCount[s.id] < getThreshold(s.id));
  if (needsPlacement.length === 0) return null;

  needsPlacement.sort((a, b) => compCount[a.id] - compCount[b.id]);
  const minCount = compCount[needsPlacement[0].id];
  const sameCount = needsPlacement.filter(s => compCount[s.id] === minCount);
  const target = sameCount[Math.floor(Math.random() * sameCount.length)];

  const byElo = [...pool].sort((a, b) => a.elo - b.elo);
  const targetIdx = byElo.findIndex(s => s.id === target.id);
  const targetComps = compCount[target.id] || 0;

  let candidates = [];

  if (targetComps === 0) {
    const medIdx = Math.floor(byElo.length / 2);
    candidates = [byElo[medIdx]];
  } else if (targetComps === 1) {
    const medianElo = byElo[Math.floor(byElo.length / 2)]?.elo || 500;
    if (target.elo >= medianElo) {
      candidates = [byElo[Math.floor(byElo.length * 0.75)]];
    } else {
      candidates = [byElo[Math.floor(byElo.length * 0.25)]];
    }
  } else {
    const range = Math.max(2, Math.floor(byElo.length * 0.1));
    const lo = Math.max(0, targetIdx - range);
    const hi = Math.min(byElo.length - 1, targetIdx + range);
    for (let i = lo; i <= hi; i++) {
      if (byElo[i].id !== target.id) candidates.push(byElo[i]);
    }
    candidates.sort((a, b) => Math.abs(a.elo - target.elo) - Math.abs(b.elo - target.elo));
  }

  for (const c of candidates) {
    if (c.id === target.id) continue;
    const key = [target.id, c.id].sort().join("|");
    if (compMap[key]) continue;
    return [target, c];
  }

  const fallbacks = [...pool]
    .filter(s => s.id !== target.id)
    .sort((a, b) => (compCount[b.id] || 0) - (compCount[a.id] || 0));
  for (const other of fallbacks) {
    const key = [target.id, other.id].sort().join("|");
    if (!compMap[key]) return [target, other];
  }
  return null;
}

function getRefinementPair(standings, compMap, genre, compCount) {
  const pool = genre ? standings.filter(s => s.genre === genre) : standings;
  if (pool.length < 2) return null;
  const sorted = [...pool].sort((a, b) => b.elo - a.elo);

  const totalComps = sorted.reduce((s, x) => s + (compCount[x.id] || 0), 0);
  const avgComps = totalComps / sorted.length || 1;
  const compCap = avgComps * 2.5;

  // 30% chance: prioritize under-compared songs
  if (Math.random() < 0.3) {
    const withCounts = sorted.map(s => ({ song: s, comps: compCount[s.id] || 0 }));
    const minComps = Math.min(...withCounts.map(w => w.comps));
    // Weight by inverse comparison count — fewer comps = higher weight
    const weights = withCounts.map(w => 1 / (1 + w.comps - minComps));
    const totalW = weights.reduce((a, b) => a + b, 0);
    let roll = Math.random() * totalW;
    let picked = withCounts[0];
    for (let i = 0; i < weights.length; i++) {
      roll -= weights[i];
      if (roll <= 0) { picked = withCounts[i]; break; }
    }
    // Find a nearby uncompared opponent
    const pickedIdx = sorted.indexOf(picked.song);
    const searchRange = Math.max(10, Math.floor(sorted.length * 0.15));
    let bestOpp = null, bestDist = Infinity;
    for (let i = Math.max(0, pickedIdx - searchRange); i < Math.min(sorted.length, pickedIdx + searchRange); i++) {
      if (i === pickedIdx) continue;
      const key = [picked.song.id, sorted[i].id].sort().join("|");
      if (compMap[key]) continue;
      const dist = Math.abs(picked.song.elo - sorted[i].elo);
      if (dist < bestDist) { bestDist = dist; bestOpp = sorted[i]; }
    }
    if (bestOpp) return [picked.song, bestOpp];
  }

  const adjacentUncompared = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const key = [sorted[i].id, sorted[i+1].id].sort().join("|");
    if (!compMap[key]) {
      const eloDiff = Math.abs(sorted[i].elo - sorted[i+1].elo);
      adjacentUncompared.push({ a: sorted[i], b: sorted[i+1], diff: eloDiff, idx: i });
    }
  }

  if (adjacentUncompared.length > 0 && Math.random() < 0.5) {
    adjacentUncompared.sort((a, b) => a.diff - b.diff);
    const pick = adjacentUncompared[Math.floor(Math.random() * Math.min(5, adjacentUncompared.length))];
    return [pick.a, pick.b];
  }

  const extremeThreshold = Math.max(1, Math.floor(sorted.length * 0.15));
  if (Math.random() < 0.2 && sorted.length >= 8) {
    const extremes = [...sorted.slice(0, extremeThreshold), ...sorted.slice(-extremeThreshold)];
    const midStart = Math.floor(sorted.length * 0.3);
    const midEnd = Math.floor(sorted.length * 0.7);
    const mids = sorted.slice(midStart, midEnd);
    if (extremes.length > 0 && mids.length > 0) {
      const ext = extremes[Math.floor(Math.random() * extremes.length)];
      const unfaced = mids.filter(m => m.id !== ext.id && !compMap[[ext.id, m.id].sort().join("|")]);
      if (unfaced.length > 0) {
        return [ext, unfaced[Math.floor(Math.random() * unfaced.length)]];
      }
    }
  }

  const candidates = sorted.map((s, i) => {
    const comps = compCount[s.id] || 0;
    const rankWeight = Math.max(0.1, 1 - (i / sorted.length) * 0.7);
    const capPenalty = comps > compCap ? 0.15 : 1;
    return { song: s, weight: rankWeight * capPenalty, index: i };
  });

  const totalWeight = candidates.reduce((s, c) => s + c.weight, 0);
  let roll = Math.random() * totalWeight;
  let songA = candidates[0];
  for (const c of candidates) {
    roll -= c.weight;
    if (roll <= 0) { songA = c; break; }
  }

  const goUp = Math.random() < 0.4 && songA.index > 0;
  let bestPair = null, bestScore = -Infinity;

  if (goUp) {
    for (let i = songA.index - 1; i >= 0; i--) {
      const key = [songA.song.id, sorted[i].id].sort().join("|");
      if (compMap[key]) continue;
      const bComps = compCount[sorted[i].id] || 0;
      if (bComps > compCap) continue;
      const dist = songA.song.elo - sorted[i].elo;
      const score = 100 - Math.abs(dist) * 0.3 + (1 - i / sorted.length) * 30;
      if (score > bestScore) { bestScore = score; bestPair = [songA.song, sorted[i]]; }
      if (songA.index - i > 15) break;
    }
  }

  if (!bestPair) {
    const searchStart = Math.max(0, songA.index - 10);
    const searchEnd = Math.min(sorted.length, songA.index + 15);
    for (let i = searchStart; i < searchEnd; i++) {
      if (i === songA.index) continue;
      const key = [songA.song.id, sorted[i].id].sort().join("|");
      if (compMap[key]) continue;
      const bComps = compCount[sorted[i].id] || 0;
      if (bComps > compCap) continue;
      const dist = Math.abs(songA.song.elo - sorted[i].elo);
      const score = 100 - dist;
      if (score > bestScore) { bestScore = score; bestPair = [songA.song, sorted[i]]; }
    }
  }

  if (!bestPair) {
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const key = [sorted[i].id, sorted[j].id].sort().join("|");
        if (!compMap[key]) return [sorted[i], sorted[j]];
      }
    }
  }

  return bestPair && bestPair[0].id !== bestPair[1].id ? bestPair : null;
}

export { useRanking, getPlacementPair, getRefinementPair };
