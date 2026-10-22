import http from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';

export function createScoreServer({ port = 8787, simulated = false } = {}) {
  // Bind to loopback: the bridge is for the computer physically attached to USB.
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ service: 'baseline-arduino-bridge', ...status }));
  });
  const wss = new WebSocketServer({
    server,
    maxPayload: 1024,
    verifyClient: ({ origin }) => {
      if (!origin) return true; // Allow local command-line clients.
      try {
        const url = new URL(origin);
        return ['http:', 'https:'].includes(url.protocol) &&
          ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      } catch { return false; }
    },
  });
  const makeStatus = connected => ({ type: 'status', connected, ...(simulated ? { simulated: true } : {}) });
  let status = makeStatus(false);
  const broadcast = message => {
    const data = JSON.stringify(message);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        if (client.bufferedAmount > 65536) client.terminate();
        else client.send(data);
      }
    }
  };
  wss.on('connection', client => {
    client.on('error', () => {});
    client.send(JSON.stringify(status));
  });
  return {
    server,
    listen: () => new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => {
        server.off('error', reject);
        resolve(server.address());
      });
    }),
    setConnected(connected) {
      status = makeStatus(connected);
      broadcast(status);
    },
    score() { broadcast({ type: 'score', value: 1 }); },
    close: () => new Promise(resolve => {
      for (const client of wss.clients) client.terminate();
      wss.close(() => server.close(resolve));
    }),
  };
}
