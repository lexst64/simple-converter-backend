import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db.js';
import authRouter from '@/routes/auth.routes.js';
import { buildTestApp } from '@/test/app.js';

const { verifyIdToken } = vi.hoisted(() => ({ verifyIdToken: vi.fn() }));

vi.mock('google-auth-library', () => ({
  OAuth2Client: class {
    verifyIdToken = verifyIdToken;
  },
}));

vi.mock('@/db.js', () => ({ db: { collection: vi.fn() } }));

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const JWT_SECRET = process.env.JWT_SECRET!;

const app = buildTestApp('/auth', authRouter, null);

const googlePayload = {
  sub: 'google-123',
  email: 'user@example.com',
  name: 'Test User',
  picture: 'https://example.com/avatar.png',
};

describe('POST /auth/google', () => {
  let users: { findOne: ReturnType<typeof vi.fn>; insertOne: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    users = { findOne: vi.fn().mockResolvedValue(null), insertOne: vi.fn() };
    vi.mocked(db.collection).mockReturnValue(users as never);
  });

  // Regression: the ID token audience must always be checked against our own client id.
  it('verifies the ID token with audience set to the configured GOOGLE_CLIENT_ID', async () => {
    verifyIdToken.mockResolvedValue({ getPayload: () => googlePayload });

    const res = await request(app).post('/auth/google').send({ token: 'google-id-token' });

    expect(res.status).toBe(200);
    expect(verifyIdToken).toHaveBeenCalledOnce();
    expect(verifyIdToken).toHaveBeenCalledWith({
      idToken: 'google-id-token',
      audience: GOOGLE_CLIENT_ID,
    });
  });

  it('creates a new user and returns an app JWT', async () => {
    verifyIdToken.mockResolvedValue({ getPayload: () => googlePayload });

    const res = await request(app).post('/auth/google').send({ token: 'google-id-token' });

    expect(res.status).toBe(200);
    expect(users.findOne).toHaveBeenCalledWith({ _id: 'google-123' });
    expect(users.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'google-123', email: 'user@example.com' }),
    );
    expect(res.body.user).toEqual({
      name: 'Test User',
      email: 'user@example.com',
      picture: 'https://example.com/avatar.png',
    });

    const decoded = jwt.verify(res.body.token, JWT_SECRET) as Record<string, unknown>;
    expect(decoded).toMatchObject({ googleId: 'google-123', email: 'user@example.com' });
  });

  it('does not re-insert an existing user', async () => {
    verifyIdToken.mockResolvedValue({ getPayload: () => googlePayload });
    users.findOne.mockResolvedValue({
      _id: 'google-123',
      email: 'user@example.com',
      name: 'Stored Name',
      picture: 'https://example.com/stored.png',
      createdAt: new Date(),
    });

    const res = await request(app).post('/auth/google').send({ token: 'google-id-token' });

    expect(res.status).toBe(200);
    expect(users.insertOne).not.toHaveBeenCalled();
    expect(res.body.user.name).toBe('Stored Name');
  });

  it('responds 400 when no token is provided', async () => {
    const res = await request(app).post('/auth/google').send({});

    expect(res.status).toBe(400);
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it('responds 401 when Google rejects the token', async () => {
    verifyIdToken.mockRejectedValue(
      new Error('Wrong recipient, payload audience != requiredAudience'),
    );

    const res = await request(app).post('/auth/google').send({ token: 'bad-token' });

    expect(res.status).toBe(401);
    expect(res.body.token).toBeUndefined();
  });

  it('responds 401 when the ticket payload is invalid', async () => {
    verifyIdToken.mockResolvedValue({ getPayload: () => ({ sub: 'google-123' }) });

    const res = await request(app).post('/auth/google').send({ token: 'google-id-token' });

    expect(res.status).toBe(401);
    expect(users.insertOne).not.toHaveBeenCalled();
  });
});
