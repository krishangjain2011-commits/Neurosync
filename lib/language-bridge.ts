// Translation Bridge for i18n (Bhashini integration)

const translations: Record<string, Record<string, string>> = {
  'en': {
    'hello': 'Hello',
    'welcome': 'Welcome to NeuroSync',
    'submit': 'Submit',
    'cancel': 'Cancel',
  },
  'hi': {
    'hello': 'नमस्ते',
    'welcome': 'NeuroSync में आपका स्वागत है',
    'submit': 'जमा करें',
    'cancel': 'रद्द करें',
  },
  'mr': {
    'hello': 'नमस्कार',
    'welcome': 'NeuroSync मध्ये आपले स्वागत आहे',
    'submit': 'सबमिट करा',
    'cancel': 'रद्द करा',
  },
};

export function translateToEnglish(text: string, lang: string): string {
  // Placeholder for Bhashini API integration
  return text;
}

export function translateFromEnglish(text: string, lang: string): string {
  // Simple translation lookup
  return translations[lang]?.[text.toLowerCase()] || text;
}

export function getSupportedLanguages(): string[] {
  return ['en', 'hi', 'mr'];
}
