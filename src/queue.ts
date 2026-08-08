import { Queue } from 'bullmq';
import { Cluster, type RedisOptions } from 'ioredis';
import { REDIS_URL, REDIS_CLUSTER_ENABLED } from '@/config.js';

const connectionUrl = new URL(REDIS_URL);
const isTls = connectionUrl.protocol === 'rediss:';
const isLocalhost =
  connectionUrl.hostname === 'localhost' ||
  connectionUrl.hostname === '127.0.0.1' ||
  connectionUrl.hostname === '0.0.0.0';

// Force standalone mode for local development to prevent cluster slot query failures on single-node Redis
const useCluster = REDIS_CLUSTER_ENABLED && !isLocalhost;

const redisOptions: RedisOptions = {
  // Use 127.0.0.1 for localhost to avoid IPv6 (::1) ECONNREFUSED issues in Node 17+
  host: isLocalhost ? '127.0.0.1' : connectionUrl.hostname,
  port: Number(connectionUrl.port) || 6379,
  username: connectionUrl.username || undefined,
  password: connectionUrl.password || undefined,
  maxRetriesPerRequest: null, // required by BullMQ for blocking commands
  ...(isTls ? { tls: { servername: connectionUrl.hostname } } : {}),
};

export const redisConnection = useCluster
  ? new Cluster([{ host: connectionUrl.hostname, port: Number(connectionUrl.port) || 6379 }], {
      dnsLookup: (address, callback) => callback(null, address),
      enableReadyCheck: false,
      clusterRetryStrategy: (times) => Math.min(times * 100, 3000),
      redisOptions: {
        username: connectionUrl.username || undefined,
        password: connectionUrl.password || undefined,
        maxRetriesPerRequest: null,
        ...(isTls ? { tls: {} } : {}),
      },
    })
  : redisOptions;

export const conversionQueue = new Queue('conversions', {
  connection: redisConnection,
  prefix: '{conversions}', // see CROSSSLOT issue
});
