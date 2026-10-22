import { defineConfig } from 'vite';
import { openDatabase } from './server/database.js';
import { api } from './server/api.js';

export default defineConfig({
  plugins: [{
    name: 'game-database',
    configureServer: attach,
    configurePreviewServer: attach,
  }],
});

function attach(server) {
  const database = openDatabase(process.env.DATABASE_PATH || 'data/hoops.sqlite');
  server.middlewares.use(api(database));
  server.httpServer?.once('close', () => database.close());
}
