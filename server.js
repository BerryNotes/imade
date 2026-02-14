const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");

const app = express();
const PORT = process.env.PORT || 3000;
const IMADE_MODE = process.env.IMADE_MODE || "web"; // "electron" or "web"
const TRIAL_SONG_LIMIT = 25;

// In web mode, share the Electron app's data directory if it exists
const SHARED_MODE = !process.env.APP_DATA_PATH && IMADE_MODE === "web" && (() => {
  const appData = process.env.APPDATA || (process.platform === "darwin"
    ? path.join(require("os").homedir(), "Library", "Application Support")
    : path.join(require("os").homedir(), ".config"));
  const electronDir = path.join(appData, "imade");
  if (fs.existsSync(path.join(electronDir, "data"))) {
    process.env.APP_DATA_PATH = electronDir;
    return true;
  }
  return false;
})();

const BASE_DIR = process.env.APP_DATA_PATH || __dirname;
const UPLOADS_DIR = path.join(BASE_DIR, "uploads");
const BACKUPS_DIR = path.join(BASE_DIR, "backups");

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });

// Initialize database
const db = require("./src/db");
db.getDb(); // triggers schema creation

// Session middleware
const { createSessionMiddleware, requireAuth, electronAutoLogin } = require("./src/middleware/auth");

app.use(express.json());
app.use(createSessionMiddleware());

// CORS for remote admin site
const ADMIN_ORIGIN = process.env.ADMIN_ORIGIN || "https://admin.imade.one";
app.use("/api/admin", (req, res, next) => {
  res.header("Access-Control-Allow-Origin", ADMIN_ORIGIN);
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Auth middleware — auto-login when running locally (Electron or shared mode)
const auth = (IMADE_MODE === "electron" || SHARED_MODE) ? electronAutoLogin : requireAuth;

// ---- AUTH ROUTES (web mode only) ----

// Login attempt tracking: { ip: { count, lockedUntil } }
const loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

app.post("/api/register", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Username and password required" });
  if (username.length < 2) return res.status(400).json({ error: "Username must be at least 2 characters" });
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });

  const existing = db.getUserByUsername(username.trim());
  if (existing) return res.status(409).json({ error: "Username already taken" });

  try {
    const hash = await bcrypt.hash(password, 10);
    db.createUser(username.trim(), hash);
    const user = db.getUserByUsername(username.trim());

    // Seed default genres for new user
    const defaultGenres = ["Hip Hop", "R&B", "Pop", "Rock", "Electronic", "Jazz", "Lo-Fi", "Soul", "Funk", "Indie", "Ambient", "Trap", "Acoustic", "Experimental", "Other"];
    for (const g of defaultGenres) db.addGenre(g, user.id);

    // Create user uploads directory
    const userUploads = path.join(UPLOADS_DIR, String(user.id));
    if (!fs.existsSync(userUploads)) fs.mkdirSync(userUploads, { recursive: true });

    req.session.userId = user.id;
    db.logActivity(user.id, "register", null, req.ip);
    res.json({ user: { id: user.id, username: user.username } });
  } catch (e) {
    console.error("Register error:", e);
    res.status(500).json({ error: "Registration failed" });
  }
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Username and password required" });

  // Rate limiting by IP
  const ip = req.ip;
  const attempt = loginAttempts.get(ip) || { count: 0, lockedUntil: 0 };
  if (attempt.lockedUntil > Date.now()) {
    const mins = Math.ceil((attempt.lockedUntil - Date.now()) / 60000);
    return res.status(429).json({ error: `Too many attempts. Try again in ${mins} minute${mins > 1 ? "s" : ""}.` });
  }

  const user = db.getUserByUsername(username.trim());
  if (!user) {
    attempt.count++;
    if (attempt.count >= MAX_LOGIN_ATTEMPTS) { attempt.lockedUntil = Date.now() + LOCKOUT_MS; attempt.count = 0; }
    loginAttempts.set(ip, attempt);
    return res.status(401).json({ error: "Invalid credentials" });
  }

  try {
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      attempt.count++;
      if (attempt.count >= MAX_LOGIN_ATTEMPTS) { attempt.lockedUntil = Date.now() + LOCKOUT_MS; attempt.count = 0; }
      loginAttempts.set(ip, attempt);
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Reset attempts on success
    loginAttempts.delete(ip);
    req.session.userId = user.id;
    req.session.save((err) => {
      if (err) console.error("Session save error:", err);
      console.log(`[LOGIN] user="${user.username}" id=${user.id} sessionId=${req.sessionID}`);
      db.logActivity(user.id, "login", null, req.ip);
      res.json({ user: { id: user.id, username: user.username } });
    });
  } catch (e) {
    console.error("Login error:", e);
    res.status(500).json({ error: "Login failed" });
  }
});

app.post("/api/logout", (req, res) => {
  const uid = req.session?.userId;
  if (uid) db.logActivity(uid, "logout", null, req.ip);
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ success: true });
  });
});

app.get("/api/debug-session", (req, res) => {
  res.json({
    sessionId: req.sessionID,
    userId: req.session?.userId || null,
    cookie: req.headers.cookie || null,
  });
});

app.get("/api/me", auth, (req, res) => {
  // auth middleware already guarantees req.session.userId is set
  const user = db.getUserById(req.session.userId);
  if (!user) return res.status(401).json({ error: "User not found" });
  console.log(`[ME] sessionUserId=${req.session.userId} username="${user.username}" sessionId=${req.sessionID}`);
  res.json({ user: { id: user.id, username: user.username } });
});

app.get("/api/plan", auth, (req, res) => {
  const userId = req.session.userId;
  const user = db.getUserById(userId);
  const plan = user?.plan || "trial";
  const songCount = db.getSongs(userId).length;
  const version = require("./package.json").version;
  if (plan === "full") {
    res.json({ plan: "full", songLimit: null, songCount, remaining: null, version });
  } else {
    res.json({ plan: "trial", songLimit: TRIAL_SONG_LIMIT, songCount, remaining: TRIAL_SONG_LIMIT - songCount, version });
  }
});

app.put("/api/profile", auth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { username, password } = req.body;
    if (username) {
      if (username.trim().length < 2) return res.status(400).json({ error: "Username must be at least 2 characters" });
      const existing = db.getUserByUsername(username.trim());
      if (existing && existing.id !== userId) return res.status(409).json({ error: "Username already taken" });
      db.updateUserUsername(userId, username.trim());
    }
    if (password) {
      if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });
      const hash = await bcrypt.hash(password, 10);
      db.updateUserPassword(userId, hash);
    }
    const user = db.getUserById(userId);
    res.json({ user: { id: user.id, username: user.username } });
  } catch (e) { console.error("Profile update error:", e); res.status(500).json({ error: e.message }); }
});

// ---- PER-USER FILE UPLOADS ----

function getUserUploadsDir(userId) {
  const dir = path.join(UPLOADS_DIR, String(userId));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userId = req.session?.userId;
    if (!userId) return cb(new Error("Not authenticated"));
    cb(null, getUserUploadsDir(userId));
  },
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

// Serve uploads per-user: /uploads/filename → uploads/<userId>/filename
app.get("/uploads/:filename", auth, (req, res) => {
  const filename = path.basename(req.params.filename); // prevent path traversal
  const userId = req.session.userId;
  const filePath = path.join(UPLOADS_DIR, String(userId), filename);
  if (!fs.existsSync(filePath)) return res.status(404).send("Not found");
  res.sendFile(filePath);
});

// ---- SONGS ----

app.get("/api/songs", auth, (req, res) => {
  const songs = db.getSongs(req.session.userId);
  console.log(`[SONGS] userId=${req.session.userId} returning ${songs.length} songs`);
  res.json(songs);
});

app.post("/api/songs/bulk", auth, upload.array("audio", 200), (req, res) => {
  const userId = req.session.userId;
  const user = db.getUserById(userId);
  const isTrial = (user?.plan || "trial") === "trial";
  const existing = db.getSongs(userId);

  if (isTrial) {
    const remaining = TRIAL_SONG_LIMIT - existing.length;
    if (remaining <= 0) return res.status(403).json({ error: `Song limit reached (${TRIAL_SONG_LIMIT}). Upgrade to add more songs.` });
  }

  const newSongs = [];
  let dates = {};
  try { dates = JSON.parse(req.body.dates || "{}"); } catch (e) {}

  const maxFiles = isTrial ? TRIAL_SONG_LIMIT - existing.length : req.files?.length || 0;
  const files = (req.files || []).slice(0, maxFiles);
  for (const file of files) {
    const origName = file.originalname;
    const title = origName.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
    const clientDate = dates[origName];
    const date = clientDate
      ? new Date(parseInt(clientDate, 10)).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0];

    const song = {
      id: Date.now().toString() + "-" + Math.round(Math.random() * 1e9),
      title, date, genre: "",
      audioFile: "/uploads/" + file.filename,
      audioName: origName,
    };
    db.insertSong(song, userId);
    newSongs.push(song);
  }

  if (newSongs.length > 0) db.logActivity(userId, "song_bulk_upload", newSongs.length + " songs: " + newSongs.map(s => s.title).join(", "), req.ip);
  res.json(newSongs);
});

app.post("/api/songs", auth, upload.single("audio"), (req, res) => {
  const userId = req.session.userId;
  const user = db.getUserById(userId);
  const isTrial = (user?.plan || "trial") === "trial";
  if (isTrial) {
    const existing = db.getSongs(userId);
    if (existing.length >= TRIAL_SONG_LIMIT) return res.status(403).json({ error: `Song limit reached (${TRIAL_SONG_LIMIT}). Upgrade to add more songs.` });
  }
  const song = {
    id: Date.now().toString(),
    title: req.body.title, date: req.body.date,
    genre: req.body.genre || "",
    audioFile: req.file ? "/uploads/" + req.file.filename : null,
    audioName: req.file ? req.file.originalname : null,
  };
  db.insertSong(song, userId);
  db.logActivity(userId, "song_create", song.title, req.ip);
  res.json(song);
});

app.put("/api/songs/:id", auth, upload.single("audio"), (req, res) => {
  const userId = req.session.userId;
  const existing = db.getSongById(req.params.id, userId);
  if (!existing) return res.status(404).json({ error: "Not found" });

  // Delete old audio file if replacing
  if (req.file && existing.audioFile) {
    const filename = path.basename(existing.audioFile);
    const p = path.join(UPLOADS_DIR, String(userId), filename);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }

  const fields = {};
  if (req.body.title !== undefined) fields.title = req.body.title;
  if (req.body.date !== undefined) fields.date = req.body.date;
  if (req.body.genre !== undefined) fields.genre = req.body.genre;
  if (req.file) {
    fields.audioFile = "/uploads/" + req.file.filename;
    fields.audioName = req.file.originalname;
  }

  if (req.body.notes !== undefined) fields.notes = req.body.notes;

  // Handle baseElo — only set when explicitly provided and non-zero
  if (req.body.baseElo !== undefined) {
    const val = parseInt(req.body.baseElo, 10);
    fields.baseElo = val > 0 ? val : 0;
  }

  db.updateSong(req.params.id, userId, fields);
  res.json(db.getSongById(req.params.id, userId));
});

// Batch genre update
app.patch("/api/songs/batch-genre", auth, (req, res) => {
  const { ids, genre } = req.body;
  if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: "ids array required" });
  db.batchUpdateGenre(ids, genre || "", req.session.userId);
  res.json({ updated: ids.length });
});

app.delete("/api/songs/:id", auth, (req, res) => {
  const userId = req.session.userId;
  const song = db.getSongById(req.params.id, userId);
  if (song?.audioFile) {
    const filename = path.basename(song.audioFile);
    const p = path.join(UPLOADS_DIR, String(userId), filename);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  db.deleteSong(req.params.id, userId);
  db.logActivity(userId, "song_delete", song?.title || req.params.id, req.ip);
  res.json({ success: true });
});

// ---- GENRES ----

app.get("/api/genres", auth, (req, res) => {
  res.json(db.getGenres(req.session.userId));
});

app.post("/api/genres", auth, (req, res) => {
  const name = (req.body.name || "").trim();
  if (!name) return res.status(400).json({ error: "Name required" });
  db.addGenre(name, req.session.userId);
  res.json(db.getGenres(req.session.userId));
});

app.delete("/api/genres/:name", auth, (req, res) => {
  db.deleteGenre(decodeURIComponent(req.params.name), req.session.userId);
  res.json(db.getGenres(req.session.userId));
});

app.put("/api/genres/:name", auth, (req, res) => {
  const userId = req.session.userId;
  const oldName = decodeURIComponent(req.params.name);
  const newName = (req.body.name || "").trim();
  if (!newName) return res.status(400).json({ error: "Name required" });

  db.renameGenre(oldName, newName, userId);

  // Update all songs with old genre name
  const songs = db.getSongs(userId).filter(s => s.genre === oldName);
  if (songs.length > 0) {
    db.batchUpdateGenre(songs.map(s => s.id), newName, userId);
  }

  res.json(db.getGenres(userId));
});

// ---- COMPARISONS ----

app.get("/api/comparisons", auth, (req, res) => {
  res.json(db.getComparisons(req.session.userId));
});

app.post("/api/comparisons", auth, (req, res) => {
  const { songA, songB, winner, source } = req.body;
  if (!songA || !songB || !winner) return res.status(400).json({ error: "Missing fields" });
  db.insertComparison({ songA, songB, winner, source, timestamp: Date.now() }, req.session.userId);
  res.json(db.getComparisons(req.session.userId));
});

app.delete("/api/comparisons/last", auth, (req, res) => {
  db.deleteLastComparison(req.session.userId);
  res.json(db.getComparisons(req.session.userId));
});

app.delete("/api/comparisons", auth, (req, res) => {
  db.deleteAllComparisons(req.session.userId);
  res.json([]);
});

// ---- RANKINGS ----

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

app.get("/api/rankings", auth, (req, res) => {
  const userId = req.session.userId;
  const songs = db.getSongs(userId);
  const comps = db.getComparisons(userId);
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

app.get("/api/export/m3u", auth, (req, res) => {
  const userId = req.session.userId;
  const songs = db.getSongs(userId);
  const comps = db.getComparisons(userId);
  const genre = req.query.genre || "";
  const limit = parseInt(req.query.limit, 10) || 0;

  const elo = computeElo(songs, comps);
  let ranked = songs
    .map(s => ({ ...s, elo: Math.round(s.baseElo > 0 ? s.baseElo : (elo[s.id] || 500)) }))
    .sort((a, b) => b.elo - a.elo);

  if (genre) ranked = ranked.filter(s => s.genre === genre);
  if (limit > 0) ranked = ranked.slice(0, limit);

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

app.get("/api/playlists", auth, (req, res) => {
  res.json(db.getPlaylists(req.session.userId));
});

app.post("/api/playlists", auth, (req, res) => {
  const pl = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: req.body.name || "Untitled",
    songIds: req.body.songIds || [],
    createdAt: new Date().toISOString(),
  };
  if (req.body.smart) pl.smart = req.body.smart;
  db.insertPlaylist(pl, req.session.userId);
  res.json(pl);
});

app.put("/api/playlists/:id", auth, (req, res) => {
  const userId = req.session.userId;
  const fields = {};
  if (req.body.name !== undefined) fields.name = req.body.name;
  if (req.body.songIds !== undefined) fields.songIds = req.body.songIds;
  db.updatePlaylist(req.params.id, userId, fields);
  const playlists = db.getPlaylists(userId);
  const updated = playlists.find(p => p.id === req.params.id);
  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json(updated);
});

app.delete("/api/playlists/:id", auth, (req, res) => {
  db.deletePlaylist(req.params.id, req.session.userId);
  res.json(db.getPlaylists(req.session.userId));
});

// ---- BACKUPS ----

app.post("/api/backup", auth, (req, res) => {
  const userId = req.session.userId;
  const data = {
    songs: db.getSongs(userId),
    comparisons: db.getComparisons(userId),
    genres: db.getGenres(userId),
    playlists: db.getPlaylists(userId),
    listenTimes: db.getListenTimes(userId),
    exportedAt: new Date().toISOString(),
  };
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const userBackupDir = path.join(BACKUPS_DIR, String(userId));
  if (!fs.existsSync(userBackupDir)) fs.mkdirSync(userBackupDir, { recursive: true });
  const backupDir = path.join(userBackupDir, ts);
  fs.mkdirSync(backupDir, { recursive: true });
  fs.writeFileSync(path.join(backupDir, "backup.json"), JSON.stringify(data, null, 2));
  res.json({ name: ts, path: backupDir });
});

app.get("/api/backups", auth, (req, res) => {
  const userBackupDir = path.join(BACKUPS_DIR, String(req.session.userId));
  if (!fs.existsSync(userBackupDir)) return res.json([]);
  const dirs = fs.readdirSync(userBackupDir).filter(d => fs.statSync(path.join(userBackupDir, d)).isDirectory()).sort().reverse();
  res.json(dirs);
});

app.post("/api/backup/restore/:name", auth, (req, res) => {
  const userId = req.session.userId;
  const userBackupDir = path.join(BACKUPS_DIR, String(userId));
  const backupDir = path.join(userBackupDir, req.params.name);
  if (!fs.existsSync(backupDir)) return res.status(404).json({ error: "Backup not found" });

  const backupFile = path.join(backupDir, "backup.json");
  if (!fs.existsSync(backupFile)) return res.status(404).json({ error: "Backup data not found" });

  try {
    const data = JSON.parse(fs.readFileSync(backupFile, "utf-8"));
    db.bulkReplace(userId, data);
    res.json({ restored: req.params.name });
  } catch (e) {
    console.error("Restore error:", e);
    res.status(500).json({ error: "Restore failed" });
  }
});

// ---- LISTEN TIMES ----

app.get("/api/listen-times", auth, (req, res) => {
  res.json(db.getListenTimes(req.session.userId));
});

app.put("/api/listen-times", auth, (req, res) => {
  if (!req.body || typeof req.body !== "object") return res.status(400).json({ error: "Object required" });
  db.updateListenTimes(req.session.userId, req.body);
  res.json({ success: true });
});

// POST alias for sendBeacon (fires on page unload)
app.post("/api/listen-times", auth, (req, res) => {
  if (!req.body || typeof req.body !== "object") return res.status(400).json({ error: "Object required" });
  db.updateListenTimes(req.session.userId, req.body);
  res.json({ success: true });
});

app.delete("/api/listen-times", auth, (req, res) => {
  db.deleteListenTimes(req.session.userId);
  res.json({ success: true });
});

// ---- COMPARISONS SWAP (for testing) ----

app.get("/api/comparisons/export", auth, (req, res) => {
  const comps = db.getComparisons(req.session.userId);
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", 'attachment; filename="comparisons.json"');
  res.json(comps);
});

app.post("/api/comparisons/import", auth, express.json({ limit: "50mb" }), (req, res) => {
  if (!Array.isArray(req.body)) return res.status(400).json({ error: "Expected array" });
  const userId = req.session.userId;
  db.deleteAllComparisons(userId);
  const stmt = db.getDb().prepare(
    "INSERT INTO comparisons (user_id, song_a, song_b, winner, source, timestamp) VALUES (?, ?, ?, ?, ?, ?)"
  );
  const tx = db.getDb().transaction(() => {
    for (const c of req.body) {
      stmt.run(userId, c.songA, c.songB, c.winner, c.source || "classic", c.timestamp);
    }
  });
  tx();
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

// ---- ADMIN ----

// Generate or load admin token
const ADMIN_TOKEN_FILE = path.join(BASE_DIR, "data", "admin-token.txt");
let ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
if (!ADMIN_TOKEN) {
  try { ADMIN_TOKEN = fs.readFileSync(ADMIN_TOKEN_FILE, "utf-8").trim(); }
  catch {
    ADMIN_TOKEN = require("crypto").randomBytes(32).toString("hex");
    const tokenDir = path.dirname(ADMIN_TOKEN_FILE);
    if (!fs.existsSync(tokenDir)) fs.mkdirSync(tokenDir, { recursive: true });
    fs.writeFileSync(ADMIN_TOKEN_FILE, ADMIN_TOKEN);
  }
}
console.log("  Admin token:", ADMIN_TOKEN);

// Admin guard: session-based (local) or token-based (remote)
function requireAdmin(req, res, next) {
  // Check Bearer token first (for remote admin site)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    if (token === ADMIN_TOKEN) return next();
    return res.status(403).json({ error: "Invalid token" });
  }
  // Fall back to session-based auth (local/primary user)
  if (req.session && req.session.userId) {
    const u = db.getUserById(req.session.userId);
    if (u && u.role === "admin") return next();
  }
  res.status(403).json({ error: "Forbidden" });
}

// Token verification endpoint for remote admin login
app.post("/api/admin/verify", (req, res) => {
  res.header("Access-Control-Allow-Origin", ADMIN_ORIGIN);
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ") && authHeader.slice(7) === ADMIN_TOKEN) {
    return res.json({ valid: true });
  }
  res.status(403).json({ error: "Invalid token" });
});

app.get("/api/admin/users", requireAdmin, (req, res) => {
  res.json(db.getAllUsersWithStats());
});

app.post("/api/admin/users", requireAdmin, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Username and password required" });
    if (username.length < 2) return res.status(400).json({ error: "Username must be at least 2 characters" });
    if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });
    const existing = db.getUserByUsername(username.trim());
    if (existing) return res.status(409).json({ error: "Username already taken" });
    const hash = await bcrypt.hash(password, 10);
    db.createUser(username.trim(), hash);
    const user = db.getUserByUsername(username.trim());
    const defaultGenres = ["Hip Hop", "R&B", "Pop", "Rock", "Electronic", "Jazz", "Lo-Fi", "Soul", "Funk", "Indie", "Ambient", "Trap", "Acoustic", "Experimental", "Other"];
    for (const g of defaultGenres) db.addGenre(g, user.id);
    const userUploads = path.join(UPLOADS_DIR, String(user.id));
    if (!fs.existsSync(userUploads)) fs.mkdirSync(userUploads, { recursive: true });
    res.json(db.getAllUsersWithStats());
  } catch (e) { console.error("Admin create user error:", e); res.status(500).json({ error: e.message }); }
});

app.put("/api/admin/users/:id", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { username, password, plan, role } = req.body;
    if (username) {
      const existing = db.getUserByUsername(username.trim());
      if (existing && existing.id !== id) return res.status(409).json({ error: "Username taken" });
      db.updateUserUsername(id, username.trim());
    }
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      db.updateUserPassword(id, hash);
    }
    if (plan && (plan === "trial" || plan === "full")) {
      db.updateUserPlan(id, plan);
    }
    if (role && (role === "admin" || role === "user")) {
      if (id === 1 && role !== "admin") return res.status(400).json({ error: "Cannot remove admin from primary user" });
      db.updateUserRole(id, role);
    }
    res.json(db.getAllUsersWithStats());
  } catch (e) { console.error("Admin update user error:", e); res.status(500).json({ error: e.message }); }
});

app.delete("/api/admin/users/:id", requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (id === 1) return res.status(400).json({ error: "Cannot delete primary user" });
  const deletedUser = db.getUserById(id);
  // Clean up user's upload files
  const userUploadsDir = path.join(UPLOADS_DIR, String(id));
  if (fs.existsSync(userUploadsDir)) fs.rmSync(userUploadsDir, { recursive: true, force: true });
  db.deleteUser(id);
  res.json(db.getAllUsersWithStats());
});

app.get("/api/admin/users/:id/songs", requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const songs = db.getSongs(id);
  const comps = db.getComparisons(id);
  const elo = computeElo(songs, comps);
  const ranked = songs
    .map(s => ({ ...s, elo: Math.round(s.baseElo > 0 ? s.baseElo : (elo[s.id] || 500)) }))
    .sort((a, b) => b.elo - a.elo);
  res.json(ranked);
});

app.get("/api/admin/activity", requireAdmin, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const offset = parseInt(req.query.offset, 10) || 0;
  const logs = db.getActivityLog(limit, offset);
  const total = db.getActivityLogCount();
  res.json({ logs, total });
});

// ---- ADMIN PANEL (separate static site) ----

const ADMIN_DIR = path.join(__dirname, "admin");
app.use("/admin", auth, requireAdmin, express.static(ADMIN_DIR));

// ---- FRONTEND ----

app.use(express.static(path.join(__dirname, "dist-client"), {
  setHeaders: (res, filePath) => {
    // Hashed assets can be cached forever; index.html must always revalidate
    if (filePath.endsWith(".html")) {
      res.setHeader("Cache-Control", "no-cache");
    }
  }
}));
app.get("*", (req, res) => {
  // Don't catch API routes
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "Not found" });
  res.setHeader("Cache-Control", "no-cache");
  res.sendFile(path.join(__dirname, "dist-client", "index.html"));
});

function startServer(callback) {
  const server = app.listen(PORT, "127.0.0.1", () => {
    const port = server.address().port;
    console.log("\n  ♪  iMade is running on http://localhost:" + port);
    console.log("    Mode: " + IMADE_MODE + "\n");
    if (callback) callback(port);
  });
  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = { startServer };
