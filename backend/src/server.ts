import { createApp } from './app';
import { config } from './config';
import { openDb } from './db';

const db = openDb(config.databasePath);
createApp(db).listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}/api (db: ${config.databasePath})`);
});
