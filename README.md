# Baseline — hoop game frontend

A responsive, frontend-only basketball scoreboard. Built with vanilla JavaScript and Vite so teammates can work on hardware and persistence independently.

## Run

```sh
npm install
npm run dev
```

Production build: `npm run build`. Preview it with `npm run preview`.

## Included

- Name entry and four mode selections.
- 30- and 60-second countdowns, automatic completion, and final scores.
- Two-player games: 30 seconds each, explicit handoff, both scores, winner or tie.
- Free practice: no countdown, manual completion, separate session history.
- Spacebar and Add basket button simulate scoring. Repeated keydown events do not add extra baskets.
- Separate local leaderboards for timed and two-player games. Practice history is newest first.
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

Results currently live in localStorage under `baseline-history`, on this browser only. Replace the history read/write in `src/main.js` with your persistence API. Each completed session has this shape:

```js
{
  mode: 'short', // short | long | versus | practice
  names: ['Player one', 'Player two'],
  scores: [12, 0],
  date: 1791432000000, // epoch milliseconds
  elapsed: 30 // seconds; practice session duration or final turn duration
}
```

Timed boards rank by score descending; two-player matches rank by the highest score in the match. Ties use earliest completion first. Agree on a match ranking rule before implementing a shared competitive board.

### UI

`src/main.js` contains the frontend state, rendering, and game interactions. `src/style.css` contains responsive styles. No backend, ESP32 firmware, hardware transport, authentication, or cloud deployment is included. Fonts load from Google Fonts with system fallbacks.
