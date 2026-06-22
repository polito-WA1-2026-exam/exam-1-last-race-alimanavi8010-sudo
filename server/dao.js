/**
 * dao.js — Data Access Object
 *
 * This file is the ONLY place in the project that talks directly to the database.
 * Every other file (index.js) calls these functions instead of writing SQL itself.
 * This separation is intentional: if I ever needed to change database engine,
 * only this file would need to change.
 *
 * LIBRARY CHOICE NOTE:
 * The course examples use the 'sqlite3' package (callback-based, async).
 * I use 'better-sqlite3' instead, because 'sqlite3' and the older 'better-sqlite3'
 * versions failed to compile natively on my Windows 11 + Node.js 24 setup
 * (a known C++20/MSBuild toolchain conflict). 'better-sqlite3' v11+ fixed
 * this for me. It is still genuine SQLite — same engine, same .db file,
 * same SQL syntax — just a synchronous API instead of callback-based.
 * To keep the rest of the app looking the same regardless of this choice,
 * every function below still returns a Promise.
 */
import Database from 'better-sqlite3'
import crypto from 'crypto'

// Open (or create) the database file. This runs once when the server starts.
const db = new Database('lastrace.db')

// WAL = Write-Ahead Logging. Lets reads and writes happen concurrently
// without locking the whole file — useful since multiple API calls can
// hit the database at the same time.
db.pragma('journal_mode = WAL')

// SQLite ignores FOREIGN KEY constraints by default. This turns them on,
// so e.g. a game row can never reference a user_id that doesn't exist.
db.pragma('foreign_keys = ON')

// ============================================================
// DATABASE INITIALIZATION (schema creation + one-time seed data)
// ============================================================

/**
 * Creates all tables if they don't already exist, and fills them with
 * starter data (lines, stations, events, users, sample games) the FIRST
 * time the server ever runs. On every later run, it sees the tables
 * already have data and skips seeding — so restarting the server never
 * duplicates data or wipes user progress.
 */
export function initializeDatabase() {
  return new Promise((resolve, reject) => {
    try {
      // db.exec() runs multiple SQL statements at once (no parameters needed)
      db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL UNIQUE,
          password TEXT NOT NULL,   -- scrypt hash, never the plain password
          salt TEXT NOT NULL        -- random salt used for that hash
        );

        CREATE TABLE IF NOT EXISTS lines (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          color TEXT NOT NULL       -- hex color used to draw the line on the map
        );

        CREATE TABLE IF NOT EXISTS stations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE
        );

        -- This is the most important table for the game logic.
        -- It says: "on line X, station Y sits at position Z".
        -- Two stations are "adjacent" (connected by a segment) only if
        -- they belong to the same line_id and their positions differ by 1.
        -- A station that appears under more than one line_id is an
        -- INTERCHANGE station (you can switch lines there).
        CREATE TABLE IF NOT EXISTS line_stations (
          line_id INTEGER NOT NULL REFERENCES lines(id),
          station_id INTEGER NOT NULL REFERENCES stations(id),
          position INTEGER NOT NULL,
          PRIMARY KEY (line_id, station_id)
        );

        CREATE TABLE IF NOT EXISTS events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          description TEXT NOT NULL,
          effect INTEGER NOT NULL   -- coin change: -4 to +4, per spec
        );

        -- One row per completed game (valid or not). The ranking page
        -- is just "best score per user" computed from this table.
        CREATE TABLE IF NOT EXISTS games (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id),
          start_station_id INTEGER NOT NULL REFERENCES stations(id),
          end_station_id INTEGER NOT NULL REFERENCES stations(id),
          score INTEGER NOT NULL DEFAULT 0,
          completed_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `)

      // If the lines table already has rows, the database was seeded
      // in a previous run — don't seed again, just resolve and return.
      const lineCount = db.prepare('SELECT COUNT(*) as c FROM lines').get().c
      if (lineCount > 0) return resolve()

      // --- SEED DATA STARTS HERE (only runs once, on first launch) ---

      // db.prepare(...) compiles a SQL statement once; .run() executes it
      // with different parameters each time — much faster than re-parsing
      // the SQL string on every insert.
      const insertLine    = db.prepare('INSERT INTO lines (name, color) VALUES (?, ?)')
      const insertStation = db.prepare('INSERT INTO stations (name) VALUES (?)')
      const insertLS      = db.prepare('INSERT INTO line_stations (line_id, station_id, position) VALUES (?, ?, ?)')
      const insertEvent   = db.prepare('INSERT INTO events (description, effect) VALUES (?, ?)')
      const insertUser    = db.prepare('INSERT INTO users (username, password, salt) VALUES (?, ?, ?)')
      const insertGame    = db.prepare('INSERT INTO games (user_id, start_station_id, end_station_id, score, completed_at) VALUES (?, ?, ?, ?, ?)')

      // 5 lines, modeled loosely on Turin's real and planned metro network.
      insertLine.run('Linea 1', '#e74c3c')
      insertLine.run('Linea 2', '#2980b9')
      insertLine.run('Linea 3', '#27ae60')
      insertLine.run('Linea 4', '#f39c12')
      insertLine.run('Linea 5', '#8e44ad')

      // 16 stations total (spec requires at least 12).
      // SQLite assigns ids 1..16 in this exact insertion order, which is
      // why the line_stations arrays below reference stations by number.
      const stationNames = [
        'Fermi','Paradiso','Massaua','Pozzo Strada','Monte Grappa',     // 1-5
        'Rivoli','Raffaello Sanzio','Porta Susa','Vinzaglio','Re Umberto', // 6-10
        'Porta Nuova','Nizza','Lingotto','Bengasi','Piazza Vittorio','Gran Madre', // 11-16
      ]
      for (const name of stationNames) insertStation.run(name)

      // Each array below is [stationId, positionOnLine].
      // Consecutive positions on the SAME line = a valid segment.
      //
      // DESIGN NOTE: I deliberately kept most lines mostly "exclusive" —
      // touching the shared network only at FOUR hub stations (Monte Grappa,
      // Porta Susa, Vinzaglio, Lingotto). This satisfies the spec's rule
      // that interchange stations cannot exceed half the total (4 out of
      // 16 here, well under the 8-station limit), while still giving every
      // line at least one connection point into the rest of the network.

      // Linea 1 (id=1): a long line — its own 10 stations, sharing two of
      // them (Monte Grappa, Porta Susa) with other lines.
      // Fermi -> Paradiso -> Massaua -> Pozzo Strada -> Monte Grappa ->
      //   Rivoli -> Raffaello Sanzio -> Porta Susa -> Vinzaglio -> Re Umberto
      ;[[1,1],[2,2],[3,3],[4,4],[5,5],[6,6],[7,7],[8,8],[9,9],[10,10]]
        .forEach(([sid, pos]) => insertLS.run(1, sid, pos))

      // Linea 2 (id=2): branches off the Porta Susa hub only.
      // Porta Susa -> Porta Nuova -> Nizza
      ;[[8,1],[11,2],[12,3]]
        .forEach(([sid, pos]) => insertLS.run(2, sid, pos))

      // Linea 3 (id=3): branches off the Monte Grappa hub, also touches Lingotto.
      // Monte Grappa -> Lingotto -> Bengasi
      ;[[5,1],[13,2],[14,3]]
        .forEach(([sid, pos]) => insertLS.run(3, sid, pos))

      // Linea 4 (id=4): branches off the Lingotto hub only.
      // Lingotto -> Piazza Vittorio -> Gran Madre
      ;[[13,1],[15,2],[16,3]]
        .forEach(([sid, pos]) => insertLS.run(4, sid, pos))

      // Linea 5 (id=5): a short line, branches off the Porta Susa hub.
      // Porta Susa -> Vinzaglio
      ;[[8,1],[9,2]]
        .forEach(([sid, pos]) => insertLS.run(5, sid, pos))

      // Result: Monte Grappa, Porta Susa, Vinzaglio and Lingotto are the
      // ONLY interchange stations (4 out of 16 total) — comfortably within
      // the "no more than half" limit, while still satisfying the "at
      // least 3 interchanges" minimum.

      // 12 random events, effect between -4 and +4 (spec requirement).
      // I wrote these descriptions myself rather than copying the ones
      // from the assignment PDF, to keep the game's "voice" my own.
      ;[
        ['Perfect journey, no issues at all.', 0],
        ['A friendly passenger shares their snack with you!', 1],
        ['Street musician plays a great tune — mood boosted!', 2],
        ['Lucky! You find a coin under the seat.', 1],
        ['Everyone starts dancing in the carriage!', 3],
        ['A famous actor boards and buys everyone a drink.', 4],
        ['You boarded the wrong platform and lost time.', -2],
        ['Track signal failure causes major delays.', -3],
        ['Thief pickpockets your coins!', -4],
        ['Train skips your stop — you have to walk back.', -1],
        ['Door stuck — delayed for several minutes.', -2],
        ['Ticket inspection causes unexpected delay.', -1],
      ].forEach(([desc, effect]) => insertEvent.run(desc, effect))

      // 3 seeded users (spec requires at least 3, with at least 2 having
      // played games already). Passwords are NEVER stored in plain text:
      // createHash() below salts and hashes them with Node's built-in
      // crypto.scrypt, the same approach shown in the course examples.
      const createHash = (password) => {
        const salt = crypto.randomBytes(16).toString('hex')
        const hash = crypto.scryptSync(password, salt, 16).toString('hex')
        return { hash, salt }
      }

      const alice = createHash('alice123')
      const bob   = createHash('bob123')
      const carol = createHash('carol123')

      // .lastInsertRowid gives back the auto-generated id of the row
      // we just inserted, so we can use it as the user_id in the
      // pre-populated games below.
      const aliceId = insertUser.run('alice', alice.hash, alice.salt).lastInsertRowid
      const bobId   = insertUser.run('bob', bob.hash, bob.salt).lastInsertRowid
      insertUser.run('carol', carol.hash, carol.salt) // carol has no games yet — that's allowed by spec

      // Alice and Bob each get 2 pre-played games, satisfying the
      // "2 registered users must have already played" requirement.
      insertGame.run(aliceId, 1, 14, 22, '2026-05-28 10:00:00') // Fermi -> Bengasi
      insertGame.run(aliceId, 8, 16, 18, '2026-05-29 14:30:00') // Porta Susa -> Gran Madre
      insertGame.run(bobId,   1, 16, 25, '2026-05-27 09:00:00') // Fermi -> Gran Madre
      insertGame.run(bobId,   3, 14, 15, '2026-05-29 20:00:00') // Massaua -> Bengasi

      resolve()
    } catch (err) { reject(err) }
  })
}

// ============================================================
// NETWORK QUERIES — used by the Setup and Planning phases
// ============================================================

/**
 * Returns every line together with its stations IN ORDER.
 * Used only in the Setup phase, where the player is allowed to see
 * the full map including which line connects which stations.
 */
export function getNetwork() {
  return new Promise((resolve, reject) => {
    try {
      const rows = db.prepare(`
        SELECT l.id as lineId, l.name as lineName, l.color,
               s.id as stationId, s.name as stationName, ls.position
        FROM lines l
        JOIN line_stations ls ON l.id = ls.line_id
        JOIN stations s ON s.id = ls.station_id
        ORDER BY l.id, ls.position
      `).all()

      // The SQL above returns one FLAT row per (line, station) pair.
      // This loop groups those flat rows back into a nested structure:
      // [{ id, name, color, stations: [...] }, ...] — easier for the
      // React client to render one <Line> block per line.
      const map = {}
      for (const r of rows) {
        if (!map[r.lineId]) map[r.lineId] = { id: r.lineId, name: r.lineName, color: r.color, stations: [] }
        map[r.lineId].stations.push({ id: r.stationId, name: r.stationName, position: r.position })
      }
      resolve(Object.values(map))
    } catch (err) { reject(err) }
  })
}

/**
 * Returns every adjacent station pair (= every "segment") in the network,
 * WITHOUT revealing which line each segment belongs to, and in RANDOM
 * order. This is exactly what the Planning phase is allowed to show:
 * the player must reconstruct the network mentally from this flat list.
 */
export function getSegments() {
  return new Promise((resolve, reject) => {
    try {
      // Self-join trick: ls2 is "the next station on the same line as ls1"
      // (same line_id, position exactly +1). Joining stations to both
      // sides gives us the human-readable names directly.
      const rows = db.prepare(`
        SELECT DISTINCT s1.id as idA, s1.name as nameA, s2.id as idB, s2.name as nameB
        FROM line_stations ls1
        JOIN line_stations ls2 ON ls1.line_id = ls2.line_id AND ls2.position = ls1.position + 1
        JOIN stations s1 ON s1.id = ls1.station_id
        JOIN stations s2 ON s2.id = ls2.station_id
      `).all()

      const segments = rows.map(r => ({
        stationA: { id: r.idA, name: r.nameA },
        stationB: { id: r.idB, name: r.nameB },
      }))

      // Fisher–Yates shuffle: guarantees the segment list looks different
      // every time, so the player can't memorise "row 3 is always X-Y".
      for (let i = segments.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[segments[i], segments[j]] = [segments[j], segments[i]]
      }
      resolve(segments)
    } catch (err) { reject(err) }
  })
}

/**
 * All stations, used by the server when picking a random start/destination.
 */
export function getAllStations() {
  return new Promise((resolve, reject) => {
    try { resolve(db.prepare('SELECT id, name FROM stations').all()) }
    catch (err) { reject(err) }
  })
}

/**
 * Builds an adjacency list: adj[stationId] = [{ neighbor, lineId }, ...].
 * This is the data structure the BFS distance check and the route
 * validator (both in index.js) actually walk through. I compute it
 * here instead of in index.js to keep all raw SQL in one file.
 */
export function getAdjacency() {
  return new Promise((resolve, reject) => {
    try {
      const rows = db.prepare(`
        SELECT ls1.station_id as fromId, ls2.station_id as toId, ls1.line_id as lineId
        FROM line_stations ls1
        JOIN line_stations ls2 ON ls1.line_id = ls2.line_id AND ls2.position = ls1.position + 1
      `).all()

      const adj = {}
      for (const r of rows) {
        if (!adj[r.fromId]) adj[r.fromId] = []
        if (!adj[r.toId])   adj[r.toId]   = []
        // Lines run both directions, so we add the edge twice (A->B and B->A).
        adj[r.fromId].push({ neighbor: r.toId, lineId: r.lineId })
        adj[r.toId].push({ neighbor: r.fromId, lineId: r.lineId })
      }
      resolve(adj)
    } catch (err) { reject(err) }
  })
}

/**
 * Returns the Set of station IDs that belong to MORE THAN ONE line.
 * These are the only stations where a route is allowed to switch lines.
 * Notice this is computed from the data (GROUP BY + COUNT DISTINCT) —
 * nothing in the schema explicitly marks a station as "interchange".
 */
export function getInterchangeStations() {
  return new Promise((resolve, reject) => {
    try {
      const rows = db.prepare(`
        SELECT station_id FROM line_stations
        GROUP BY station_id HAVING COUNT(DISTINCT line_id) > 1
      `).all()
      resolve(new Set(rows.map(r => r.station_id)))
    } catch (err) { reject(err) }
  })
}

// ============================================================
// EVENT QUERIES — used by the Execution phase
// ============================================================

export function getAllEvents() {
  return new Promise((resolve, reject) => {
    try { resolve(db.prepare('SELECT * FROM events').all()) }
    catch (err) { reject(err) }
  })
}

/**
 * Only the events with a NEGATIVE effect. The server uses this to raise
 * the odds of something bad happening after the player's 4th stop
 * (see the weighting logic in index.js's /api/game/submit handler).
 */
export function getBadEvents() {
  return new Promise((resolve, reject) => {
    try { resolve(db.prepare('SELECT * FROM events WHERE effect < 0').all()) }
    catch (err) { reject(err) }
  })
}

export function getStationName(id) {
  return new Promise((resolve, reject) => {
    try {
      const row = db.prepare('SELECT name FROM stations WHERE id = ?').get(id)
      resolve(row ? row.name : null)
    } catch (err) { reject(err) }
  })
}

// ============================================================
// GAME / RANKING QUERIES — used by the Result and Ranking pages
// ============================================================

/**
 * Records one completed game (valid or not — even a score of 0 gets saved,
 * so the ranking and "games played" count stay accurate).
 */
export function saveGame(userId, startId, endId, score) {
  return new Promise((resolve, reject) => {
    try {
      const result = db.prepare(
        'INSERT INTO games (user_id, start_station_id, end_station_id, score) VALUES (?, ?, ?, ?)'
      ).run(userId, startId, endId, score)
      resolve(result.lastInsertRowid)
    } catch (err) { reject(err) }
  })
}

/**
 * One row per user: their BEST score ever and how many games they've played.
 * This single query is the entire backend for the ranking page — no extra
 * processing needed on the client side beyond rendering the table.
 */
export function getRanking() {
  return new Promise((resolve, reject) => {
    try {
      resolve(db.prepare(`
        SELECT u.username, MAX(g.score) as best_score, COUNT(g.id) as games_played
        FROM users u JOIN games g ON u.id = g.user_id
        GROUP BY u.id ORDER BY best_score DESC
      `).all())
    } catch (err) { reject(err) }
  })
}

// ============================================================
// USER / AUTH QUERIES — used by Passport's LocalStrategy in index.js
// ============================================================

/**
 * Verifies a username + password pair against the stored hash.
 * Returns the user object { id, username } on success, or false on
 * any kind of mismatch (unknown username OR wrong password) — the
 * caller in index.js can't tell which one failed, which is intentional:
 * it stops an attacker from guessing which usernames exist.
 */
export function getUser(username, password) {
  return new Promise((resolve, reject) => {
    try {
      const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username)
      if (!row) return resolve(false)

      const user = { id: row.id, username: row.username }

      // Re-hash the supplied password with the SAME salt that was stored,
      // then compare the two hashes byte-for-byte. timingSafeEqual avoids
      // leaking timing information that could help an attacker.
      crypto.scrypt(password, row.salt, 16, (err, hashed) => {
        if (err) return reject(err)
        if (!crypto.timingSafeEqual(Buffer.from(row.password, 'hex'), hashed)) {
          resolve(false)
        } else {
          resolve(user)
        }
      })
    } catch (err) { reject(err) }
  })
}
