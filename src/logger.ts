import { NODE_ENV } from '@/config.js';
import pino from 'pino';
import fs from 'fs';
import path from 'path';

const logFilePath = path.resolve(process.cwd(), 'logs', 'app.log');

const isDev = NODE_ENV === 'dev' || NODE_ENV === 'development';

if (!isDev) {
  fs.mkdirSync(path.dirname(logFilePath), { recursive: true });
}

export const logger = isDev
  ? pino({
      level: 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          singleLine: true,
        },
      },
    })
  : pino({
      level: 'info',
      base: undefined,
      timestamp: pino.stdTimeFunctions.isoTime,
    });
