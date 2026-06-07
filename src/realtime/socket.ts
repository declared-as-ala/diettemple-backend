import type { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import { Server, type Socket } from 'socket.io';
import User from '../models/User.model';
import { REALTIME_ROOMS } from './events';

type JwtPayload = { userId?: string };

let io: Server | null = null;

function devLog(...args: unknown[]) {
  if (process.env.NODE_ENV !== 'production') {
    console.log('[realtime]', ...args);
  }
}

function extractToken(socket: Socket): string | null {
  const authToken = socket.handshake.auth?.token;
  if (typeof authToken === 'string' && authToken.trim()) return authToken;

  const header = socket.handshake.headers.authorization;
  if (!header) return null;
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
}

export function initializeRealtimeServer(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    path: '/api/socket.io',
    cors: {
      origin: true,
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  io.use(async (socket, next) => {
    try {
      if (!process.env.JWT_SECRET) {
        return next(new Error('Server configuration error'));
      }
      const token = extractToken(socket);
      if (!token) return next(new Error('Unauthorized'));
      const decoded = jwt.verify(token, process.env.JWT_SECRET) as JwtPayload;
      if (!decoded?.userId) return next(new Error('Unauthorized'));

      const user = await User.findById(decoded.userId).select('_id role').lean();
      if (!user) return next(new Error('Unauthorized'));

      socket.data.userId = String(user._id);
      socket.data.role = String((user as any).role || 'user');
      return next();
    } catch {
      return next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId as string | undefined;
    if (!userId) {
      socket.disconnect(true);
      return;
    }

    socket.join(REALTIME_ROOMS.user(userId));
    devLog(`socket connected user:${userId} socket:${socket.id}`);

    socket.on('disconnect', (reason) => {
      devLog(`socket disconnected user:${userId} reason:${reason}`);
    });
  });

  return io;
}

export function getRealtimeServer(): Server {
  if (!io) {
    throw new Error('Realtime server not initialized');
  }
  return io;
}
