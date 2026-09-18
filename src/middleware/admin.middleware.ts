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

/**
 * Middleware to check if user is admin or employee
 * Enforces strict RBAC:
 * - Admin: Full access to all modules
 * - Employee: Access ONLY to Produits (/products) and Commandes (/orders)
 *   All other modules return 403 Forbidden
 */
export const requireAdminOrEmployee = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  console.log('🔍 [REQUIRE ADMIN OR EMPLOYEE] Checking role access');
  console.log('🔍 [REQUIRE ADMIN OR EMPLOYEE] User:', req.user ? { id: req.user._id, email: req.user.email, role: req.user.role } : 'No user');

  if (!req.user) {
    console.error('❌ [REQUIRE ADMIN OR EMPLOYEE] No user found');
    return res.status(401).json({ message: 'Authentication required' });
  }

  const role = req.user.role;
  if (role === 'admin') {
    console.log('✅ [REQUIRE ADMIN OR EMPLOYEE] Admin access granted');
    return next();
  }

  if (role === 'employee') {
    const path = req.path;
    const method = req.method;

    // Produits module: allowed for employees (viewing & product management)
    if (path.startsWith('/products')) {
      console.log(`✅ [REQUIRE ADMIN OR EMPLOYEE] Employee product access granted: ${method} ${path}`);
      return next();
    }

    // Commandes module: allowed for employees (view orders, details, update status / payment-status)
    if (path.startsWith('/orders')) {
      if (method === 'DELETE') {
        console.error('❌ [REQUIRE ADMIN OR EMPLOYEE] Employee denied DELETE on orders');
        return res.status(403).json({ message: 'Action de suppression non autorisée pour le rôle Employé' });
      }
      console.log(`✅ [REQUIRE ADMIN OR EMPLOYEE] Employee order access granted: ${method} ${path}`);
      return next();
    }

    // Strictly forbidden for any other admin module (Clients, Plans, Séances, Nutrition, Dashboard, etc.)
    console.error(`❌ [REQUIRE ADMIN OR EMPLOYEE] Employee access denied for path: ${path}`);
    return res.status(403).json({
      message: 'Accès interdit : le rôle Employé a accès uniquement aux Produits et Commandes.',
    });
  }

  console.error('❌ [REQUIRE ADMIN OR EMPLOYEE] Access denied, invalid role:', role);
  return res.status(403).json({ message: 'Accès non autorisé' });
};

