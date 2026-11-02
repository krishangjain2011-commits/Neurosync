import { Router, Request, Response } from 'express';
import { authenticate, requireRole } from '../../lib/auth.js';
import db from '../../db/index.js';

const router = Router();

// Get all students (school/teacher view)
router.get('/', authenticate, requireRole('teacher', 'admin'), (req: Request, res: Response) => {
  try {
    const students = db.prepare('SELECT * FROM children').all();
    res.json(students);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch students' });
  }
});

// Get student progress
router.get('/:studentId/progress', authenticate, (req: Request, res: Response) => {
  try {
    const { studentId } = req.params;
    const progress = db.prepare('SELECT * FROM progress_metrics WHERE child_id = ?').all(studentId);
    res.json(progress);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch progress' });
  }
});

export default router;
