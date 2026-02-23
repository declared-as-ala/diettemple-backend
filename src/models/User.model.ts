import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  email?: string;
  phone?: string;
  passwordHash: string;
  name?: string;
  photoUri?: string;
  age?: string;
  sexe?: string;
  poids?: string;
  taille?: string;
  objectif?: string;
  xp?: number; // Changed from string to number for proper calculations
  level?: 'Intiate' | 'Fighter' | 'Warrior' | 'Champion' | 'Elite';
  role?: 'user' | 'admin';
  biometricEnabled: boolean;
  biometricType: 'fingerprint' | 'faceid' | null;
  otp?: string;
  otpExpires?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema: Schema = new Schema(
  {
    email: {
      type: String,
      lowercase: true,
      trim: true,
      sparse: true,
      index: true,
    },
    phone: {
      type: String,
      trim: true,
      sparse: true,
      index: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      trim: true,
    },
    photoUri: {
      type: String,
    },
    age: {
      type: String,
    },
    sexe: {
      type: String,
    },
    poids: {
      type: String,
    },
    taille: {
      type: String,
    },
    objectif: {
      type: String,
    },
    xp: {
      type: Number,
      default: 0,
    },
    level: {
      type: String,
      enum: ['Intiate', 'Fighter', 'Warrior', 'Champion', 'Elite'],
      default: 'Intiate',
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
      index: true,
    },
    biometricEnabled: {
      type: Boolean,
      default: false,
    },
    biometricType: {
      type: String,
      enum: ['fingerprint', 'faceid', null],
      default: null,
    },
    otp: {
      type: String,
    },
    otpExpires: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Ensure either email or phone is provided
UserSchema.pre('validate', function (next) {
  if (!this.email && !this.phone) {
    next(new Error('Either email or phone must be provided'));
  } else {
    next();
  }
});

export default mongoose.model<IUser>('User', UserSchema);


