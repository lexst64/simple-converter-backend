import { NODE_ENV } from '@/index.js';
import pino from 'pino';
import fs from 'fs';
import path from 'path';

export const createLogger = () => {
  const logFilePath = path.resolve(process.cwd(), 'logs', 'app.log');

  if (NODE_ENV !== 'dev') {
    fs.mkdirSync(path.dirname(logFilePath), { recursive: true });
  }

  const logger =
    NODE_ENV === 'dev'
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
      : pino(
          {
            level: 'info',
            base: undefined,
            timestamp: pino.stdTimeFunctions.isoTime,
          },
          pino.destination({ dest: logFilePath, sync: false }),
        );

  return logger;
};
