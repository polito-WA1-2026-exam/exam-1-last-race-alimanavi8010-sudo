/**
 * dao.js — Data Access Object
 *
 * This file is the ONLY place in the project that talks directly to the database.
 * Every other file (index.js) calls these functions instead of writing SQL itself.
 *
 * Uses 'sqlite3' (the exact package shown in the course examples), with the
 * same callback-wrapped-in-Promise style used in week10/week11's dao.js:
 * db.run/db.get/db.all take a callback (err, result) => {...}, and each
 * exported function wraps that callback in a `new Promise((resolve, reject) => ...)`
 * so the rest of the app can simply `await` these functions.
 */
import sqlite3 from 'sqlite3'
import crypto from 'crypto'

// Open (or create) the database file. This runs once when the server starts.
const db = new sqlite3.Database('lastrace.db', (err) => {
  if (err) throw err
})

// SQLite ignores FOREIGN KEY constraints by default. This turns them on,
// so e.g. a game row can never reference a user_id that doesn't exist.
db.run('PRAGMA foreign_keys = ON')

// ============================================================
// DATABASE INITIALIZATION (schema creation + one-time seed data)
// ============================================================

/**
 * Creates all tables if they don't already exist, and fills them with
 * starter data (lines, stations, events, users, sample games) the FIRST
 * time the server ever runs. On every later run, it sees the tables
 * already have data and skips seeding — so restarting the server never
 * duplicates data or wipes user progress.
 *
 * IMPLEMENTATION NOTE: sqlite3 is fully asynchronous — every db.run() call
 * queues a SQLite operation and returns immediately, before that operation
 * has actually finished. Running many INSERTs in a plain for-loop would fire
 * them all "at once" with no guarantee about completion order. To seed
 * data reliably in a fixed order (stations must exist before line_stations
 * references them, etc.), every step here explicitly waits for the
 * PREVIOUS step's callback before starting the next one — i.e. I chain
 * each insert inside the callback of the one before it.
 */
export function initializeDatabase() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,   -- scrypt hash, never the plain password
        salt TEXT NOT NULL        -- random salt used for that hash
      )`)

      db.run(`CREATE TABLE IF NOT EXISTS lines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        color TEXT NOT NULL       -- hex color used to draw the line on the map
      )`)

      db.run(`CREATE TABLE IF NOT EXISTS stations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE
      )`)

      // This is the most important table for the game logic.
      // It says: "on line X, station Y sits at position Z".
      // Two stations are "adjacent" (connected by a segment) only if
      // they belong to the same line_id and their positions differ by 1.
      // A station that appears under more than one line_id is an
      // INTERCHANGE station (you can switch lines there).
      db.run(`CREATE TABLE IF NOT EXISTS line_stations (
        line_id INTEGER NOT NULL REFERENCES lines(id),
        station_id INTEGER NOT NULL REFERENCES stations(id),
        position INTEGER NOT NULL,
        PRIMARY KEY (line_id, station_id)
      )`)

      db.run(`CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        description TEXT NOT NULL,
        effect INTEGER NOT NULL   -- coin change: -4 to +4, per spec
      )`)

      // One row per completed game (valid or not). The ranking page
      // is just "best score per user" computed from this table.
      db.run(`CREATE TABLE IF NOT EXISTS games (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        start_station_id INTEGER NOT NULL REFERENCES stations(id),
        end_station_id INTEGER NOT NULL REFERENCES stations(id),
        score INTEGER NOT NULL DEFAULT 0,
        completed_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`, seedIfEmpty)

      // All the table-creation statements above are queued by db.serialize()
      // to run strictly in order. The LAST one (games) carries a callback —
      // seedIfEmpty — which only starts once every table is guaranteed to exist.
      function seedIfEmpty() {
        db.get('SELECT COUNT(*) as c FROM lines', [], (err, row) => {
          if (err) return reject(err)
          if (row.c > 0) return resolve() // already seeded in a previous run

          seedLines()
        })
      }

      // --- SEED DATA: each function below calls the next one from
      // inside its own callback, guaranteeing strict ordering. ---

      function seedLines() {
        // 5 lines, modeled loosely on Turin's real and planned metro network.
        const lines = [
          ['Linea 1', '#e74c3c'],
          ['Linea 2', '#2980b9'],
          ['Linea 3', '#27ae60'],
          ['Linea 4', '#f39c12'],
          ['Linea 5', '#8e44ad'],
        ]
        let i = 0
        function next() {
          if (i >= lines.length) return seedStations()
          const [name, color] = lines[i++]
          db.run('INSERT INTO lines (name, color) VALUES (?, ?)', [name, color], next)
        }
        next()
      }

      function seedStations() {
        // 16 stations total (spec requires at least 12).
        // SQLite assigns ids 1..16 in this exact insertion order, which is
        // why the line_stations arrays below reference stations by number.
        const stationNames = [
          'Fermi','Paradiso','Massaua','Pozzo Strada','Monte Grappa',     // 1-5
          'Rivoli','Raffaello Sanzio','Porta Susa','Vinzaglio','Re Umberto', // 6-10
          'Porta Nuova','Nizza','Lingotto','Bengasi','Piazza Vittorio','Gran Madre', // 11-16
        ]
        let i = 0
        function next() {
          if (i >= stationNames.length) return seedLineStations()
          db.run('INSERT INTO stations (name) VALUES (?)', [stationNames[i++]], next)
        }
        next()
      }

      function seedLineStations() {
        // Each entry below is [lineId, stationId, positionOnLine].
        // Consecutive positions on the SAME line = a valid segment.
        //
        // DESIGN NOTE: I deliberately kept most lines mostly "exclusive" —
        // touching the shared network only at FOUR hub stations (Monte Grappa,
        // Porta Susa, Vinzaglio, Lingotto). This satisfies the spec's rule
        // that interchange stations cannot exceed half the total (4 out of
        // 16 here, well under the 8-station limit), while still giving every
        // line at least one connection point into the rest of the network.
        const entries = [
          // Linea 1: Fermi -> Paradiso -> Massaua -> Pozzo Strada -> Monte Grappa ->
          //          Rivoli -> Raffaello Sanzio -> Porta Susa -> Vinzaglio -> Re Umberto
          [1,1,1],[1,2,2],[1,3,3],[1,4,4],[1,5,5],[1,6,6],[1,7,7],[1,8,8],[1,9,9],[1,10,10],
          // Linea 2: Porta Susa -> Porta Nuova -> Nizza
          [2,8,1],[2,11,2],[2,12,3],
          // Linea 3: Monte Grappa -> Lingotto -> Bengasi
          [3,5,1],[3,13,2],[3,14,3],
          // Linea 4: Lingotto -> Piazza Vittorio -> Gran Madre
          [4,13,1],[4,15,2],[4,16,3],
          // Linea 5: Porta Susa -> Vinzaglio
          [5,8,1],[5,9,2],
        ]
        // Result: Monte Grappa, Porta Susa, Vinzaglio and Lingotto are the
        // ONLY interchange stations (4 out of 16 total) — comfortably within
        // the "no more than half" limit, while still satisfying the "at
        // least 3 interchanges" minimum.
        let i = 0
        function next() {
          if (i >= entries.length) return seedEvents()
          const [lineId, stationId, pos] = entries[i++]
          db.run('INSERT INTO line_stations (line_id, station_id, position) VALUES (?, ?, ?)', [lineId, stationId, pos], next)
        }
        next()
      }

      function seedEvents() {
        // 12 random events, effect between -4 and +4 (spec requirement).
        // I wrote these descriptions myself rather than copying the ones
        // from the assignment PDF, to keep the game's "voice" my own.
        const events = [
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
        ]
        let i = 0
        function next() {
          if (i >= events.length) return seedUsers()
          const [desc, effect] = events[i++]
          db.run('INSERT INTO events (description, effect) VALUES (?, ?)', [desc, effect], next)
        }
        next()
      }

      function seedUsers() {
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

        // sqlite3's run() callback receives `this.lastID`, the auto-generated
        // id of the row we just inserted — we capture it so we can use it
        // as the user_id in the pre-populated games below.
        db.run('INSERT INTO users (username, password, salt) VALUES (?, ?, ?)',
          ['alice', alice.hash, alice.salt], function (err) {
            if (err) return reject(err)
            const aliceId = this.lastID

            db.run('INSERT INTO users (username, password, salt) VALUES (?, ?, ?)',
              ['bob', bob.hash, bob.salt], function (err) {
                if (err) return reject(err)
                const bobId = this.lastID

                // carol has no games yet — that's allowed by spec
                db.run('INSERT INTO users (username, password, salt) VALUES (?, ?, ?)',
                  ['carol', carol.hash, carol.salt], (err) => {
                    if (err) return reject(err)
                    seedGames(aliceId, bobId)
                  })
              })
          })
      }

      function seedGames(aliceId, bobId) {
        // Alice and Bob each get 2 pre-played games, satisfying the
        // "2 registered users must have already played" requirement.
        const games = [
          [aliceId, 1, 14, 22, '2026-05-28 10:00:00'], // Fermi -> Bengasi
          [aliceId, 8, 16, 18, '2026-05-29 14:30:00'], // Porta Susa -> Gran Madre
          [bobId,   1, 16, 25, '2026-05-27 09:00:00'], // Fermi -> Gran Madre
          [bobId,   3, 14, 15, '2026-05-29 20:00:00'], // Massaua -> Bengasi
        ]
        let i = 0
        function next() {
          if (i >= games.length) return resolve() // seeding fully complete
          const [userId, startId, endId, score, completedAt] = games[i++]
          db.run(
            'INSERT INTO games (user_id, start_station_id, end_station_id, score, completed_at) VALUES (?, ?, ?, ?, ?)',
            [userId, startId, endId, score, completedAt],
            (err) => { if (err) reject(err); else next() }
          )
        }
        next()
      }
    })
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
    const sql = `
      SELECT l.id as lineId, l.name as lineName, l.color,
             s.id as stationId, s.name as stationName, ls.position
      FROM lines l
      JOIN line_stations ls ON l.id = ls.line_id
      JOIN stations s ON s.id = ls.station_id
      ORDER BY l.id, ls.position
    `
    db.all(sql, [], (err, rows) => {
      if (err) return reject(err)

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
    })
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
    // Self-join trick: ls2 is "the next station on the same line as ls1"
    // (same line_id, position exactly +1). Joining stations to both
    // sides gives us the human-readable names directly.
    const sql = `
      SELECT DISTINCT s1.id as idA, s1.name as nameA, s2.id as idB, s2.name as nameB
      FROM line_stations ls1
      JOIN line_stations ls2 ON ls1.line_id = ls2.line_id AND ls2.position = ls1.position + 1
      JOIN stations s1 ON s1.id = ls1.station_id
      JOIN stations s2 ON s2.id = ls2.station_id
    `
    db.all(sql, [], (err, rows) => {
      if (err) return reject(err)

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
    })
  })
}

/**
 * All stations, used by the server when picking a random start/destination.
 */
export function getAllStations() {
  return new Promise((resolve, reject) => {
    db.all('SELECT id, name FROM stations', [], (err, rows) => {
      if (err) reject(err)
      else resolve(rows)
    })
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
    const sql = `
      SELECT ls1.station_id as fromId, ls2.station_id as toId, ls1.line_id as lineId
      FROM line_stations ls1
      JOIN line_stations ls2 ON ls1.line_id = ls2.line_id AND ls2.position = ls1.position + 1
    `
    db.all(sql, [], (err, rows) => {
      if (err) return reject(err)

      const adj = {}
      for (const r of rows) {
        if (!adj[r.fromId]) adj[r.fromId] = []
        if (!adj[r.toId])   adj[r.toId]   = []
        // Lines run both directions, so we add the edge twice (A->B and B->A).
        adj[r.fromId].push({ neighbor: r.toId, lineId: r.lineId })
        adj[r.toId].push({ neighbor: r.fromId, lineId: r.lineId })
      }
      resolve(adj)
    })
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
    const sql = `
      SELECT station_id FROM line_stations
      GROUP BY station_id HAVING COUNT(DISTINCT line_id) > 1
    `
    db.all(sql, [], (err, rows) => {
      if (err) return reject(err)
      resolve(new Set(rows.map(r => r.station_id)))
    })
  })
}

// ============================================================
// EVENT QUERIES — used by the Execution phase
// ============================================================

export function getAllEvents() {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM events', [], (err, rows) => {
      if (err) reject(err)
      else resolve(rows)
    })
  })
}

/**
 * Only the events with a NEGATIVE effect. The server uses this to raise
 * the odds of something bad happening after the player's 4th stop
 * (see the weighting logic in index.js's /api/game/submit handler).
 */
export function getBadEvents() {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM events WHERE effect < 0', [], (err, rows) => {
      if (err) reject(err)
      else resolve(rows)
    })
  })
}

export function getStationName(id) {
  return new Promise((resolve, reject) => {
    db.get('SELECT name FROM stations WHERE id = ?', [id], (err, row) => {
      if (err) reject(err)
      else resolve(row ? row.name : null)
    })
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
    const sql = 'INSERT INTO games (user_id, start_station_id, end_station_id, score) VALUES (?, ?, ?, ?)'
    db.run(sql, [userId, startId, endId, score], function (err) {
      if (err) reject(err)
      else resolve(this.lastID)
    })
  })
}

/**
 * One row per user: their BEST score ever and how many games they've played.
 * This single query is the entire backend for the ranking page — no extra
 * processing needed on the client side beyond rendering the table.
 */
export function getRanking() {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT u.username, MAX(g.score) as best_score, COUNT(g.id) as games_played
      FROM users u JOIN games g ON u.id = g.user_id
      GROUP BY u.id ORDER BY best_score DESC
    `
    db.all(sql, [], (err, rows) => {
      if (err) reject(err)
      else resolve(rows)
    })
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
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
      if (err) return reject(err)
      if (!row) return resolve(false) // unknown username

      const user = { id: row.id, username: row.username }

      // Re-hash the supplied password with the SAME salt that was stored,
      // then compare the two hashes byte-for-byte. timingSafeEqual avoids
      // leaking timing information that could help an attacker.
      crypto.scrypt(password, row.salt, 16, (err, hashed) => {
        if (err) return reject(err)
        if (!crypto.timingSafeEqual(Buffer.from(row.password, 'hex'), hashed)) {
          resolve(false) // wrong password
        } else {
          resolve(user)
        }
      })
    })
  })
}
