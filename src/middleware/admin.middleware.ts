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
 * Denies dashboard stats, orders, leads, support by default to employees
 * Restricts employees to read-only on templates, exercises, products, and recipes
 * Allows full client management except DELETE methods to employees
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

    // Clients module: allowed GET, POST, PUT, PATCH. Denied: DELETE.
    if (path.startsWith('/clients')) {
      if (method === 'DELETE') {
        console.error('❌ [REQUIRE ADMIN OR EMPLOYEE] Employee denied DELETE on clients');
        return res.status(403).json({ message: 'Action non autorisée pour le rôle Employé' });
      }
      console.log('✅ [REQUIRE ADMIN OR EMPLOYEE] Employee client access granted');
      return next();
    }

    // Workout plan assignment
    if (req.baseUrl.startsWith('/api/admin/workout-plan')) {
      if (method === 'DELETE') {
        console.error('❌ [REQUIRE ADMIN OR EMPLOYEE] Employee denied DELETE on workout-plan');
        return res.status(403).json({ message: 'Action non autorisée pour le rôle Employé' });
      }
      console.log('✅ [REQUIRE ADMIN OR EMPLOYEE] Employee workout-plan access granted');
      return next();
    }

    // Templates, Recipes, Products, Exercises: read-only (GET only)
    const isReadOnlyPath =
      path.startsWith('/level-templates') ||
      path.startsWith('/session-templates') ||
      path.startsWith('/recipes') ||
      path.startsWith('/products') ||
      path.startsWith('/exercises');

    if (isReadOnlyPath) {
      if (method === 'GET') {
        console.log(`✅ [REQUIRE ADMIN OR EMPLOYEE] Employee read-only access granted for ${path}`);
        return next();
      } else {
        console.error(`❌ [REQUIRE ADMIN OR EMPLOYEE] Employee write denied on ${path}`);
        return res.status(403).json({ message: 'Accès en écriture refusé pour le rôle Employé' });
      }
    }

    // Denied by default for any other endpoints
    console.error(`❌ [REQUIRE ADMIN OR EMPLOYEE] Employee access denied for path: ${path}`);
    return res.status(403).json({ message: 'Accès non autorisé pour le rôle Employé' });
  }

  console.error('❌ [REQUIRE ADMIN OR EMPLOYEE] Access denied, invalid role:', role);
  return res.status(403).json({ message: 'Accès non autorisé' });
};

