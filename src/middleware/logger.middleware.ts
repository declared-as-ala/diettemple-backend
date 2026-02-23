import { Request, Response, NextFunction } from 'express';

interface RequestLog {
  timestamp: string;
  method: string;
  path: string;
  ip: string;
  userAgent?: string;
  query?: any;
  body?: any;
  userId?: string;
  userEmail?: string;
  userRole?: string;
}

interface ResponseLog {
  timestamp: string;
  method: string;
  path: string;
  statusCode: number;
  responseTime: number;
  ip: string;
}

/**
 * Request logging middleware
 * Logs all incoming requests with IP, method, path, query, body, and user info
 */
export const requestLogger = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  // Get client IP (handles proxies)
  const getClientIp = (req: Request): string => {
    return (
      (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
      (req.headers['x-real-ip'] as string) ||
      req.socket.remoteAddress ||
      'unknown'
    );
  };

  const clientIp = getClientIp(req);

  // Log request
  const requestLog: RequestLog = {
    timestamp,
    method: req.method,
    path: req.path,
    ip: clientIp,
    userAgent: req.headers['user-agent'],
    query: Object.keys(req.query).length > 0 ? req.query : undefined,
  };

  // Add body for POST/PUT/PATCH (but exclude sensitive data)
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const body = { ...req.body };
    // Remove sensitive fields
    if (body.password) body.password = '[REDACTED]';
    if (body.passwordHash) body.passwordHash = '[REDACTED]';
    if (body.token) body.token = '[REDACTED]';
    if (body.otp) body.otp = '[REDACTED]';
    requestLog.body = body;
  }

  // Add user info if available (from auth middleware)
  const authReq = req as any;
  if (authReq.user) {
    requestLog.userId = authReq.user._id?.toString();
    requestLog.userEmail = authReq.user.email || authReq.user.phone;
    requestLog.userRole = authReq.user.role;
  }

  // Log request
  console.log('📥 [REQUEST]', JSON.stringify(requestLog, null, 2));

  // Log response when finished
  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    const responseLog: ResponseLog = {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      responseTime,
      ip: clientIp,
    };

    // Color code by status
    if (res.statusCode >= 500) {
      console.error('❌ [RESPONSE]', JSON.stringify(responseLog, null, 2));
    } else if (res.statusCode >= 400) {
      console.warn('⚠️  [RESPONSE]', JSON.stringify(responseLog, null, 2));
    } else {
      console.log('✅ [RESPONSE]', JSON.stringify(responseLog, null, 2));
    }
  });

  next();
};

/**
 * Error logging middleware
 * Logs all errors with full details
 * Must be used as: app.use(errorLogger) after all routes
 */
export const errorLogger = (
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const timestamp = new Date().toISOString();
  const getClientIp = (req: Request): string => {
    return (
      (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
      (req.headers['x-real-ip'] as string) ||
      req.socket.remoteAddress ||
      'unknown'
    );
  };

  const errorLog = {
    timestamp,
    method: req.method,
    path: req.path,
    ip: getClientIp(req),
    error: {
      name: error?.name,
      message: error?.message,
      stack: error?.stack,
      code: error?.code,
      statusCode: error?.statusCode || 500,
    },
    user: (req as any).user
      ? {
          id: (req as any).user._id?.toString(),
          email: (req as any).user.email || (req as any).user.phone,
          role: (req as any).user.role,
        }
      : undefined,
  };

  // Enhanced error logging
  console.error('🔥 [ERROR] ==========================================');
  console.error('🔥 [ERROR] TIMESTAMP:', timestamp);
  console.error('🔥 [ERROR] METHOD:', req.method);
  console.error('🔥 [ERROR] PATH:', req.path);
  console.error('🔥 [ERROR] IP:', getClientIp(req));
  console.error('🔥 [ERROR] ERROR NAME:', error?.name);
  console.error('🔥 [ERROR] ERROR MESSAGE:', error?.message);
  console.error('🔥 [ERROR] ERROR CODE:', error?.code);
  console.error('🔥 [ERROR] ERROR STATUS CODE:', error?.statusCode || 500);
  
  if (error?.stack) {
    console.error('🔥 [ERROR] STACK TRACE:');
    console.error(error.stack);
  }
  
  if (error?.errors) {
    console.error('🔥 [ERROR] VALIDATION ERRORS:', error.errors);
  }
  
  if (error?.codeName) {
    console.error('🔥 [ERROR] MONGODB CODE NAME:', error.codeName);
  }
  
  if (error?.errmsg) {
    console.error('🔥 [ERROR] MONGODB ERROR MESSAGE:', error.errmsg);
  }
  
  if (error?.keyPattern) {
    console.error('🔥 [ERROR] MONGODB KEY PATTERN:', error.keyPattern);
  }
  
  if (error?.keyValue) {
    console.error('🔥 [ERROR] MONGODB KEY VALUE:', error.keyValue);
  }
  
  // Try to stringify full error
  try {
    const errorString = JSON.stringify(errorLog, null, 2);
    console.error('🔥 [ERROR] FULL ERROR OBJECT:', errorString);
  } catch (stringifyError) {
    console.error('🔥 [ERROR] Could not stringify error (circular reference)');
    console.error('🔥 [ERROR] Error object keys:', Object.keys(error || {}));
  }
  
  console.error('🔥 [ERROR] ==========================================');

  // Send error response if not already sent
  if (!res.headersSent) {
    res.status(error?.statusCode || 500).json({
      message: error?.message || 'Internal server error',
      ...(process.env.NODE_ENV === 'development' && { stack: error?.stack }),
    });
  }

  next(error);
};
