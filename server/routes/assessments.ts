import { Router, Request, Response } from 'express';
import { authenticate } from '../../lib/auth.js';
import db from '../../db/index.js';

const router = Router();

// Get assessments
router.get('/', authenticate, (req: Request, res: Response) => {
  try {
    const assessments = db.prepare('SELECT * FROM assessments').all();
    res.json(assessments);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch assessments' });
  }
});

// Start assessment
router.post('/:assessmentId/start', authenticate, (req: Request, res: Response) => {
  try {
    const { assessmentId } = req.params;
    const { childId } = req.body;
    const userId = (req as any).user?.id;

    const resultId = Math.random().toString(36).substring(7);
    db.prepare(
      'INSERT INTO assessment_results (id, assessment_id, child_id, started_at, started_by) VALUES (?, ?, ?, datetime("now"), ?)'
    ).run(resultId, assessmentId, childId, userId);

    res.json({ resultId });
  } catch (error) {
    res.status(500).json({ error: 'Failed to start assessment' });
  }
});

// Submit assessment result
router.post('/:resultId/submit', authenticate, (req: Request, res: Response) => {
  try {
    const { resultId } = req.params;
    const { answers, score } = req.body;

    db.prepare(
      'UPDATE assessment_results SET answers = ?, score = ?, completed_at = datetime("now") WHERE id = ?'
    ).run(JSON.stringify(answers), score, resultId);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to submit assessment' });
  }
});

export default router;
