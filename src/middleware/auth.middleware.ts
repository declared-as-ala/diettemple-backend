import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.model';

export interface AuthRequest extends Request {
  user?: any;
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // CRITICAL: Use the SAME JWT_SECRET as auth.service.ts
    // Must be from process.env.JWT_SECRET - NO fallback, NO hardcoded values
    if (!process.env.JWT_SECRET) {
      console.error('[Auth Middleware] JWT_SECRET is not set in environment variables');
      return res.status(500).json({ message: 'Server configuration error' });
    }
    
    const JWT_SECRET = process.env.JWT_SECRET;

    let decoded: { userId: string; tokenVersion?: number };
    try {
      decoded = jwt.verify(token, JWT_SECRET) as { userId: string; tokenVersion?: number };
    } catch (jwtError: any) {
      console.error(`[Auth Middleware] JWT verification failed:`, jwtError.message);
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({ message: 'Token expired' });
      } else if (jwtError.name === 'JsonWebTokenError') {
        return res.status(401).json({ message: 'Invalid token signature' });
      } else {
        return res.status(401).json({ message: `Token verification failed: ${jwtError.message}` });
      }
    }

    const user = await User.findById(decoded.userId).select('+tokenVersion -passwordHash');

    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    if (user.isActive === false) {
      return res.status(403).json({ message: 'Account disabled' });
    }

    if ((decoded.tokenVersion || 0) !== (user.tokenVersion || 0)) {
      return res.status(401).json({ message: 'Session revoked' });
    }
    req.user = user;
    next();
  } catch (error: any) {
    console.error(`[Auth Middleware] Unexpected error:`, error);
    return res.status(401).json({ message: `Authentication failed: ${error.message}` });
  }
};

