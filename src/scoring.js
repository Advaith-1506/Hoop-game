/** Hardware integration boundary. Call receiveSensorMessage with a decoded Arduino message. */
export function receiveSensorMessage(message) {
  if (typeof message === 'string' && message.trim() === 'SCORE') {
    window.dispatchEvent(new CustomEvent('hoop:score'));
  }
}
