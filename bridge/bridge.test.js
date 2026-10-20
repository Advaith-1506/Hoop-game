import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createScoreParser } from './protocol.js';
import { createScoreServer } from './server.js';

test('handles fragmented lines, CRLF, noise, and consecutive baskets', () => {
  let count = 0;
  const parse = createScoreParser(() => count++);
  parse('SC'); parse('ORE\r'); parse('\nSCORE\nDEBUG\n SCORE \n');
  parse('SCORE_EXTRA\nscore\n');
  assert.equal(count, 3);
  parse('SCORE');
  assert.equal(count, 3, 'unterminated messages must wait');
  parse('\n');
  assert.equal(count, 4);
});

test('drops oversized noise and recovers on the next line', () => {
  let count = 0;
  const parse = createScoreParser(() => count++);
  parse('x'.repeat(10000) + 'SCORE\nSCORE\n');
  assert.equal(count, 1);
});

test('sends connection state and forwards only parsed scores to clients', async t => {
  const bridge = createScoreServer({ port: 0 });
  const address = await bridge.listen();
  t.after(() => bridge.close());
  const socket = new WebSocket(`ws://127.0.0.1:${address.port}`);
  const initial = await once(socket, 'message');
  assert.deepEqual(JSON.parse(initial[0]), { type: 'status', connected: false });
  let received = once(socket, 'message');
  bridge.setConnected(true);
  assert.deepEqual(JSON.parse((await received)[0]), { type: 'status', connected: true });
  received = once(socket, 'message');
  const parse = createScoreParser(() => bridge.score());
  parse('debug\nSC'); parse('ORE\r\n');
  assert.deepEqual(JSON.parse((await received)[0]), { type: 'score', value: 1 });
  received = once(socket, 'message');
  bridge.setConnected(false);
  assert.equal(JSON.parse((await received)[0]).connected, false);
});

test('rejects unrelated website origins', async t => {
  const bridge = createScoreServer({ port: 0 });
  const address = await bridge.listen();
  t.after(() => bridge.close());
  const socket = new WebSocket(`ws://127.0.0.1:${address.port}`, { origin: 'https://unrelated.example' });
  const [error] = await once(socket, 'error');
  assert.match(error.message, /401/);
});
