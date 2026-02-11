const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_DIR = process.env.APP_DATA_PATH || __dirname;
const DATA_DIR = path.join(BASE_DIR, "data");
const UPLOADS_DIR = path.join(BASE_DIR, "uploads");
const SONGS_FILE = path.join(DATA_DIR, "songs.json");
const GENRES_FILE = path.join(DATA_DIR, "genres.json");
const COMPARISONS_FILE = path.join(DATA_DIR, "comparisons.json");
const PLAYLISTS_FILE = path.join(DATA_DIR, "playlists.json");
const BACKUPS_DIR = path.join(BASE_DIR, "backups");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);
if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR);
if (!fs.existsSync(SONGS_FILE)) fs.writeFileSync(SONGS_FILE, "[]");
if (!fs.existsSync(GENRES_FILE))
  fs.writeFileSync(GENRES_FILE, JSON.stringify([
    "Hip Hop","R&B","Pop","Rock","Electronic","Jazz","Lo-Fi",
    "Soul","Funk","Indie","Ambient","Trap","Acoustic","Experimental","Other"
  ]));
if (!fs.existsSync(COMPARISONS_FILE)) fs.writeFileSync(COMPARISONS_FILE, "[]");
if (!fs.existsSync(PLAYLISTS_FILE)) fs.writeFileSync(PLAYLISTS_FILE, "[]");

const readJSON = (f) => {
  try {
    return JSON.parse(fs.readFileSync(f, "utf-8"));
  } catch (e) {
    const backup = f + ".bak";
    if (fs.existsSync(backup)) {
      console.error(`Warning: ${path.basename(f)} corrupted, restoring from backup`);
      const data = JSON.parse(fs.readFileSync(backup, "utf-8"));
      fs.writeFileSync(f, JSON.stringify(data, null, 2));
      return data;
    }
    return [];
  }
};

const writeJSON = (f, d) => {
  const json = JSON.stringify(d, null, 2);
  const tmp = f + ".tmp";
  fs.writeFileSync(tmp, json);
  if (fs.existsSync(f)) {
    try { fs.copyFileSync(f, f + ".bak"); } catch {}
  }
  fs.renameSync(tmp, f);
};

// In-memory cache — pre-warmed at startup, updated on writes
const cache = {};
[SONGS_FILE, GENRES_FILE, COMPARISONS_FILE, PLAYLISTS_FILE].forEach(f => { cache[f] = readJSON(f); });

const readJSONAsync = async (f) => {
  if (cache[f]) return cache[f];
  try {
    const raw = await fs.promises.readFile(f, "utf-8");
    const data = JSON.parse(raw);
    cache[f] = data;
    return data;
  } catch (e) {
    const backup = f + ".bak";
    try {
      await fs.promises.access(backup);
      console.error(`Warning: ${path.basename(f)} corrupted, restoring from backup`);
      const raw = await fs.promises.readFile(backup, "utf-8");
      const data = JSON.parse(raw);
      await fs.promises.writeFile(f, JSON.stringify(data, null, 2));
      cache[f] = data;
      return data;
    } catch {
      return [];
    }
  }
};

const writeJSONAsync = async (f, d) => {
  cache[f] = d;
  const json = JSON.stringify(d, null, 2);
  const tmp = f + ".tmp";
  await fs.promises.writeFile(tmp, json);
  try { await fs.promises.copyFile(f, f + ".bak"); } catch {}
  await fs.promises.rename(tmp, f);
};

// Per-file lock to prevent concurrent read-modify-write races
const fileLocks = new Map();
const withLock = (f, fn) => {
  const chain = (fileLocks.get(f) || Promise.resolve()).then(fn, fn);
  fileLocks.set(f, chain.catch(() => {}));
  return chain;
};

app.use(express.json());
app.use("/uploads", express.static(UPLOADS_DIR));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e6);
    cb(null, unique + path.extname(file.originalname));
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("audio/")) cb(null, true);
    else cb(new Error("Only audio files allowed"), false);
  },
});

// ---- SONGS ----

app.get("/api/songs", async (req, res) => res.json(await readJSONAsync(SONGS_FILE)));

app.post("/api/songs/bulk", upload.array("audio", 200), async (req, res) => {
  const songs = await readJSONAsync(SONGS_FILE);
  const newSongs = [];
  let dates = {};
  try { dates = JSON.parse(req.body.dates || "{}"); } catch (e) {}

  for (const file of req.files || []) {
    const origName = file.originalname;
    const title = origName.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
    const clientDate = dates[origName];
    const date = clientDate
      ? new Date(parseInt(clientDate, 10)).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0];

    newSongs.push({
      id: Date.now().toString() + "-" + Math.round(Math.random() * 1e9),
      title, date, genre: "",
      audioFile: "/uploads/" + file.filename,
      audioName: origName,
    });
  }

  songs.unshift(...newSongs);
  await writeJSONAsync(SONGS_FILE, songs);
  res.json(newSongs);
});

app.post("/api/songs", upload.single("audio"), async (req, res) => {
  const songs = await readJSONAsync(SONGS_FILE);
  const song = {
    id: Date.now().toString(),
    title: req.body.title, date: req.body.date,
    genre: req.body.genre || "",
    audioFile: req.file ? "/uploads/" + req.file.filename : null,
    audioName: req.file ? req.file.originalname : null,
  };
  songs.unshift(song);
  await writeJSONAsync(SONGS_FILE, songs);
  res.json(song);
});

app.put("/api/songs/:id", upload.single("audio"), async (req, res) => {
  const songs = await readJSONAsync(SONGS_FILE);
  const idx = songs.findIndex((s) => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  if (req.file && songs[idx].audioFile) {
    const p = path.join(BASE_DIR, songs[idx].audioFile);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  // Handle baseElo (manual Elo override) — only set when explicitly provided and non-zero
  if (req.body.baseElo !== undefined) {
    const val = parseInt(req.body.baseElo, 10);
    if (val > 0) songs[idx].baseElo = val;
    else delete songs[idx].baseElo;
  }
  songs[idx] = {
    ...songs[idx],
    title: req.body.title ?? songs[idx].title,
    date: req.body.date ?? songs[idx].date,
    genre: req.body.genre ?? songs[idx].genre,
    ...(req.file ? { audioFile: "/uploads/" + req.file.filename, audioName: req.file.originalname } : {}),
  };
  await writeJSONAsync(SONGS_FILE, songs);
  res.json(songs[idx]);
});

// Batch genre update
app.patch("/api/songs/batch-genre", async (req, res) => {
  const { ids, genre } = req.body;
  if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: "ids array required" });
  const songs = await readJSONAsync(SONGS_FILE);
  const idSet = new Set(ids);
  for (const s of songs) {
    if (idSet.has(s.id)) s.genre = genre || "";
  }
  await writeJSONAsync(SONGS_FILE, songs);
  res.json({ updated: ids.length });
});

app.delete("/api/songs/:id", async (req, res) => {
  let songs = await readJSONAsync(SONGS_FILE);
  const song = songs.find((s) => s.id === req.params.id);
  if (song?.audioFile) {
    const p = path.join(BASE_DIR, song.audioFile);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  songs = songs.filter((s) => s.id !== req.params.id);
  await writeJSONAsync(SONGS_FILE, songs);
  let comps = await readJSONAsync(COMPARISONS_FILE);
  comps = comps.filter((c) => c.songA !== req.params.id && c.songB !== req.params.id);
  await writeJSONAsync(COMPARISONS_FILE, comps);
  res.json({ success: true });
});

// ---- GENRES ----

app.get("/api/genres", async (req, res) => res.json(await readJSONAsync(GENRES_FILE)));

app.post("/api/genres", async (req, res) => {
  const genres = await readJSONAsync(GENRES_FILE);
  const name = (req.body.name || "").trim();
  if (!name) return res.status(400).json({ error: "Name required" });
  if (!genres.includes(name)) { genres.push(name); await writeJSONAsync(GENRES_FILE, genres); }
  res.json(genres);
});

app.delete("/api/genres/:name", async (req, res) => {
  let genres = await readJSONAsync(GENRES_FILE);
  genres = genres.filter((g) => g !== decodeURIComponent(req.params.name));
  await writeJSONAsync(GENRES_FILE, genres);
  res.json(genres);
});

app.put("/api/genres/:name", async (req, res) => {
  const oldName = decodeURIComponent(req.params.name);
  const newName = (req.body.name || "").trim();
  if (!newName) return res.status(400).json({ error: "Name required" });
  let genres = await readJSONAsync(GENRES_FILE);
  const idx = genres.indexOf(oldName);
  if (idx !== -1) genres[idx] = newName;
  else if (!genres.includes(newName)) genres.push(newName);
  await writeJSONAsync(GENRES_FILE, genres);
  // Update all songs with old genre name
  const songs = await readJSONAsync(SONGS_FILE);
  songs.forEach(s => { if (s.genre === oldName) s.genre = newName; });
  await writeJSONAsync(SONGS_FILE, songs);
  res.json(genres);
});

// ---- COMPARISONS ----

app.get("/api/comparisons", async (req, res) => res.json(await readJSONAsync(COMPARISONS_FILE)));

app.post("/api/comparisons", async (req, res) => {
  const comps = await readJSONAsync(COMPARISONS_FILE);
  const { songA, songB, winner, source } = req.body;
  if (!songA || !songB || !winner) return res.status(400).json({ error: "Missing fields" });
  const filtered = comps.filter(
    (c) => !((c.songA === songA && c.songB === songB) || (c.songA === songB && c.songB === songA))
  );
  const entry = { songA, songB, winner, timestamp: Date.now() };
  if (source) entry.source = source;
  filtered.push(entry);
  await writeJSONAsync(COMPARISONS_FILE, filtered);
  res.json(filtered);
});

app.delete("/api/comparisons/last", async (req, res) => {
  const comps = await readJSONAsync(COMPARISONS_FILE);
  if (comps.length > 0) comps.pop();
  await writeJSONAsync(COMPARISONS_FILE, comps);
  res.json(comps);
});

app.delete("/api/comparisons", async (req, res) => {
  await writeJSONAsync(COMPARISONS_FILE, []);
  res.json([]);
});

// ---- RANKINGS ----

// Shared Elo computation — matches the frontend useRanking algorithm
const SOURCE_K = { tier: 24, quick: 32, classic: 48, bracket: 56 };
const computeElo = (songs, comps) => {
  const elo = {};
  songs.forEach(s => (elo[s.id] = 500));
  for (const c of comps) {
    const ra = elo[c.songA] || 500, rb = elo[c.songB] || 500;
    const ea = 1 / (1 + Math.pow(10, (rb - ra) / 400));
    const eb = 1 / (1 + Math.pow(10, (ra - rb) / 400));
    const src = c.source || "classic";
    const baseK = SOURCE_K[src] || 40;
    const kA = baseK * (1 - Math.abs(ra - 500) / 500 * 0.4);
    const kB = baseK * (1 - Math.abs(rb - 500) / 500 * 0.4);
    if (c.winner === c.songA) {
      elo[c.songA] = Math.max(0, Math.min(1000, ra + kA * (1 - ea)));
      elo[c.songB] = Math.max(0, Math.min(1000, rb + kB * (0 - eb)));
    } else {
      elo[c.songB] = Math.max(0, Math.min(1000, rb + kB * (1 - eb)));
      elo[c.songA] = Math.max(0, Math.min(1000, ra + kA * (0 - ea)));
    }
  }
  return elo;
};

app.get("/api/rankings", async (req, res) => {
  const songs = await readJSONAsync(SONGS_FILE);
  const comps = await readJSONAsync(COMPARISONS_FILE);
  const elo = computeElo(songs, comps);
  const totalPairs = (songs.length * (songs.length - 1)) / 2;
  const ranked = songs
    .map((s) => ({
      ...s, elo: Math.round(s.baseElo > 0 ? s.baseElo : (elo[s.id] || 500)),
      wins: comps.filter((c) => c.winner === s.id).length,
      losses: comps.filter((c) => (c.songA === s.id || c.songB === s.id) && c.winner !== s.id).length,
    }))
    .sort((a, b) => b.elo - a.elo);
  res.json({ rankings: ranked, totalComparisons: comps.length, totalPairs, progress: totalPairs > 0 ? comps.length / totalPairs : 0 });
});

// ---- EXPORT ----

app.get("/api/export/m3u", async (req, res) => {
  const songs = await readJSONAsync(SONGS_FILE);
  const comps = await readJSONAsync(COMPARISONS_FILE);
  const genre = req.query.genre || "";
  const limit = parseInt(req.query.limit, 10) || 0;

  const elo = computeElo(songs, comps);
  let ranked = songs
    .map(s => ({ ...s, elo: Math.round(s.baseElo > 0 ? s.baseElo : (elo[s.id] || 500)) }))
    .sort((a, b) => b.elo - a.elo);

  if (genre) ranked = ranked.filter(s => s.genre === genre);
  if (limit > 0) ranked = ranked.slice(0, limit);

  // Build M3U
  let m3u = "#EXTM3U\n";
  for (const s of ranked) {
    if (s.audioFile) {
      m3u += `#EXTINF:-1,${s.title}\n`;
      m3u += `${s.audioFile}\n`;
    }
  }

  res.setHeader("Content-Type", "audio/mpegurl");
  res.setHeader("Content-Disposition", `attachment; filename="IMAde-playlist.m3u"`);
  res.send(m3u);
});

// ---- PLAYLISTS ----

app.get("/api/playlists", async (req, res) => res.json(await readJSONAsync(PLAYLISTS_FILE)));

app.post("/api/playlists", async (req, res) => {
  const playlists = await readJSONAsync(PLAYLISTS_FILE);
  const pl = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: req.body.name || "Untitled",
    songIds: req.body.songIds || [],
    createdAt: new Date().toISOString(),
  };
  if (req.body.smart) pl.smart = req.body.smart;
  playlists.push(pl);
  await writeJSONAsync(PLAYLISTS_FILE, playlists);
  res.json(pl);
});

app.put("/api/playlists/:id", async (req, res) => {
  const playlists = await readJSONAsync(PLAYLISTS_FILE);
  const idx = playlists.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  if (req.body.name !== undefined) playlists[idx].name = req.body.name;
  if (req.body.songIds !== undefined) playlists[idx].songIds = req.body.songIds;
  await writeJSONAsync(PLAYLISTS_FILE, playlists);
  res.json(playlists[idx]);
});

app.delete("/api/playlists/:id", async (req, res) => {
  let playlists = await readJSONAsync(PLAYLISTS_FILE);
  playlists = playlists.filter(p => p.id !== req.params.id);
  await writeJSONAsync(PLAYLISTS_FILE, playlists);
  res.json(playlists);
});

// ---- BACKUPS ----

app.post("/api/backup", (req, res) => {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backupDir = path.join(BACKUPS_DIR, ts);
  fs.mkdirSync(backupDir, { recursive: true });
  for (const f of [SONGS_FILE, COMPARISONS_FILE, GENRES_FILE, PLAYLISTS_FILE]) {
    if (fs.existsSync(f)) fs.copyFileSync(f, path.join(backupDir, path.basename(f)));
  }
  res.json({ name: ts, path: backupDir });
});

app.get("/api/backups", (req, res) => {
  if (!fs.existsSync(BACKUPS_DIR)) return res.json([]);
  const dirs = fs.readdirSync(BACKUPS_DIR).filter(d => fs.statSync(path.join(BACKUPS_DIR, d)).isDirectory()).sort().reverse();
  res.json(dirs);
});

app.post("/api/backup/restore/:name", async (req, res) => {
  const backupDir = path.join(BACKUPS_DIR, req.params.name);
  if (!fs.existsSync(backupDir)) return res.status(404).json({ error: "Backup not found" });
  for (const f of ["songs.json", "comparisons.json", "genres.json", "playlists.json"]) {
    const src = path.join(backupDir, f);
    const dest = path.join(DATA_DIR, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, dest);
  }
  // Invalidate cache after restore
  [SONGS_FILE, GENRES_FILE, COMPARISONS_FILE, PLAYLISTS_FILE].forEach(f => { cache[f] = readJSON(f); });
  res.json({ restored: req.params.name });
});

// ---- COMPARISONS SWAP (for testing) ----

app.get("/api/comparisons/export", (req, res) => {
  res.download(COMPARISONS_FILE, "comparisons.json");
});

app.post("/api/comparisons/import", express.json({ limit: "50mb" }), async (req, res) => {
  if (!Array.isArray(req.body)) return res.status(400).json({ error: "Expected array" });
  await writeJSONAsync(COMPARISONS_FILE, req.body);
  res.json({ imported: req.body.length });
});

// ---- UPDATE CHECK ----

const APP_VERSION = require("./package.json").version;

app.get("/api/update-check", async (req, res) => {
  try {
    const response = await fetch(
      "https://api.github.com/repos/BerryNotes/imade-releases/releases/latest",
      { headers: { "Accept": "application/vnd.github.v3+json", "User-Agent": "iMade-App" } }
    );
    if (!response.ok) return res.json({ available: false });
    const data = await response.json();
    const latest = (data.tag_name || "").replace(/^v/, "");
    if (!latest) return res.json({ available: false });

    const current = APP_VERSION.split(".").map(Number);
    const remote = latest.split(".").map(Number);
    const newer = remote[0] > current[0] ||
      (remote[0] === current[0] && remote[1] > current[1]) ||
      (remote[0] === current[0] && remote[1] === current[1] && remote[2] > current[2]);

    res.json({
      available: newer,
      current: APP_VERSION,
      latest,
      url: data.html_url || "",
    });
  } catch (e) {
    res.json({ available: false });
  }
});

// ---- FRONTEND ----

app.use(express.static(path.join(__dirname, "dist-client")));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "dist-client", "index.html")));

function startServer(callback) {
  const server = app.listen(PORT, "127.0.0.1", () => {
    const port = server.address().port;
    console.log("\n  ♪  iMade is running on http://localhost:" + port + "\n");
    if (callback) callback(port);
  });
  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = { startServer };
