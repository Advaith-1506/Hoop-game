export function api(database) {
  return async (req, res, next) => {
    const path = req.url.split('?')[0];
    if (!['/api/games', '/api/practice', '/api/leaderboard'].includes(path)) return next();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (path === '/api/leaderboard') {
        if (req.method !== 'GET') {
          res.setHeader('Allow', 'GET'); res.statusCode = 405;
          return res.end(JSON.stringify({error:'Method not allowed.'}));
        }
        const mode = new URL(req.url, 'http://localhost').searchParams.get('mode');
        return res.end(JSON.stringify(database.leaderboard(mode)));
      }
      if (req.method === 'GET') return res.end(JSON.stringify(database.list(path === '/api/practice' ? 'practice' : 'competitive')));
      if (req.method !== 'POST' || path === '/api/practice') { res.setHeader('Allow', path === '/api/practice' ? 'GET' : 'GET, POST'); res.statusCode = 405; return res.end(JSON.stringify({error:'Method not allowed.'})); }
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (Buffer.byteLength(body) > 16384) throw Object.assign(new Error('Result too large.'), {status:413});
      }
      let value;
      try { value = JSON.parse(body); } catch { throw Object.assign(new Error('Invalid JSON.'), {status:400}); }
      database.save(value);
      res.statusCode = 201;
      res.end(JSON.stringify({id:value.id}));
    } catch (error) {
      res.statusCode = error.status || 500;
      if (!error.status) console.error(error);
      res.end(JSON.stringify({error:error.status ? error.message : 'Unable to store game result.'}));
    }
  };
}
