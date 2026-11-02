import { Router, Request, Response } from 'express';
import { authenticate } from '../../lib/auth.js';
import { generateText, visionAnalysis } from '../../lib/ai-client.js';

const router = Router();

// AI Chat endpoint
router.post('/chat', authenticate, async (req: Request, res: Response) => {
  try {
    const { message, childId } = req.body;

    if (!message) return res.status(400).json({ error: 'Message required' });

    const response = await generateText(message);
    res.json({ reply: response });
  } catch (error) {
    res.status(500).json({ error: 'AI generation failed' });
  }
});

// Vision analysis for handwriting
router.post('/vision', authenticate, async (req: Request, res: Response) => {
  try {
    const { imageBase64 } = req.body;

    if (!imageBase64) return res.status(400).json({ error: 'Image required' });

    const analysis = await visionAnalysis(imageBase64);
    res.json({ analysis });
  } catch (error) {
    res.status(500).json({ error: 'Vision analysis failed' });
  }
});

export default router;
