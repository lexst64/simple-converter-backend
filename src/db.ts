import { Db, MongoClient, ServerApiVersion } from 'mongodb';
import { MONGODB_URI, NODE_ENV } from '@/config.js';
import { logger } from '@/logger.js';

let client: MongoClient | null = null;
export let db: Db;

export async function connectToDatabase(): Promise<Db> {
  if (client) return db;

  client = new MongoClient(MONGODB_URI, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  });

  await client.connect();
  db = client.db(['prod', 'production'].includes(NODE_ENV) ? 'main' : 'dev');
  logger.info(`Successfully connected to "${db.databaseName}"`);

  // idempotent; supports paginated listing of a user's jobs
  await db.collection('jobs').createIndex({ userId: 1, createdAt: -1 });

  return db;
}

export async function closeDatabaseConnection(): Promise<void> {
  if (client) {
    await client.close();
    logger.info('Database connection closed gracefully.');
    client = null;
  }
}
