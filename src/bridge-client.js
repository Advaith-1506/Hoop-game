/** One connection per page. Reconnection never replays old baskets. */
export function connectBridge({
  url,
  onScore,
  onStatus,
  WebSocketClass = globalThis.WebSocket,
  retryMs = 2000,
}) {
  let socket;
  let retry;
  let stopped = false;
  let connected = false;
  let handshake;

  function open() {
    if (stopped) return;
    connected = false;
    onStatus('connecting');
    try {
      socket = new WebSocketClass(url);
    } catch {
      onStatus('offline');
      retry = setTimeout(open, retryMs);
      return;
    }
    const current = socket;
    // Require the bridge's initial status, not just a successful TCP connection.
    handshake = setTimeout(() => current.close(), 5000);
    current.onmessage = event => {
      if (stopped || current !== socket) return;
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (!message || typeof message !== 'object') return;
      if (message.type === 'status' && typeof message.connected === 'boolean') {
        clearTimeout(handshake);
        connected = message.connected;
        onStatus(message.simulated === true
          ? (connected ? 'simulated' : 'simulated-offline')
          : (connected ? 'connected' : 'waiting'));
      } else if (message.type === 'score' && message.value === 1 && connected) {
        onScore();
      }
    };
    current.onerror = () => {
      connected = false;
      onStatus('offline');
      current.close();
    };
    current.onclose = () => {
      clearTimeout(handshake);
      if (stopped || current !== socket) return;
      connected = false;
      onStatus('offline');
      retry = setTimeout(open, retryMs);
    };
  }
  open();
  return () => {
    stopped = true;
    connected = false;
    clearTimeout(retry);
    clearTimeout(handshake);
    if (socket) {
      socket.onmessage = socket.onerror = socket.onclose = null;
      socket.close();
    }
  };
}
