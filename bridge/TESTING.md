# Arduino-to-website acceptance test

Status: **physical testing pending**. These are instructions, not recorded passes.

Tester: __________  Date: __________  OS/browser: __________
Board: __________  Firmware revision: __________  Git commit: __________
Serial port: __________  Baud rate: __________

## Prepare

- [ ] Pull the latest `arduino-serial-bridge` branch and run `npm install`.
- [ ] EE confirms the firmware emits exactly one standalone `SCORE` line per basket.
- [ ] Firmware baud rate matches the bridge (9600 by default).
- [ ] Upload the firmware; close Serial Monitor and stop the simulator.
- [ ] Start the real bridge with the correct port, then start Vite in a second terminal.
- [ ] Open the localhost page on that laptop. Header says **Arduino connected**, not Simulator.

## Check physical counting

- [ ] Before starting a game, break the beams. The website score stays at zero.
- [ ] Start free practice. Pass one object top-to-bottom: terminal shows one SCORE and the website adds one point.
- [ ] Repeat with 10 distinct valid passes: terminal events and website increase both equal 10.
- [ ] Hold a beam broken: no repeated points from the same object.
- [ ] Test a bottom-first pass and a top-only timeout: no basket should be reported by EE firmware.
- [ ] Test consecutive valid passes and confirm each distinct basket is counted once.
- [ ] Press Space and Add basket during practice: each adds one test point.

## Check game boundaries

- [ ] 30-second mode ends automatically at 00:00; beam breaks afterward add nothing.
- [ ] 60-second mode ends automatically at 00:00; beam breaks afterward add nothing.
- [ ] Two-player mode gives each player 30 seconds. Points go to the current player only.
- [ ] Handoff screen ignores baskets until Player 2 starts their turn.
- [ ] Verify a player win and a tie show the correct result.
- [ ] Free practice has no countdown and continues until manually ended.
- [ ] End game saves the result to the selected mode; practice saves separately.
- [ ] Reset discards the current run, returns to ready, and ignores baskets until restarted.

## Check recovery

- [ ] During practice, unplug Arduino USB. Header reports Arduino offline or bridge offline.
- [ ] Reconnect to the same configured port. Scoring resumes without restarting the website (allow for board startup and bridge retry).
- [ ] If the OS assigns a new port, stop the bridge, list ports again, update SERIAL_PORT, and restart.
- [ ] Stop the bridge, then restart it. The website reconnects and does not replay old baskets.
- [ ] A basket scored while disconnected is not added later: there is intentionally no replay buffer.

## Record outcome

Observed valid passes: ______  Terminal SCORE count: ______  Website point increase: ______

Failures / reproduction steps: ___________________________________________

Decision: [ ] Ready for review/merge  [ ] Needs fixes

Keep test sessions recognizable (e.g. player name `Hardware test`) because completed games save in that browser’s history. Do not delete someone else’s existing results during testing.
