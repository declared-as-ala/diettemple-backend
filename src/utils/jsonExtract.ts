/**
 * Robust JSON extraction from OpenRouter/LLM response (same style as gym).
 * Handles: raw JSON, JSON inside ```json ... ```, extra text before/after.
 */

export function extractJsonObject<T = Record<string, unknown>>(raw: string): T | null {
  if (!raw || typeof raw !== 'string') return null;
  let text = raw.trim();
  // Strip markdown code fences
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) text = fenceMatch[1].trim();
  // Find first complete {...} object (greedy match then trim from end if parse fails)
  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (!objectMatch) return null;
  let candidate = objectMatch[0];
  for (let i = 0; i < 50; i++) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      if (candidate.length <= 2) return null;
      const lastBrace = candidate.lastIndexOf('}');
      if (lastBrace <= 0) return null;
      candidate = candidate.slice(0, lastBrace + 1);
    }
  }
  return null;
}
