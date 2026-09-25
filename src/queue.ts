import { Queue } from 'bullmq';
import { type RedisOptions } from 'ioredis';
import { REDIS_URL } from '@/config.js';

const connectionUrl = new URL(REDIS_URL);
const isTls = connectionUrl.protocol === 'rediss:';
const isLocalhost =
  connectionUrl.hostname === 'localhost' ||
  connectionUrl.hostname === '127.0.0.1' ||
  connectionUrl.hostname === '0.0.0.0';

const redisOptions: RedisOptions = {
  // Use 127.0.0.1 for localhost to avoid IPv6 (::1) ECONNREFUSED issues in Node 17+
  host: isLocalhost ? '127.0.0.1' : connectionUrl.hostname,
  port: Number(connectionUrl.port) || 6379,
  username: connectionUrl.username || undefined,
  password: connectionUrl.password || undefined,
  ...(isTls ? { tls: { servername: connectionUrl.hostname } } : {}),
};

export const redisConnection = redisOptions;

export const conversionQueue = new Queue('conversions', {
  connection: redisOptions,
});
