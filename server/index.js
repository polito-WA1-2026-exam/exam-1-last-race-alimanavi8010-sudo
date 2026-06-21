/**
 * index.js — Last Race API server
 *
 * Responsibilities of this file:
 *  - Express app setup (JSON parsing, logging, CORS for the two-server pattern)
 *  - Passport.js authentication (local username/password strategy + sessions)
 *  - All HTTP routes (/api/...)
 *  - The two pieces of "game logic" that don't belong in the database layer:
 *    bfsDistance() and isRouteValid()
 *
 * All actual SQL lives in dao.js — this file never touches the database
 * directly, it only calls the functions dao.js exports.
 */
import express from 'express'
import morgan from 'morgan'
import cors from 'cors'
import session from 'express-session'
import passport from 'passport'
import LocalStrategy from 'passport-local'
import {
  initializeDatabase,
  getNetwork,
  getSegments,
  getAllStations,
  getAdjacency,
  getInterchangeStations,
  getAllEvents,
  getBadEvents,
  getStationName,
  saveGame,
  getRanking,
  getUser,
} from './dao.js'

const app = express()
const port = 3001

// The database must exist (tables created + seed data inserted) BEFORE
// the server starts accepting requests, so we await it here at startup
// rather than inside each route handler.
await initializeDatabase()

// --- MIDDLEWARE ---

app.use(express.json())  // lets req.body be parsed automatically from JSON
app.use(morgan('dev'))   // logs every request to the terminal (method, path, status, time)

// Two-server pattern: the React dev server (Vite, port 5173) and this
// API server (port 3001) are two separate origins. By default the
// browser blocks requests between different origins (CORS), so we
// explicitly allow the Vite origin and allow credentials (cookies)
// to be sent — required for the session cookie to work.
app.use(cors({
  origin: 'http://localhost:5173',
  optionsSuccessStatus: 200,
  credentials: true,
}))

// --- PASSPORT (AUTHENTICATION) SETUP ---

// LocalStrategy defines HOW to check a username/password pair.
// It delegates the actual check to dao.js's getUser(), which already
// knows how to verify the scrypt hash. This function only has to
// translate "valid / invalid" into Passport's expected callback shape.
passport.use(new LocalStrategy(async function verify(username, password, cb) {
  const user = await getUser(username, password)
  if (!user) return cb(null, false, 'Incorrect username or password.')
  return cb(null, user)
}))

// serializeUser / deserializeUser control what gets stored in the
// session and how it's turned back into req.user on later requests.
// Here the whole { id, username } object is stored directly — simple
// because we don't need to re-query the database on every request.
passport.serializeUser(function (user, cb) { cb(null, user) })
passport.deserializeUser(function (user, cb) { return cb(null, user) })

// express-session attaches a signed cookie to the response and keeps
// server-side session data tied to it. resave/saveUninitialized are
// both false to avoid creating empty sessions for anonymous visitors.
app.use(session({
  secret: 'lastrace-secret-2026',
  resave: false,
  saveUninitialized: false,
}))

// Tells Passport to check for an existing session on every request,
// and (if found) restore req.user via deserializeUser above.
app.use(passport.authenticate('session'))

/**
 * Route guard: blocks anonymous users from protected endpoints.
 * Per spec, anonymous users may only read the instructions — every
 * other endpoint (map, segments, game logic, ranking) requires login.
 */
const isLoggedIn = (req, res, next) => {
  if (req.isAuthenticated()) return next()
  return res.status(401).json({ error: 'Not authorized' })
}

// ============================================================
// AUTH ROUTES
// Naming follows the course convention: /api/sessions (plural),
// where a session is "created" by POST and "destroyed" by DELETE.
// ============================================================

// POST /api/sessions — log in.
// passport.authenticate('local') runs the LocalStrategy above using
// req.body.username/password; if it succeeds, req.user is populated
// and this handler just echoes it back to the client.
app.post('/api/sessions', passport.authenticate('local'), function (req, res) {
  return res.status(201).json(req.user)
})

// GET /api/sessions/current — "am I logged in, and as who?"
// The React client calls this once on page load to restore the
// logged-in state after a refresh (since React state itself resets).
app.get('/api/sessions/current', (req, res) => {
  if (req.isAuthenticated()) res.json(req.user)
  else res.status(401).json({ error: 'Not authenticated' })
})

// DELETE /api/sessions/current — log out.
// req.logout() is provided by Passport; it clears req.user and
// invalidates the session.
app.delete('/api/sessions/current', (req, res) => {
  req.logout(() => { res.end() })
})

// ============================================================
// NETWORK ROUTES
// ============================================================

// GET /api/network — full map (all lines + their stations, in order).
// Only used in the Setup phase, where seeing the lines is allowed.
app.get('/api/network', isLoggedIn, async (req, res) => {
  try { res.json(await getNetwork()) } catch { res.status(500).end() }
})

// GET /api/segments — shuffled list of adjacent station pairs, with NO
// line information attached. This is deliberately less information
// than /api/network: per spec, during Planning the player must
// reconstruct the network mentally rather than see it directly.
app.get('/api/segments', isLoggedIn, async (req, res) => {
  try { res.json(await getSegments()) } catch { res.status(500).end() }
})

// ============================================================
// GAME ROUTES
// ============================================================

/**
 * GET /api/game/start
 * Picks a random (start, destination) pair, but only accepts it if the
 * shortest path between them is at least 3 segments — exactly what the
 * spec requires ("minimum distance of at least 3 segments"). Since there's
 * no direct SQL way to ask "give me 2 stations at least N hops apart",
 * I instead pick random pairs and check their BFS distance, retrying up
 * to 200 times. With 16 stations this converges almost instantly in
 * practice (most random pairs already satisfy the distance requirement).
 */
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
    // Extremely unlikely with this network size, but handled anyway.
    res.status(500).json({ error: 'Could not find valid pair.' })
  } catch { res.status(500).end() }
})

/**
 * POST /api/game/submit
 * Body: { startId, destinationId, route: number[] }
 *
 * This is the heart of the Execution phase. Steps:
 *  1. Validate the request shape (basic input validation, per spec
 *     "Essential data validation in Express and React").
 *  2. Validate the route itself with isRouteValid() — if invalid,
 *     the player loses everything and the response says so.
 *  3. If valid, walk the route segment by segment, picking a random
 *     event for each one and accumulating the coin total.
 *  4. Save the result either way (saveGame is called on both branches)
 *     so the ranking page reflects every attempt, not just successes.
 */
app.post('/api/game/submit', isLoggedIn, async (req, res) => {
  const { startId, destinationId, route } = req.body

  // Basic shape validation — the client should never send anything
  // malformed, but we never trust the client.
  if (!startId || !destinationId || !Array.isArray(route)) {
    return res.status(400).json({ error: 'Invalid body.' })
  }

  try {
    const adj         = await getAdjacency()
    const interchanges = await getInterchangeStations()
    const allEvents    = await getAllEvents()
    const badEvents     = await getBadEvents()

    const valid = isRouteValid(route, startId, destinationId, adj, interchanges)

    if (!valid) {
      // Per spec: an invalid/incomplete route skips Execution entirely
      // and the player loses their starting 20 coins -> score 0.
      await saveGame(req.user.id, startId, destinationId, 0)
      return res.json({ valid: false, score: 0, steps: [] })
    }

    const STARTING_COINS = 20
    let coins = STARTING_COINS
    const steps = []

    for (let i = 0; i < route.length - 1; i++) {
      const fromName = await getStationName(route[i])
      const toName   = await getStationName(route[i + 1])

      // Custom rule I added beyond the base spec: from the 5th segment
      // onward (index i >= 4, i.e. after 4 completed stops), there's a
      // 70% chance the event is drawn from the "bad events only" pool
      // instead of the full pool. This makes longer routes meaningfully
      // riskier without making them impossible to win.
      const event = (i >= 4 && badEvents.length > 0 && Math.random() < 0.7)
        ? badEvents[Math.floor(Math.random() * badEvents.length)]
        : allEvents[Math.floor(Math.random() * allEvents.length)]

      coins += event.effect

      steps.push({
        from: fromName,
        to: toName,
        event: { description: event.description, effect: event.effect },
        coinsAfter: coins,
      })
    }

    // Per spec: a negative total is stored and shown as 0, never negative.
    const finalScore = Math.max(0, coins)
    await saveGame(req.user.id, startId, destinationId, finalScore)

    return res.json({ valid: true, score: finalScore, steps })

  } catch (err) {
    console.error(err)
    res.status(500).end()
  }
})

// GET /api/ranking — best score per user, descending.
app.get('/api/ranking', isLoggedIn, async (req, res) => {
  try { res.json(await getRanking()) } catch { res.status(500).end() }
})

// ============================================================
// GAME-LOGIC HELPERS
// These two functions are pure logic (no I/O), which is why they live
// here instead of dao.js — dao.js is reserved for database access only.
// ============================================================

/**
 * Breadth-First Search shortest path length, counted in SEGMENTS
 * (edges), not stations (nodes). E.g. A-B-C-D is distance 3, even
 * though it touches 4 stations — this matches the spec's own example
 * ("Centrale -> Porta Velaria -> Crocevia -> Piazza... counts as
 * 3 segments, involving 4 stops").
 *
 * BFS (rather than DFS) guarantees we find the SHORTEST path first,
 * which is exactly what "minimum distance" means in the spec.
 */
function bfsDistance(adj, startId, endId) {
  if (startId === endId) return 0

  const visited = new Set([startId])
  const queue = [{ id: startId, dist: 0 }]

  while (queue.length > 0) {
    const { id, dist } = queue.shift()
    for (const { neighbor } of (adj[id] || [])) {
      if (neighbor === endId) return dist + 1
      if (!visited.has(neighbor)) {
        visited.add(neighbor)
        queue.push({ id: neighbor, dist: dist + 1 })
      }
    }
  }
  return Infinity // no path exists (shouldn't happen on a connected network)
}

/**
 * Validates a submitted route against every rule in the final spec:
 *
 *  1. Must start at the assigned start station and end at the
 *     assigned destination.
 *  2. Stations CAN repeat (per the final spec clarification), but the
 *     same SEGMENT (pair of adjacent stations) cannot be used twice —
 *     in either direction. I track this with a normalized "min-max"
 *     key so A-B and B-A count as the same segment.
 *  3. Every consecutive pair in the route must be an actual segment
 *     in the network (adj lookup) — no "teleporting" between
 *     unconnected stations.
 *  4. The player can only switch from one line to another at a
 *     station that is a genuine interchange (appears on both lines).
 *     I track "currentLine" as I walk the route: as long as the next
 *     segment is on the SAME line, no check is needed; the moment it
 *     isn't, the station I'm leaving FROM must be an interchange.
 */
function isRouteValid(route, startId, destinationId, adj, interchanges) {
  if (!route || route.length < 2) return false
  if (route[0] !== startId || route[route.length - 1] !== destinationId) return false

  const usedSegments = new Set()
  let currentLine = null

  for (let i = 0; i < route.length - 1; i++) {
    const from = route[i]
    const to   = route[i + 1]

    // Normalize the segment so direction doesn't matter when checking
    // for repeats: Math.min/max always puts the smaller id first.
    const segKey = [Math.min(from, to), Math.max(from, to)].join('-')
    if (usedSegments.has(segKey)) return false
    usedSegments.add(segKey)

    // Which line(s) actually connect "from" directly to "to"?
    // (A pair of interchange stations could be connected by more than
    // one line — adj stores every line that has that exact segment.)
    const linesWithSegment = (adj[from] || [])
      .filter(e => e.neighbor === to)
      .map(e => e.lineId)

    if (linesWithSegment.length === 0) return false // not a real segment at all

    if (currentLine === null) {
      // First segment of the journey — just pick whichever line it's on.
      currentLine = linesWithSegment[0]
    } else if (!linesWithSegment.includes(currentLine)) {
      // We're changing lines. Only legal if "from" is an interchange.
      if (!interchanges.has(from)) return false
      currentLine = linesWithSegment[0]
    }
    // else: staying on currentLine, nothing more to check for this step.
  }

  return true
}

// --- START SERVER ---
app.listen(port, () => {
  console.log(`API server started at http://localhost:${port}`)
})
