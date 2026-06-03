import { Db, MongoClient, ServerApiVersion } from 'mongodb';
import { logger, MONGODB_URI, NODE_ENV } from '.';

export async function connectToDatabase(): Promise<Db> {
  const client = new MongoClient(MONGODB_URI, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  });
  await client.connect();
  const db = client.db(NODE_ENV === 'prod' ? 'main' : 'dev');
  logger.info(`Successfully connected to "${db.databaseName}"`);
  return db;
}
