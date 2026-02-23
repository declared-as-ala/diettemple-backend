const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const UserSchema = new mongoose.Schema({
  email: { type: String, lowercase: true, trim: true, sparse: true, index: true },
  phone: { type: String, trim: true, sparse: true, index: true },
  passwordHash: { type: String, required: true },
  name: { type: String, trim: true },
  photoUri: String,
  age: String,
  sexe: String,
  poids: String,
  taille: String,
  objectif: String,
  xp: { type: Number, default: 0 },
  level: { 
    type: String, 
    enum: ['Intiate', 'Fighter', 'Warrior', 'Champion', 'Elite'],
    default: 'Intiate'
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user',
    index: true,
  },
  biometricEnabled: { type: Boolean, default: false },
  biometricType: { type: String, enum: ['fingerprint', 'faceid', null], default: null },
  otp: String,
  otpExpires: Date,
}, {
  timestamps: true
});

const User = mongoose.model('User', UserSchema);

async function createAdmin() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/diettemple';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    const email = 'admin@diettemple.com';
    const password = 'admin123';

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email });
    if (existingAdmin) {
      // Update existing user to admin
      const passwordHash = await bcrypt.hash(password, 10);
      existingAdmin.passwordHash = passwordHash;
      existingAdmin.role = 'admin';
      existingAdmin.name = 'Admin User';
      await existingAdmin.save();
      console.log('✅ Admin user updated successfully!');
      console.log(`   Email: ${email}`);
      console.log(`   Password: ${password}`);
      console.log(`   Role: admin`);
    } else {
      // Create new admin user
      const passwordHash = await bcrypt.hash(password, 10);
      const admin = new User({
        email,
        passwordHash,
        name: 'Admin User',
        role: 'admin',
        level: 'Elite',
        xp: 1000,
      });
      await admin.save();
      console.log('✅ Admin user created successfully!');
      console.log(`   Email: ${email}`);
      console.log(`   Password: ${password}`);
      console.log(`   Role: admin`);
    }

    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error creating admin user:', error);
    process.exit(1);
  }
}

createAdmin();
