# Baseline — hoop game frontend

A responsive basketball scoreboard built with vanilla JavaScript, Vite, and a persistent SQLite database. Requires Node.js 22.13 or newer.

## Run

```sh
npm install
npm run dev
```

Production build: `npm run build`. Serve the build and database API with `npm run preview`. Both dev and preview automatically create `data/hoops.sqlite`. Override its location with `DATABASE_PATH=/absolute/path/hoops.sqlite npm run dev` (or `npm run preview`). Keep that file on persistent storage and back it up. Run API and persistence checks with `npm test`.

## Included

- Name entry and four mode selections.
- 30- and 60-second countdowns, automatic completion, and final scores.
- Two-player games: 30 seconds each, explicit handoff, both scores, winner or tie.
- Free practice: no countdown, manual completion, separate session history.
- Spacebar and Add basket button simulate scoring. Repeated keydown events do not add extra baskets.
- Separate shared leaderboards for timed and two-player games. Practice history is newest first.
- Reset discards the active run without saving it. End game saves a result; in two-player mode, End turn advances the handoff or finishes the match.
- Timers use a monotonic deadline so inactive tabs do not slow the countdown.

## Teammate handoff

### ESP32 / sensor connection

`src/scoring.js` is the hardware input boundary. Import and call `receiveSensorMessage(message)` with each decoded message. A trimmed `SCORE` emits `hoop:score`; the frontend accepts it only during an active turn. Transport, pairing, serial framing, reconnects, and sensor debounce are intentionally left for hardware integration. The connection badge currently identifies simulation mode.

```js
import { receiveSensorMessage } from './src/scoring.js';
receiveSensorMessage('SCORE');
```

### Backend / shared leaderboard

Completed results are stored in SQLite on the server. `games` stores a unique result ID, mode, completion date (epoch milliseconds), and elapsed seconds. `scores` stores each game's player names and scores, with player order preserved for versus games. For two-player games, `games.outcome` stores `player1`, `player2`, or `tie`, calculated by the server from both scores. Other modes have a null outcome. `GET /api/games` includes this field, and the leaderboard uses it to display the winner. Player positions distinguish opponents even when names match. The schema is initialized automatically in `server/database.js`; existing two-player results are backfilled on server startup.

- `GET /api/games` returns only competitive sessions (`short`, `long`, and `versus`). Free practice never enters this feed.
- `GET /api/leaderboard?mode=short` returns ranked results for `short`, `long`, or `versus`. Each result includes `rank`, ranking `score`, names, both player scores where applicable, outcome, date, and elapsed seconds. Scores sort highest first; equal scores use earliest completion, then game ID. Versus matches rank by the higher player score. Missing, unknown, or practice modes return `400`; an empty board returns `[]`.
- `GET /api/practice` returns only free-practice sessions, newest first, with no competitive ranking.
- `POST /api/games` validates and saves a session of any mode atomically. Reusing an ID is safe for retries.

Example POST body:

```json
{"id":"unique-game-id","mode":"versus","names":["Ada","Sam"],"scores":[12,14],"date":1791432000000,"elapsed":30}
```

Modes are `short`, `long`, `versus`, and `practice`. Names must be 1–24 characters; scores, dates, and elapsed seconds must be nonnegative integers. Single-player modes use the first name and score. Versus requires two players.

Existing `baseline-history` browser results are imported automatically. New results are also queued there until the database confirms saving; the UI reports connection failures and retries every 15 seconds and when connectivity returns. Reset still discards the active game. Leaderboards refresh every 15 seconds.

The API has no authentication and accepts simulated client scores. Use it on a trusted network; public competitive deployment requires authentication and trusted scoring. `npm run preview` is a convenient local server; hosted deployment needs a Node process, persistent database storage, and appropriate production serving infrastructure.

Timed boards rank by score descending; two-player matches rank by the highest score in the match. Ties use earliest completion first. The leaderboard API applies these same ranking rules.

### UI

`src/main.js` contains the frontend state, rendering, and game interactions. `src/style.css` contains responsive styles. ESP32 firmware, hardware transport, authentication, and cloud deployment are not included. Fonts load from Google Fonts with system fallbacks.
