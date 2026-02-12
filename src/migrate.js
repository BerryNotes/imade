/**
 * Migration script: JSON files → SQLite
 *
 * Reads existing data/songs.json, comparisons.json, genres.json, playlists.json
 * and imports everything under a default "admin" user.
 *
 * Also moves uploads/ files to uploads/1/ (user ID 1 directory).
 *
 * Usage: node src/migrate.js [--data-path /path/to/data]
 */

const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");

// Allow overriding the data path (e.g. for migrating packaged app data)
const dataPathArg = process.argv.indexOf("--data-path");
if (dataPathArg !== -1 && process.argv[dataPathArg + 1]) {
  process.env.APP_DATA_PATH = process.argv[dataPathArg + 1];
}

const db = require("./db");

const BASE_DIR = process.env.APP_DATA_PATH || path.join(__dirname, "..");
const DATA_DIR = path.join(BASE_DIR, "data");
const UPLOADS_DIR = path.join(BASE_DIR, "uploads");

function readJSONSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (e) {
    console.log(`  Skipping ${path.basename(filePath)} (not found or invalid)`);
    return null;
  }
}

async function migrate() {
  console.log("\n=== iMade JSON → SQLite Migration ===\n");
  console.log("Data directory:", DATA_DIR);

  // Check if migration already done
  const existingAdmin = db.getUserByUsername("admin");
  if (existingAdmin) {
    const songCount = db.getSongs(existingAdmin.id).length;
    if (songCount > 0) {
      console.log(`\nMigration already completed (admin user has ${songCount} songs).`);
      console.log("To re-migrate, delete data/imade.db first.\n");
      return;
    }
  }

  // Read JSON files
  const songs = readJSONSafe(path.join(DATA_DIR, "songs.json"));
  const comparisons = readJSONSafe(path.join(DATA_DIR, "comparisons.json"));
  const genres = readJSONSafe(path.join(DATA_DIR, "genres.json"));
  const playlists = readJSONSafe(path.join(DATA_DIR, "playlists.json"));

  if (!songs && !comparisons && !genres && !playlists) {
    console.log("No JSON data files found. Creating empty database with admin user.\n");
  }

  // Create default admin user
  const passwordHash = await bcrypt.hash("admin", 10);
  let user = db.getUserByUsername("admin");
  if (!user) {
    db.createUser("admin", passwordHash);
    user = db.getUserByUsername("admin");
    console.log(`Created admin user (id: ${user.id}, password: "admin")`);
  }
  const userId = user.id;

  // Import songs
  if (songs && songs.length > 0) {
    console.log(`\nImporting ${songs.length} songs...`);
    const stmt = db.getDb().prepare(
      "INSERT OR IGNORE INTO songs (id, user_id, title, date, genre, audio_file, audio_name, base_elo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    );
    const tx = db.getDb().transaction(() => {
      for (const s of songs) {
        // Rewrite audioFile paths: /uploads/file.mp3 → /uploads/file.mp3 (stays same, served per-user)
        stmt.run(s.id, userId, s.title, s.date || null, s.genre || "", s.audioFile || null, s.audioName || null, s.baseElo || 0);
      }
    });
    tx();
    console.log(`  ✓ ${songs.length} songs imported`);
  }

  // Import comparisons
  if (comparisons && comparisons.length > 0) {
    console.log(`Importing ${comparisons.length} comparisons...`);
    const stmt = db.getDb().prepare(
      "INSERT INTO comparisons (user_id, song_a, song_b, winner, source, timestamp) VALUES (?, ?, ?, ?, ?, ?)"
    );
    const tx = db.getDb().transaction(() => {
      for (const c of comparisons) {
        stmt.run(userId, c.songA, c.songB, c.winner, c.source || "classic", c.timestamp);
      }
    });
    tx();
    console.log(`  ✓ ${comparisons.length} comparisons imported`);
  }

  // Import genres
  if (genres && genres.length > 0) {
    console.log(`Importing ${genres.length} genres...`);
    const stmt = db.getDb().prepare("INSERT OR IGNORE INTO genres (user_id, name) VALUES (?, ?)");
    const tx = db.getDb().transaction(() => {
      for (const g of genres) stmt.run(userId, g);
    });
    tx();
    console.log(`  ✓ ${genres.length} genres imported`);
  }

  // Import playlists
  if (playlists && playlists.length > 0) {
    console.log(`Importing ${playlists.length} playlists...`);
    const plStmt = db.getDb().prepare(
      "INSERT OR IGNORE INTO playlists (id, user_id, name, smart_json, created_at) VALUES (?, ?, ?, ?, ?)"
    );
    const psStmt = db.getDb().prepare(
      "INSERT OR IGNORE INTO playlist_songs (playlist_id, song_id, position) VALUES (?, ?, ?)"
    );
    const tx = db.getDb().transaction(() => {
      for (const pl of playlists) {
        plStmt.run(pl.id, userId, pl.name, pl.smart ? JSON.stringify(pl.smart) : null, pl.createdAt || new Date().toISOString());
        if (pl.songIds) {
          pl.songIds.forEach((sid, i) => psStmt.run(pl.id, sid, i));
        }
      }
    });
    tx();
    console.log(`  ✓ ${playlists.length} playlists imported`);
  }

  // Move uploads to per-user directory
  if (fs.existsSync(UPLOADS_DIR)) {
    const userUploadsDir = path.join(UPLOADS_DIR, String(userId));
    const files = fs.readdirSync(UPLOADS_DIR).filter(f => {
      const fPath = path.join(UPLOADS_DIR, f);
      return fs.statSync(fPath).isFile();
    });

    if (files.length > 0) {
      console.log(`\nMoving ${files.length} upload files to uploads/${userId}/...`);
      if (!fs.existsSync(userUploadsDir)) fs.mkdirSync(userUploadsDir, { recursive: true });

      for (const f of files) {
        const src = path.join(UPLOADS_DIR, f);
        const dest = path.join(userUploadsDir, f);
        fs.renameSync(src, dest);
      }
      console.log(`  ✓ ${files.length} files moved`);

      // Update audio_file paths in DB: /uploads/file.mp3 → /uploads/1/file.mp3
      // Actually, we need to update the path references
      // Old: /uploads/1234-567.mp3  New: /uploads/1234-567.mp3 (same filename, new directory)
      // The server will serve from uploads/<userId>/ so we can keep the path as-is
      // BUT the static serve path needs to change. Let's update DB paths to not include /uploads/ prefix.
      // Actually, simplest: keep /uploads/filename in DB, server serves uploads/<userId>/filename
      console.log("  (audio paths unchanged — server handles per-user routing)");
    }
  }

  console.log("\n=== Migration complete! ===");
  console.log(`\nDefault login:\n  Username: admin\n  Password: admin\n`);
  console.log("IMPORTANT: Change the admin password after first login.\n");
}

migrate().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
