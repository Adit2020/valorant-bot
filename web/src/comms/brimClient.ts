import { BrimRequestSchema, BrimResponseSchema, type BrimResponse } from '../../../shared/schema.js';

export interface ReplyResult { response: BrimResponse; source: 'local' | 'openai' }

export async function requestReply(transcript: string, signal: AbortSignal): Promise<ReplyResult> {
  const response = await fetch('/api/brim', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(BrimRequestSchema.parse({ transcript })),
    signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
    throw new Error(body?.error?.message ? `${body.error.code}: ${body.error.message}` : `API request failed (${response.status}).`);
  }
  const parsed = BrimResponseSchema.parse(await response.json());
  if (parsed.actions.length || parsed.needs !== null || !parsed.reply.trim() || parsed.reply.trim().split(/\s+/u).length > 12) {
    throw new Error('Invalid voice-only Brim response.');
  }
  const source = response.headers.get('X-Brim-Source');
  if (source !== 'local' && source !== 'openai') throw new Error('Response source is missing.');
  return { response: parsed, source };
}
