/**
 * Opus Experience Studio — prototype backend.
 *
 * Four services behind one Express process: Catalog, Definition store, Generation seam, Data
 * Gateway. A modular monolith is the architecture's own recommendation for this stage
 * (backend-architecture.md §2.1) — module boundaries are hard, deployment is one unit, and
 * extraction later is a deployment change rather than a redesign.
 *
 * Run: `npm run api` (or `npm run dev` for API + app together).
 */

import express from 'express';

import { PORT, AI_PROVIDER } from './config';
import { api } from './routes';
import { seedMissing } from './store/experience-store';
import { catalogVersion } from './services/catalog';
import { servedEntities } from './services/gateway';

const app = express();

app.use(express.json({ limit: '4mb' }));

// The dev server proxies /api, so this is for direct calls (curl, tests, a second origin).
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type,x-persona');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  next();
});
app.options('/{*splat}', (_req, res) => res.sendStatus(204));

app.use('/api', api);

app.use((_req, res) => {
  res.status(404).json({ status: 404, category: 'semantic', code: 'notFound', detail: 'No such endpoint' });
});

// Wrapped rather than top-level `await`: the workspace is a CommonJS package (Angular's own
// tooling expects that), so tsx transpiles these files to CJS and top-level await has no meaning
// there. Declaring `"type": "module"` to get it would change module resolution for every Angular
// build in the repo — a large blast radius for a two-line convenience.
async function main(): Promise<void> {
  const { seeded } = seedMissing();
  const entities = await servedEntities();

  app.listen(PORT, () => {
    console.log(`\n  Opus Experience Studio API   http://localhost:${PORT}/api/health`);
    console.log(`  catalog v${catalogVersion()} · ${entities.length} entities · AI provider: ${AI_PROVIDER}`);
    if (seeded.length) console.log(`  seeded experiences: ${seeded.join(', ')}`);
    console.log('');
  });
}

void main();
