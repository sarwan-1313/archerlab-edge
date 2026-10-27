import { buildCoachRequest, parseCoachReview, type CoachReview } from '../cloud/ai/coachReview';
import type { VideoAnalysisReport } from '../video-analysis/types';
import type { ChatMessage, Completion, LocalEngine } from './engine';
import { LOCAL_MODEL } from './model';

/** Thrown when the athlete pressed Stop, so callers can tell it from a failure. */
export class LocalCoachStopped extends Error {
  constructor() {
    super('Stopped.');
    this.name = 'LocalCoachStopped';
  }
}

const REVIEW_TOKENS = 900;
const ANSWER_TOKENS = 400;
/** The model's window must hold the prompt and its answer; this much is kept free as a safety margin for the rough token estimate. */
const MARGIN_TOKENS = 250;

/** A cautious guess (a token is usually 3–4 characters), used only to keep the prompt inside the window. */
export const estimateTokens = (text: string): number => Math.ceil(text.length / 3);

/** The review's shape, enforced while the model writes so a small model cannot drift from it. */
export const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    level: { enum: ['beginner', 'intermediate', 'advanced', 'elite'] },
    confidence: { type: 'number' },
    summary: { type: 'string' },
    strengths: { type: 'array', items: { type: 'string' }, maxItems: 3 },
    improvements: {
      type: 'array',
      maxItems: 4,
      items: {
        type: 'object',
        properties: { title: { type: 'string' }, detail: { type: 'string' }, drill: { type: 'string' }, priority: { type: 'integer' } },
        required: ['title', 'detail', 'drill', 'priority'],
      },
    },
    disagreements: { type: 'array', items: { type: 'string' }, maxItems: 2 },
    safety: { type: 'array', items: { type: 'string' }, maxItems: 2 },
  },
  required: ['level', 'confidence', 'summary', 'strengths', 'improvements', 'disagreements', 'safety'],
} as const;

/** The cloud prompt describes still frames; this model gets none, so say so plainly. */
const NO_IMAGES = `

In this conversation there are NO images and NO video, only the measurements in the message. Ignore anything above about frames or what you can see. Do not describe what the athlete looks like. Only use numbers that appear in the measurements. If the measurements are too thin to judge something, leave that out.`;

/** The review request: the same measurements-only prompt the cloud coaches get, minus images. */
export function buildLocalReviewMessages(report: VideoAnalysisReport): ChatMessage[] {
  const request = buildCoachRequest(report, []);
  return [
    { role: 'system', content: request.system + NO_IMAGES },
    { role: 'user', content: request.prompt },
  ];
}

function check(result: Completion): string {
  if (result.stopped) throw new LocalCoachStopped();
  if (result.truncated) throw new Error('The private coach ran out of room before finishing. Try again.');
  return result.text;
}

/** Asks the on-device model for a review of the report, in the same shape as the cloud coaches' reviews. */
export async function runLocalReview(engine: LocalEngine, report: VideoAnalysisReport, onText?: (text: string) => void): Promise<CoachReview> {
  const result = await engine.complete(buildLocalReviewMessages(report), { maxTokens: REVIEW_TOKENS, temperature: 0.3, jsonSchema: REVIEW_SCHEMA, onText });
  const review = parseCoachReview('local', LOCAL_MODEL.name, check(result), false);
  if (!review.summary && !review.improvements.length) throw new Error('The private coach did not give usable advice. Try again.');
  return review;
}

// ---------- Follow-up questions ----------

export interface ChatTurn { role: 'user' | 'assistant'; content: string }

const CHAT_RULES = `You are an encouraging archery coach answering an athlete's follow-up questions about ONE video analysis report.

Rules:
- Use ONLY the report data below. Never invent measurements, shots, scores or events that are not in it.
- If the report does not contain what is needed to answer, say so plainly and suggest what to film or measure next time.
- You cannot see the video. Do not describe what the athlete looks like.
- Keep answers short and practical: at most 4 sentences, or a few bullet points. Plain text, no JSON.
- Keep advice safe. Never suggest increasing draw weight. For pain or injury, suggest a qualified coach or doctor.
- If asked about anything unrelated to this report or to archery form, say you can only discuss this report.`;

function briefReview(review: CoachReview | null): string {
  if (!review) return '';
  const lines = ['', 'Your earlier review of this report:'];
  if (review.summary) lines.push(review.summary);
  review.improvements.forEach((item) => lines.push(`- ${item.title}: ${item.detail}`));
  return lines.join('\n');
}

/** The system message for chat: the rules, then the report's measurements (and the earlier review when there is room). */
export function buildChatSystem(report: VideoAnalysisReport, review: CoachReview | null): string {
  const base = `${CHAT_RULES}\n\n=== REPORT DATA ===\n${buildCoachRequest(report, []).prompt}`;
  const room = LOCAL_MODEL.contextTokens - ANSWER_TOKENS - MARGIN_TOKENS - 200;
  const withReview = base + briefReview(review);
  return estimateTokens(withReview) <= room ? withReview : base;
}

/** The messages to send: the system message, as much recent conversation as fits, then the new question. */
export function buildChatMessages(system: string, history: readonly ChatTurn[], question: string): ChatMessage[] {
  const budget = LOCAL_MODEL.contextTokens - ANSWER_TOKENS - MARGIN_TOKENS;
  let used = estimateTokens(system) + estimateTokens(question);
  if (used > budget) throw new Error('This report is too long for the private coach to discuss. Ask a shorter question, or use one of the cloud coaches.');
  const kept: ChatTurn[] = [];
  // Newest first, so the oldest turns are the ones dropped.
  for (let index = history.length - 1; index >= 0; index -= 1) {
    used += estimateTokens(history[index].content);
    if (used > budget) break;
    kept.unshift(history[index]);
  }
  // A reply without the question that prompted it only confuses the model.
  while (kept.length && kept[0].role === 'assistant') kept.shift();
  return [{ role: 'system', content: system }, ...kept, { role: 'user', content: question }];
}

export interface FollowUpAnswer { text: string; truncated: boolean; stopped: boolean }

/** Answers one follow-up question from the report. The partial answer is kept when stopped. */
export async function askFollowUp(engine: LocalEngine, system: string, history: readonly ChatTurn[], question: string, onText?: (text: string) => void): Promise<FollowUpAnswer> {
  const result = await engine.complete(buildChatMessages(system, history, question), { maxTokens: ANSWER_TOKENS, temperature: 0.4, onText });
  return { text: result.text.trim(), truncated: result.truncated, stopped: result.stopped };
}
