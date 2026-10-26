import { GoogleGenAI } from '@google/genai';

export const GEMINI_MODELS = {
  fast: 'gemini-2.5-flash',
  pro: 'gemini-2.5-pro',
} as const;

/**
 * サーバー専用。GEMINI_API_KEY が未設定の場合は null を返し、
 * 呼び出し側はローカル採点/シミュレーションにフォールバックする。
 */
export function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.startsWith('your-')) return null;
  return new GoogleGenAI({ apiKey });
}
