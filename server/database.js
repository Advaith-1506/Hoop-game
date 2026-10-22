import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDatabase(path) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      mode TEXT NOT NULL CHECK (mode IN ('short','long','versus','practice')),
      date INTEGER NOT NULL CHECK (date >= 0),
      elapsed INTEGER NOT NULL CHECK (elapsed >= 0)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS scores (
      game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      player INTEGER NOT NULL CHECK (player IN (0,1)),
      name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 24),
      score INTEGER NOT NULL CHECK (score >= 0),
      PRIMARY KEY (game_id, player)
    ) STRICT;
    CREATE INDEX IF NOT EXISTS games_mode_date ON games(mode, date);`);
  // Upgrade databases created before match outcomes were stored.
  if (!db.prepare('PRAGMA table_info(games)').all().some(column => column.name === 'outcome')) {
    db.exec(`BEGIN;
      ALTER TABLE games ADD COLUMN outcome TEXT
        CHECK (outcome IN ('player1', 'player2', 'tie'));
      UPDATE games SET outcome = (
        SELECT CASE WHEN first.score = second.score THEN 'tie'
          WHEN first.score > second.score THEN 'player1' ELSE 'player2' END
        FROM scores AS first JOIN scores AS second ON first.game_id = second.game_id
        WHERE first.game_id = games.id AND first.player = 0 AND second.player = 1
      ) WHERE mode = 'versus';
      COMMIT;`);
  }
  return {
    save(value) {
      const count = value?.mode === 'versus' ? 2 : 1;
      if (!value || typeof value.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value.id)
        || !['short','long','versus','practice'].includes(value.mode)
        || !Array.isArray(value.names) || !Array.isArray(value.scores)
        || value.names.length < count || value.names.length > 2 || value.scores.length < count || value.scores.length > 2
        || !value.names.slice(0,count).every(n => typeof n === 'string' && n.trim().length > 0 && n.trim().length <= 24)
        || !value.scores.slice(0,count).every(n => Number.isSafeInteger(n) && n >= 0)
        || !Number.isSafeInteger(value.date) || value.date < 0 || value.date > 8640000000000000
        || !Number.isSafeInteger(value.elapsed) || value.elapsed < 0) {
        throw Object.assign(new Error('Invalid game result.'), { status: 400 });
      }
      db.exec('BEGIN');
      try {
        // Derive the outcome from validated scores rather than trusting the client.
        const outcome = value.mode !== 'versus' ? null : value.scores[0] === value.scores[1]
          ? 'tie' : value.scores[0] > value.scores[1] ? 'player1' : 'player2';
        const inserted = db.prepare('INSERT OR IGNORE INTO games (id, mode, date, elapsed, outcome) VALUES (?, ?, ?, ?, ?)')
          .run(value.id, value.mode, value.date, value.elapsed, outcome);
        if (inserted.changes) {
          const insert = db.prepare('INSERT INTO scores VALUES (?, ?, ?, ?)');
          for (let i = 0; i < count; i++) insert.run(value.id, i, value.names[i].trim(), value.scores[i]);
        }
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    list(category = 'all') {
      const queries = {
        all: 'SELECT * FROM games ORDER BY date, id',
        competitive: "SELECT * FROM games WHERE mode != 'practice' ORDER BY date, id",
        practice: "SELECT * FROM games WHERE mode = 'practice' ORDER BY date DESC, id",
      };
      if (!Object.hasOwn(queries, category)) throw new Error('Unknown history category.');
      return db.prepare(queries[category]).all().map(game => {
        const players = db.prepare('SELECT name, score FROM scores WHERE game_id = ? ORDER BY player').all(game.id);
        return { ...game, names: players.map(p => p.name), scores: players.map(p => p.score) };
      });
    },
    leaderboard(mode) {
      if (!['short', 'long', 'versus'].includes(mode)) {
        throw Object.assign(new Error('Mode must be short, long, or versus. Practice has a separate history feed.'), {status:400});
      }
      return db.prepare(`SELECT games.*, MAX(scores.score) AS score
        FROM games JOIN scores ON scores.game_id = games.id
        WHERE games.mode = ? GROUP BY games.id
        ORDER BY score DESC, games.date ASC, games.id ASC`).all(mode).map((game, index) => {
        const players = db.prepare('SELECT name, score FROM scores WHERE game_id = ? ORDER BY player').all(game.id);
        return {...game, rank:index + 1, names:players.map(p => p.name), scores:players.map(p => p.score)};
      });
    },
    close() { db.close(); },
  };
}
