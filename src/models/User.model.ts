import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  email?: string;
  phone?: string;
  passwordHash: string;
  name?: string;
  photoUri?: string;
  age?: string;
  sexe?: 'M' | 'F';
  poids?: string;
  taille?: string;
  objectif?: string;
  level?: 'Intiate' | 'Fighter' | 'Warrior' | 'Champion' | 'Elite';
  role?: 'user' | 'admin' | 'employee' | 'coach' | 'nutritionist';
  biometricEnabled: boolean;
  biometricType: 'fingerprint' | 'faceid' | null;
  otp?: string;
  otpExpires?: Date;
  nutritionTarget?: {
    dailyCalories?: number;
    proteinG?: number;
    carbsG?: number;
    fatG?: number;
  };
  bodyComposition?: {
    bodyFatPercentage?: number;
    muscleMassPercentage?: number;
  };
  fitnessLevel?: 'A' | 'B';
  nutritionGoal?: {
    calorieMode?: 'SURPLUS' | 'DEFICIT';
    calorieAdjustment?: number;
    proteinGrams?: number;
    carbohydrateGrams?: number;
    fatGrams?: number;
  };
  assignedPlanId?: mongoose.Types.ObjectId;
  planAssignmentStartDate?: Date;
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
      enum: ['M', 'F'],
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
    level: {
      type: String,
      enum: ['Intiate', 'Fighter', 'Warrior', 'Champion', 'Elite'],
      default: 'Intiate',
    },
    role: {
      type: String,
      enum: ['user', 'admin', 'employee', 'coach', 'nutritionist'],
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
    nutritionTarget: {
      dailyCalories: { type: Number },
      proteinG: { type: Number },
      carbsG: { type: Number },
      fatG: { type: Number },
    },
    bodyComposition: {
      bodyFatPercentage: { type: Number, min: 0, max: 100 },
      muscleMassPercentage: { type: Number, min: 0, max: 100 },
    },
    fitnessLevel: {
      type: String,
      enum: ['A', 'B'],
    },
    nutritionGoal: {
      calorieMode: { type: String, enum: ['SURPLUS', 'DEFICIT'] },
      calorieAdjustment: { type: Number, min: 0 },
      proteinGrams: { type: Number, min: 0 },
      carbohydrateGrams: { type: Number },
      fatGrams: { type: Number },
    },
    assignedPlanId: {
      type: Schema.Types.ObjectId,
      ref: 'LevelTemplate',
    },
    planAssignmentStartDate: {
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

// PRE-SAVE: Prevent direct level changes when plan is assigned
// Level must be derived from the assigned plan only
UserSchema.pre('save', function (next) {
  if (this.isModified('level') && this.assignedPlanId) {
    // Silently ignore level changes; it will be populated from the plan during serialization
    this.level = undefined;
  }
  next();
});

export default mongoose.model<IUser>('User', UserSchema);


