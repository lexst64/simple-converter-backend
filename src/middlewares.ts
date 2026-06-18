import { NextFunction, Request, Response } from 'express';
import { UserPayload } from '@/types.js';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '@/config.js';
import { logger } from '@/logger.js';
import { AppError } from '@/errors.js';
import pino from 'pino';
import { pinoHttp } from 'pino-http';
import { z } from 'zod';

export const UserPayloadSchema = z.object({
  email: z.email(),
  googleId: z.string(),
  name: z.string(),
  picture: z.string().optional(),
});

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

/**
 * Middleware that authenticates requests using JWT app tokens.
 * Allows specifying paths that should bypass authentication checks.
 */
export const jwtAuth = (exceptFor?: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const requestPath = req.originalUrl.split('?')[0];
    if (exceptFor && exceptFor.includes(requestPath)) {
      next();
      return;
    }

    const authHeader = req.headers.authorization;
    const queryToken = typeof req.query.token === 'string' ? req.query.token : undefined;
    const rawToken = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : queryToken;

    if (!rawToken) throw new AppError(401, 'Not authenticated');

    let decodedPayload;

    try {
      decodedPayload = jwt.verify(rawToken, JWT_SECRET);
    } catch (error: any) {
      throw new AppError(401, 'Incorret authentication token');
    }

    const validation = UserPayloadSchema.safeParse(decodedPayload);

    if (!validation.success) {
      throw new AppError(401, 'Incorret authentication token');
    }

    req.loggedInUser = {
      email: validation.data.email,
      googleId: validation.data.googleId,
      name: validation.data.name,
      picture: validation.data.picture,
    };

    next();
  };
};

/**
 * Middleware that parses and validates offset and limit query parameters for pagination.
 */
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

/**
 * Error-handling middleware that catches all errors, logging 5xx errors
 * and sending structured JSON responses to the client.
 */
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

/**
 * HTTP request/response logging middleware using pino-http.
 */
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
