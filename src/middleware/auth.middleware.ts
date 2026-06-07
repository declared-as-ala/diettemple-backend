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

    let decoded: { userId: string };
    try {
      decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
      console.log(`[Auth Middleware] Token decoded successfully, userId: ${decoded.userId}`);
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

    const user = await User.findById(decoded.userId).select('-passwordHash');

    if (!user) {
      console.error(`[Auth Middleware] User not found: ${decoded.userId}`);
      return res.status(401).json({ message: 'User not found' });
    }

    console.log(`[Auth Middleware] User authenticated: ${user.email || user.phone}`);
    req.user = user;
    next();
  } catch (error: any) {
    console.error(`[Auth Middleware] Unexpected error:`, error);
    return res.status(401).json({ message: `Authentication failed: ${error.message}` });
  }
};

