/**
 * NeuroSync — AI Client Abstraction
 *
 * Provider priority (first available key wins):
 *   1. Groq  — free tier, no credit card, 14,400 req/day
 *              models: llama-3.3-70b-versatile, mixtral-8x7b-32768
 *   2. Google Gemini — free tier, 1,500 req/day
 *              model: gemini-2.5-flash-lite
 *
 * Set GROQ_API_KEY in .env for Groq (recommended).
 * Set GEMINI_API_KEY in .env for Gemini fallback.
 * Both can be set simultaneously — Groq is tried first.
 *
 * Get a free Groq key at: https://console.groq.com
 * Get a free Gemini key at: https://aistudio.google.com/apikey
 */

import Groq from "groq-sdk";
import { GoogleGenAI } from "@google/genai";

export const SYSTEM_INSTRUCTION =
  "You are NeuroSync, an AI Digital Caretaker for Autism, ADHD, and Dyslexia. " +
  "Provide concise, structured support for behavioral de-escalation, therapy scheduling, " +
  "diet planning, and homeschooling. Prioritize safety and empathy. " +
  "Never provide a medical diagnosis or contradict a treating clinician; always frame " +
  "suggestions as supportive, non-clinical guidance and encourage professional " +
  "consultation for medical decisions.";

// ── Provider detection ─────────────────────────────────────────────────────

export type Provider = "groq" | "gemini";

export function getActiveProvider(): Provider {
  if (process.env.GROQ_API_KEY) return "groq";
  if (process.env.GEMINI_API_KEY) return "gemini";
  throw new Error(
    "No AI API key configured. Set GROQ_API_KEY (free at console.groq.com) " +
    "or GEMINI_API_KEY (free at aistudio.google.com/apikey) in your .env file."
  );
}

// ── Groq client ────────────────────────────────────────────────────────────

// Free models on Groq — llama-3.3-70b is the strongest free option
const GROQ_MODEL = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";

function getGroq(): Groq {
  return new Groq({ apiKey: process.env.GROQ_API_KEY });
}

// ── Gemini client ──────────────────────────────────────────────────────────

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash-lite";

function getGenAI(): GoogleGenAI {
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
}

// ── Unified: generate text ─────────────────────────────────────────────────

export async function generateText(prompt: string): Promise<string> {
  const provider = getActiveProvider();

  if (provider === "groq") {
    const groq = getGroq();
    const res = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: SYSTEM_INSTRUCTION },
        { role: "user",   content: prompt },
      ],
      temperature: 0.4,
      max_tokens: 2048,
    });
    return res.choices[0]?.message?.content ?? "";
  }

  // Gemini fallback
  const genai = getGenAI();
  const result = await genai.models.generateContent({
    model: GEMINI_MODEL,
    config: { systemInstruction: SYSTEM_INSTRUCTION },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });
  return result.text ?? "";
}

// ── Unified: structured JSON ───────────────────────────────────────────────

export async function generateStructured(prompt: string): Promise<string> {
  const provider = getActiveProvider();

  if (provider === "groq") {
    const groq = getGroq();
    const res = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: SYSTEM_INSTRUCTION + " Always respond with valid JSON only. No markdown, no explanation outside the JSON." },
        { role: "user",   content: prompt + "\n\nRespond with JSON only." },
      ],
      temperature: 0.2,  // lower temp = more deterministic JSON
      max_tokens: 4096,
      response_format: { type: "json_object" },
    });
    return res.choices[0]?.message?.content ?? "{}";
  }

  // Gemini fallback
  const genai = getGenAI();
  const result = await genai.models.generateContent({
    model: GEMINI_MODEL,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
    },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });
  return result.text ?? "{}";
}

// ── Unified: chat history (for streaming chat page) ────────────────────────

export type ChatMessage = { role: "user" | "assistant"; content: string };

export async function* streamChat(
  messages: ChatMessage[],
  contextStr?: string
): AsyncGenerator<string> {
  const provider = getActiveProvider();
  const lastMsg  = messages[messages.length - 1];
  const userText = contextStr
    ? `[Child profile: ${contextStr}]\n\n${lastMsg.content}`
    : lastMsg.content;

  if (provider === "groq") {
    const groq = getGroq();
    const history = messages.slice(0, -1).map(m => ({
      role:    m.role as "user" | "assistant",
      content: m.content,
    }));

    const stream = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: SYSTEM_INSTRUCTION },
        ...history,
        { role: "user", content: userText },
      ],
      temperature: 0.5,
      max_tokens: 2048,
      stream: true,
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content;
      if (text) yield text;
    }
    return;
  }

  // Gemini streaming fallback
  const genai = getGenAI();
  const chat = genai.chats.create({
    model: GEMINI_MODEL,
    config: { systemInstruction: SYSTEM_INSTRUCTION },
    history: messages.slice(0, -1).map(m => ({
      role: m.role,
      parts: [{ text: m.content }],
    })),
  });

  const stream = await chat.sendMessageStream({ message: userText });
  for await (const chunk of stream) {
    if (chunk.text) yield chunk.text;
  }
}
