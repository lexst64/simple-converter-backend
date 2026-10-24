import { Writable } from 'node:stream';
import express, { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import pino from 'pino';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '@/errors.js';
import { logger } from '@/logger.js';
import { errorHandler, httpLogger, jwtAuth, pagination } from '@/middlewares.js';

const JWT_SECRET = process.env.JWT_SECRET!;

const validPayload = {
  googleId: 'google-123',
  email: 'user@example.com',
  name: 'Test User',
  picture: 'https://example.com/avatar.png',
};

function buildAuthApp(exceptFor?: string[]) {
  const app = express();
  app.use(jwtAuth(exceptFor));
  app.get('/public', (req, res) => {
    res.json({ public: true, user: req.user ?? null });
  });
  app.get('/private', (req, res) => {
    res.json({ user: req.user ?? null });
  });
  app.use(errorHandler());
  return app;
}

describe('jwtAuth', () => {
  it('sets req.user from a valid Bearer token', async () => {
    const token = jwt.sign(validPayload, JWT_SECRET, { expiresIn: '1h' });

    const res = await request(buildAuthApp())
      .get('/private')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toEqual(validPayload);
  });

  it('strips unknown claims from the payload', async () => {
    const token = jwt.sign({ ...validPayload, admin: true }, JWT_SECRET);

    const res = await request(buildAuthApp())
      .get('/private')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toEqual(validPayload);
  });

  it('responds 401 when no token is provided', async () => {
    const res = await request(buildAuthApp()).get('/private');

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ status: 'error', code: 401, message: 'Not authenticated' });
  });

  it('responds 401 when the Authorization header is not a Bearer token', async () => {
    const token = jwt.sign(validPayload, JWT_SECRET);

    const res = await request(buildAuthApp()).get('/private').set('Authorization', token);

    expect(res.status).toBe(401);
  });

  it('responds 401 for a token signed with a different secret', async () => {
    const token = jwt.sign(validPayload, 'some-other-secret');

    const res = await request(buildAuthApp())
      .get('/private')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
  });

  it('responds 401 for a malformed token', async () => {
    const res = await request(buildAuthApp())
      .get('/private')
      .set('Authorization', 'Bearer not.a.jwt');

    expect(res.status).toBe(401);
  });

  it('responds 401 for an expired token', async () => {
    const token = jwt.sign(
      { ...validPayload, exp: Math.floor(Date.now() / 1000) - 60 },
      JWT_SECRET,
    );

    const res = await request(buildAuthApp())
      .get('/private')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
  });

  it('responds 401 when the payload fails schema validation', async () => {
    const token = jwt.sign({ googleId: 'google-123', email: 'not-an-email' }, JWT_SECRET);

    const res = await request(buildAuthApp())
      .get('/private')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
  });

  // Regression: tokens used to be accepted from the query string, which leaks them into logs.
  it('rejects a token passed only via the ?token= query parameter', async () => {
    const token = jwt.sign(validPayload, JWT_SECRET);

    const res = await request(buildAuthApp()).get(`/private?token=${encodeURIComponent(token)}`);

    expect(res.status).toBe(401);
    expect(res.body.user).toBeUndefined();
  });

  it('lets exceptFor paths bypass authentication', async () => {
    const res = await request(buildAuthApp(['/public'])).get('/public');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ public: true, user: null });
  });

  it('matches exceptFor paths ignoring the query string', async () => {
    const res = await request(buildAuthApp(['/public'])).get('/public?foo=bar');

    expect(res.status).toBe(200);
  });

  it('still requires auth for paths not in exceptFor', async () => {
    const res = await request(buildAuthApp(['/public'])).get('/private');

    expect(res.status).toBe(401);
  });
});

describe('pagination', () => {
  function run(query: Record<string, unknown>, defaultLimit = 20, maxLimit = 50) {
    const req = { query } as unknown as Request;
    const res = { locals: {} } as Response;
    const next = vi.fn();

    pagination(defaultLimit, maxLimit)(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    return res.locals.pagination;
  }

  it('uses defaults when no params are given', () => {
    expect(run({})).toEqual({ limit: 20, offset: 0 });
  });

  it('passes through valid values', () => {
    expect(run({ limit: '10', offset: '30' })).toEqual({ limit: 10, offset: 30 });
  });

  it('clamps limit to maxLimit', () => {
    expect(run({ limit: '1000' })).toEqual({ limit: 50, offset: 0 });
  });

  it('falls back to the default limit for zero or negative limits', () => {
    expect(run({ limit: '0' })).toEqual({ limit: 20, offset: 0 });
    expect(run({ limit: '-5' })).toEqual({ limit: 20, offset: 0 });
  });

  it('clamps negative offsets to 0', () => {
    expect(run({ offset: '-10' })).toEqual({ limit: 20, offset: 0 });
  });

  it('falls back to defaults for NaN inputs', () => {
    expect(run({ limit: 'abc', offset: 'xyz' })).toEqual({ limit: 20, offset: 0 });
  });

  it('floors float inputs', () => {
    expect(run({ limit: '7.9', offset: '3.2' })).toEqual({ limit: 7, offset: 3 });
  });

  it('falls back to the default limit when a float floors to 0', () => {
    expect(run({ limit: '0.5' })).toEqual({ limit: 20, offset: 0 });
  });

  it('falls back to defaults for array-valued (repeated) params', () => {
    expect(run({ limit: ['10', '20'], offset: ['1', '2'] })).toEqual({ limit: 20, offset: 0 });
  });
});

describe('errorHandler', () => {
  function run(err: Error) {
    const req = { method: 'GET', originalUrl: '/some/path' } as Request;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as Response;

    errorHandler()(err, req, res, vi.fn() as NextFunction);
    return res;
  }

  it('passes AppError status and message through for 4xx', () => {
    const res = run(new AppError(404, 'Thing not found'));

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      status: 'error',
      message: 'Thing not found',
      code: 404,
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('hides the message of 5xx AppErrors and logs them', () => {
    const res = run(new AppError(503, 'database password is hunter2'));

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      status: 'error',
      message: 'Something went wrong',
      code: 503,
    });
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'database password is hunter2', status: 503 }),
    );
  });

  it('treats errors without a status as 500 and hides the message', () => {
    const res = run(new Error('internal details'));

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      status: 'error',
      message: 'Something went wrong',
      code: 500,
    });
  });
});

describe('httpLogger', () => {
  // Regression: the full request URL, including query strings that may carry secrets, was logged.
  it('strips the query string from the logged request url', async () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk, _encoding, callback) {
        lines.push(chunk.toString());
        callback();
      },
    });
    const testLogger = pino({ level: 'info' }, sink);

    const app = express();
    app.use(httpLogger(testLogger));
    app.get('/files/abc', (req, res) => {
      res.json({ ok: true });
    });

    const res = await request(app).get('/files/abc?token=super-secret&x=1');
    expect(res.status).toBe(200);

    await vi.waitFor(() => expect(lines.length).toBeGreaterThan(0));

    const entry = JSON.parse(lines[0]!);
    expect(entry.req).toEqual({ method: 'GET', url: '/files/abc' });
    expect(entry.res).toEqual({ statusCode: 200 });
    expect(lines.join('\n')).not.toContain('super-secret');
  });
});
