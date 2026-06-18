import { WebSocketServer } from 'ws';
import { UserPayload } from './types.js';
import { handleJobStatusWebSocket } from './routes/conversions.routes.js';
import { logger } from './logger.js';
import { Server } from 'node:http';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from './config.js';
import { UserPayloadSchema } from './middlewares.js';

export let wss: WebSocketServer;

export const setupWebSocketServer = (httpServer: Server) => {
  wss = new WebSocketServer({
    noServer: true,
    handleProtocols: (protocols) => (protocols.has('Bearer') ? 'Bearer' : false),
  });

  (wss as any).on('connection', (ws: any, req: any, id: string, loggedInUser: UserPayload) => {
    (req as any).loggedInUser = loggedInUser;
    handleJobStatusWebSocket(ws, req, id).catch((error) => {
      logger.error({ error, jobId: id }, 'WebSocket status handler error');
    });
  });

  httpServer.on('upgrade', (request, socket, head) => {
    const parsedUrl = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    const match = pathname?.match(/^\/api\/v1\/conversions\/job\/([a-f\d]{24})\/status$/);

    if (match) {
      const id = match[1];

      const protocolHeader = request.headers['sec-websocket-protocol'];
      let token: string | undefined;

      if (protocolHeader) {
        const protocols = protocolHeader.split(',').map((p) => p.trim());
        if (protocols[0] === 'Bearer' && protocols[1]) {
          token = protocols[1];
        }
      }

      if (!token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      try {
        const decodedPayload = jwt.verify(token, JWT_SECRET);
        const validation = UserPayloadSchema.safeParse(decodedPayload);

        if (!validation.success) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }

        const loggedInUser: UserPayload = {
          email: validation.data.email,
          googleId: validation.data.googleId,
          name: validation.data.name,
          picture: validation.data.picture,
        };

        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request, id, loggedInUser);
        });
      } catch (error) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
      }
    } else {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
    }
  });
};
