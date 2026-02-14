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

// Electron/local auto-login: respect explicit login sessions, but
// validate that the user still exists. Falls back to primary (first) user.
function electronAutoLogin(req, res, next) {
  // If there's an active session, validate it
  if (req.session && req.session.userId) {
    const sessionUser = db.getUserById(req.session.userId);
    if (sessionUser) {
      res.setHeader("X-Auth-User", `${sessionUser.id}:${sessionUser.username}`);
      return next();
    }
    // User no longer exists — clear invalid session
    console.log(`[AUTH] session userId=${req.session.userId} not found in DB, falling back to primary user`);
    delete req.session.userId;
  }
  // No valid session — auto-login as the primary user (id=1)
  console.log(`[AUTH] No valid session for ${req.method} ${req.path}, auto-login as primary user (sessionId=${req.sessionID})`);
  let user = db.getUserById(1);
  if (!user) {
    const bcrypt = require("bcryptjs");
    const hash = bcrypt.hashSync("imade-default-user", 10);
    db.createUser("admin", hash);
    user = db.getUserById(1);
  }
  req.session.userId = user.id;
  res.setHeader("X-Auth-User", `${user.id}:${user.username}:auto`);
  next();
}

module.exports = { createSessionMiddleware, requireAuth, electronAutoLogin, SQLiteStore };
