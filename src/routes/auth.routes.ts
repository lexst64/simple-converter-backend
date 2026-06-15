import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { db } from '@/db.js';
import { JWT_SECRET } from '@/config.js';
import { logger } from '@/logger.js';
import { AppError } from '@/errors.js';
import { User } from '@/types.js';
import z from 'zod';

const router = Router();
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const TicketPayloadSchema = z.object({
  sub: z.string(),
  email: z.email(),
  name: z.string(),
  picture: z.url().optional(),
});

router.post('/google', async (req, res) => {
  const { token } = req.body || {};

  if (!token) {
    throw new AppError(400, 'Token is required');
  }

  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    if (!payload) {
      throw new AppError(400, 'Token is broken');
    }
    const validation = TicketPayloadSchema.safeParse(payload);
    if (!validation.success) {
      throw new AppError(400, 'Invalid ticket payload');
    }
    const { sub: googleId, email, name, picture } = validation.data;

    const users = db.collection<User>('users');
    let user = await users.findOne({ _id: googleId });

    if (!user) {
      const newUser: User = {
        _id: googleId,
        email,
        name,
        picture: picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}`,
        createdAt: new Date(),
      };
      await users.insertOne(newUser);
      user = newUser;
    }

    if (!user) {
      throw new AppError(500, 'Failed to create or find user');
    }

    const appToken = jwt.sign(
      { googleId: googleId, name: user.name, email: user.email, picture: user.picture },
      JWT_SECRET,
      {
        expiresIn: '1d',
      },
    );

    return res.status(200).json({
      message: 'Login successful',
      token: appToken,
      user: { name: user.name, email: user.email, picture: user.picture },
    });
  } catch (error) {
    logger.warn({ error }, 'Google token verification failed');
    throw new AppError(401, 'Invalid Google token');
  }
});

router.get('/me', async (req, res) => {
  res.json({
    googleId: req.loggedInUser?.googleId,
    email: req.loggedInUser?.email,
    name: req.loggedInUser?.name,
    picture: req.loggedInUser?.picture,
  });
});

export default router;
