import jwt from 'jsonwebtoken';
import { generateToken } from './auth.service';

describe('Auth Service - JWT Token Generation & Role Claims', () => {
  const originalEnv = process.env.JWT_SECRET;

  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret-at-least-32-characters-long-12345';
  });

  afterAll(() => {
    process.env.JWT_SECRET = originalEnv;
  });

  it('generates token containing role and name for admin', () => {
    const token = generateToken('admin-user-id-123', 0, 'admin', 'Super Admin');
    expect(token).toBeDefined();

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    expect(decoded.userId).toBe('admin-user-id-123');
    expect(decoded.tokenVersion).toBe(0);
    expect(decoded.role).toBe('admin');
    expect(decoded.name).toBe('Super Admin');
  });

  it('generates token containing role and name for employee', () => {
    const token = generateToken('employee-user-id-456', 2, 'employee', 'Employee Staff');
    expect(token).toBeDefined();

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    expect(decoded.userId).toBe('employee-user-id-456');
    expect(decoded.tokenVersion).toBe(2);
    expect(decoded.role).toBe('employee');
    expect(decoded.name).toBe('Employee Staff');
  });

  it('remains backwards compatible when role and name are omitted', () => {
    const token = generateToken('user-id-789', 1);
    expect(token).toBeDefined();

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    expect(decoded.userId).toBe('user-id-789');
    expect(decoded.tokenVersion).toBe(1);
    expect(decoded.role).toBeUndefined();
    expect(decoded.name).toBeUndefined();
  });
});
