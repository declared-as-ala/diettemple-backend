/**
 * Tests for userSerializer.ts
 * Validates level derivation, backward compatibility, and serialization
 * ✅ NO DATABASE REQUIRED - Pure unit tests
 */

import { describe, it, expect } from '@jest/globals';
import { serializeUserForAPI, convertToBackCompatLevel, serializeUsersForAPI } from './userSerializer';
import { IUser } from '../models/User.model';
import { ILevelTemplate } from '../models/LevelTemplate.model';

describe('userSerializer - Unit Tests (No DB Required)', () => {
  describe('convertToBackCompatLevel', () => {
    it('converts INITIATE to Initiate', () => {
      expect(convertToBackCompatLevel('INITIATE')).toBe('Initiate');
    });

    it('converts FIGHTER to Fighter', () => {
      expect(convertToBackCompatLevel('FIGHTER')).toBe('Fighter');
    });

    it('converts WARRIOR to Warrior', () => {
      expect(convertToBackCompatLevel('WARRIOR')).toBe('Warrior');
    });

    it('converts CHAMPION to Champion', () => {
      expect(convertToBackCompatLevel('CHAMPION')).toBe('Champion');
    });

    it('converts ELITE to Elite', () => {
      expect(convertToBackCompatLevel('ELITE')).toBe('Elite');
    });

    it('defaults to Initiate for unknown levels', () => {
      expect(convertToBackCompatLevel('UNKNOWN')).toBe('Initiate');
    });

    it('defaults to Initiate for empty string', () => {
      expect(convertToBackCompatLevel('')).toBe('Initiate');
    });
  });

  describe('serializeUserForAPI', () => {
    it('includes user basic fields', () => {
      const mockUser = {
        _id: { toString: () => 'user123' },
        email: 'test@example.com',
        phone: '+1234567890',
        name: 'John Doe',
        role: 'user',
        level: 'Intiate',
        biometricEnabled: false,
      } as any as IUser;

      const serialized = serializeUserForAPI(mockUser);

      expect(serialized._id).toBe('user123');
      expect(serialized.email).toBe('test@example.com');
      expect(serialized.phone).toBe('+1234567890');
      expect(serialized.name).toBe('John Doe');
      expect(serialized.role).toBe('user');
    });

    it('derives level from assigned plan when available', () => {
      const mockPlan = {
        _id: { toString: () => 'plan123' },
        name: 'Fighter Spring',
        level: 'FIGHTER',
        durationWeeks: 5,
        isActive: true,
      } as any as ILevelTemplate;

      const mockUser = {
        _id: { toString: () => 'user123' },
        email: 'test@example.com',
        level: 'Intiate',
        assignedPlanId: mockPlan,
        biometricEnabled: false,
      } as any as IUser;

      const serialized = serializeUserForAPI(mockUser);

      expect(serialized.level).toBe('Fighter');
      expect(serialized.assignedPlan).toBeDefined();
      expect(serialized.assignedPlan?.level).toBe('FIGHTER');
      expect(serialized.assignedPlan?.levelDisplay).toBe('Fighter');
    });

    it('uses default level when no plan assigned', () => {
      const mockUser = {
        _id: { toString: () => 'user123' },
        email: 'test@example.com',
        level: 'Intiate',  // Note: typo in existing User model
        assignedPlanId: null,
        biometricEnabled: false,
      } as any as IUser;

      const serialized = serializeUserForAPI(mockUser);

      expect(serialized.level).toBe('Intiate');  // Returns as-is when no plan
      expect(serialized.assignedPlan).toBeUndefined();
    });

    it('includes assignedPlan with full details when plan exists', () => {
      const mockPlan = {
        _id: { toString: () => 'plan123' },
        name: 'Warrior Advanced',
        level: 'WARRIOR',
        durationWeeks: 5,
        minimumSessionsPerWeek: 4,
        maximumSessionsPerWeek: 6,
        isActive: true,
      } as any as ILevelTemplate;

      const mockUser = {
        _id: { toString: () => 'user123' },
        email: 'test@example.com',
        level: 'Intiate',
        assignedPlanId: mockPlan,
        biometricEnabled: false,
      } as any as IUser;

      const serialized = serializeUserForAPI(mockUser);

      expect(serialized.assignedPlan).toEqual({
        id: 'plan123',
        name: 'Warrior Advanced',
        level: 'WARRIOR',
        levelDisplay: 'Warrior',
        durationWeeks: 5,
        minimumSessionsPerWeek: 4,
        maximumSessionsPerWeek: 6,
        isActive: true,
      });
    });

    it('maintains backward compatibility with legacy level field', () => {
      const mockUser = {
        _id: { toString: () => 'user123' },
        email: 'test@example.com',
        level: 'Fighter',
        assignedPlanId: null,
        biometricEnabled: false,
      } as any as IUser;

      const serialized = serializeUserForAPI(mockUser);

      // Legacy mobile apps expect level field
      expect(serialized).toHaveProperty('level');
      expect(typeof serialized.level).toBe('string');
    });

    it('handles missing plan details gracefully', () => {
      const mockPlan = {
        _id: { toString: () => 'plan123' },
        name: 'Champion',
        level: 'CHAMPION',
        // Missing durationWeeks
        isActive: true,
      } as any as ILevelTemplate;

      const mockUser = {
        _id: { toString: () => 'user123' },
        email: 'test@example.com',
        level: 'Intiate',
        assignedPlanId: mockPlan,
        biometricEnabled: false,
      } as any as IUser;

      const serialized = serializeUserForAPI(mockUser);

      expect(serialized.assignedPlan).toBeDefined();
      expect(serialized.assignedPlan?.durationWeeks).toBe(5); // Default fallback
    });
  });

  describe('serializeUsersForAPI', () => {
    it('serializes multiple users', () => {
      const mockUsers = [
        {
          _id: { toString: () => 'user1' },
          email: 'user1@example.com',
          level: 'Intiate',
          assignedPlanId: null,
          biometricEnabled: false,
        } as any as IUser,
        {
          _id: { toString: () => 'user2' },
          email: 'user2@example.com',
          level: 'Intiate',
          assignedPlanId: null,
          biometricEnabled: false,
        } as any as IUser,
      ];

      const serialized = serializeUsersForAPI(mockUsers);

      expect(serialized).toHaveLength(2);
      expect(serialized[0]._id).toBe('user1');
      expect(serialized[1]._id).toBe('user2');
    });

    it('preserves user order', () => {
      const mockUsers = [
        { _id: { toString: () => 'a' }, level: 'Intiate', assignedPlanId: null, biometricEnabled: false } as any as IUser,
        { _id: { toString: () => 'b' }, level: 'Fighter', assignedPlanId: null, biometricEnabled: false } as any as IUser,
        { _id: { toString: () => 'c' }, level: 'Warrior', assignedPlanId: null, biometricEnabled: false } as any as IUser,
      ];

      const serialized = serializeUsersForAPI(mockUsers);

      expect(serialized.map(u => u._id)).toEqual(['a', 'b', 'c']);
    });
  });

  describe('Mobile API Compatibility', () => {
    it('returns level in expected format for mobile app', () => {
      const mockPlan = {
        _id: { toString: () => 'plan123' },
        name: 'Elite Master',
        level: 'ELITE',
        durationWeeks: 5,
        isActive: true,
      } as any as ILevelTemplate;

      const mockUser = {
        _id: { toString: () => 'user123' },
        email: 'test@example.com',
        level: 'Intiate',
        assignedPlanId: mockPlan,
        biometricEnabled: false,
      } as any as IUser;

      const serialized = serializeUserForAPI(mockUser);

      // Mobile app expects: "Elite", "Fighter", "Warrior", etc. (not ELITE, FIGHTER, etc.)
      expect(serialized.level).toBe('Elite');
      expect(['Initiate', 'Fighter', 'Warrior', 'Champion', 'Elite']).toContain(serialized.level);
    });

    it('always includes level field for backward compatibility', () => {
      const mockUser = {
        _id: { toString: () => 'user123' },
        email: 'test@example.com',
        level: undefined,
        assignedPlanId: null,
        biometricEnabled: false,
      } as any as IUser;

      const serialized = serializeUserForAPI(mockUser);

      expect(serialized).toHaveProperty('level');
      expect(serialized.level).toBeTruthy(); // Should have default value
    });
  });
});
