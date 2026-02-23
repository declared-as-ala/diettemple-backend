import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User, { IUser } from '../models/User.model';
import { generateOTP, sendEmailOTP, sendSMSOTP } from './otp.service';

export interface LoginData {
  emailOrPhone: string;
  password: string;
}

export interface ForgotPasswordData {
  emailOrPhone: string;
}

export interface VerifyOTPData {
  emailOrPhone: string;
  otp: string;
}

export interface ResetPasswordData {
  emailOrPhone: string;
  otp: string;
  newPassword: string;
  confirmPassword: string;
}

// CRITICAL: Use JWT_SECRET from environment variables ONLY
// NO fallback secrets - must be set in .env file
// This ensures token generation and verification use the SAME secret
// Note: Validation happens at runtime (when function is called), not at module load time
// This allows dotenv.config() to run first in index.ts

const getJWTSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not set in environment variables. Please configure it in .env file.');
  }
  return secret;
};

const JWT_EXPIRES_IN: string = process.env.JWT_EXPIRES_IN || '7d';

export const generateToken = (userId: string): string => {
  // Get JWT_SECRET at runtime (after dotenv.config() has run)
  const JWT_SECRET = getJWTSecret();
  
  // Use process.env.JWT_SECRET directly - NO fallback, NO hardcoded values
  const token = jwt.sign(
    { userId },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions
  );
  return token;
};

export const isEmail = (str: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
};

export const isPhone = (str: string): boolean => {
  return /^[\d\s\+\-]+$/.test(str.replace(/\s/g, ''));
};

export const authService = {
  login: async (data: LoginData): Promise<{ user: IUser; token: string }> => {
    const isEmailInput = isEmail(data.emailOrPhone);
    const isPhoneInput = isPhone(data.emailOrPhone);

    if (!isEmailInput && !isPhoneInput) {
      throw new Error('Invalid email or phone number');
    }

    const query = isEmailInput
      ? { email: data.emailOrPhone.toLowerCase() }
      : { phone: data.emailOrPhone.replace(/\s/g, '') };

    const user = await User.findOne(query);

    if (!user) {
      throw new Error('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(data.password, user.passwordHash);

    if (!isPasswordValid) {
      throw new Error('Invalid credentials');
    }

    const token = generateToken(user._id.toString());

    return {
      user: user.toObject(),
      token,
    };
  },

  forgotPassword: async (data: ForgotPasswordData): Promise<void> => {
    const isEmailInput = isEmail(data.emailOrPhone);
    const isPhoneInput = isPhone(data.emailOrPhone);

    if (!isEmailInput && !isPhoneInput) {
      throw new Error('Invalid email or phone number');
    }

    const query = isEmailInput
      ? { email: data.emailOrPhone.toLowerCase() }
      : { phone: data.emailOrPhone.replace(/\s/g, '') };

    const user = await User.findOne(query);

    if (!user) {
      // Don't reveal if user exists for security
      return;
    }

    const otp = generateOTP();
    const otpExpires = new Date();
    otpExpires.setMinutes(otpExpires.getMinutes() + 10); // OTP valid for 10 minutes

    user.otp = otp;
    user.otpExpires = otpExpires;
    await user.save();

    if (isEmailInput) {
      await sendEmailOTP(user.email!, otp);
    } else {
      await sendSMSOTP(user.phone!, otp);
    }
  },

  verifyOTP: async (data: VerifyOTPData): Promise<void> => {
    const isEmailInput = isEmail(data.emailOrPhone);
    const isPhoneInput = isPhone(data.emailOrPhone);

    if (!isEmailInput && !isPhoneInput) {
      throw new Error('Invalid email or phone number');
    }

    const query = isEmailInput
      ? { email: data.emailOrPhone.toLowerCase() }
      : { phone: data.emailOrPhone.replace(/\s/g, '') };

    const user = await User.findOne(query);

    if (!user || !user.otp || !user.otpExpires) {
      throw new Error('Invalid OTP');
    }

    if (user.otpExpires < new Date()) {
      throw new Error('OTP expired');
    }

    if (user.otp !== data.otp) {
      throw new Error('Invalid OTP');
    }

    // OTP verified, but don't clear it yet - will be cleared after password reset
  },

  resetPassword: async (data: ResetPasswordData): Promise<void> => {
    if (data.newPassword !== data.confirmPassword) {
      throw new Error('Passwords do not match');
    }

    if (data.newPassword.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }

    const isEmailInput = isEmail(data.emailOrPhone);
    const isPhoneInput = isPhone(data.emailOrPhone);

    if (!isEmailInput && !isPhoneInput) {
      throw new Error('Invalid email or phone number');
    }

    const query = isEmailInput
      ? { email: data.emailOrPhone.toLowerCase() }
      : { phone: data.emailOrPhone.replace(/\s/g, '') };

    const user = await User.findOne(query);

    if (!user || !user.otp || !user.otpExpires) {
      throw new Error('Invalid or expired OTP');
    }

    if (user.otpExpires < new Date()) {
      throw new Error('OTP expired');
    }

    if (user.otp !== data.otp) {
      throw new Error('Invalid OTP');
    }

    const passwordHash = await bcrypt.hash(data.newPassword, 10);

    user.passwordHash = passwordHash;
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save();
  },

  biometricLogin: async (emailOrPhone: string): Promise<{ user: IUser; token: string }> => {
    console.log(`[Biometric Login] Attempting login for: ${emailOrPhone}`);
    
    const isEmailInput = isEmail(emailOrPhone);
    const isPhoneInput = isPhone(emailOrPhone);

    if (!isEmailInput && !isPhoneInput) {
      console.error(`[Biometric Login] Invalid email or phone: ${emailOrPhone}`);
      throw new Error('Invalid email or phone number');
    }

    const query = isEmailInput
      ? { email: emailOrPhone.toLowerCase() }
      : { phone: emailOrPhone.replace(/\s/g, '') };

    console.log(`[Biometric Login] Query:`, query);
    const user = await User.findOne(query);

    if (!user) {
      console.error(`[Biometric Login] User not found: ${emailOrPhone}`);
      throw new Error('User not found');
    }
    
    console.log(`[Biometric Login] User found: ${user.email || user.phone}, biometricEnabled: ${user.biometricEnabled}`);

    // Check if user has biometric enabled
    if (!user.biometricEnabled) {
      console.error(`Biometric login failed: User ${emailOrPhone} does not have biometric enabled`);
      throw new Error('Biometric authentication not enabled for this user. Please enable it from settings.');
    }

    // Generate new JWT token
    const token = generateToken(user._id.toString());

    return {
      user: user.toObject(),
      token,
    };
  },
};

