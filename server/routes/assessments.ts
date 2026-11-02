import { Router, Request, Response } from 'express';
import { authenticate } from '../../lib/auth.js';
import db from '../../db/index.js';
import { randomBytes } from 'crypto';
import {
  validateAnswers,
  validateScore,
  validateChildId,
  validateAssessmentId,
  validateResultId,
  sanitizeAnswers,
} from '../../lib/validators/assessmentValidator.js';

const router = Router();

// Helper to get user from request
function getUserId(req: Request): string {
  return (req as any).user?.id || 'unknown';
}

// Helper to format validation errors
function formatValidationErrors(errors: string[]): string {
  return errors.join('; ');
}

// Helper to generate secure result ID
function generateResultId(): string {
  return randomBytes(6).toString('hex');
}

// Get assessments
router.get('/', authenticate, (req: Request, res: Response) => {
  try {
    const assessments = db
      .prepare('SELECT * FROM assessment_results ORDER BY started_at DESC LIMIT 100')
      .all();
    res.json(assessments);
  } catch (error) {
    console.error('Error fetching assessments:', error);
    res.status(500).json({ error: 'Failed to fetch assessments' });
  }
});

// Get assessment results for a child
router.get('/child/:childId', authenticate, (req: Request, res: Response) => {
  try {
    const { childId } = req.params;

    // Validate childId
    const childValidation = validateChildId(childId);
    if (!childValidation.isValid) {
      return res.status(400).json({
        error: 'Invalid child ID',
        details: formatValidationErrors(childValidation.errors),
      });
    }

    const results = db
      .prepare(
        'SELECT * FROM assessment_results WHERE child_id = ? ORDER BY started_at DESC LIMIT 100'
      )
      .all(childId);

    res.json(results);
  } catch (error) {
    console.error('Error fetching child assessments:', error);
    res.status(500).json({ error: 'Failed to fetch assessment results' });
  }
});

// Get single assessment result
router.get('/results/:resultId', authenticate, (req: Request, res: Response) => {
  try {
    const { resultId } = req.params;

    // Validate resultId
    const validation = validateResultId(resultId);
    if (!validation.isValid) {
      return res.status(400).json({
        error: 'Invalid result ID format',
        details: formatValidationErrors(validation.errors),
      });
    }

    const result = db.prepare('SELECT * FROM assessment_results WHERE id = ?').get(resultId);

    if (!result) {
      return res.status(404).json({ error: 'Assessment result not found' });
    }

    res.json(result);
  } catch (error) {
    console.error('Error fetching assessment result:', error);
    res.status(500).json({ error: 'Failed to fetch assessment result' });
  }
});

// Start assessment
router.post('/:assessmentId/start', authenticate, (req: Request, res: Response) => {
  try {
    const { assessmentId } = req.params;
    const { childId } = req.body;
    const userId = getUserId(req);

    // Validate assessmentId
    const assessmentValidation = validateAssessmentId(assessmentId);
    if (!assessmentValidation.isValid) {
      return res.status(400).json({
        error: 'Invalid assessment ID',
        details: formatValidationErrors(assessmentValidation.errors),
      });
    }

    // Validate childId
    const childValidation = validateChildId(childId);
    if (!childValidation.isValid) {
      return res.status(400).json({
        error: 'Invalid child ID',
        details: formatValidationErrors(childValidation.errors),
      });
    }

    // Verify child exists
    const child = db.prepare('SELECT id FROM children WHERE id = ?').get(childId);
    if (!child) {
      return res.status(404).json({ error: 'Child not found' });
    }

    // Generate unique result ID
    const resultId = generateResultId();

    // Insert new assessment result
    db.prepare(
      `INSERT INTO assessment_results 
       (id, assessment_id, child_id, started_at, started_by) 
       VALUES (?, ?, ?, datetime('now'), ?)`
    ).run(resultId, assessmentId, childId, userId);

    res.json({ resultId });
  } catch (error) {
    console.error('Error starting assessment:', error);
    res.status(500).json({ error: 'Failed to start assessment' });
  }
});

// Submit assessment result
router.post('/:resultId/submit', authenticate, (req: Request, res: Response) => {
  try {
    const { resultId } = req.params;
    const { answers, score } = req.body;

    // Validate resultId
    const resultValidation = validateResultId(resultId);
    if (!resultValidation.isValid) {
      return res.status(400).json({
        error: 'Invalid result ID format',
        details: formatValidationErrors(resultValidation.errors),
      });
    }

    // Check that result exists and get assessment info
    const existing: any = db
      .prepare('SELECT id, assessment_id FROM assessment_results WHERE id = ?')
      .get(resultId);

    if (!existing) {
      return res.status(404).json({ error: 'Assessment result not found' });
    }

    // Validate answers
    const answersValidation = validateAnswers(answers, existing.assessment_id);
    if (!answersValidation.isValid) {
      return res.status(400).json({
        error: 'Invalid answers',
        details: formatValidationErrors(answersValidation.errors),
      });
    }

    // Validate score
    const scoreValidation = validateScore(score, existing.assessment_id);
    if (!scoreValidation.isValid) {
      return res.status(400).json({
        error: 'Invalid score',
        details: formatValidationErrors(scoreValidation.errors),
      });
    }

    // Sanitize answers to consistent format
    const sanitized = sanitizeAnswers(answers as Record<string, unknown>);

    // Update with answers and score
    db.prepare(
      `UPDATE assessment_results 
       SET answers = ?, score = ?, completed_at = datetime('now') 
       WHERE id = ?`
    ).run(JSON.stringify(sanitized), score, resultId);

    res.json({ success: true, resultId });
  } catch (error) {
    console.error('Error submitting assessment:', error);
    res.status(500).json({ error: 'Failed to submit assessment' });
  }
});

export default router;
