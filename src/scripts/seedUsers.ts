/**
 * Seed users (30+ regular, 2-3 admins). Idempotent: deletes non-admin users then inserts.
 * Keeps existing admin users.
 */
import bcrypt from 'bcrypt';
import User from '../models/User.model';
import { runSeed } from './runSeed';

const PASSWORD_HASH = bcrypt.hashSync('password123', 10);

const REGULAR_USERS = Array.from({ length: 32 }, (_, i) => ({
  name: `User ${i + 1}`,
  email: `user${i + 1}@diettemple.com`,
  phone: i < 15 ? `+3360000000${String(i).padStart(2, '0')}` : undefined,
  passwordHash: PASSWORD_HASH,
  level: ['Intiate', 'Fighter', 'Warrior', 'Champion', 'Elite'][i % 5] as any,
  role: 'user',
  objectif: ['Prise de masse', 'Sèche', 'Force', 'Endurance'][i % 4],
  age: String(20 + (i % 25)),
  sexe: i % 2 ? 'M' : 'F',
}));

const ADMIN_USERS = [
  { name: 'Admin', email: 'admin@diettemple.com', passwordHash: PASSWORD_HASH, role: 'admin' },
  { name: 'Admin 2', email: 'admin2@diettemple.com', passwordHash: PASSWORD_HASH, role: 'admin' },
  { name: 'Coach', email: 'coach@diettemple.com', passwordHash: PASSWORD_HASH, role: 'admin' },
];

export async function seedUsers(): Promise<number> {
  const existingAdmins = await User.find({ role: 'admin' }).select('email').lean();
  const adminEmails = new Set(existingAdmins.map((a: any) => a.email));

  await User.deleteMany({ role: 'user' });
  console.log('🧹 Deleted existing non-admin users');

  await User.insertMany(REGULAR_USERS);
  console.log(`✅ Created ${REGULAR_USERS.length} regular users`);

  for (const admin of ADMIN_USERS) {
    const exists = await User.findOne({ email: admin.email });
    if (exists) continue;
    await User.create(admin);
    console.log(`✅ Created admin ${admin.email}`);
  }
  return REGULAR_USERS.length + ADMIN_USERS.length;
}

if (require.main === module) {
  runSeed('users', seedUsers)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
