import { Router, Request, Response } from 'express';
import { authenticate } from '../lib/auth.js';
import { callMLSidecar } from '../lib/ml-sidecar.js';
import db from '../db/index.js';

const router = Router();

// Get audio cues for child
router.get('/:childId/cues', authenticate, (req: Request, res: Response) => {
  try {
    const { childId } = req.params;
    const cues = db.prepare('SELECT * FROM audio_cues WHERE child_id = ?').all(childId);
    res.json(cues);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch cues' });
  }
});

// Record audio cue
router.post('/:childId/record', authenticate, async (req: Request, res: Response) => {
  try {
    const { childId } = req.params;
    const { audioPath } = req.body;

    // Call ML sidecar for embedding
    const embedding = await callMLSidecar('/embed', { audioPath });

    if (embedding) {
      const cueId = Math.random().toString(36).substring(7);
      db.prepare(
        'INSERT INTO audio_cues (id, child_id, audio_path, embedding) VALUES (?, ?, ?, ?)'
      ).run(cueId, childId, audioPath, JSON.stringify(embedding));

      res.json({ success: true, cueId });
    } else {
      res.status(500).json({ error: 'Failed to process audio' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Recording failed' });
  }
});

export default router;
