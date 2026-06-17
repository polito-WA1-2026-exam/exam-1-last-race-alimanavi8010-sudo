/**
 * dao.js - Data Access Object
 * Uses sql.js - pure JavaScript SQLite, no compilation needed.
 * All functions return Promises, matching the professor's async style.
 */
import { createRequire } from 'module'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import crypto from 'crypto'

const require = createRequire(import.meta.url)
const initSqlJs = require('sql.js')

let db = null

// Save database to disk after every write
function saveDb() {
  const data = db.export()
  writeFileSync('lastrace.db', Buffer.from(data))
}

// Get a single row
function get(sql, params = []) {
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const row = stmt.step() ? stmt.getAsObject() : null
  stmt.free()
  return row
}

// Get all rows
function all(sql, params = []) {
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const rows = []
  while (stmt.step()) rows.push(stmt.getAsObject())
  stmt.free()
  return rows
}

// ============================================================
// DATABASE INITIALIZATION
// ============================================================

export function initializeDatabase() {
  return new Promise(async (resolve, reject) => {
    try {
      const SQL = await initSqlJs()

      if (existsSync('lastrace.db')) {
        const fileBuffer = readFileSync('lastrace.db')
        db = new SQL.Database(fileBuffer)
      } else {
        db = new SQL.Database()
      }

      // Create tables
      db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, password TEXT NOT NULL, salt TEXT NOT NULL)`)
      db.run(`CREATE TABLE IF NOT EXISTS lines (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, color TEXT NOT NULL)`)
      db.run(`CREATE TABLE IF NOT EXISTS stations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE)`)
      db.run(`CREATE TABLE IF NOT EXISTS line_stations (line_id INTEGER NOT NULL, station_id INTEGER NOT NULL, position INTEGER NOT NULL, PRIMARY KEY (line_id, station_id))`)
      db.run(`CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, description TEXT NOT NULL, effect INTEGER NOT NULL)`)
      db.run(`CREATE TABLE IF NOT EXISTS games (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, start_station_id INTEGER NOT NULL, end_station_id INTEGER NOT NULL, score INTEGER NOT NULL DEFAULT 0, completed_at TEXT NOT NULL DEFAULT (datetime('now')))`)

      // Only seed if empty
      const lineCount = get('SELECT COUNT(*) as c FROM lines')
      if (lineCount && lineCount.c > 0) { saveDb(); return resolve() }

      // LINES
      db.run("INSERT INTO lines (name, color) VALUES ('Linea 1', '#e74c3c')")
      db.run("INSERT INTO lines (name, color) VALUES ('Linea 2', '#2980b9')")
      db.run("INSERT INTO lines (name, color) VALUES ('Linea 3', '#27ae60')")
      db.run("INSERT INTO lines (name, color) VALUES ('Linea 4', '#f39c12')")
      db.run("INSERT INTO lines (name, color) VALUES ('Linea 5', '#8e44ad')")

      // STATIONS
      const stations = ['Fermi','Paradiso','Massaua','Pozzo Strada','Monte Grappa','Rivoli','Raffaello Sanzio','Porta Susa','Vinzaglio','Re Umberto','Porta Nuova','Nizza','Lingotto','Bengasi','Piazza Vittorio','Gran Madre']
      for (const name of stations) {
        db.run('INSERT INTO stations (name) VALUES (?)', [name])
      }

      // LINE STATIONS - insert one by one
      // Line 1: Fermi->Paradiso->Massaua->Pozzo Strada->Monte Grappa->Rivoli->Raffaello Sanzio->Porta Susa->Vinzaglio->Re Umberto->Porta Nuova->Nizza->Lingotto->Bengasi
      const line1 = [[1,1],[2,2],[3,3],[4,4],[5,5],[6,6],[7,7],[8,8],[9,9],[10,10],[11,11],[12,12],[13,13],[14,14]]
      for (const [s, p] of line1) db.run('INSERT INTO line_stations (line_id, station_id, position) VALUES (?,?,?)', [1, s, p])

      // Line 2: Porta Susa(8)->Re Umberto(10)->Porta Nuova(11)->Piazza Vittorio(15)->Gran Madre(16)
      const line2 = [[8,1],[10,2],[11,3],[15,4],[16,5]]
      for (const [s, p] of line2) db.run('INSERT INTO line_stations (line_id, station_id, position) VALUES (?,?,?)', [2, s, p])

      // Line 3: Monte Grappa(5)->Porta Susa(8)->Vinzaglio(9)->Lingotto(13)->Piazza Vittorio(15)
      const line3 = [[5,1],[8,2],[9,3],[13,4],[15,5]]
      for (const [s, p] of line3) db.run('INSERT INTO line_stations (line_id, station_id, position) VALUES (?,?,?)', [3, s, p])

      // Line 4: Re Umberto(10)->Porta Nuova(11)->Nizza(12)->Lingotto(13)->Bengasi(14)
      const line4 = [[10,1],[11,2],[12,3],[13,4],[14,5]]
      for (const [s, p] of line4) db.run('INSERT INTO line_stations (line_id, station_id, position) VALUES (?,?,?)', [4, s, p])

      // Line 5: Massaua(3)->Monte Grappa(5)->Porta Susa(8)->Re Umberto(10)->Gran Madre(16)
      const line5 = [[3,1],[5,2],[8,3],[10,4],[16,5]]
      for (const [s, p] of line5) db.run('INSERT INTO line_stations (line_id, station_id, position) VALUES (?,?,?)', [5, s, p])

      // EVENTS
      const events = [
        ['Smooth ride, no delays.', 0],
        ['Kind passenger offers their seat!', 1],
        ['Busker plays your favourite song!', 2],
        ['You find a coin on the seat.', 1],
        ['Dance party in the carriage!', 3],
        ['Celebrity buys everyone coffee.', 4],
        ['Wrong platform — time wasted.', -2],
        ['Signal failure — long delay.', -3],
        ['Pickpocket steals your coins!', -4],
        ['Train overshoots the station.', -1],
        ['Doors malfunction.', -2],
        ['Ticket inspector delay.', -1],
      ]
      for (const [desc, effect] of events) {
        db.run('INSERT INTO events (description, effect) VALUES (?,?)', [desc, effect])
      }

      // USERS
      const hashPw = (pw) => {
        const salt = crypto.randomBytes(16).toString('hex')
        const hash = crypto.scryptSync(pw, salt, 16).toString('hex')
        return { hash, salt }
      }
      const a = hashPw('alice123')
      const b = hashPw('bob123')
      const c = hashPw('carol123')
      db.run('INSERT INTO users (username, password, salt) VALUES (?,?,?)', ['alice', a.hash, a.salt])
      db.run('INSERT INTO users (username, password, salt) VALUES (?,?,?)', ['bob', b.hash, b.salt])
      db.run('INSERT INTO users (username, password, salt) VALUES (?,?,?)', ['carol', c.hash, c.salt])

      // PRE-POPULATED GAMES
      db.run('INSERT INTO games (user_id, start_station_id, end_station_id, score, completed_at) VALUES (1,1,14,22,"2026-05-28 10:00:00")')
      db.run('INSERT INTO games (user_id, start_station_id, end_station_id, score, completed_at) VALUES (1,8,16,18,"2026-05-29 14:30:00")')
      db.run('INSERT INTO games (user_id, start_station_id, end_station_id, score, completed_at) VALUES (2,1,16,25,"2026-05-27 09:00:00")')
      db.run('INSERT INTO games (user_id, start_station_id, end_station_id, score, completed_at) VALUES (2,3,14,15,"2026-05-29 20:00:00")')

      saveDb()
      resolve()
    } catch(err) { reject(err) }
  })
}

// ============================================================
// NETWORK QUERIES
// ============================================================

export function getNetwork() {
  return new Promise((resolve, reject) => {
    try {
      const rows = all(`
        SELECT l.id as lineId, l.name as lineName, l.color,
               s.id as stationId, s.name as stationName, ls.position
        FROM lines l
        JOIN line_stations ls ON l.id = ls.line_id
        JOIN stations s ON s.id = ls.station_id
        ORDER BY l.id, ls.position
      `)
      const map = {}
      for (const r of rows) {
        if (!map[r.lineId]) map[r.lineId] = { id: r.lineId, name: r.lineName, color: r.color, stations: [] }
        map[r.lineId].stations.push({ id: r.stationId, name: r.stationName, position: r.position })
      }
      resolve(Object.values(map))
    } catch(err) { reject(err) }
  })
}

export function getSegments() {
  return new Promise((resolve, reject) => {
    try {
      const rows = all(`
        SELECT DISTINCT s1.id as idA, s1.name as nameA, s2.id as idB, s2.name as nameB
        FROM line_stations ls1
        JOIN line_stations ls2 ON ls1.line_id = ls2.line_id AND ls2.position = ls1.position + 1
        JOIN stations s1 ON s1.id = ls1.station_id
        JOIN stations s2 ON s2.id = ls2.station_id
      `)
      const segments = rows.map(r => ({ stationA: { id: r.idA, name: r.nameA }, stationB: { id: r.idB, name: r.nameB } }))
      for (let i = segments.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[segments[i], segments[j]] = [segments[j], segments[i]]
      }
      resolve(segments)
    } catch(err) { reject(err) }
  })
}

export function getAllStations() {
  return new Promise((resolve, reject) => {
    try { resolve(all('SELECT id, name FROM stations')) }
    catch(err) { reject(err) }
  })
}

export function getAdjacency() {
  return new Promise((resolve, reject) => {
    try {
      const rows = all(`
        SELECT ls1.station_id as fromId, ls2.station_id as toId, ls1.line_id as lineId
        FROM line_stations ls1
        JOIN line_stations ls2 ON ls1.line_id = ls2.line_id AND ls2.position = ls1.position + 1
      `)
      const adj = {}
      for (const r of rows) {
        if (!adj[r.fromId]) adj[r.fromId] = []
        if (!adj[r.toId]) adj[r.toId] = []
        adj[r.fromId].push({ neighbor: r.toId, lineId: r.lineId })
        adj[r.toId].push({ neighbor: r.fromId, lineId: r.lineId })
      }
      resolve(adj)
    } catch(err) { reject(err) }
  })
}

export function getInterchangeStations() {
  return new Promise((resolve, reject) => {
    try {
      const rows = all(`SELECT station_id FROM line_stations GROUP BY station_id HAVING COUNT(DISTINCT line_id) > 1`)
      resolve(new Set(rows.map(r => r.station_id)))
    } catch(err) { reject(err) }
  })
}

export function getAllEvents() {
  return new Promise((resolve, reject) => {
    try { resolve(all('SELECT * FROM events')) }
    catch(err) { reject(err) }
  })
}

export function getBadEvents() {
  return new Promise((resolve, reject) => {
    try { resolve(all('SELECT * FROM events WHERE effect < 0')) }
    catch(err) { reject(err) }
  })
}

export function getStationName(id) {
  return new Promise((resolve, reject) => {
    try {
      const r = get('SELECT name FROM stations WHERE id = ?', [id])
      resolve(r ? r.name : null)
    } catch(err) { reject(err) }
  })
}

export function saveGame(userId, startId, endId, score) {
  return new Promise((resolve, reject) => {
    try {
      db.run('INSERT INTO games (user_id, start_station_id, end_station_id, score) VALUES (?,?,?,?)', [userId, startId, endId, score])
      saveDb()
      resolve()
    } catch(err) { reject(err) }
  })
}

export function getRanking() {
  return new Promise((resolve, reject) => {
    try {
      resolve(all(`
        SELECT u.username, MAX(g.score) as best_score, COUNT(g.id) as games_played
        FROM users u JOIN games g ON u.id = g.user_id
        GROUP BY u.id ORDER BY best_score DESC
      `))
    } catch(err) { reject(err) }
  })
}

export function getUser(username, password) {
  return new Promise((resolve, reject) => {
    try {
      const row = get('SELECT * FROM users WHERE username = ?', [username])
      if (!row) return resolve(false)
      const user = { id: row.id, username: row.username }
      crypto.scrypt(password, row.salt, 16, (err, hashed) => {
        if (err) return reject(err)
        if (!crypto.timingSafeEqual(Buffer.from(row.password, 'hex'), hashed)) resolve(false)
        else resolve(user)
      })
    } catch(err) { reject(err) }
  })
}
