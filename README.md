# Baseline — hoop game

A responsive basketball scoreboard built with vanilla JavaScript and Vite, with a local Node.js bridge for Arduino USB scoring. Results now persist in a server-side SQLite database. Requires Node.js 22.13 or newer.

## Run

```sh
npm install
npm run dev
```

Production build: `npm run build`. Serve the build and database API locally with `npm run preview`. Both dev and preview create `data/hoops.sqlite`; use persistent storage and back up that file. Override its path with `DATABASE_PATH`. Run all tests with `npm test`. Static Netlify hosting alone does not run this database API.

## Included

- Name entry and four mode selections.
- 30- and 60-second countdowns, automatic completion, and final scores.
- Two-player games: 30 seconds each, explicit handoff, both scores, winner or tie.
- Free practice: no countdown, manual completion, separate session history.
- Spacebar and Add basket button simulate scoring. Repeated keydown events do not add extra baskets.
- Separate database-backed leaderboards for timed and two-player games. Practice history is newest first.
- Reset discards the active run without saving it. End game saves a result; in two-player mode, End turn advances the handoff or finishes the match.
- Timers use a monotonic deadline so inactive tabs do not slow the countdown.

## Teammate handoff

### Arduino / sensor connection

See [the Arduino setup and protocol guide](bridge/README.md) for Windows and macOS commands, firmware requirements, simulator testing, and troubleshooting. Use the `arduino-serial-bridge` branch until integration is reviewed and merged.

- Real hardware: `npm run bridge:ports`, then start `npm run bridge` with `SERIAL_PORT` configured.
- No hardware: `npm run bridge:simulate`, then type `SCORE` and Enter to send a basket.
- In another terminal, run `npm run dev` and open its localhost URL on the same laptop.
- The frontend automatically connects to the bridge. Valid baskets only count during an active game.
- Stop the simulator before starting the real bridge; both use port 8787.

The Arduino must emit one standalone `SCORE` line per basket at 9600 baud by default. EE firmware owns beam ordering and duplicate detection. The website bridge does not interpret `SCORE! Total: 1` as a basket.

[Physical test checklist](bridge/TESTING.md): use this with EE before merging into main. Automated checks pass, but they do not establish that physical sensors or USB hardware work.

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

`src/main.js` contains the frontend state, rendering, and game interactions. `src/style.css` contains responsive styles. The local hardware bridge lives in `bridge/`; `src/bridge-client.js` handles the website connection, and `src/scoring.js` routes baskets to the game. Arduino firmware, authentication, and production cloud deployment are not included. Fonts load from Google Fonts with system fallbacks.
