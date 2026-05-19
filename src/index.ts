import express, { Response } from 'express';
import dotenv from 'dotenv';
import { OAuth2Client } from 'google-auth-library';
import morgan from 'morgan';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import { authMiddleware } from './middlewares';
import { FRONTEND_URL, JWT_SECRET, PORT } from './consts';

dotenv.config();

const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(morgan('dev'));
app.use(cors({ origin: FRONTEND_URL || true, credentials: true }));
app.use(authMiddleware);

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

function notImplemented(res: Response) {
  return res.status(501).json({ message: 'Not implemented' });
}

app.post('/api/auth/google', async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ message: 'Token is required' });
  }

  try {
    // 1. Verify the ID token with Google's servers
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    // 2. Extract user profile information from payload
    const payload = ticket.getPayload();

    if (!payload) {
      return res.status(400).json({ message: 'Token is broken' });
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

    // 4. Generate your own JWT or session for your application
    const appToken = jwt.sign(
      { googleId: user.googleId, name: user.name, email: user.email, picture: user.picture },
      JWT_SECRET,
      { expiresIn: '1d' },
    );

    // 5. Respond back to the frontend with your custom session token and user info
    return res.status(200).json({
      message: 'Login successful',
      token: appToken,
      user: { name: user.name, email: user.email, picture: user.picture },
    });
  } catch (error) {
    console.error('Google auth verification failed:', error);
    return res.status(401).json({ message: 'Invalid Google token' });
  }
});

app.get('/api/me', async (req, res) => {
  if (!req.isLoggedIn) {
    res.status(401);
    return;
  }

  res.json({
    googleId: req.loggedInUser?.googleId,
    email: req.loggedInUser?.email,
    name: req.loggedInUser?.name,
  });
});

app.post('/api/file-uploads/request', async (req, res) => {
  if (!req.isLoggedIn) {
    res.status(401);
    return;
  }

  return notImplemented(res);
});

app.post('/api/file-uploads/:fileUploadId', async (req, res) => {
  if (!req.isLoggedIn) {
    res.status(401);
    return;
  }

  return notImplemented(res);
});

app.post('/api/file-uploads/:fileUploadId/convert', async (req, res) => {
  if (!req.isLoggedIn) {
    res.status(401);
    return;
  }

  return notImplemented(res);
});

app.get('/api/conversions/:conversionId', async (req, res) => {
  if (!req.isLoggedIn) {
    res.status(401);
    return;
  }

  return notImplemented(res);
});

app.get('/api/conversions/:conversionId/events', async (req, res) => {
  if (!req.isLoggedIn) {
    res.status(401);
    return;
  }

  return notImplemented(res);
});

app.get('/api/conversions/:conversionId/file', async (req, res) => {
  if (!req.isLoggedIn) {
    res.status(401);
    return;
  }

  return notImplemented(res);
});

app.post('/api/preparations', async (req, res) => {
  if (!req.isLoggedIn) {
    res.status(401);
    return;
  }

  return notImplemented(res);
});

app.get('/api/preparations/:preparationId', async (req, res) => {
  if (!req.isLoggedIn) {
    res.status(401);
    return;
  }

  return notImplemented(res);
});

app.get('/api/preparations/:preparationId/file', async (req, res) => {
  if (!req.isLoggedIn) {
    res.status(401);
    return;
  }

  return notImplemented(res);
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
