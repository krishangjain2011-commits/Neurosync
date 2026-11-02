import { Router, Request, Response } from 'express';
import { authenticate } from '../../lib/auth.js';
import db from '../../db/index.js';

const router = Router();

// Get teaching modules
router.get('/modules', authenticate, async (req: Request, res: Response) => {
  try {
    const modules = db.prepare('SELECT * FROM teaching_modules').all();
    res.json(modules);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch modules' });
  }
});

// Create lesson plan
router.post('/lesson-plan', authenticate, async (req: Request, res: Response) => {
  try {
    const { childId, moduleId, adaptations } = req.body;
    const userId = (req as any).user?.id;

    if (!userId || !childId) return res.status(400).json({ error: 'Missing parameters' });

    const lessonId = Math.random().toString(36).substring(7);
    db.prepare(
      'INSERT INTO lesson_plans (id, child_id, module_id, adaptations, created_by) VALUES (?, ?, ?, ?, ?)'
    ).run(lessonId, childId, moduleId, JSON.stringify(adaptations), userId);

    res.json({ lessonId });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create lesson plan' });
  }
});

export default router;
