import { SerialPort } from 'serialport';
import { createScoreParser } from './protocol.js';
import { createScoreServer } from './server.js';

if (process.argv.includes('--list')) {
  const ports = await SerialPort.list();
  console.table(ports.map(({ path, manufacturer }) => ({ path, manufacturer })));
  if (!ports.length) console.log('No serial ports found. Connect the Arduino by USB.');
} else {
  const path = process.env.SERIAL_PORT;
  const baudRate = Number(process.env.SERIAL_BAUD || 9600);
  const port = Number(process.env.BRIDGE_PORT || 8787);
  if (!path) throw new Error('Set SERIAL_PORT. Run npm run bridge:ports to find your Arduino.');
  if (!Number.isInteger(baudRate) || baudRate <= 0) throw new Error('SERIAL_BAUD must be a positive integer.');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('BRIDGE_PORT must be between 1 and 65535.');

  const bridge = createScoreServer({ port });
  await bridge.listen();
  console.log(`Scoring bridge listening at ws://127.0.0.1:${port}`);
  let serial;
  let retry;
  let stopping = false;
  const reconnect = () => {
    if (stopping || retry) return;
    bridge.setConnected(false);
    retry = setTimeout(() => { retry = undefined; connect(); }, 2000);
  };
  function connect() {
    if (stopping) return;
    console.log(`Opening ${path} at ${baudRate} baud…`);
    serial = new SerialPort({ path, baudRate, autoOpen: false });
    // A new parser per connection discards any partial line from a disconnect.
    serial.on('data', createScoreParser(() => {
      bridge.score();
      console.log('SCORE');
    }));
    serial.on('open', () => {
      bridge.setConnected(true);
      console.log('Arduino connected. Waiting for SCORE lines.');
    });
    serial.on('error', error => {
      console.error(`Serial error: ${error.message}`);
      if (!serial.isOpen) reconnect();
    });
    serial.on('close', () => {
      console.log('Arduino disconnected. Retrying in 2 seconds…');
      reconnect();
    });
    serial.open(error => {
      if (error) { console.error(error.message); reconnect(); }
    });
  }
  async function shutdown() {
    if (stopping) return;
    stopping = true;
    clearTimeout(retry);
    if (serial?.isOpen) serial.close();
    await bridge.close();
  }
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  connect();
}
