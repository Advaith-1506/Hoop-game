import { StringDecoder } from 'node:string_decoder';

// Serial chunks may split a line or contain several lines. Ignore long/noisy lines.
export function createScoreParser(onScore, maxLength = 128) {
  const decoder = new StringDecoder('utf8');
  let line = '';
  let overflow = false;
  return chunk => {
    for (const char of decoder.write(Buffer.from(chunk))) {
      if (char === '\n') {
        if (!overflow && line.trim() === 'SCORE') onScore();
        line = '';
        overflow = false;
      } else if (!overflow) {
        if (line.length >= maxLength) {
          line = '';
          overflow = true;
        } else line += char;
      }
    }
  };
}
