import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createApplication } from './app.js';
const port = Number(process.env.PORT ?? 3000);
const database = process.env.DATABASE_PATH ?? 'data/marksync.sqlite';
mkdirSync(dirname(database), { recursive: true });
const application = createApplication(
  database,
  process.env.APP_ORIGIN ?? `http://localhost:${port}`,
);
application.server.listen(port, process.env.HOST ?? '127.0.0.1', () =>
  console.log(`MarkSync ready at http://localhost:${port}`),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    void application.close();
  });
