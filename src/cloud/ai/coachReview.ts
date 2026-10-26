import { CATEGORY_INFO, METRIC_RUBRIC, formatMetric } from '../../video-analysis/rubric';
import { LEVEL_LABEL } from '../../video-analysis/scoring';
import type { MetricKey, SkillLevel, VideoAnalysisReport } from '../../video-analysis/types';
import type { CloudProviderId, CoachRequest, MediaPart } from './providers';

export interface CoachImprovement {
  title: string;
  detail: string;
  drill: string;
  priority: number;
}

export interface CoachReview {
  provider: CloudProviderId;
  model: string;
  level: SkillLevel | null;
  confidence: number | null;
  summary: string;
  strengths: string[];
  improvements: CoachImprovement[];
  disagreements: string[];
  safety: string[];
  usedVideo: boolean;
}

const SYSTEM = `You are an experienced, encouraging archery coach reviewing an athlete's shooting form.
You will receive still frames from the athlete's video (or the video itself), with a pose skeleton drawn on the stills: cyan = bow arm, orange = draw arm, gold rings = areas the on-device analysis flagged. You will also receive measurements from ArcherLab's on-device analysis engine.

Rules:
- Base your feedback on what you can actually see and on the measurements given. Never invent numbers.
- If the images are unclear or the camera angle hides something, say so instead of guessing.
- The athlete may be young. Keep advice safe and practical. Never suggest increasing draw weight; suggest a qualified coach for pain or injury concerns.
- Be specific: say what to change, why it matters, and one drill to practise it.
- Where you disagree with the on-device measurements, say so and explain why.
Respond with ONLY a JSON object, no markdown, matching exactly:
{"level":"beginner|intermediate|advanced|elite","confidence":0.0,"summary":"2-3 sentences","strengths":["..."],"improvements":[{"title":"...","detail":"...","drill":"...","priority":1}],"disagreements":["..."],"safety":["..."]}
Use at most 4 improvements, ordered by priority (1 = most important).`;

function metricLine(key: MetricKey, value: number, confidence: number): string {
  const rubric = METRIC_RUBRIC[key];
  return `- ${rubric.label}: ${formatMetric(key, value)} (confidence ${Math.round(confidence * 100)}%)`;
}

/** Builds the coaching prompt from a finished on-device report. */
export function buildCoachRequest(report: VideoAnalysisReport, media: MediaPart[]): CoachRequest {
  const session = report.scores;
  const lines: string[] = [
    `Bow type: ${report.settings.bowType}. Drawing hand: ${report.settings.handedness}. Camera view: ${report.view.kind}.`,
    `Clip length: ${report.source.durationS.toFixed(1)} s. Shots detected: ${report.shots.length}${report.letDowns.length ? `, let-downs: ${report.letDowns.length}` : ''}.`,
    `On-device estimate: ${session.overall === null ? 'not enough data' : `${Math.round(session.overall)}/100 (${LEVEL_LABEL[session.level ?? 'beginner']}, ${session.confidence} confidence)`}.`,
    '',
    'Category scores (0–100):',
    ...session.categories.filter((category) => category.score !== null).map((category) => `- ${CATEGORY_INFO[category.id].label}: ${Math.round(category.score as number)}`),
    '',
    'Per-shot measurements (median across shots):',
  ];
  const keys = new Set<MetricKey>();
  report.shots.forEach((shot) => (Object.keys(shot.metrics) as MetricKey[]).forEach((key) => keys.add(key)));
  for (const key of keys) {
    const values = report.shots.map((shot) => shot.metrics[key]).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
    if (!values.length) continue;
    const sorted = [...values].sort((a, b) => a.value - b.value);
    const middle = sorted[Math.floor(sorted.length / 2)];
    lines.push(metricLine(key, middle.value, middle.confidence));
  }
  const sessionKeys = Object.entries(report.session) as Array<[MetricKey, { value: number; confidence: number }]>;
  if (sessionKeys.length) {
    lines.push('', 'Consistency across shots:');
    for (const [key, entry] of sessionKeys) lines.push(metricLine(key, entry.value, entry.confidence));
  }
  if (report.findings.length) {
    lines.push('', 'On-device findings (worst first):');
    for (const finding of report.findings.slice(0, 6)) lines.push(`- ${finding.title} (${finding.severity}): ${finding.observed}`);
  }
  if (report.audio?.available) {
    const timed = report.shots.filter((shot) => shot.audio?.releaseOnset !== undefined).length;
    lines.push('', `Audio: release sounds matched for ${timed} shot(s).`);
  }
  lines.push('', media.some((part) => part.kind === 'video')
    ? 'The full video is attached. Review the whole shot cycle.'
    : `${media.length} still frame(s) are attached, captioned with the shot and moment.`);
  return { system: SYSTEM, prompt: lines.join('\n'), media };
}

const LEVELS: SkillLevel[] = ['beginner', 'intermediate', 'advanced', 'elite'];

/** Extracts the first JSON object from model text (tolerates code fences and preambles). */
export function extractJsonObject(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  try { return JSON.parse(cleaned); } catch { /* fall through */ }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { /* fall through */ }
  }
  return null;
}

const strings = (value: unknown, limit: number): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim()).slice(0, limit) : [];

/** Validates a model's JSON into a CoachReview, dropping anything malformed. */
export function parseCoachReview(provider: CloudProviderId, model: string, text: string, usedVideo: boolean): CoachReview {
  const data = extractJsonObject(text) as Record<string, unknown> | null;
  if (!data || typeof data !== 'object') throw new Error('The model did not return a readable review.');
  const level = typeof data.level === 'string' && LEVELS.includes(data.level.toLowerCase() as SkillLevel) ? data.level.toLowerCase() as SkillLevel : null;
  const confidence = typeof data.confidence === 'number' && Number.isFinite(data.confidence) ? Math.min(1, Math.max(0, data.confidence)) : null;
  const improvements = (Array.isArray(data.improvements) ? data.improvements : [])
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null && typeof (item as { title?: unknown }).title === 'string')
    .map((item, index) => ({
      title: String(item.title).trim(),
      detail: typeof item.detail === 'string' ? item.detail.trim() : '',
      drill: typeof item.drill === 'string' ? item.drill.trim() : '',
      priority: typeof item.priority === 'number' && Number.isFinite(item.priority) ? item.priority : index + 1,
    }))
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 5);
  return {
    provider,
    model,
    level,
    confidence,
    summary: typeof data.summary === 'string' ? data.summary.trim() : '',
    strengths: strings(data.strengths, 5),
    improvements,
    disagreements: strings(data.disagreements, 4),
    safety: strings(data.safety, 3),
    usedVideo,
  };
}

export interface Consensus {
  level: SkillLevel | null;
  levelVotes: Partial<Record<SkillLevel, number>>;
  agreed: Array<{ title: string; detail: string; drill: string; votes: number; providers: CloudProviderId[] }>;
}

const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'your', 'at', 'in', 'on', 'with', 'is', 'too', 'more', 'during', 'after', 'before', 'keep']);
function words(text: string): Set<string> {
  return new Set(text.toLowerCase().replace(/[^a-z\s-]/g, ' ').split(/\s+/).filter((word) => word.length > 2 && !STOP.has(word)).map((word) => word.replace(/s$/, '')));
}
function similarity(a: Set<string>, b: Set<string>): number {
  const shared = [...a].filter((word) => b.has(word)).length;
  return shared / Math.max(1, Math.min(a.size, b.size));
}

/** Combines several coaches (and the on-device estimate) into one view. */
export function buildConsensus(reviews: readonly CoachReview[], onDeviceLevel: SkillLevel | null): Consensus {
  const levelVotes: Partial<Record<SkillLevel, number>> = {};
  for (const review of reviews) if (review.level) levelVotes[review.level] = (levelVotes[review.level] ?? 0) + 1;
  if (onDeviceLevel) levelVotes[onDeviceLevel] = (levelVotes[onDeviceLevel] ?? 0) + 1;
  const ranked = (Object.entries(levelVotes) as Array<[SkillLevel, number]>).sort((a, b) => b[1] - a[1] || LEVELS.indexOf(a[0]) - LEVELS.indexOf(b[0]));
  let level: SkillLevel | null = ranked[0]?.[0] ?? null;
  if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) {
    // Tie: take the median of all votes.
    const ordinals = ranked.flatMap(([name, count]) => Array(count).fill(LEVELS.indexOf(name)) as number[]).sort((a, b) => a - b);
    level = LEVELS[ordinals[Math.floor((ordinals.length - 1) / 2)]];
  }
  const clusters: Array<{ title: string; detail: string; drill: string; keys: Set<string>; providers: Set<CloudProviderId>; priority: number }> = [];
  for (const review of reviews) {
    for (const item of review.improvements) {
      const keys = words(`${item.title} ${item.detail}`);
      const match = clusters.find((cluster) => similarity(cluster.keys, words(item.title)) >= 0.5 || similarity(cluster.keys, keys) >= 0.45);
      if (match) {
        match.providers.add(review.provider);
        keys.forEach((key) => match.keys.add(key));
        match.priority = Math.min(match.priority, item.priority);
      } else {
        clusters.push({ title: item.title, detail: item.detail, drill: item.drill, keys, providers: new Set([review.provider]), priority: item.priority });
      }
    }
  }
  const agreed = [...clusters]
    .sort((a, b) => b.providers.size - a.providers.size || a.priority - b.priority)
    .slice(0, 6)
    .map((cluster) => ({ title: cluster.title, detail: cluster.detail, drill: cluster.drill, votes: cluster.providers.size, providers: [...cluster.providers] }));
  return { level, levelVotes, agreed };
}
