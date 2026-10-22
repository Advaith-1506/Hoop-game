import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createScoreServer } from './server.js';
import { createSimulator } from './simulator.js';

test('simulated serial input reaches a real WebSocket through the shared parser', async t => {
  const bridge = createScoreServer({ port: 0, simulated: true });
  const address = await bridge.listen();
  t.after(() => bridge.close());
  const handle = createSimulator(bridge, () => {});
  const socket = new WebSocket(`ws://127.0.0.1:${address.port}`);
  const messages = [];
  socket.on('message', data => messages.push(JSON.parse(data)));
  await once(socket, 'message');
  assert.deepEqual(messages[0], { type: 'status', connected: true, simulated: true });
  let received = once(socket, 'message');
  handle('SCORE');
  await received;
  assert.deepEqual(messages.at(-1), { type: 'score', value: 1 });
  received = once(socket, 'message');
  handle('disconnect');
  await received;
  assert.equal(messages.at(-1).connected, false);
  handle('SCORE');
  received = once(socket, 'message');
  handle('connect');
  await received;
  received = once(socket, 'message');
  handle('SCORE! Total: 2'); // Debug line must not score.
  handle('SCORE');
  await received;
  assert.equal(messages.filter(m => m.type === 'score').length, 2);
});
