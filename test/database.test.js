import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { openDatabase } from '../server/database.js';
import { api } from '../server/api.js';

test('API persists all modes, both players, and handles invalid data and retries', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hoops-'));
  const path = join(dir, 'test.sqlite');
  let db = openDatabase(path);
  const server = createServer(api(db));
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}/api/games`;
    const post = value => fetch(url, {method:'POST', body:JSON.stringify(value)});
    for (const mode of ['short','long','versus','practice']) {
      const value = {id:mode, mode, names: mode === 'versus' ? ['Ada', "O’Neil"] : ['Ada'], scores:mode === 'versus' ? [12,14] : [12], date:1791432000000, elapsed:30};
      assert.equal((await post(value)).status, 201);
      assert.equal((await post(value)).status, 201);
    }
    const games = await (await fetch(url)).json();
    assert.equal(games.length, 3);
    assert.ok(games.every(game => game.mode !== 'practice'));
    const practice = await (await fetch(url.replace('/games', '/practice'))).json();
    assert.deepEqual(practice.map(game => game.mode), ['practice']);
    assert.equal((await fetch(url.replace('/games', '/practice'), {method:'POST', body:'{}'})).status, 405);
    assert.deepEqual(games.find(g => g.mode === 'versus').scores, [12,14]);
    assert.equal(games.find(g => g.mode === 'versus').outcome, 'player2');
    for (const override of [{mode:'unknown'}, {scores:[-1]}, {names:['']}, {date:1.5}, {elapsed:-1}, {names:["a' OR 1=1 --"],scores:['12']}]) {
      assert.equal((await post({id:'bad',mode:'short',names:['Ada'],scores:[12],date:123,elapsed:30,...override})).status, 400);
    }
    assert.equal((await fetch(url, {method:'POST',body:'{'})).status, 400);
    assert.equal((await fetch(url, {method:'DELETE'})).status, 405);
    const leaderboardUrl = url.replace('/games', '/leaderboard');
    assert.deepEqual((await (await fetch(`${leaderboardUrl}?mode=short`)).json()).map(g => [g.id,g.rank,g.score]), [['short',1,12]]);
    for (const query of ['', '?mode=practice', '?mode=invalid']) {
      assert.equal((await fetch(leaderboardUrl + query)).status, 400);
    }
    const notAllowed = await fetch(`${leaderboardUrl}?mode=short`, {method:'POST', body:'{}'});
    assert.equal(notAllowed.status, 405);
    assert.equal(notAllowed.headers.get('allow'), 'GET');
    await new Promise(resolve => server.close(resolve));
    db.close();
    db = openDatabase(path);
    assert.deepEqual(db.list('competitive'), games);
    assert.deepEqual(db.list('practice'), practice);
  } finally {
    server.close(); db.close(); rmSync(dir, {recursive:true, force:true});
  }
});

test('stores wins and ties, ignores client outcome, and preserves results on retry', () => {
  const db = openDatabase(':memory:');
  try {
    for (const [id, scores, outcome] of [
      ['first', [9, 2], 'player1'], ['second', [0, 3], 'player2'],
      ['tie', [4, 4], 'tie'], ['zero', [0, 0], 'tie'],
    ]) {
      const game = {id, mode:'versus', names:['Sam','Sam'], scores, date:123, elapsed:30, outcome:'incorrect'};
      db.save(game);
      db.save({...game, scores:[99, 0]});
      const saved = db.list().find(g => g.id === id);
      assert.deepEqual(saved.names, ['Sam','Sam']);
      assert.deepEqual(saved.scores, scores);
      assert.equal(saved.outcome, outcome);
    }
    assert.throws(() => db.save({id:'incomplete', mode:'versus', names:['Ada'], scores:[2], date:123, elapsed:30}));
    db.save({id:'solo', mode:'short', names:['Ada'], scores:[2], date:123, elapsed:30});
    assert.equal(db.list().find(g => g.id === 'solo').outcome, null);
  } finally { db.close(); }
});

test('migrates existing two-player scores and keeps outcomes after reopening', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hoops-migration-'));
  const path = join(dir, 'legacy.sqlite');
  const legacy = new DatabaseSync(path);
  legacy.exec(`CREATE TABLE games (id TEXT PRIMARY KEY, mode TEXT, date INTEGER, elapsed INTEGER);
    CREATE TABLE scores (game_id TEXT, player INTEGER, name TEXT, score INTEGER);
    INSERT INTO games VALUES ('win','versus',123,30), ('tie','versus',124,30), ('solo','short',125,30);
    INSERT INTO scores VALUES ('win',0,'Ada',5), ('win',1,'Sam',2),
      ('tie',0,'Ada',0), ('tie',1,'Sam',0), ('solo',0,'Ada',3);`);
  legacy.close();
  try {
    for (let i = 0; i < 2; i++) {
      const db = openDatabase(path);
      try {
        assert.deepEqual(db.list().map(g => g.outcome), ['player1','tie',null]);
        assert.deepEqual(db.list()[0].scores, [5,2]);
      } finally { db.close(); }
    }
  } finally { rmSync(dir, {recursive:true, force:true}); }
});

test('practice scores never enter competitive history and practice stays newest first', () => {
  const db = openDatabase(':memory:');
  try {
    for (const [id, mode, score, date] of [
      ['older', 'practice', 10000, 100], ['short', 'short', 2, 200],
      ['newer', 'practice', 0, 300], ['long', 'long', 4, 400],
      ['versus', 'versus', 6, 500],
    ]) {
      db.save({id, mode, names:['Ada','Sam'], scores:[score,1], date, elapsed:30});
    }
    assert.deepEqual(db.list('competitive').map(g => g.id), ['short','long','versus']);
    assert.deepEqual(db.list('practice').map(g => g.id), ['newer','older']);
    assert.ok(db.list('practice').every(g => g.outcome === null));
    assert.equal(db.list().length, 5);
  } finally { db.close(); }
});

test('leaderboards isolate modes and rank scores, dates, then IDs deterministically', () => {
  const db = openDatabase(':memory:');
  try {
    assert.deepEqual(db.leaderboard('short'), []);
    for (const mode of ['short','long','versus']) {
      for (const [id, scores, date] of [
        ['low',[1,0],1], ['late',[9,2],30], ['b',[9,1],20], ['a',[9,3],20],
        ['high', mode === 'versus' ? [0,10] : [10,0],40],
      ]) db.save({id:mode+id, mode, names:['Ada','Sam'], scores, date, elapsed:30});
      const rows = db.leaderboard(mode);
      assert.deepEqual(rows.map(r => r.id), ['high','a','b','late','low'].map(id => mode+id));
      assert.deepEqual(rows.map(r => r.rank), [1,2,3,4,5]);
      assert.deepEqual(rows.map(r => r.score), [10,9,9,9,1]);
      if (mode === 'versus') {
        assert.deepEqual(rows[0].scores, [0,10]);
        assert.equal(rows[0].outcome, 'player2');
      }
    }
    db.save({id:'practice-high', mode:'practice', names:['Ada'], scores:[99999], date:1, elapsed:1});
    assert.equal(db.leaderboard('short').length, 5);
    assert.throws(() => db.leaderboard('practice'), {status:400});
  } finally { db.close(); }
});
