/**
 * The rules of the club community (chat, forum, polls and predictions, leaderboard, bracket), kept apart
 * from the screens so they can be tested. The database enforces the same limits (supabase/schema.sql);
 * checking here first gives a clear message instead of a refusal.
 */

export const CHAT_MAX = 500;
export const POST_MAX = 4000;
export const TITLE_MAX = 120;
export const QUESTION_MAX = 200;
export const OPTION_MAX = 60;
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 8;
export const ROUND_LABEL_MAX = 60;
export const BRACKET_MIN = 2;
export const BRACKET_MAX = 16;
export const ENTRANT_MAX = 40;

/** Links are refused everywhere, so nothing can lead a young athlete off the app. Same pattern as the database. */
export function containsLink(text: string): boolean {
  return /(https?:|www\.)/i.test(text);
}

/** A message for text that cannot be posted, or null when it can. */
export function textProblem(text: string, max: number, label = 'Message'): string | null {
  const trimmed = text.trim();
  if (!trimmed) return `${label} cannot be empty.`;
  if (trimmed.length > max) return `${label} can be up to ${max} characters.`;
  if (containsLink(trimmed)) return 'Links are not allowed in the club community. Describe where to find it instead.';
  return null;
}

/** Trims the options, drops blanks and repeats (ignoring case), and keeps at most `limit` (poll options by default). */
export function cleanOptions(raw: readonly string[], max = OPTION_MAX, limit = MAX_OPTIONS): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const option of raw) {
    const value = option.trim().slice(0, max);
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= limit) break;
  }
  return out;
}

// Polls and predictions ----------------------------------------------------------

export type PollKind = 'poll' | 'prediction';

export interface ClubPoll {
  id: string;
  club_id: string;
  author_id: string;
  author_name: string;
  kind: PollKind;
  question: string;
  options: string[];
  closes_at: string;
  correct_option: number | null;
  created_at: string;
  hidden_at: string | null;
}

export interface TallyRow { poll_id: string; option_index: number; votes: number }

export type PollState = 'open' | 'closed' | 'settled';

export function pollState(poll: Pick<ClubPoll, 'closes_at' | 'correct_option'>, now = Date.now()): PollState {
  if (poll.correct_option !== null) return 'settled';
  return Date.parse(poll.closes_at) > now ? 'open' : 'closed';
}

export interface PollCounts { counts: number[]; total: number; leader: number | null }

/** Votes per option for one poll. `leader` is the option in front, or null on a tie or with no votes. */
export function tallyPoll(poll: Pick<ClubPoll, 'id' | 'options'>, rows: readonly TallyRow[]): PollCounts {
  const counts = poll.options.map(() => 0);
  for (const row of rows) {
    if (row.poll_id === poll.id && row.option_index >= 0 && row.option_index < counts.length) counts[row.option_index] += Number(row.votes);
  }
  const total = counts.reduce((sum, value) => sum + value, 0);
  const top = Math.max(0, ...counts);
  const leaders = counts.flatMap((value, index) => (top > 0 && value === top ? [index] : []));
  return { counts, total, leader: leaders.length === 1 ? leaders[0] : null };
}

export interface Standing { display_name: string; correct: number; answered: number }
export interface RankedStanding extends Standing { rank: number }

/** Prediction standings with shared ranks for ties (most right first, then fewest answered, i.e. the better hit rate). */
export function rankStandings(rows: readonly Standing[]): RankedStanding[] {
  const sorted = [...rows].map((row) => ({ ...row, correct: Number(row.correct), answered: Number(row.answered) }))
    .sort((a, b) => b.correct - a.correct || a.answered - b.answered || a.display_name.localeCompare(b.display_name));
  let rank = 0;
  return sorted.map((row, index) => {
    const previous = sorted[index - 1];
    if (!previous || previous.correct !== row.correct || previous.answered !== row.answered) rank = index + 1;
    return { ...row, rank };
  });
}

// Forum -----------------------------------------------------------------------------

export interface ClubPost {
  id: string;
  club_id: string;
  parent_id: string | null;
  author_id: string;
  author_name: string;
  title: string | null;
  body: string;
  created_at: string;
  hidden_at: string | null;
}

export interface Thread { thread: ClubPost; replies: ClubPost[]; lastActivity: string }

/** Threads with their replies in order, the most recently active thread first. Replies to a missing thread are dropped. */
export function groupThreads(posts: readonly ClubPost[]): Thread[] {
  const threads = new Map<string, Thread>();
  for (const post of posts) if (!post.parent_id) threads.set(post.id, { thread: post, replies: [], lastActivity: post.created_at });
  for (const post of [...posts].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const parent = post.parent_id ? threads.get(post.parent_id) : null;
    if (!parent) continue;
    parent.replies.push(post);
    if (post.created_at > parent.lastActivity) parent.lastActivity = post.created_at;
  }
  return [...threads.values()].sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));
}

// Leaderboard -------------------------------------------------------------------------

export interface ClubResult {
  id: string;
  club_id: string;
  author_id: string;
  author_name: string;
  round_label: string;
  score: number;
  max_score: number;
  arrows: number;
  shot_on: string;
  created_at: string;
}

export type BoardPeriod = 'week' | 'month' | 'all';
export type BoardKind = 'best' | 'average' | 'volume';

export interface BoardRow {
  rank: number;
  authorId: string;
  name: string;
  /** Best result, as a percentage of its round's maximum. */
  bestPct: number;
  /** Average of all results in the period, as a percentage of each round's maximum. */
  averagePct: number;
  arrows: number;
  results: number;
}

const DAY_MS = 86_400_000;

/** The first day included for a period (local midnight, as an ISO date), or null for all time. */
export function periodStart(period: BoardPeriod, now = new Date()): string | null {
  if (period === 'all') return null;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === 'week') start.setTime(start.getTime() - ((start.getDay() + 6) % 7) * DAY_MS); // Monday
  else start.setDate(1);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
}

/**
 * The club leaderboard. Results differ in round and size, so each is compared as a percentage of its own
 * maximum. Everything is self-reported by members: it is for friendly competition, not an official ranking.
 */
export function buildLeaderboard(results: readonly ClubResult[], kind: BoardKind, period: BoardPeriod, now = new Date()): BoardRow[] {
  const since = periodStart(period, now);
  const byAuthor = new Map<string, { name: string; pcts: number[]; arrows: number }>();
  for (const result of results) {
    if (since && result.shot_on < since) continue;
    if (!(result.max_score > 0)) continue;
    const entry = byAuthor.get(result.author_id) ?? { name: result.author_name, pcts: [], arrows: 0 };
    entry.pcts.push((result.score / result.max_score) * 100);
    entry.arrows += result.arrows;
    byAuthor.set(result.author_id, entry);
  }
  const rows = [...byAuthor.entries()].map(([authorId, entry]) => ({
    authorId, name: entry.name,
    bestPct: Math.max(...entry.pcts),
    averagePct: entry.pcts.reduce((sum, value) => sum + value, 0) / entry.pcts.length,
    arrows: entry.arrows, results: entry.pcts.length,
  }));
  const value = (row: (typeof rows)[number]) => (kind === 'best' ? row.bestPct : kind === 'average' ? row.averagePct : row.arrows);
  rows.sort((a, b) => value(b) - value(a) || b.results - a.results || a.name.localeCompare(b.name));
  let rank = 0;
  return rows.map((row, index) => {
    if (index === 0 || Math.abs(value(rows[index - 1]) - value(row)) > 1e-9) rank = index + 1;
    return { ...row, rank };
  });
}

// Bracket -----------------------------------------------------------------------------

export interface BracketMatch {
  id: string;
  round: number;
  index: number;
  /** Entrant numbers (positions in the entrants list), or null for an empty slot or a bye. */
  a: number | null;
  b: number | null;
  winner: number | null;
  /** True when one side is a bye, so the other goes through without shooting. */
  bye: boolean;
}

export interface BracketView { rounds: BracketMatch[][]; champion: number | null }

/** Seed positions for a bracket of this size, so the top seeds meet last (0v7, 3v4, 1v6, 2v5 for eight). */
function seedOrder(size: number): number[] {
  let order = [0];
  for (let current = 1; current < size; current *= 2) order = order.flatMap((seed) => [seed, current * 2 - 1 - seed]);
  return order;
}

export const matchId = (round: number, index: number) => `r${round}m${index}`;

/**
 * Lays out a single-elimination bracket for the entrants (in seed order: the first is the top seed) and fills in
 * the winners recorded so far. A recorded winner only counts if they really are in that match, so changing an early
 * result cannot leave a stale one further on.
 */
export function buildBracket(entrantCount: number, winners: Readonly<Record<string, number>> = {}): BracketView {
  const count = Math.max(BRACKET_MIN, Math.min(BRACKET_MAX, entrantCount));
  let size = 2;
  while (size < count) size *= 2;
  const seeds = seedOrder(size).map((seed) => (seed < count ? seed : null));
  const rounds: BracketMatch[][] = [];
  for (let round = 0; size / 2 ** (round + 1) >= 1; round += 1) {
    const matches: BracketMatch[] = [];
    for (let index = 0; index < size / 2 ** (round + 1); index += 1) {
      const previous = rounds[round - 1];
      const a = round === 0 ? seeds[index * 2] : previous[index * 2].winner;
      const b = round === 0 ? seeds[index * 2 + 1] : previous[index * 2 + 1].winner;
      const bye = round === 0 && ((a === null) !== (b === null));
      let winner: number | null = null;
      const recorded = winners[matchId(round, index)];
      if (bye) winner = a ?? b;
      else if (recorded !== undefined && (recorded === a || recorded === b) && a !== null && b !== null) winner = recorded;
      matches.push({ id: matchId(round, index), round, index, a, b, winner, bye });
    }
    rounds.push(matches);
  }
  return { rounds, champion: rounds[rounds.length - 1][0].winner };
}

/** Records (or clears, with null) the winner of a match, and drops any later results that no longer make sense. */
export function setBracketWinner(entrantCount: number, winners: Readonly<Record<string, number>>, id: string, winner: number | null): Record<string, number> {
  const next: Record<string, number> = { ...winners };
  if (winner === null) delete next[id]; else next[id] = winner;
  const view = buildBracket(entrantCount, next);
  const valid: Record<string, number> = {};
  for (const round of view.rounds) for (const match of round) if (match.winner !== null && !match.bye) valid[match.id] = match.winner;
  return valid;
}

/** Splits typed entrants (one per line or comma separated) into clean names, without repeats. */
export function parseEntrants(text: string): string[] {
  return cleanOptions(text.split(/[\n,]/), ENTRANT_MAX, BRACKET_MAX);
}

/** Name of round `round` (0 first) in a bracket with `rounds` rounds: Final, Semi-final, Quarter-final, then Round of N. */
export function roundName(round: number, rounds: number): string {
  const fromEnd = rounds - 1 - round;
  if (fromEnd === 0) return 'Final';
  if (fromEnd === 1) return 'Semi-finals';
  if (fromEnd === 2) return 'Quarter-finals';
  return `Round of ${2 ** (fromEnd + 1)}`;
}
