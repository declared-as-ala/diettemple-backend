import { Response, NextFunction } from 'express';
import { authenticate, AuthRequest } from './auth.middleware';

/**
 * Middleware to check if user is an admin
 * Must be used after authenticate middleware
 */
export const requireAdmin = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  console.log('🔍 [REQUIRE ADMIN] Checking admin access');
  console.log('🔍 [REQUIRE ADMIN] User:', req.user ? { id: req.user._id, email: req.user.email, role: req.user.role } : 'No user');
  
  // Check if user exists and is admin
  if (!req.user) {
    console.error('❌ [REQUIRE ADMIN] No user found');
    return res.status(401).json({ message: 'Authentication required' });
  }

  if (req.user.role !== 'admin') {
    console.error('❌ [REQUIRE ADMIN] User is not admin, role:', req.user.role);
    return res.status(403).json({ message: 'Admin access required' });
  }

  console.log('✅ [REQUIRE ADMIN] Admin access granted');
  next();
};

