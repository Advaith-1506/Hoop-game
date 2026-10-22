import test from 'node:test';
import assert from 'node:assert/strict';
import { connectBridge } from '../src/bridge-client.js';

function setup(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const sockets = [], scores = [], statuses = [];
  class Socket {
    constructor(url) { this.url = url; sockets.push(this); }
    close() { this.onclose?.(); }
    message(data) { this.onmessage?.({ data }); }
  }
  const stop = connectBridge({ url: 'ws://127.0.0.1:8787', WebSocketClass: Socket,
    onScore: () => scores.push(1), onStatus: status => statuses.push(status) });
  t.after(stop);
  return { sockets, scores, statuses, stop };
}

test('only accepts valid baskets after Arduino connected status', t => {
  const { sockets, scores, statuses } = setup(t);
  const socket = sockets[0];
  socket.message('{"type":"score","value":1}');
  socket.message('bad JSON');
  socket.message('null');
  socket.message('{"type":"status","connected":true}');
  socket.message('{"type":"score","value":2}');
  socket.message('{"type":"score","value":1}');
  socket.message('{"type":"score","value":1}');
  socket.message('{"type":"status","connected":false}');
  socket.message('{"type":"score","value":1}');
  assert.equal(scores.length, 2);
  assert.deepEqual(statuses, ['connecting', 'connected', 'waiting']);
});

test('reconnects without trusting old status or replaying points', t => {
  const { sockets, scores, statuses } = setup(t);
  sockets[0].message('{"type":"status","connected":true}');
  sockets[0].close();
  assert.equal(statuses.at(-1), 'offline');
  t.mock.timers.tick(2000);
  assert.equal(sockets.length, 2);
  sockets[0].message('{"type":"score","value":1}');
  sockets[1].message('{"type":"score","value":1}');
  assert.equal(scores.length, 0);
  sockets[1].message('{"type":"status","connected":true}');
  sockets[1].message('{"type":"score","value":1}');
  assert.equal(scores.length, 1);
});

test('cleanup cancels pending reconnection', t => {
  const { sockets, stop } = setup(t);
  sockets[0].close();
  stop();
  t.mock.timers.tick(20000);
  assert.equal(sockets.length, 1);
});

test('missing bridge handshake triggers reconnection', t => {
  const { sockets } = setup(t);
  t.mock.timers.tick(5000);
  t.mock.timers.tick(2000);
  assert.equal(sockets.length, 2);
});

test('simulator status cannot be mistaken for real hardware', t => {
  const { sockets, statuses } = setup(t);
  sockets[0].message('{"type":"status","connected":true,"simulated":true}');
  assert.equal(statuses.at(-1), 'simulated');
  sockets[0].message('{"type":"status","connected":false,"simulated":true}');
  assert.equal(statuses.at(-1), 'simulated-offline');
});
