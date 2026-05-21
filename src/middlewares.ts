import { NextFunction, Request, Response } from 'express';
import { UserPayload } from './types';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '.';

declare global {
  namespace Express {
    interface Request {
      loggedInUser: UserPayload;
    }
  }
}

export const authMiddleware = (exceptFor?: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (exceptFor && exceptFor.includes(req.originalUrl)) {
      next();
      return;
    }

    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decodedPayload = jwt.verify(token, JWT_SECRET);
        if (typeof decodedPayload === 'string') {
          throw new Error('Incorrect JWT payload');
        }
        req.loggedInUser = {
          email: decodedPayload.email,
          googleId: decodedPayload.googleId,
          name: decodedPayload.name,
        };
      } catch (error: any) {
        return res.status(401).json({ message: 'Incorret authentication token' });
      }
    } else {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    next();
  };
};
