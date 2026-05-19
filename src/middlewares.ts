import { NextFunction, Request, Response } from 'express';
import { UserPayload } from './types';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from './consts';

declare global {
  namespace Express {
    interface Request {
      isLoggedIn?: boolean;
      loggedInUser?: UserPayload;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  req.isLoggedIn = false;
  req.loggedInUser = undefined;

  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decodedPayload = jwt.verify(token, JWT_SECRET);
      if (typeof decodedPayload === 'string') {
        throw new Error('Incorrect payload');
      }
      req.isLoggedIn = true;
      req.loggedInUser = {
        email: decodedPayload.email,
        googleId: decodedPayload.googleId,
        name: decodedPayload.name,
      };
    } catch (error: any) {
      // Token present but invalid — isLoggedIn stays false
      console.log('Token verification failed:', error.message);
    }
  }

  next();
}
