import { NextFunction, Request, Response } from 'express';
import { UserPayload } from './types';
import jwt from 'jsonwebtoken';
import { JWT_SECRET, logger } from '.';
import { AppError } from './errors';
import pino from 'pino';
import { pinoHttp } from 'pino-http';

declare global {
  namespace Express {
    interface Request {
      loggedInUser?: UserPayload;
    }
  }
  interface Error {
    status?: number;
  }
}

export const jwtAuth = (exceptFor?: string[]) => {
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
        throw new AppError(401, 'Incorret authentication token');
      }
    } else {
      throw new AppError(401, 'Not authenticated');
    }

    next();
  };
};

export const pagination = (defaultLimit: number, maxLimit: number) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    let { limit, offset } = req.query;

    let parsedLimit = Number(limit) || defaultLimit;
    let parsedOffset = Number(offset) || 0;

    if (parsedLimit < 1) parsedLimit = defaultLimit;
    if (parsedLimit > maxLimit) parsedLimit = maxLimit;
    if (parsedOffset < 0) parsedOffset = 0;

    req.query.limit = parsedLimit.toString();
    req.query.offset = parsedOffset.toString();

    next();
  };
};

export const errorHandler = () => {
  return (err: Error, req: Request, res: Response, _next: NextFunction) => {
    const errorStatus = err.status || 500;
    const errorMessage = err.message;

    if (errorStatus >= 500) {
      logger.error({
        message: errorMessage,
        status: errorStatus,
        method: req.method,
        url: req.originalUrl,
      });
    }

    return res.status(errorStatus).json({
      status: 'error',
      message: errorStatus >= 500 ? 'Something went wrong' : errorMessage,
      code: errorStatus,
    });
  };
};

export const httpLogger = (logger: pino.Logger) => {
  return pinoHttp({
    logger,
    serializers: {
      req: (req) => ({
        method: req.method,
        url: req.url,
      }),
      res: (res) => ({
        statusCode: res.statusCode,
      }),
    },
  });
};
