const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

let db;

function getDb() {
  if (db) return db;
  const BASE_DIR = process.env.APP_DATA_PATH || path.join(__dirname, "..");
  const DATA_DIR = path.join(BASE_DIR, "data");
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const dbPath = path.join(DATA_DIR, "imade.db");
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  initSchema(db);
  migrateSchema(db);
  return db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS songs (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      date TEXT,
      genre TEXT DEFAULT '',
      audio_file TEXT,
      audio_name TEXT,
      base_elo REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS comparisons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      song_a TEXT NOT NULL,
      song_b TEXT NOT NULL,
      winner TEXT NOT NULL,
      source TEXT DEFAULT 'classic',
      timestamp INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS genres (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      UNIQUE(user_id, name)
    );

    CREATE TABLE IF NOT EXISTS playlists (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      smart_json TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS playlist_songs (
      playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
      song_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      PRIMARY KEY (playlist_id, song_id)
    );

    CREATE TABLE IF NOT EXISTS listen_times (
      user_id INTEGER NOT NULL REFERENCES users(id),
      song_id TEXT NOT NULL,
      seconds REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, song_id)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      sess TEXT NOT NULL,
      expired INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_songs_user ON songs(user_id);
    CREATE INDEX IF NOT EXISTS idx_comparisons_user ON comparisons(user_id);
    CREATE INDEX IF NOT EXISTS idx_genres_user ON genres(user_id);
    CREATE INDEX IF NOT EXISTS idx_playlists_user ON playlists(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expired ON sessions(expired);
  `);
}

function migrateSchema(db) {
  const cols = db.prepare("PRAGMA table_info(songs)").all().map(c => c.name);
  if (!cols.includes("notes")) {
    db.exec("ALTER TABLE songs ADD COLUMN notes TEXT DEFAULT ''");
  }
}

// --- User helpers ---

function createUser(username, passwordHash) {
  const stmt = getDb().prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)");
  return stmt.run(username, passwordHash);
}

function getUserByUsername(username) {
  return getDb().prepare("SELECT * FROM users WHERE username = ?").get(username);
}

function getUserById(id) {
  return getDb().prepare("SELECT id, username, created_at FROM users WHERE id = ?").get(id);
}

// --- Admin helpers ---

function getAllUsersWithStats() {
  return getDb().prepare(`
    SELECT u.id, u.username, u.created_at,
      (SELECT COUNT(*) FROM songs WHERE user_id = u.id) AS song_count,
      (SELECT COUNT(*) FROM comparisons WHERE user_id = u.id) AS comparison_count,
      (SELECT COUNT(*) FROM playlists WHERE user_id = u.id) AS playlist_count
    FROM users u ORDER BY u.id
  `).all();
}

function updateUserUsername(id, newUsername) {
  return getDb().prepare("UPDATE users SET username = ? WHERE id = ?").run(newUsername, id);
}

function updateUserPassword(id, passwordHash) {
  return getDb().prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, id);
}

function deleteUser(id) {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM listen_times WHERE user_id = ?").run(id);
    db.prepare("DELETE FROM playlists WHERE user_id = ?").run(id);
    db.prepare("DELETE FROM comparisons WHERE user_id = ?").run(id);
    db.prepare("DELETE FROM genres WHERE user_id = ?").run(id);
    db.prepare("DELETE FROM songs WHERE user_id = ?").run(id);
    db.prepare("DELETE FROM users WHERE id = ?").run(id);
  });
  tx();
}

// --- Song helpers ---

function getSongs(userId) {
  return getDb().prepare("SELECT * FROM songs WHERE user_id = ? ORDER BY created_at DESC").all(userId).map(rowToSong);
}

function getSongById(id, userId) {
  const row = getDb().prepare("SELECT * FROM songs WHERE id = ? AND user_id = ?").get(id, userId);
  return row ? rowToSong(row) : null;
}

function insertSong(song, userId) {
  const stmt = getDb().prepare(
    "INSERT INTO songs (id, user_id, title, date, genre, audio_file, audio_name, base_elo, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  stmt.run(song.id, userId, song.title, song.date || null, song.genre || "", song.audioFile || null, song.audioName || null, song.baseElo || 0, song.notes || "");
}

function updateSong(id, userId, fields) {
  const sets = [];
  const vals = [];
  if (fields.title !== undefined) { sets.push("title = ?"); vals.push(fields.title); }
  if (fields.date !== undefined) { sets.push("date = ?"); vals.push(fields.date); }
  if (fields.genre !== undefined) { sets.push("genre = ?"); vals.push(fields.genre); }
  if (fields.audioFile !== undefined) { sets.push("audio_file = ?"); vals.push(fields.audioFile); }
  if (fields.audioName !== undefined) { sets.push("audio_name = ?"); vals.push(fields.audioName); }
  if (fields.baseElo !== undefined) { sets.push("base_elo = ?"); vals.push(fields.baseElo); }
  if (fields.notes !== undefined) { sets.push("notes = ?"); vals.push(fields.notes); }
  if (sets.length === 0) return;
  vals.push(id, userId);
  getDb().prepare(`UPDATE songs SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`).run(...vals);
}

function deleteSong(id, userId) {
  getDb().prepare("DELETE FROM playlist_songs WHERE song_id = ?").run(id);
  getDb().prepare("DELETE FROM comparisons WHERE user_id = ? AND (song_a = ? OR song_b = ?)").run(userId, id, id);
  getDb().prepare("DELETE FROM songs WHERE id = ? AND user_id = ?").run(id, userId);
}

function batchUpdateGenre(ids, genre, userId) {
  const stmt = getDb().prepare("UPDATE songs SET genre = ? WHERE id = ? AND user_id = ?");
  const tx = getDb().transaction(() => {
    for (const id of ids) stmt.run(genre, id, userId);
  });
  tx();
}

// Convert DB row (snake_case) to API format (camelCase)
function rowToSong(row) {
  const song = {
    id: row.id,
    title: row.title,
    date: row.date,
    genre: row.genre || "",
    audioFile: row.audio_file,
    audioName: row.audio_name,
  };
  if (row.base_elo > 0) song.baseElo = row.base_elo;
  if (row.notes) song.notes = row.notes;
  return song;
}

// --- Comparison helpers ---

function getComparisons(userId) {
  return getDb().prepare("SELECT * FROM comparisons WHERE user_id = ? ORDER BY id ASC").all(userId).map(rowToComparison);
}

function insertComparison(comp, userId) {
  // Remove existing comparison between these two songs (replace logic)
  getDb().prepare(
    "DELETE FROM comparisons WHERE user_id = ? AND ((song_a = ? AND song_b = ?) OR (song_a = ? AND song_b = ?))"
  ).run(userId, comp.songA, comp.songB, comp.songB, comp.songA);

  getDb().prepare(
    "INSERT INTO comparisons (user_id, song_a, song_b, winner, source, timestamp) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(userId, comp.songA, comp.songB, comp.winner, comp.source || "classic", comp.timestamp);
}

function deleteLastComparison(userId) {
  const last = getDb().prepare("SELECT id FROM comparisons WHERE user_id = ? ORDER BY id DESC LIMIT 1").get(userId);
  if (last) getDb().prepare("DELETE FROM comparisons WHERE id = ?").run(last.id);
}

function deleteAllComparisons(userId) {
  getDb().prepare("DELETE FROM comparisons WHERE user_id = ?").run(userId);
}

function rowToComparison(row) {
  const comp = { songA: row.song_a, songB: row.song_b, winner: row.winner, timestamp: row.timestamp };
  if (row.source) comp.source = row.source;
  return comp;
}

// --- Genre helpers ---

function getGenres(userId) {
  return getDb().prepare("SELECT name FROM genres WHERE user_id = ? ORDER BY id ASC").all(userId).map(r => r.name);
}

function addGenre(name, userId) {
  try {
    getDb().prepare("INSERT INTO genres (user_id, name) VALUES (?, ?)").run(userId, name);
  } catch (e) {
    // UNIQUE constraint — already exists, ignore
  }
}

function deleteGenre(name, userId) {
  getDb().prepare("DELETE FROM genres WHERE user_id = ? AND name = ?").run(userId, name);
}

function renameGenre(oldName, newName, userId) {
  getDb().prepare("UPDATE genres SET name = ? WHERE user_id = ? AND name = ?").run(newName, userId, oldName);
}

function setGenres(names, userId) {
  const tx = getDb().transaction(() => {
    getDb().prepare("DELETE FROM genres WHERE user_id = ?").run(userId);
    const stmt = getDb().prepare("INSERT INTO genres (user_id, name) VALUES (?, ?)");
    for (const name of names) stmt.run(userId, name);
  });
  tx();
}

// --- Playlist helpers ---

function getPlaylists(userId) {
  const rows = getDb().prepare("SELECT * FROM playlists WHERE user_id = ? ORDER BY created_at ASC").all(userId);
  return rows.map(row => {
    const songRows = getDb().prepare("SELECT song_id FROM playlist_songs WHERE playlist_id = ? ORDER BY position ASC").all(row.id);
    const pl = {
      id: row.id,
      name: row.name,
      songIds: songRows.map(r => r.song_id),
      createdAt: row.created_at,
    };
    if (row.smart_json) {
      try { pl.smart = JSON.parse(row.smart_json); } catch {}
    }
    return pl;
  });
}

function insertPlaylist(pl, userId) {
  getDb().prepare(
    "INSERT INTO playlists (id, user_id, name, smart_json, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(pl.id, userId, pl.name, pl.smart ? JSON.stringify(pl.smart) : null, pl.createdAt || new Date().toISOString());

  if (pl.songIds && pl.songIds.length > 0) {
    const stmt = getDb().prepare("INSERT INTO playlist_songs (playlist_id, song_id, position) VALUES (?, ?, ?)");
    const tx = getDb().transaction(() => {
      pl.songIds.forEach((sid, i) => stmt.run(pl.id, sid, i));
    });
    tx();
  }
}

function updatePlaylist(id, userId, fields) {
  if (fields.name !== undefined) {
    getDb().prepare("UPDATE playlists SET name = ? WHERE id = ? AND user_id = ?").run(fields.name, id, userId);
  }
  if (fields.songIds !== undefined) {
    const tx = getDb().transaction(() => {
      getDb().prepare("DELETE FROM playlist_songs WHERE playlist_id = ?").run(id);
      const stmt = getDb().prepare("INSERT INTO playlist_songs (playlist_id, song_id, position) VALUES (?, ?, ?)");
      fields.songIds.forEach((sid, i) => stmt.run(id, sid, i));
    });
    tx();
  }
}

function deletePlaylist(id, userId) {
  getDb().prepare("DELETE FROM playlists WHERE id = ? AND user_id = ?").run(id, userId);
}

// --- Listen time helpers ---

function getListenTimes(userId) {
  const rows = getDb().prepare("SELECT song_id, seconds FROM listen_times WHERE user_id = ?").all(userId);
  const result = {};
  for (const r of rows) result[r.song_id] = r.seconds;
  return result;
}

function updateListenTimes(userId, times) {
  const stmt = getDb().prepare(
    "INSERT INTO listen_times (user_id, song_id, seconds) VALUES (?, ?, ?) ON CONFLICT(user_id, song_id) DO UPDATE SET seconds = MAX(seconds, excluded.seconds)"
  );
  const tx = getDb().transaction(() => {
    for (const [songId, seconds] of Object.entries(times)) {
      if (seconds > 0) stmt.run(userId, songId, seconds);
    }
  });
  tx();
}

function deleteListenTimes(userId) {
  getDb().prepare("DELETE FROM listen_times WHERE user_id = ?").run(userId);
}

// --- Session store helpers (for express-session) ---

function getSession(sid) {
  const row = getDb().prepare("SELECT sess FROM sessions WHERE sid = ? AND expired > ?").get(sid, Date.now());
  return row ? JSON.parse(row.sess) : null;
}

function setSession(sid, sess, maxAge) {
  const expired = Date.now() + (maxAge || 86400000);
  getDb().prepare(
    "INSERT OR REPLACE INTO sessions (sid, sess, expired) VALUES (?, ?, ?)"
  ).run(sid, JSON.stringify(sess), expired);
}

function destroySession(sid) {
  getDb().prepare("DELETE FROM sessions WHERE sid = ?").run(sid);
}

function cleanExpiredSessions() {
  getDb().prepare("DELETE FROM sessions WHERE expired < ?").run(Date.now());
}

// --- Bulk operations for backup/restore ---

function bulkReplace(userId, data) {
  const tx = getDb().transaction(() => {
    // Clear existing data for user
    getDb().prepare("DELETE FROM listen_times WHERE user_id = ?").run(userId);
    getDb().prepare("DELETE FROM playlist_songs WHERE playlist_id IN (SELECT id FROM playlists WHERE user_id = ?)").run(userId);
    getDb().prepare("DELETE FROM playlists WHERE user_id = ?").run(userId);
    getDb().prepare("DELETE FROM comparisons WHERE user_id = ?").run(userId);
    getDb().prepare("DELETE FROM songs WHERE user_id = ?").run(userId);
    getDb().prepare("DELETE FROM genres WHERE user_id = ?").run(userId);

    // Re-insert songs
    if (data.songs) {
      const stmt = getDb().prepare(
        "INSERT INTO songs (id, user_id, title, date, genre, audio_file, audio_name, base_elo, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      );
      for (const s of data.songs) {
        stmt.run(s.id, userId, s.title, s.date || null, s.genre || "", s.audioFile || null, s.audioName || null, s.baseElo || 0, s.notes || "");
      }
    }

    // Re-insert comparisons
    if (data.comparisons) {
      const stmt = getDb().prepare(
        "INSERT INTO comparisons (user_id, song_a, song_b, winner, source, timestamp) VALUES (?, ?, ?, ?, ?, ?)"
      );
      for (const c of data.comparisons) {
        stmt.run(userId, c.songA, c.songB, c.winner, c.source || "classic", c.timestamp);
      }
    }

    // Re-insert genres
    if (data.genres) {
      const stmt = getDb().prepare("INSERT INTO genres (user_id, name) VALUES (?, ?)");
      for (const g of data.genres) stmt.run(userId, g);
    }

    // Re-insert playlists
    if (data.playlists) {
      const plStmt = getDb().prepare(
        "INSERT INTO playlists (id, user_id, name, smart_json, created_at) VALUES (?, ?, ?, ?, ?)"
      );
      const psStmt = getDb().prepare("INSERT INTO playlist_songs (playlist_id, song_id, position) VALUES (?, ?, ?)");
      for (const pl of data.playlists) {
        plStmt.run(pl.id, userId, pl.name, pl.smart ? JSON.stringify(pl.smart) : null, pl.createdAt || new Date().toISOString());
        if (pl.songIds) {
          pl.songIds.forEach((sid, i) => psStmt.run(pl.id, sid, i));
        }
      }
    }

    // Re-insert listen times
    if (data.listenTimes && typeof data.listenTimes === "object") {
      const stmt = getDb().prepare(
        "INSERT INTO listen_times (user_id, song_id, seconds) VALUES (?, ?, ?)"
      );
      for (const [songId, seconds] of Object.entries(data.listenTimes)) {
        if (seconds > 0) stmt.run(userId, songId, seconds);
      }
    }
  });
  tx();
}

module.exports = {
  getDb,
  createUser, getUserByUsername, getUserById,
  getAllUsersWithStats, updateUserUsername, updateUserPassword, deleteUser,
  getSongs, getSongById, insertSong, updateSong, deleteSong, batchUpdateGenre, rowToSong,
  getComparisons, insertComparison, deleteLastComparison, deleteAllComparisons,
  getGenres, addGenre, deleteGenre, renameGenre, setGenres,
  getPlaylists, insertPlaylist, updatePlaylist, deletePlaylist,
  getListenTimes, updateListenTimes, deleteListenTimes,
  getSession, setSession, destroySession, cleanExpiredSessions,
  bulkReplace,
};
