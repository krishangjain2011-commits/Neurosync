// Unified AI Client (Groq, Gemini, Mistral)

import { Groq } from 'groq-sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const gemini = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY || '');

export type AIProvider = 'groq' | 'gemini' | 'mistral';

export async function generateText(
  prompt: string,
  provider: AIProvider = 'groq'
): Promise<string> {
  try {
    if (provider === 'groq') {
      const message = await groq.messages.create({
        model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });

      return message.content[0].type === 'text' ? message.content[0].text : '';
    }

    if (provider === 'gemini') {
      const model = gemini.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const result = await model.generateContent(prompt);
      return result.response.text();
    }

    return '';
  } catch (error) {
    console.error('AI generation failed:', error);
    return '';
  }
}

export async function getActiveProvider(): Promise<AIProvider> {
  if (process.env.GROQ_API_KEY) return 'groq';
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) return 'gemini';
  return 'groq';
}

export async function visionAnalysis(imageBase64: string): Promise<string> {
  try {
    const message = await groq.messages.create({
      model: process.env.GROQ_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: imageBase64,
              },
            },
            {
              type: 'text',
              text: 'Analyze this image and provide feedback.',
            },
          ],
        },
      ],
    });

    return message.content[0].type === 'text' ? message.content[0].text : '';
  } catch (error) {
    console.error('Vision analysis failed:', error);
    return '';
  }
}
