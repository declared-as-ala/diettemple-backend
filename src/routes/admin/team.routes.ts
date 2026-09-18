import { Router, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import bcrypt from 'bcrypt';
import User from '../../models/User.model';
import { AuthRequest } from '../../middleware/auth.middleware';

const router = Router();

// GET /api/admin/team - List all administrators and employees
router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('role').optional().isIn(['all', 'admin', 'employee']),
    query('search').optional().isString(),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: errors.array()[0].msg });
      }

      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 50;
      const skip = (page - 1) * limit;

      const filter: any = {};

      const roleQuery = req.query.role as string;
      if (roleQuery && roleQuery !== 'all') {
        filter.role = roleQuery;
      } else {
        filter.role = { $in: ['admin', 'employee'] };
      }

      const searchQuery = (req.query.search as string)?.trim();
      if (searchQuery) {
        filter.$or = [
          { name: { $regex: searchQuery, $options: 'i' } },
          { email: { $regex: searchQuery, $options: 'i' } },
          { phone: { $regex: searchQuery, $options: 'i' } },
        ];
      }

      const [members, total, adminCount, employeeCount, activeCount] = await Promise.all([
        User.find(filter)
          .select('-passwordHash -otp -otpExpires')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        User.countDocuments(filter),
        User.countDocuments({ role: 'admin' }),
        User.countDocuments({ role: 'employee' }),
        User.countDocuments({ role: { $in: ['admin', 'employee'] }, isActive: true }),
      ]);

      res.json({
        members,
        stats: {
          total,
          adminCount,
          employeeCount,
          activeCount,
        },
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit) || 1,
        },
      });
    } catch (error: any) {
      console.error('[Team Routes] Error listing members:', error);
      res.status(500).json({ message: error.message || 'Erreur lors de la récupération des membres' });
    }
  }
);

// POST /api/admin/team - Create a new administrator or employee
router.post(
  '/',
  [
    body('name').trim().notEmpty().withMessage('Le nom est requis'),
    body('email').optional({ values: 'falsy' }).isEmail().withMessage('Adresse email invalide'),
    body('phone').optional({ values: 'falsy' }).isString().trim(),
    body('password').isLength({ min: 6 }).withMessage('Le mot de passe doit contenir au moins 6 caractères'),
    body('role').isIn(['admin', 'employee']).withMessage('Rôle invalide (doit être Administrateur ou Employé)'),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: errors.array()[0].msg });
      }

      const { name, email, phone, password, role } = req.body;

      if (!email && !phone) {
        return res.status(400).json({ message: 'Veuillez renseigner au moins un email ou un numéro de téléphone' });
      }

      const normalizedEmail = email ? email.trim().toLowerCase() : undefined;
      const normalizedPhone = phone ? phone.trim() : undefined;

      // Check existing email
      if (normalizedEmail) {
        const existingByEmail = await User.findOne({ email: normalizedEmail });
        if (existingByEmail) {
          return res.status(400).json({ message: 'Cette adresse email est déjà utilisée par un autre compte' });
        }
      }

      // Check existing phone
      if (normalizedPhone) {
        const existingByPhone = await User.findOne({ phone: normalizedPhone });
        if (existingByPhone) {
          return res.status(400).json({ message: 'Ce numéro de téléphone est déjà utilisé par un autre compte' });
        }
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const user = await User.create({
        name,
        email: normalizedEmail,
        phone: normalizedPhone,
        passwordHash,
        role,
        isActive: true,
        tokenVersion: 0,
      });

      const userObj = user.toObject();
      delete (userObj as any).passwordHash;
      delete (userObj as any).otp;
      delete (userObj as any).otpExpires;

      res.status(201).json({
        member: userObj,
        message: `Le compte ${role === 'admin' ? 'Administrateur' : 'Employé'} a été créé avec succès`,
      });
    } catch (error: any) {
      console.error('[Team Routes] Error creating member:', error);
      res.status(500).json({ message: error.message || 'Erreur lors de la création du compte' });
    }
  }
);

// PUT /api/admin/team/:id - Update member details (name, email, phone, role)
router.put(
  '/:id',
  [
    param('id').isMongoId().withMessage('ID invalide'),
    body('name').optional().trim().notEmpty().withMessage('Le nom ne peut pas être vide'),
    body('email').optional({ values: 'falsy' }).isEmail().withMessage('Adresse email invalide'),
    body('phone').optional({ values: 'falsy' }).isString().trim(),
    body('role').optional().isIn(['admin', 'employee']).withMessage('Rôle invalide'),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: errors.array()[0].msg });
      }

      const member = await User.findById(req.params.id);
      if (!member) {
        return res.status(404).json({ message: 'Membre introuvable' });
      }

      // Safeguard: Demoting from admin
      if (req.body.role && req.body.role !== member.role) {
        if (member.role === 'admin' && req.body.role === 'employee') {
          // Cannot demote self
          if (member._id.toString() === req.user?._id?.toString()) {
            return res.status(403).json({
              message: 'Action interdite : vous ne pouvez pas révoquer votre propre rôle d’administrateur.',
            });
          }

          // Cannot demote last active admin
          const activeAdmins = await User.countDocuments({ role: 'admin', isActive: true });
          if (activeAdmins <= 1 && member.isActive) {
            return res.status(403).json({
              message: 'Action interdite : la plateforme doit conserver au moins un administrateur actif.',
            });
          }
        }
        member.role = req.body.role;
      }

      if (req.body.name !== undefined) {
        member.name = req.body.name.trim();
      }

      if (req.body.email !== undefined) {
        const normalizedEmail = req.body.email ? req.body.email.trim().toLowerCase() : undefined;
        if (normalizedEmail) {
          const existing = await User.findOne({ email: normalizedEmail, _id: { $ne: member._id } });
          if (existing) {
            return res.status(400).json({ message: 'Cette adresse email est déjà utilisée.' });
          }
        }
        member.email = normalizedEmail;
      }

      if (req.body.phone !== undefined) {
        const normalizedPhone = req.body.phone ? req.body.phone.trim() : undefined;
        if (normalizedPhone) {
          const existing = await User.findOne({ phone: normalizedPhone, _id: { $ne: member._id } });
          if (existing) {
            return res.status(400).json({ message: 'Ce numéro de téléphone est déjà utilisé.' });
          }
        }
        member.phone = normalizedPhone;
      }

      await member.save();

      const memberObj = member.toObject();
      delete (memberObj as any).passwordHash;
      delete (memberObj as any).otp;
      delete (memberObj as any).otpExpires;

      res.json({
        member: memberObj,
        message: 'Informations mises à jour avec succès',
      });
    } catch (error: any) {
      console.error('[Team Routes] Error updating member:', error);
      res.status(500).json({ message: error.message || 'Erreur lors de la mise à jour' });
    }
  }
);

// PUT /api/admin/team/:id/status - Activate or deactivate account
router.put(
  '/:id/status',
  [
    param('id').isMongoId().withMessage('ID invalide'),
    body('isActive').isBoolean().withMessage('Le statut isActive doit être un booléen'),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: errors.array()[0].msg });
      }

      const member = await User.findById(req.params.id);
      if (!member) {
        return res.status(404).json({ message: 'Membre introuvable' });
      }

      const { isActive } = req.body;

      // Safeguards when deactivating
      if (!isActive) {
        // Prevent self-deactivation
        if (member._id.toString() === req.user?._id?.toString()) {
          return res.status(403).json({
            message: 'Action interdite : vous ne pouvez pas désactiver votre propre compte administrateur.',
          });
        }

        // Prevent deactivating last active admin
        if (member.role === 'admin') {
          const activeAdmins = await User.countDocuments({ role: 'admin', isActive: true });
          if (activeAdmins <= 1) {
            return res.status(403).json({
              message: 'Action interdite : impossible de désactiver le dernier administrateur actif de la plateforme.',
            });
          }
        }

        // Revoke active sessions by bumping tokenVersion
        member.tokenVersion = (member.tokenVersion || 0) + 1;
      }

      member.isActive = isActive;
      await member.save();

      const memberObj = member.toObject();
      delete (memberObj as any).passwordHash;

      res.json({
        member: memberObj,
        message: isActive ? 'Compte réactivé avec succès' : 'Compte désactivé avec succès',
      });
    } catch (error: any) {
      console.error('[Team Routes] Error toggling status:', error);
      res.status(500).json({ message: error.message || 'Erreur lors de la modification du statut' });
    }
  }
);

// PUT /api/admin/team/:id/password - Reset / change temporary password
router.put(
  '/:id/password',
  [
    param('id').isMongoId().withMessage('ID invalide'),
    body('password').isLength({ min: 6 }).withMessage('Le mot de passe doit contenir au moins 6 caractères'),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: errors.array()[0].msg });
      }

      const member = await User.findById(req.params.id);
      if (!member) {
        return res.status(404).json({ message: 'Membre introuvable' });
      }

      member.passwordHash = await bcrypt.hash(req.body.password, 10);
      // Invalidate existing sessions so user must log in with new password
      member.tokenVersion = (member.tokenVersion || 0) + 1;

      await member.save();

      res.json({
        message: 'Mot de passe temporaire défini avec succès. Les sessions existantes de ce membre ont été révoquées.',
      });
    } catch (error: any) {
      console.error('[Team Routes] Error resetting password:', error);
      res.status(500).json({ message: error.message || 'Erreur lors de la réinitialisation du mot de passe' });
    }
  }
);

// DELETE /api/admin/team/:id - Delete team member
router.delete(
  '/:id',
  [param('id').isMongoId().withMessage('ID invalide')],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: errors.array()[0].msg });
      }

      const member = await User.findById(req.params.id);
      if (!member) {
        return res.status(404).json({ message: 'Membre introuvable' });
      }

      // Cannot delete self
      if (member._id.toString() === req.user?._id?.toString()) {
        return res.status(403).json({
          message: 'Action interdite : vous ne pouvez pas supprimer votre propre compte.',
        });
      }

      // Cannot delete last admin
      if (member.role === 'admin') {
        const adminCount = await User.countDocuments({ role: 'admin' });
        if (adminCount <= 1) {
          return res.status(403).json({
            message: 'Action interdite : la plateforme doit conserver au moins un compte administrateur.',
          });
        }
      }

      await User.findByIdAndDelete(member._id);

      res.json({ message: 'Membre supprimé avec succès' });
    } catch (error: any) {
      console.error('[Team Routes] Error deleting member:', error);
      res.status(500).json({ message: error.message || 'Erreur lors de la suppression du membre' });
    }
  }
);

export default router;
