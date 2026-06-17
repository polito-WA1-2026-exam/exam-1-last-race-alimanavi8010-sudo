# Exam #1: "Last Race"

## React Client Routes

| Route | Description |
|---|---|
| `/` | Home page with instructions. Visible to all. Anonymous users see no map or play button. |
| `/login` | Login form. Redirects to `/` if already logged in. |
| `/setup` | *(protected)* Full Turin metro map with memorization timer (30s). Auto-starts when timer expires. |
| `/planning` | *(protected)* 90s countdown, hidden lines, segment list, route builder. DISCONNECTED warning for invalid moves. |
| `/execution` | *(protected)* Step-by-step journey with random events and coin updates. |
| `/result` | *(protected)* Final score display. Play again or view ranking. |
| `/ranking` | *(protected)* Global leaderboard: best score per user. |

## HTTP APIs

| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/api/sessions` | No | Login. Body: `{username, password}`. Returns `{id, username}`. |
| GET | `/api/sessions/current` | No | Returns current user or 401. |
| DELETE | `/api/sessions/current` | Yes | Logout. |
| GET | `/api/network` | Yes | All lines with ordered stations. Used in Setup. |
| GET | `/api/segments` | Yes | Shuffled adjacent station pairs (no line info). Used in Planning. |
| GET | `/api/game/start` | Yes | Random start + destination (BFS distance ≥ 3). |
| POST | `/api/game/submit` | Yes | Body: `{startId, destinationId, route}`. Validates, applies events, saves score. |
| GET | `/api/ranking` | Yes | Best score per user, descending. |

## Database Tables

| Table | Purpose |
|---|---|
| `users` | id, username, hashed password, salt |
| `lines` | id, name, color |
| `stations` | id, name |
| `line_stations` | line_id, station_id, position — connects stations to lines in order |
| `events` | id, description, effect (−4 to +4) |
| `games` | id, user_id, start/end station, score, timestamp |

## Main React Components

| Component | Purpose |
|---|---|
| `App.jsx` | Router, user state, game state, UserContext.Provider |
| `NavBar.jsx` | Navigation bar, logout |
| `NetworkMap.jsx` | Metro map — full (Setup) or stations-only (Planning) |
| `UserContext.js` | `React.createContext()` — user shared across components |
| `auth.js` | doLogin, doLogout, checkSession |
| `api.js` | getNetwork, getSegments, startGame, submitRoute, getRanking |
| `HomePage.jsx` | Instructions, adapts for guest vs logged-in |
| `LoginPage.jsx` | Login form |
| `SetupPage.jsx` | Full map + memorization timer |
| `PlanningPage.jsx` | 90s timer, segment list, route builder, DISCONNECTED warning |
| `ExecutionPage.jsx` | Animated step-by-step journey |
| `ResultPage.jsx` | Final score |
| `RankingPage.jsx` | Leaderboard |

## Screenshots

*(Add after running the app)*

## User Credentials

| Username | Password | Notes |
|---|---|---|
| alice | alice123 | 2 pre-played games |
| bob | bob123 | 2 pre-played games |
| carol | carol123 | No games yet |

## Use of AI

Claude (Anthropic) was used to scaffold the project structure and generate boilerplate. All code was reviewed and understood by the student. Design decisions including BFS validation, interchange enforcement, event probability weighting, and database schema were verified manually.
