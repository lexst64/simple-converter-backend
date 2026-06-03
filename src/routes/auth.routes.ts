import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { db, JWT_SECRET, logger } from '@/index.js';
import { AppError } from '@/errors.js';
import { User } from '@/types.js';
import z from 'zod';

const router = Router();
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const TicketPayloadSchema = z.object({
  sub: z.string(),
  email: z.email(),
  name: z.string(),
  picture: z.string(),
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
      throw new AppError(400, 'Incorrect ticken payload');
    }
    const { sub: googleId, email, name, picture } = validation.data;

    const users = db.collection<User>('users');
    let user = await users.findOne({ _id: googleId });

    if (!user) {
      const result = await users.insertOne({
        _id: googleId,
        email,
        name,
        picture,
        createdAt: new Date(),
      });
      user = await users.findOne({ _id: result.insertedId });
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
    logger.info(error);
    throw new AppError(401, 'Invalid Google token');
  }
});

router.get('/me', async (req, res) => {
  res.json({
    googleId: req.loggedInUser?.googleId,
    email: req.loggedInUser?.email,
    name: req.loggedInUser?.name,
  });
});

export default router;
