// Claude reads one keyword-matched email and says whether it is a change that could justify a VO.
import Anthropic from 'npm:@anthropic-ai/sdk@0.135.0';
import { ANALYSIS_SCHEMA, SYSTEM_PROMPT, parseAnalysis, type Analysis } from './rules.ts';

export const MODEL = 'claude-opus-5-5';

let client: Anthropic | null = null;
export function claudeConfigured() { return !!Deno.env.get('ANTHROPIC_API_KEY'); }

// Errors that should stop this scan (and retry the same page next time) rather than skip the email.
export class StopScan extends Error {}

export async function analyseEmail(prompt: string): Promise<{ analysis: Analysis | null; model: string }> {
  if (!client) client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });
  try {
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 8000,
      betas: ['server-side-fallback-2026-07-01'],
      // On a safety decline the API re-runs the request on Anthropic's recommended fallback model.
      fallbacks: 'default',
      system: SYSTEM_PROMPT,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: ANALYSIS_SCHEMA } },
      messages: [{ role: 'user', content: prompt }],
      // deno-lint-ignore no-explicit-any
    } as any);
    if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') return { analysis: null, model: res.model };
    const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    return { analysis: parseAnalysis(text), model: res.model };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new StopScan('Claude rejected the API key (ANTHROPIC_API_KEY)');
    if (err instanceof Anthropic.PermissionDeniedError) throw new StopScan(`Claude: ${err.message}`);
    if (err instanceof Anthropic.RateLimitError) throw new StopScan('Claude rate limit reached; the next scan will continue');
    if (err instanceof Anthropic.BadRequestError) return { analysis: null, model: MODEL }; // this email only
    if (err instanceof Anthropic.APIError) throw new StopScan(`Claude API error ${err.status ?? ''}: ${err.message}`);
    throw new StopScan(`Claude unreachable: ${err instanceof Error ? err.message : String(err)}`);
  }
}
