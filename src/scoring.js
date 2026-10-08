/** Hardware integration boundary. Call receiveSensorMessage with a decoded ESP32 message. */
export function receiveSensorMessage(message) {
  if (typeof message === 'string' && message.trim() === 'SCORE') {
    window.dispatchEvent(new CustomEvent('hoop:score'));
  }
}
