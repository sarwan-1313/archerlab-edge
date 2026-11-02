import {
  CHAT_MAX, POST_MAX, QUESTION_MAX, ROUND_LABEL_MAX, TITLE_MAX, cleanOptions, textProblem,
  type ClubPoll, type ClubPost, type ClubResult, type PollKind, type Standing, type TallyRow,
} from '../../community/community';
import { CloudError, type CloudSession, type SupabaseRest } from './supabaseRest';

/**
 * The club community over the cloud project (chat, forum, polls and predictions, results, bracket, moderation).
 * Every call goes through row-level security and the functions in supabase/schema.sql, so only a club's members
 * and coach can read or post, whatever this code does.
 */

export interface ChatMessage {
  id: string;
  club_id: string;
  author_id: string;
  author_name: string;
  body: string;
  created_at: string;
  hidden_at: string | null;
}

export interface ClubBracket {
  id: string;
  club_id: string;
  title: string;
  entrants: string[];
  winners: Record<string, number>;
  created_at: string;
}

export interface ClubReport {
  id: string;
  club_id: string;
  item_table: ReportTable;
  item_id: string;
  item_author_id: string | null;
  item_author_name: string | null;
  excerpt: string | null;
  reason: string;
  created_at: string;
}

export interface MemberMute { athlete_id: string; display_name: string; muted: boolean }

export type ReportTable = 'club_chat' | 'club_posts' | 'club_polls';
export type DeletableTable = ReportTable | 'club_results' | 'club_brackets';

const eq = (value: string) => `eq.${encodeURIComponent(value)}`;
const CHAT_COLUMNS = 'id,club_id,author_id,author_name,body,created_at,hidden_at';
const POST_COLUMNS = 'id,club_id,parent_id,author_id,author_name,title,body,created_at,hidden_at';
const POLL_COLUMNS = 'id,club_id,author_id,author_name,kind,question,options,closes_at,correct_option,created_at,hidden_at';
const RESULT_COLUMNS = 'id,club_id,author_id,author_name,round_label,score,max_score,arrows,shot_on,created_at';

/** Sentences for the refusals the database gives. */
export function communityError(error: unknown): unknown {
  if (error instanceof CloudError) {
    if (error.status === 404) return new CloudError('Community is not set up on this cloud project yet. Ask whoever runs this app to run the latest supabase/schema.sql.', 404);
    if (error.status === 429 || /too quickly/i.test(error.message)) return new CloudError('You are posting too quickly. Wait a moment and try again.', 429);
    if (error.status === 403 || /row-level security|not a member|cannot vote/i.test(error.message)) return new CloudError('You cannot post in this club right now. You may have been muted, or you may have left the club.', 403);
    if (error.status === 409) return new CloudError('That has already been done.', 409);
  }
  return error;
}

async function run<T>(work: Promise<T>): Promise<T> {
  try { return await work; } catch (error) { throw communityError(error); }
}

const refuse = (message: string | null) => { if (message) throw new CloudError(message, 400); };

// Chat -------------------------------------------------------------------------

/** The latest messages, oldest first. Members never receive messages the coach has hidden. */
export async function listChat(client: SupabaseRest, session: CloudSession, clubId: string, limit = 80): Promise<ChatMessage[]> {
  const rows = await run(client.select<ChatMessage>('club_chat', `select=${CHAT_COLUMNS}&club_id=${eq(clubId)}&order=created_at.desc&limit=${limit}`, session.accessToken));
  return rows.reverse();
}

export async function sendChat(client: SupabaseRest, session: CloudSession, clubId: string, body: string): Promise<ChatMessage> {
  refuse(textProblem(body, CHAT_MAX));
  const rows = await run(client.insert<ChatMessage>('club_chat', [{ club_id: clubId, body: body.trim() }], session.accessToken));
  return rows[0];
}

// Forum ------------------------------------------------------------------------

export async function listPosts(client: SupabaseRest, session: CloudSession, clubId: string): Promise<ClubPost[]> {
  return run(client.select<ClubPost>('club_posts', `select=${POST_COLUMNS}&club_id=${eq(clubId)}&order=created_at.desc&limit=400`, session.accessToken));
}

export async function createThread(client: SupabaseRest, session: CloudSession, clubId: string, title: string, body: string): Promise<ClubPost> {
  refuse(textProblem(title, TITLE_MAX, 'The title'));
  refuse(textProblem(body, POST_MAX));
  const rows = await run(client.insert<ClubPost>('club_posts', [{ club_id: clubId, title: title.trim(), body: body.trim() }], session.accessToken));
  return rows[0];
}

export async function createReply(client: SupabaseRest, session: CloudSession, clubId: string, threadId: string, body: string): Promise<ClubPost> {
  refuse(textProblem(body, POST_MAX));
  const rows = await run(client.insert<ClubPost>('club_posts', [{ club_id: clubId, parent_id: threadId, body: body.trim() }], session.accessToken));
  return rows[0];
}

// Polls and predictions -------------------------------------------------------------

export async function listPolls(client: SupabaseRest, session: CloudSession, clubId: string): Promise<ClubPoll[]> {
  return run(client.select<ClubPoll>('club_polls', `select=${POLL_COLUMNS}&club_id=${eq(clubId)}&order=created_at.desc&limit=100`, session.accessToken));
}

export async function createPoll(
  client: SupabaseRest,
  session: CloudSession,
  poll: { clubId: string; kind: PollKind; question: string; options: string[]; closesAt: Date },
): Promise<ClubPoll> {
  refuse(textProblem(poll.question, QUESTION_MAX, 'The question'));
  const options = cleanOptions(poll.options);
  if (options.length < 2) throw new CloudError('Give at least two different options.', 400);
  for (const option of options) refuse(textProblem(option, 60, 'An option'));
  if (!(poll.closesAt.getTime() > Date.now())) throw new CloudError('Choose a closing time in the future.', 400);
  const rows = await run(client.insert<ClubPoll>('club_polls', [{ club_id: poll.clubId, kind: poll.kind, question: poll.question.trim(), options, closes_at: poll.closesAt.toISOString() }], session.accessToken));
  return rows[0];
}

export async function pollTally(client: SupabaseRest, session: CloudSession, clubId: string): Promise<TallyRow[]> {
  const rows = await run(client.rpc<TallyRow[]>('club_poll_tally', { p_club_id: clubId }, session.accessToken));
  return rows.map((row) => ({ ...row, votes: Number(row.votes) }));
}

/** The signed-in member's own picks: poll id to option index. */
export async function myVotes(client: SupabaseRest, session: CloudSession, clubId: string): Promise<Map<string, number>> {
  const rows = await run(client.select<{ poll_id: string; option_index: number }>('club_poll_votes', `select=poll_id,option_index&club_id=${eq(clubId)}&voter_id=${eq(session.user.id)}`, session.accessToken));
  return new Map(rows.map((row) => [row.poll_id, row.option_index]));
}

/** Casts or changes a vote (allowed until the poll closes). */
export async function castVote(client: SupabaseRest, session: CloudSession, pollId: string, optionIndex: number): Promise<void> {
  await run(client.insert('club_poll_votes', [{ poll_id: pollId, option_index: optionIndex }], session.accessToken, 'poll_id,voter_id'));
}

export async function settlePrediction(client: SupabaseRest, session: CloudSession, pollId: string, optionIndex: number): Promise<void> {
  await run(client.rpc('resolve_club_prediction', { p_poll_id: pollId, p_option: optionIndex }, session.accessToken));
}

export async function closePoll(client: SupabaseRest, session: CloudSession, pollId: string): Promise<void> {
  await run(client.rpc('close_club_poll', { p_poll_id: pollId }, session.accessToken));
}

export async function predictionStandings(client: SupabaseRest, session: CloudSession, clubId: string): Promise<Standing[]> {
  return run(client.rpc<Standing[]>('club_prediction_standings', { p_club_id: clubId }, session.accessToken));
}

// Leaderboard -------------------------------------------------------------------------

export async function listResults(client: SupabaseRest, session: CloudSession, clubId: string): Promise<ClubResult[]> {
  return run(client.select<ClubResult>('club_results', `select=${RESULT_COLUMNS}&club_id=${eq(clubId)}&order=shot_on.desc&limit=1000`, session.accessToken));
}

export async function shareResult(
  client: SupabaseRest,
  session: CloudSession,
  result: { clubId: string; roundLabel: string; score: number; maxScore: number; arrows: number; shotOn: string },
): Promise<ClubResult> {
  refuse(textProblem(result.roundLabel, ROUND_LABEL_MAX, 'The round name'));
  if (!Number.isInteger(result.score) || !Number.isInteger(result.maxScore) || !Number.isInteger(result.arrows)) throw new CloudError('Score, maximum and arrows must be whole numbers.', 400);
  if (result.maxScore < 1 || result.score < 0 || result.score > result.maxScore) throw new CloudError('The score must be between 0 and the round’s maximum.', 400);
  if (result.arrows < 1 || result.arrows > 400) throw new CloudError('Arrows must be between 1 and 400.', 400);
  const rows = await run(client.insert<ClubResult>('club_results', [{ club_id: result.clubId, round_label: result.roundLabel.trim(), score: result.score, max_score: result.maxScore, arrows: result.arrows, shot_on: result.shotOn }], session.accessToken));
  return rows[0];
}

// Bracket -------------------------------------------------------------------------------

export async function listBrackets(client: SupabaseRest, session: CloudSession, clubId: string): Promise<ClubBracket[]> {
  return run(client.select<ClubBracket>('club_brackets', `select=id,club_id,title,entrants,winners,created_at&club_id=${eq(clubId)}&order=created_at.desc&limit=20`, session.accessToken));
}

export async function createBracket(client: SupabaseRest, session: CloudSession, clubId: string, title: string, entrants: string[]): Promise<ClubBracket> {
  refuse(textProblem(title, 80, 'The title'));
  if (entrants.length < 2 || entrants.length > 16) throw new CloudError('A bracket needs 2 to 16 entrants.', 400);
  const rows = await run(client.insert<ClubBracket>('club_brackets', [{ club_id: clubId, title: title.trim(), entrants }], session.accessToken));
  return rows[0];
}

export async function saveBracketWinners(client: SupabaseRest, session: CloudSession, bracketId: string, winners: Record<string, number>): Promise<void> {
  await run(client.update('club_brackets', `id=${eq(bracketId)}`, { winners }, session.accessToken));
}

// Moderation and housekeeping ---------------------------------------------------------------

export async function deleteItem(client: SupabaseRest, session: CloudSession, table: DeletableTable, id: string): Promise<void> {
  await run(client.remove(table, `id=${eq(id)}`, session.accessToken));
}

/** Coach only: hides an item from members (or shows it again). */
export async function setItemHidden(client: SupabaseRest, session: CloudSession, table: ReportTable, id: string, hidden: boolean): Promise<void> {
  await run(client.rpc('set_club_item_hidden', { p_table: table, p_id: id, p_hidden: hidden }, session.accessToken));
}

export async function reportItem(client: SupabaseRest, session: CloudSession, clubId: string, table: ReportTable, id: string, reason = ''): Promise<void> {
  await run(client.insert('club_reports', [{ club_id: clubId, item_table: table, item_id: id, reason: reason.trim().slice(0, 300) }], session.accessToken));
}

export async function listReports(client: SupabaseRest, session: CloudSession, clubId: string): Promise<ClubReport[]> {
  return run(client.select<ClubReport>('club_reports', `select=id,club_id,item_table,item_id,item_author_id,item_author_name,excerpt,reason,created_at&club_id=${eq(clubId)}&order=created_at.desc&limit=100`, session.accessToken));
}

export async function clearReport(client: SupabaseRest, session: CloudSession, reportId: string): Promise<void> {
  await run(client.remove('club_reports', `id=${eq(reportId)}`, session.accessToken));
}

/** Coach only: the club's members with whether each is muted. */
export async function listMuteStates(client: SupabaseRest, session: CloudSession, clubId: string): Promise<MemberMute[]> {
  return run(client.select<MemberMute>('club_members', `select=athlete_id,display_name,muted&club_id=${eq(clubId)}&left_at=is.null&order=display_name.asc`, session.accessToken));
}

export async function setMemberMuted(client: SupabaseRest, session: CloudSession, clubId: string, athleteId: string, muted: boolean): Promise<void> {
  await run(client.rpc('set_club_member_muted', { p_club_id: clubId, p_athlete_id: athleteId, p_muted: muted }, session.accessToken));
}
