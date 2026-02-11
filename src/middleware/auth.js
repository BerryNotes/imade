const session = require("express-session");
const db = require("../db");

// Custom SQLite session store using better-sqlite3
class SQLiteStore extends session.Store {
  constructor() {
    super();
    // Clean expired sessions every 15 minutes
    this._cleanTimer = setInterval(() => db.cleanExpiredSessions(), 15 * 60 * 1000);
  }

  get(sid, cb) {
    try {
      const sess = db.getSession(sid);
      cb(null, sess || null);
    } catch (e) {
      cb(e);
    }
  }

  set(sid, sess, cb) {
    try {
      const maxAge = sess.cookie?.maxAge || 86400000;
      db.setSession(sid, sess, maxAge);
      cb(null);
    } catch (e) {
      cb(e);
    }
  }

  destroy(sid, cb) {
    try {
      db.destroySession(sid);
      cb(null);
    } catch (e) {
      cb(e);
    }
  }
}

function createSessionMiddleware() {
  const secret = process.env.SESSION_SECRET || "imade-dev-secret-change-in-production";

  return session({
    store: new SQLiteStore(),
    secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      httpOnly: true,
      sameSite: "lax",
    },
  });
}

// Middleware: require authenticated user
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  res.status(401).json({ error: "Not authenticated" });
}

// Electron auto-login: create/use a local user, set session automatically
function electronAutoLogin(req, res, next) {
  if (req.session && req.session.userId) return next();

  // Auto-create and login as "local" user
  let user = db.getUserByUsername("local");
  if (!user) {
    // bcrypt not needed for auto-login — use a placeholder hash
    const bcrypt = require("bcrypt");
    const hash = bcrypt.hashSync("local-electron-user", 10);
    db.createUser("local", hash);
    user = db.getUserByUsername("local");
  }
  req.session.userId = user.id;
  next();
}

module.exports = { createSessionMiddleware, requireAuth, electronAutoLogin, SQLiteStore };
