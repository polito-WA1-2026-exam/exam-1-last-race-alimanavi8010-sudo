/**
 * index.js - Main Express server for Last Race
 * ES modules, Passport.js auth, professor's coding style
 */
import express from 'express'
import morgan from 'morgan'
import cors from 'cors'
import session from 'express-session'
import passport from 'passport'
import LocalStrategy from 'passport-local'
import { initializeDatabase, getNetwork, getSegments, getAllStations, getAdjacency, getInterchangeStations, getAllEvents, getBadEvents, getStationName, saveGame, getRanking, getUser } from './dao.js'

const app = express()
const port = 3001

await initializeDatabase()

app.use(express.json())
app.use(morgan('dev'))
app.use(cors({ origin: 'http://localhost:5173', optionsSuccessStatus: 200, credentials: true }))

passport.use(new LocalStrategy(async function verify(username, password, cb) {
  const user = await getUser(username, password)
  if (!user) return cb(null, false, 'Incorrect username or password.')
  return cb(null, user)
}))

passport.serializeUser(function(user, cb) { cb(null, user) })
passport.deserializeUser(function(user, cb) { return cb(null, user) })

app.use(session({ secret: 'lastrace-secret-2026', resave: false, saveUninitialized: false }))
app.use(passport.authenticate('session'))

const isLoggedIn = (req, res, next) => {
  if (req.isAuthenticated()) return next()
  return res.status(401).json({ error: 'Not authorized' })
}

// AUTH
app.post('/api/sessions', passport.authenticate('local'), function(req, res) {
  return res.status(201).json(req.user)
})

app.get('/api/sessions/current', (req, res) => {
  if (req.isAuthenticated()) res.json(req.user)
  else res.status(401).json({ error: 'Not authenticated' })
})

app.delete('/api/sessions/current', (req, res) => {
  req.logout(() => { res.end() })
})

// NETWORK
app.get('/api/network', isLoggedIn, async (req, res) => {
  try { res.json(await getNetwork()) } catch { res.status(500).end() }
})

app.get('/api/segments', isLoggedIn, async (req, res) => {
  try { res.json(await getSegments()) } catch { res.status(500).end() }
})

// GAME
app.get('/api/game/start', isLoggedIn, async (req, res) => {
  try {
    const stations = await getAllStations()
    const adj = await getAdjacency()
    let attempts = 0
    while (attempts++ < 200) {
      const a = stations[Math.floor(Math.random() * stations.length)]
      const b = stations[Math.floor(Math.random() * stations.length)]
      if (a.id === b.id) continue
      if (bfsDistance(adj, a.id, b.id) >= 3) return res.json({ start: a, destination: b })
    }
    res.status(500).json({ error: 'Could not find valid pair.' })
  } catch { res.status(500).end() }
})

app.post('/api/game/submit', isLoggedIn, async (req, res) => {
  const { startId, destinationId, route } = req.body
  if (!startId || !destinationId || !Array.isArray(route)) return res.status(400).json({ error: 'Invalid body.' })
  try {
    const adj = await getAdjacency()
    const interchanges = await getInterchangeStations()
    const allEvents = await getAllEvents()
    const badEvents = await getBadEvents()
    const valid = isRouteValid(route, startId, destinationId, adj, interchanges)
    if (!valid) {
      await saveGame(req.user.id, startId, destinationId, 0)
      return res.json({ valid: false, score: 0, steps: [] })
    }
    let coins = 20
    const steps = []
    for (let i = 0; i < route.length - 1; i++) {
      const fromName = await getStationName(route[i])
      const toName = await getStationName(route[i + 1])
      // After 4 stops: 70% chance of bad event
      const event = (i >= 4 && badEvents.length > 0 && Math.random() < 0.7)
        ? badEvents[Math.floor(Math.random() * badEvents.length)]
        : allEvents[Math.floor(Math.random() * allEvents.length)]
      coins += event.effect
      steps.push({ from: fromName, to: toName, event: { description: event.description, effect: event.effect }, coinsAfter: coins })
    }
    const finalScore = Math.max(0, coins)
    await saveGame(req.user.id, startId, destinationId, finalScore)
    return res.json({ valid: true, score: finalScore, steps })
  } catch(err) { console.error(err); res.status(500).end() }
})

app.get('/api/ranking', isLoggedIn, async (req, res) => {
  try { res.json(await getRanking()) } catch { res.status(500).end() }
})

function bfsDistance(adj, startId, endId) {
  if (startId === endId) return 0
  const visited = new Set([startId])
  const queue = [{ id: startId, dist: 0 }]
  while (queue.length > 0) {
    const { id, dist } = queue.shift()
    for (const { neighbor } of (adj[id] || [])) {
      if (neighbor === endId) return dist + 1
      if (!visited.has(neighbor)) { visited.add(neighbor); queue.push({ id: neighbor, dist: dist + 1 }) }
    }
  }
  return Infinity
}

function isRouteValid(route, startId, destinationId, adj, interchanges) {
  if (!route || route.length < 2) return false
  if (route[0] !== startId || route[route.length - 1] !== destinationId) return false

  // Per final spec: stations CAN be visited more than once,
  // but segments must NOT be repeated
  const usedSegments = new Set()
  let currentLine = null

  for (let i = 0; i < route.length - 1; i++) {
    const from = route[i]
    const to = route[i + 1]

    // Check for repeated segment (in either direction)
    const segKey = [Math.min(from, to), Math.max(from, to)].join('-')
    if (usedSegments.has(segKey)) return false
    usedSegments.add(segKey)

    // Check segment exists in the network
    const lines = (adj[from] || []).filter(e => e.neighbor === to).map(e => e.lineId)
    if (lines.length === 0) return false

    // Check line continuity — can only change lines at interchange stations
    if (currentLine === null) {
      currentLine = lines[0]
    } else if (!lines.includes(currentLine)) {
      if (!interchanges.has(from)) return false
      currentLine = lines[0]
    }
  }
  return true
}

app.listen(port, () => { console.log(`API server started at http://localhost:${port}`) })
