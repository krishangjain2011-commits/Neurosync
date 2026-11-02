import { Router, Request, Response } from 'express';
import { authenticate } from '../../lib/auth.js';
import db from '../../db/index.js';

const router = Router();

// Get user profile
router.get('/profile', authenticate, (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    res.json(user || { error: 'User not found' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Update user profile
router.put('/profile', authenticate, (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { name, email, preferences } = req.body;

    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    db.prepare('UPDATE users SET name = ?, email = ?, preferences = ? WHERE id = ?').run(
      name,
      email,
      JSON.stringify(preferences),
      userId
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Get user children
router.get('/children', authenticate, (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const children = db.prepare('SELECT * FROM children WHERE parent_id = ?').all(userId);
    res.json(children);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch children' });
  }
});

export default router;
