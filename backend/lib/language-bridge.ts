/**
 * NeuroSync — Language Bridge (Bhashini-aligned)
 *
 * Swappable module. Currently passes English through unchanged.
 * To add Bhashini: implement translateToEnglish() and translateFromEnglish()
 * using the Bhashini ULCA API (https://bhashini.gov.in/ulca) and set the
 * env variables below.
 *
 * The Gemini call is ALWAYS made in English (or the model's strongest pivot
 * language) — this module translates in and out around that call so non-English
 * caregivers get native-language responses without degrading AI quality.
 */

const BHASHINI_API_KEY = process.env.BHASHINI_API_KEY;
const BHASHINI_ENDPOINT = process.env.BHASHINI_ENDPOINT ?? "https://dhruva-api.bhashini.gov.in/services/inference/pipeline";

// ISO 639-1 → Bhashini language codes
const BHASHINI_LANG_MAP: Record<string, string> = {
  hi: "hi",   // Hindi
  ta: "ta",   // Tamil
  te: "te",   // Telugu
  kn: "kn",   // Kannada
  ml: "ml",   // Malayalam
  bn: "bn",   // Bengali
  gu: "gu",   // Gujarati
  mr: "mr",   // Marathi
  or: "or",   // Odia
  pa: "pa",   // Punjabi
  ur: "ur",   // Urdu
  as: "as",   // Assamese
};

function isSupportedNonEnglish(lang: string): boolean {
  return lang !== "en" && lang in BHASHINI_LANG_MAP;
}

/**
 * Translate text TO English for the AI call.
 * Returns original text unchanged if lang is 'en' or Bhashini is not configured.
 */
export async function translateToEnglish(
  text: string,
  sourceLang: string
): Promise<string> {
  if (!isSupportedNonEnglish(sourceLang) || !BHASHINI_API_KEY) return text;

  try {
    const res = await fetch(BHASHINI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: BHASHINI_API_KEY,
      },
      body: JSON.stringify({
        pipelineTasks: [
          {
            taskType: "translation",
            config: {
              language: {
                sourceLanguage: BHASHINI_LANG_MAP[sourceLang],
                targetLanguage: "en",
              },
            },
          },
        ],
        inputData: { input: [{ source: text }] },
      }),
    });
    if (!res.ok) throw new Error(`Bhashini HTTP ${res.status}`);
    const data = await res.json();
    const translated =
      data?.pipelineResponse?.[0]?.output?.[0]?.target;
    return translated || text;
  } catch (err) {
    console.warn("[language-bridge] Translation to English failed, using original:", err);
    return text;
  }
}

/**
 * Translate AI response FROM English to the user's language.
 * Returns original text unchanged if lang is 'en' or Bhashini is not configured.
 */
export async function translateFromEnglish(
  text: string,
  targetLang: string
): Promise<string> {
  if (!isSupportedNonEnglish(targetLang) || !BHASHINI_API_KEY) return text;

  try {
    const res = await fetch(BHASHINI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: BHASHINI_API_KEY,
      },
      body: JSON.stringify({
        pipelineTasks: [
          {
            taskType: "translation",
            config: {
              language: {
                sourceLanguage: "en",
                targetLanguage: BHASHINI_LANG_MAP[targetLang],
              },
            },
          },
        ],
        inputData: { input: [{ source: text }] },
      }),
    });
    if (!res.ok) throw new Error(`Bhashini HTTP ${res.status}`);
    const data = await res.json();
    const translated =
      data?.pipelineResponse?.[0]?.output?.[0]?.target;
    return translated || text;
  } catch (err) {
    console.warn("[language-bridge] Translation from English failed, returning English:", err);
    return text;
  }
}

/**
 * Wrap an async AI call with language translation in/out.
 */
export async function withLanguageBridge<T>(
  userLang: string,
  inputText: string,
  aiCall: (translatedInput: string) => Promise<{ text: string; data?: T }>
): Promise<{ text: string; data?: T }> {
  const translated = await translateToEnglish(inputText, userLang);
  const result = await aiCall(translated);
  const localizedText = await translateFromEnglish(result.text, userLang);
  return { ...result, text: localizedText };
}
