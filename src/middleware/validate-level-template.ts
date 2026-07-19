/**
 * Validation middleware for LevelTemplate fields
 */

import { body, validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';

export const validateLevelTemplate = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Plan name is required'),

  body('level')
    .notEmpty()
    .withMessage('Level is required')
    .isIn(['INITIATE', 'FIGHTER', 'WARRIOR', 'CHAMPION', 'ELITE'])
    .withMessage('Level must be one of: INITIATE, FIGHTER, WARRIOR, CHAMPION, ELITE'),

  body('durationWeeks')
    .isInt({ min: 1 })
    .withMessage('Duration must be at least 1 week'),

  body('minimumSessionsPerWeek')
    .optional()
    .isInt({ min: 1, max: 7 })
    .withMessage('Minimum sessions per week must be between 1 and 7'),

  body('maximumSessionsPerWeek')
    .optional()
    .isInt({ min: 1, max: 7 })
    .withMessage('Maximum sessions per week must be between 1 and 7'),

  // Custom validation: max >= min
  body().custom((body) => {
    const { minimumSessionsPerWeek, maximumSessionsPerWeek } = body;
    if (minimumSessionsPerWeek && maximumSessionsPerWeek) {
      if (maximumSessionsPerWeek < minimumSessionsPerWeek) {
        throw new Error('Maximum sessions per week must be >= minimum sessions per week');
      }
    }
    return true;
  }),

  // Middleware to handle validation errors
  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }
    next();
  },
];

export const validateLevelTemplateUpdate = [
  body('name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Plan name cannot be empty'),

  body('level')
    .optional()
    .isIn(['INITIATE', 'FIGHTER', 'WARRIOR', 'CHAMPION', 'ELITE'])
    .withMessage('Level must be one of: INITIATE, FIGHTER, WARRIOR, CHAMPION, ELITE'),

  body('durationWeeks')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Duration must be at least 1 week'),

  body('minimumSessionsPerWeek')
    .optional()
    .isInt({ min: 1, max: 7 })
    .withMessage('Minimum sessions per week must be between 1 and 7'),

  body('maximumSessionsPerWeek')
    .optional()
    .isInt({ min: 1, max: 7 })
    .withMessage('Maximum sessions per week must be between 1 and 7'),

  // Custom validation: max >= min
  body().custom((body) => {
    const { minimumSessionsPerWeek, maximumSessionsPerWeek } = body;
    if (minimumSessionsPerWeek && maximumSessionsPerWeek) {
      if (maximumSessionsPerWeek < minimumSessionsPerWeek) {
        throw new Error('Maximum sessions per week must be >= minimum sessions per week');
      }
    }
    return true;
  }),

  // Middleware to handle validation errors
  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }
    next();
  },
];
