import type { VideoAnalysisReport } from '../../video-analysis/types';
import { buildCoachRequest, parseCoachReview, type CoachReview } from './coachReview';
import { PROVIDERS, buildRequest, describeHttpError, extractText, type CloudProviderId, type MediaPart } from './providers';

export interface ProviderSetting {
  provider: CloudProviderId;
  apiKey: string;
  model: string;
  /** Gemini only: send the whole clip instead of stills when it is small enough. */
  sendVideo?: boolean;
}

export type ProviderOutcome =
  | { provider: CloudProviderId; status: 'ok'; review: CoachReview }
  | { provider: CloudProviderId; status: 'failed'; error: string };

const TIMEOUT_MS = 120_000;

async function callProvider(setting: ProviderSetting, report: VideoAnalysisReport, stills: MediaPart[], video: MediaPart | null, signal: AbortSignal): Promise<ProviderOutcome> {
  const { provider } = setting;
  const useVideo = Boolean(setting.sendVideo && video && PROVIDERS[provider].supportsVideo && video.base64.length * 0.75 < PROVIDERS[provider].maxInlineBytes);
  const media = useVideo && video ? [video] : stills;
  const request = buildRequest(provider, setting.model.trim() || PROVIDERS[provider].defaultModel, setting.apiKey.trim(), buildCoachRequest(report, media));
  const timeout = new AbortController();
  const timer = window.setTimeout(() => timeout.abort(), TIMEOUT_MS);
  const onAbort = () => timeout.abort();
  signal.addEventListener('abort', onAbort);
  try {
    const response = await fetch(request.url, { ...request.init, signal: timeout.signal });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) return { provider, status: 'failed', error: describeHttpError(provider, response.status, body) };
    const text = extractText(provider, body);
    if (!text) return { provider, status: 'failed', error: `${PROVIDERS[provider].name} returned an empty answer.` };
    return { provider, status: 'ok', review: parseCoachReview(provider, setting.model, text, useVideo) };
  } catch (error) {
    if (signal.aborted) return { provider, status: 'failed', error: 'Cancelled.' };
    if (timeout.signal.aborted) return { provider, status: 'failed', error: `${PROVIDERS[provider].name} took too long to answer.` };
    if (error instanceof Error && /readable review/.test(error.message)) return { provider, status: 'failed', error: `${PROVIDERS[provider].name}'s answer could not be read as a review. Try again or another model.` };
    return { provider, status: 'failed', error: `Could not reach ${PROVIDERS[provider].name}. Check your connection, key and model name.` };
  } finally {
    window.clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
  }
}

/** Asks every enabled provider in parallel; one failing never blocks the others. */
export async function runCloudReview(settings: ProviderSetting[], report: VideoAnalysisReport, stills: MediaPart[], video: MediaPart | null, signal: AbortSignal): Promise<ProviderOutcome[]> {
  return Promise.all(settings.map((setting) => callProvider(setting, report, stills, video, signal)));
}
