/**
 * AI Routes
 * Handles AI chat, structured generation, and emergency support
 */

import express from "express";
import db from "../../db/index.js";
import { authenticate, requireRole } from "../../lib/auth.js";
import { translateToEnglish, translateFromEnglish } from "../../lib/language-bridge.js";
import { generateText, generateStructured, streamChat } from "../../lib/ai-client.js";

const router = express.Router();

// Self-healing JSON repair with telemetry
function repairJson(raw: string, endpoint: string): { result: string; repaired: boolean } {
  let s = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const original = s;
  const opens: string[] = [];
  const pairs: Record<string, string> = { "{": "}", "[": "]" };
  const closes = new Set(["}", "]"]);
  
  for (const ch of s) {
    if (pairs[ch]) opens.push(pairs[ch]);
    else if (closes.has(ch) && opens[opens.length - 1] === ch) opens.pop();
  }
  
  const quoteCount = (s.match(/(?<!\\)"/g) || []).length;
  if (quoteCount % 2 !== 0) s += '"';
  s = s.replace(/,\s*([\]}])/g, "$1");
  while (opens.length) s += opens.pop();
  
  const repaired = s !== original;
  if (repaired) {
    db.prepare("INSERT INTO ai_repair_log (endpoint, repaired) VALUES (?,1)").run(endpoint);
    console.warn(`[AI] JSON repair triggered on ${endpoint}`);
  }
  
  return { result: s, repaired };
}

/**
 * POST /api/gemini/stream
 * Stream AI chat responses
 */
router.post("/gemini/stream", authenticate, async (req, res) => {
  const { messages, context } = req.body;
  if (!messages?.length) return res.status(400).json({ error: "messages required" });

  const { preferredLanguage } = (req as any).sessionUser;

  try {
    const msgs = [...messages];
    const lastIdx = msgs.length - 1;
    msgs[lastIdx] = {
      ...msgs[lastIdx],
      content: await translateToEnglish(msgs[lastIdx].content, preferredLanguage),
    };

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const contextStr = context ? JSON.stringify(context) : undefined;
    for await (const chunk of streamChat(msgs, contextStr)) {
      res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
    }
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err: any) {
    console.error("[ai/stream]", err);
    if (!res.headersSent) res.status(500).json({ error: err.message || "Stream failed" });
  }
});

/**
 * POST /api/gemini/structured
 * Generate structured JSON responses
 */
router.post("/gemini/structured", authenticate, async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: "prompt required" });
  
  const { preferredLanguage } = (req as any).sessionUser;

  try {
    const translatedPrompt = await translateToEnglish(prompt, preferredLanguage);
    const raw = await generateStructured(translatedPrompt);
    const { result: repaired } = repairJson(raw, "/api/gemini/structured");

    try {
      res.json(JSON.parse(repaired));
    } catch {
      res.status(422).json({ error: "Model returned unparseable JSON", raw });
    }
  } catch (err: any) {
    console.error("[ai/structured]", err);
    res.status(500).json({ error: err.message || "Structured generation failed" });
  }
});

/**
 * POST /api/gemini/emergency
 * Emergency support with location-aware guidance
 */
router.post("/gemini/emergency", authenticate, async (req, res) => {
  const { lat, lng, concern } = req.body;
  if (!concern) return res.status(400).json({ error: "concern required" });
  
  const { preferredLanguage } = (req as any).sessionUser;

  try {
    const locationCtx = lat && lng ? `The caregiver is at coordinates: ${lat}, ${lng}. ` : "";
    const englishConcern = await translateToEnglish(concern, preferredLanguage);
    const prompt =
      `${locationCtx}A caregiver in India needs urgent support for a child with neurodevelopmental needs. ` +
      `Concern: "${englishConcern}". ` +
      `Provide: 1) Immediate calm-down steps (numbered list), ` +
      `2) When to seek emergency medical help, ` +
      `3) Key Indian emergency helplines (112 Police/Ambulance, 108 Ambulance, CHILDLINE 1098), ` +
      `4) Advice on reaching a pediatric specialist in India. Keep under 400 words.`;

    const english = await generateText(prompt);
    const text = await translateFromEnglish(english, preferredLanguage);
    res.json({ text });
  } catch (err: any) {
    console.error("[ai/emergency]", err);
    res.status(500).json({ error: err.message || "Emergency query failed" });
  }
});

export default router;
