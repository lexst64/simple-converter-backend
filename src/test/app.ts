import express, { Router } from 'express';
import { errorHandler } from '@/middlewares.js';
import { UserPayload } from '@/types.js';

export const testUser: UserPayload = {
  googleId: 'user-1',
  email: 'user@example.com',
  name: 'Test User',
};

/**
 * Builds a minimal express app around a single router, injecting `req.user`
 * (instead of going through jwtAuth) and the real error handler.
 */
export function buildTestApp(
  mountPath: string,
  router: Router,
  user: UserPayload | null = testUser,
) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (user) req.user = user;
    next();
  });
  app.use(mountPath, router);
  app.use(errorHandler());
  return app;
}
