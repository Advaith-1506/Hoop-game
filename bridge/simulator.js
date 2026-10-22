import readline from 'node:readline';
import { pathToFileURL } from 'node:url';
import { createScoreParser } from './protocol.js';
import { createScoreServer } from './server.js';

/** The simulator exercises the same line parser and WebSocket server as USB input. */
export function createSimulator(bridge, log = console.log) {
  let connected = true;
  let parse;
  function resetParser() {
    parse = createScoreParser(() => {
      bridge.score();
      log('Sent one basket.');
    });
  }
  resetParser();
  bridge.setConnected(true);
  return line => {
    switch (line.trim().toLowerCase()) {
      case 'connect':
        connected = true;
        resetParser();
        bridge.setConnected(true);
        log('Simulated Arduino connected.');
        break;
      case 'disconnect':
        connected = false;
        resetParser();
        bridge.setConnected(false);
        log('Simulated Arduino disconnected.');
        break;
      case 'help':
        log('SCORE = one basket | disconnect | connect | quit. Other lines test ignored serial noise.');
        break;
      default:
        if (!connected) log('Ignored: simulated Arduino is disconnected.');
        else parse(line + '\n');
    }
  };
}

async function main() {
  const port = Number(process.env.BRIDGE_PORT || 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('BRIDGE_PORT must be between 1 and 65535.');
  }
  const bridge = createScoreServer({ port, simulated: true });
  await bridge.listen();
  console.log(`SIMULATOR ONLY — no USB hardware. Listening at ws://127.0.0.1:${port}`);
  const input = readline.createInterface({ input: process.stdin, output: process.stdout });
  const handle = createSimulator(bridge);
  let stopping = false;
  async function stop() {
    if (stopping) return;
    stopping = true;
    input.close();
    await bridge.close();
  }
  input.on('line', line => {
    if (line.trim().toLowerCase() === 'quit') void stop();
    else handle(line);
  });
  input.on('close', stop);
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  console.log('Type SCORE then Enter for a basket. Type help for commands.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(`Simulator failed: ${error.message}`);
    process.exitCode = 1;
  });
}
