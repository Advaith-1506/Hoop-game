# Baseline — hoop game

A responsive basketball scoreboard built with vanilla JavaScript and Vite, with a local Node.js bridge for Arduino USB scoring. Results currently save in browser storage; a shared leaderboard backend remains separate teammate work.

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

`src/main.js` contains the frontend state, rendering, and game interactions. `src/style.css` contains responsive styles. The local hardware bridge lives in `bridge/`; `src/bridge-client.js` handles the website connection, and `src/scoring.js` routes baskets to the game. No shared database backend, Arduino firmware, authentication, or cloud deployment is included. Fonts load from Google Fonts with system fallbacks.
