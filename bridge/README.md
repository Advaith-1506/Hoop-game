# Arduino serial bridge — step 1

Requires Node.js 20.19+ (or 22.12+). This process runs on the computer attached to the Arduino by USB. It does not run on Netlify.

## Run

1. Run `npm install` in the repository root.
2. Connect the Arduino, then run `npm run bridge:ports` to list available ports.
3. Close Arduino Serial Monitor so the bridge can open the port.
4. Start the bridge, replacing the example port with your actual port:

macOS / Linux:

```sh
SERIAL_PORT=/dev/cu.usbmodem1101 SERIAL_BAUD=9600 npm run bridge
```

Windows PowerShell:

```powershell
$env:SERIAL_PORT="COM3"
$env:SERIAL_BAUD="9600"
npm run bridge
```

The baud rate must match the Arduino sketch. The default is 9600. `BRIDGE_PORT` optionally overrides the WebSocket port (default 8787).

## Arduino message contract

Send one newline-terminated `SCORE` for each detected basket, for example `Serial.println("SCORE");`. CRLF is supported. Debug lines are ignored. Broken-up serial chunks and several messages in one chunk are supported. Lines longer than 128 characters are discarded.

Every valid line becomes one point event. The bridge does not suppress consecutive SCORE lines: EE firmware owns the one-point-per-object logic. Separate legitimate baskets must remain countable.

## Website-facing protocol

Connect to `ws://127.0.0.1:8787`. Messages are JSON:

```json
{"type":"status","connected":true}
```

```json
{"type":"score","value":1}
```

New clients immediately receive the current serial connection status. Serial-open failures and disconnects trigger retries every two seconds. No scores are stored or replayed; the frontend will decide whether a game is active. Client messages cannot generate scores.

The bridge listens only on loopback and accepts browser connections from localhost/loopback origins. Hosted Netlify integration is not included in this step; browser security and explicit origin configuration must be addressed before using a hosted frontend with local hardware.

## Verification

`npm run test:bridge` tests fragmented serial input, consecutive baskets, noisy lines, actual WebSocket forwarding, connection statuses, and rejection of unrelated browser origins. `npm run build` checks that the existing frontend still builds.

Physical Arduino/IR testing remains pending. Frontend wiring and the standalone simulator are subsequent approved-plan steps.

## Step 2: frontend connection

Run `npm run dev` in a second terminal and open the localhost URL on the same computer as the bridge. The page automatically connects to `ws://127.0.0.1:8787` and retries every two seconds. The header distinguishes bridge offline, bridge ready but Arduino offline, and Arduino connected. Spacebar and Add basket remain available in every connection state.

Start a game before breaking the beam: hardware points only count during an active turn, and are ignored before starting, between turns, after a reset, or after time expires. The Arduino must send `SCORE` on its own line. Messages such as `SCORE! Total: 1` are ignored.

`VITE_BRIDGE_URL` can override the connection address for a local build. Hosted pages default to simulation mode: direct Netlify-to-local-Arduino access remains outside this step and requires addressing origin and browser security requirements. Do not expose the USB bridge publicly.

`npm run test:bridge` now also verifies the frontend connection protocol, rejection of malformed events, disconnect status, automatic retry, and cleanup. Full physical beam-to-browser testing remains pending until the Arduino is available.

## Step 3: test without an Arduino

Do not run the real USB bridge and simulator at the same time: both use port 8787 by default.

1. In one terminal, run `npm run bridge:simulate`.
2. In another terminal, run `npm run dev` and open its localhost URL.
3. The header must say **Simulator connected · No hardware**.
4. Enter a name and start a game. In the simulator terminal, type `SCORE` and press Enter. The website should add exactly one point per line.
5. Type `disconnect`: the header should report a simulated disconnect. `SCORE` should no longer add points. Type `connect`, then `SCORE`, to resume.
6. Type a debug line such as `SCORE! Total: 3`. It should not add a point.
7. Reset or finish a game, then send `SCORE`. The score should stay unchanged until a new game starts.
8. Type `quit` (or press Ctrl+C) to stop the simulator. The website should report an offline bridge. Restart the simulator and confirm the website reconnects automatically without replaying baskets.

Repeat scoring with 30-second, 60-second, two-player, and practice modes. For timed games, confirm points stop at expiry; for two-player mode, confirm each basket goes to the current player and none count on the handoff screen. Spacebar and Add basket should still work.

The simulator sends typed input through the same serial line parser and WebSocket server as the real bridge. It does not emulate USB drivers, serial baud rate, sensor wiring, or EE firmware timing. The physical Arduino/IR acceptance test is still required before merging into main. Confirm the firmware emits one standalone SCORE line per basket at the configured baud rate, then repeat the checks above using the beam instead of terminal input.
