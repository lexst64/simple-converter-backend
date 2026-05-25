import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '..';
import { AppError } from '../errors';

const router = Router();
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

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

    const { sub: googleId, email, name, picture } = payload;

    /* 
        let user = await db.findUserByEmail(email);
        
        if (!user) {
            user = await db.createUser({ googleId, email, name, picture });
        }
        */

    // Dummy user object for this example
    const user = { googleId, email, name, picture };

    const appToken = jwt.sign(
      { googleId: user.googleId, name: user.name, email: user.email, picture: user.picture },
      JWT_SECRET,
      { expiresIn: '1d' },
    );

    return res.status(200).json({
      message: 'Login successful',
      token: appToken,
      user: { name: user.name, email: user.email, picture: user.picture },
    });
  } catch (error) {
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
