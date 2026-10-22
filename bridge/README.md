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
