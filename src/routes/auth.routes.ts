import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import bcrypt from 'bcrypt';
import { authService } from '../services/auth.service';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import User from '../models/User.model';
import { processAndSaveAvatar, validateAvatarSize } from '../lib/imageProcessor';
import { deleteOldAvatarIfLocal } from '../lib/mediaStorage';

const router = Router();

// Login
router.post(
  '/login',
  [
    body('emailOrPhone').notEmpty().withMessage('Email or phone is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: errors.array()[0].msg });
      }

      const result = await authService.login(req.body);
      res.json(result);
    } catch (error: any) {
      res.status(401).json({ message: error.message });
    }
  }
);

// Forgot Password
router.post(
  '/forgot-password',
  [body('emailOrPhone').notEmpty().withMessage('Email or phone is required')],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: errors.array()[0].msg });
      }

      await authService.forgotPassword(req.body);
      res.json({ message: 'OTP sent successfully' });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  }
);

// Verify OTP
router.post(
  '/verify-otp',
  [
    body('emailOrPhone').notEmpty().withMessage('Email or phone is required'),
    body('otp').isLength({ min: 4, max: 4 }).withMessage('OTP must be 4 digits'),
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: errors.array()[0].msg });
      }

      await authService.verifyOTP(req.body);
      res.json({ message: 'OTP verified successfully' });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  }
);

// Reset Password
router.post(
  '/reset-password',
  [
    body('emailOrPhone').notEmpty().withMessage('Email or phone is required'),
    body('otp').isLength({ min: 4, max: 4 }).withMessage('OTP must be 4 digits'),
    body('newPassword').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('confirmPassword').custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('Passwords do not match');
      }
      return true;
    }),
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: errors.array()[0].msg });
      }

      await authService.resetPassword(req.body);
      res.json({ message: 'Password reset successfully' });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  }
);

// Get current user
router.get('/me', authenticate, async (req: AuthRequest, res) => {
  try {
    const user = await User.findById(req.user._id).select('-passwordHash -otp -otpExpires');
    res.json({ user });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// Enable biometric authentication (preference only - backend does NOT validate biometrics)
router.post(
  '/enable-biometric',
  authenticate,
  [
    body('biometricType').isIn(['fingerprint', 'faceid']).withMessage('Invalid biometric type'),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: errors.array()[0].msg });
      }

      const { biometricType } = req.body;
      
      // Update user's biometric preference (preference only - NOT validation)
      await User.findByIdAndUpdate(req.user._id, {
        biometricEnabled: true,
        biometricType: biometricType,
      });

      res.json({ 
        message: 'Biometric authentication enabled',
        biometricEnabled: true,
        biometricType: biometricType,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
);

// Biometric login - generates new JWT after OS-level biometric verification
router.post(
  '/biometric-login',
  [
    body('emailOrPhone').notEmpty().withMessage('Email or phone is required'),
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: errors.array()[0].msg });
      }

      const result = await authService.biometricLogin(req.body.emailOrPhone);
      res.json(result);
    } catch (error: any) {
      res.status(401).json({ message: error.message });
    }
  }
);

// Update profile
router.put(
  '/profile',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const { name, photoUri, age, sexe, poids, taille, objectif, xp } = req.body;
      
      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (photoUri !== undefined) updateData.photoUri = photoUri;
      if (age !== undefined) updateData.age = age;
      if (sexe !== undefined) updateData.sexe = sexe;
      if (poids !== undefined) updateData.poids = poids;
      if (taille !== undefined) updateData.taille = taille;
      if (objectif !== undefined) updateData.objectif = objectif;
      if (xp !== undefined) updateData.xp = xp;

      const user = await User.findByIdAndUpdate(
        req.user._id,
        { $set: updateData },
        { new: true }
      ).select('-passwordHash -otp -otpExpires');

      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      res.json({ 
        message: 'Profile updated successfully',
        user 
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
);

// Get profile
router.get(
  '/profile',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const user = await User.findById(req.user._id).select('-passwordHash -otp -otpExpires');
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      res.json({ user });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
);

// Change password
router.post(
  '/change-password',
  authenticate,
  [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
    body('confirmPassword').custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('Passwords do not match');
      }
      return true;
    }),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: errors.array()[0].msg });
      }

      const { currentPassword, newPassword } = req.body;
      const user = await User.findById(req.user._id);
      
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Verify current password
      const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isValid) {
        return res.status(401).json({ message: 'Current password is incorrect' });
      }

      // Update password
      const newPasswordHash = await bcrypt.hash(newPassword, 10);
      await User.findByIdAndUpdate(req.user._id, { passwordHash: newPasswordHash });

      res.json({ message: 'Password changed successfully' });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
);

// Upload profile image (VPS local: save as WebP under /media, optimize with sharp)
router.post(
  '/upload-image',
  authenticate,
  [body('image').notEmpty().withMessage('Image is required')],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: errors.array()[0].msg });
      }

      let { image } = req.body;
      if (typeof image !== 'string' || image.trim().length === 0) {
        return res.status(400).json({ message: 'Invalid image data' });
      }

      const dataUriMatch = image.match(/^data:image\/(\w+);base64,(.+)$/);
      if (dataUriMatch) {
        image = dataUriMatch[2];
      }
      const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
      if (!base64Regex.test(image)) {
        return res.status(400).json({ message: 'Invalid base64 image format' });
      }

      const buffer = Buffer.from(image, 'base64');
      validateAvatarSize(buffer);

      const currentUser = await User.findById(req.user._id).select('photoUri').lean();
      const previousPhotoUri = (currentUser as any)?.photoUri;

      const { publicUrl } = await processAndSaveAvatar(String(req.user._id), buffer);
      deleteOldAvatarIfLocal(previousPhotoUri);

      const updatedUser = await User.findByIdAndUpdate(
        req.user._id,
        { $set: { photoUri: publicUrl } },
        { new: true }
      ).select('-passwordHash -otp -otpExpires');

      if (!updatedUser) {
        return res.status(404).json({ message: 'User not found' });
      }

      res.json({
        message: 'Image uploaded successfully',
        imageUrl: publicUrl,
        user: updatedUser,
      });
    } catch (error: any) {
      console.error('Error uploading image:', error);
      const status = error.message?.includes('too large') ? 413 : 500;
      res.status(status).json({ message: error.message || 'Failed to upload image' });
    }
  }
);

export default router;

