import type { PracticeLogData } from '../../practice-log/types';
import type { VideoReportSummary } from '../../video-analysis/types';
import { CloudError, type CloudSession, type SupabaseRest } from './supabaseRest';
import type { ReportComment } from './coachReview';

/**
 * Clubs: a volunteer coach follows the athletes of a training ground. Athletes
 * join with an invite code and choose what the coach sees; row-level security
 * and the functions in supabase/schema.sql enforce it. Joining, changing
 * sharing and leaving are database functions, so an athlete can never edit
 * their club, age flag or email on the membership row.
 */

export interface Club {
  id: string;
  name: string;
  coach_id: string;
  created_at: string;
}

export interface ClubMember {
  club_id: string;
  athlete_id: string;
  display_name: string;
  /** Adults only; always null for a minor. */
  athlete_email: string | null;
  is_minor: boolean;
  share_analyses: boolean;
  share_practice_log: boolean;
  joined_at: string;
  left_at: string | null;
}

/** One of the signed-in athlete's memberships, with the club's name. */
export interface MyMembership extends ClubMember {
  club_name: string | null;
}

export interface ClubInvite {
  id: string;
  club_id: string;
  code: string;
  expires_at: string;
  max_uses: number;
  uses: number;
  created_at: string;
}

/** A shared report as the club coach lists it. */
export interface MemberReport {
  id: string;
  user_id: string;
  created_at: string;
  summary: VideoReportSummary;
}

export const CLUB_NAME_MAX = 80;
export const DISPLAY_NAME_MAX = 60;
export const INVITE_CODE_LENGTH = 8;
/** No 0/O or 1/I, so a code read aloud or copied from paper is not mistyped. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const CLUB_COLUMNS = 'id,name,coach_id,created_at';
const MEMBER_COLUMNS = 'club_id,athlete_id,display_name,athlete_email,is_minor,share_analyses,share_practice_log,joined_at,left_at';
const INVITE_COLUMNS = 'id,club_id,code,expires_at,max_uses,uses,created_at';

const eq = (value: string) => `eq.${encodeURIComponent(value)}`;
const inList = (values: string[]) => `in.(${values.map(encodeURIComponent).join(',')})`;

export function generateInviteCode(random: (bytes: Uint8Array<ArrayBuffer>) => Uint8Array = (bytes) => crypto.getRandomValues(bytes)): string {
  const bytes = random(new Uint8Array(INVITE_CODE_LENGTH));
  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
}

/** Upper-cases a typed code and drops spaces and dashes. */
export function normalizeInviteCode(code: string): string {
  return code.toUpperCase().replace(/[\s-]/g, '');
}

export function isInviteActive(invite: ClubInvite, now = Date.now()): boolean {
  return Date.parse(invite.expires_at) > now && invite.uses < invite.max_uses;
}

/** Turns database refusals from the club functions into sentences. */
function clubError(error: unknown): unknown {
  if (error instanceof CloudError && error.status === 404) return new CloudError('This cloud project has no clubs yet. Ask whoever runs this app to run the latest supabase/schema.sql.', 404);
  return error;
}

// Coach ------------------------------------------------------------------------

export async function createClub(client: SupabaseRest, session: CloudSession, name: string): Promise<Club> {
  const trimmed = name.trim();
  if (!trimmed) throw new CloudError('Give the club a name.', 400);
  if (trimmed.length > CLUB_NAME_MAX) throw new CloudError(`Club names can be up to ${CLUB_NAME_MAX} characters.`, 400);
  const rows = await client.insert<Club>('clubs', [{ name: trimmed }], session.accessToken).catch((error: unknown) => { throw clubError(error); });
  if (!rows[0]) throw new CloudError('The club could not be created.', 500);
  return rows[0];
}

/** Clubs the signed-in user coaches, oldest first. */
export async function listMyClubs(client: SupabaseRest, session: CloudSession): Promise<Club[]> {
  return client.select<Club>('clubs', `select=${CLUB_COLUMNS}&coach_id=${eq(session.user.id)}&order=created_at.asc`, session.accessToken)
    .catch((error: unknown) => { throw clubError(error); });
}

export async function createInvite(
  client: SupabaseRest,
  session: CloudSession,
  invite: { clubId: string; days: number; maxUses: number },
  now = Date.now(),
  code = generateInviteCode(),
): Promise<ClubInvite> {
  if (!Number.isInteger(invite.maxUses) || invite.maxUses < 1 || invite.maxUses > 500) throw new CloudError('An invite can be used 1 to 500 times.', 400);
  if (!(invite.days > 0 && invite.days <= 90)) throw new CloudError('An invite can last up to 90 days.', 400);
  const rows = await client.insert<ClubInvite>('club_invites', [{
    club_id: invite.clubId,
    code,
    expires_at: new Date(now + invite.days * 86_400_000).toISOString(),
    max_uses: invite.maxUses,
  }], session.accessToken);
  if (!rows[0]) throw new CloudError('The invite could not be created.', 500);
  return rows[0];
}

export async function listInvites(client: SupabaseRest, session: CloudSession, clubId: string): Promise<ClubInvite[]> {
  return client.select<ClubInvite>('club_invites', `select=${INVITE_COLUMNS}&club_id=${eq(clubId)}&order=created_at.desc`, session.accessToken);
}

export async function deleteInvite(client: SupabaseRest, session: CloudSession, inviteId: string): Promise<void> {
  await client.remove('club_invites', `id=${eq(inviteId)}`, session.accessToken);
}

/** Current members of a club the signed-in user coaches. */
export async function listMembers(client: SupabaseRest, session: CloudSession, clubId: string): Promise<ClubMember[]> {
  return client.select<ClubMember>('club_members', `select=${MEMBER_COLUMNS}&club_id=${eq(clubId)}&left_at=is.null&order=display_name.asc`, session.accessToken);
}

/** Reports the given athletes share with the coach's club, newest first. Row-level security drops any that are not shared. */
export async function listMemberReports(client: SupabaseRest, session: CloudSession, athleteIds: string[]): Promise<MemberReport[]> {
  if (!athleteIds.length) return [];
  return client.select<MemberReport>('video_reports', `select=id,user_id,created_at,summary&user_id=${inList(athleteIds)}&order=created_at.desc&limit=500`, session.accessToken);
}

/** Practice logs the given athletes share with the coach's club. */
export async function listMemberPracticeLogs(client: SupabaseRest, session: CloudSession, athleteIds: string[]): Promise<Map<string, PracticeLogData>> {
  if (!athleteIds.length) return new Map();
  const rows = await client.select<{ user_id: string; data: PracticeLogData | null }>('practice_logs', `select=user_id,data&user_id=${inList(athleteIds)}`, session.accessToken);
  return new Map(rows.filter((row) => row.data && Array.isArray(row.data.entries)).map((row) => [row.user_id, row.data as PracticeLogData]));
}

/** The member who owns a report, if the caller coaches their club; used to label a report opened from My club. */
export async function memberForReport(client: SupabaseRest, session: CloudSession, athleteId: string): Promise<ClubMember | null> {
  const rows = await client.select<ClubMember>('club_members', `select=${MEMBER_COLUMNS}&athlete_id=${eq(athleteId)}&left_at=is.null&share_analyses=is.true&limit=1`, session.accessToken)
    .catch(() => [] as ClubMember[]);
  return rows[0] && rows[0].athlete_id !== session.user.id ? rows[0] : null;
}

/** Comments on a club member's report, with the emails of minors left out by the database. */
export async function listClubComments(client: SupabaseRest, session: CloudSession, reportId: string): Promise<ReportComment[]> {
  return client.rpc<ReportComment[]>('club_report_comments', { p_report_id: reportId }, session.accessToken);
}

// Athlete ----------------------------------------------------------------------

export async function joinClub(
  client: SupabaseRest,
  session: CloudSession,
  join: { code: string; displayName: string; isMinor: boolean; guardianConfirmed: boolean },
): Promise<string> {
  const code = normalizeInviteCode(join.code);
  const displayName = join.displayName.trim();
  if (code.length !== INVITE_CODE_LENGTH) throw new CloudError(`Invite codes have ${INVITE_CODE_LENGTH} letters and numbers.`, 400);
  if (!displayName) throw new CloudError('Enter the name your coach will see.', 400);
  if (displayName.length > DISPLAY_NAME_MAX) throw new CloudError(`Names can be up to ${DISPLAY_NAME_MAX} characters.`, 400);
  if (join.isMinor && !join.guardianConfirmed) throw new CloudError('A parent or guardian must agree before you join a club.', 400);
  try {
    return await client.rpc<string>('join_club', {
      p_code: code,
      p_display_name: displayName,
      p_is_minor: join.isMinor,
      p_guardian_confirmed: join.isMinor && join.guardianConfirmed,
    }, session.accessToken);
  } catch (error) {
    throw clubError(error);
  }
}

/** The signed-in athlete's current memberships, with each club's name. */
export async function listMyMemberships(client: SupabaseRest, session: CloudSession): Promise<MyMembership[]> {
  const rows = await client.select<ClubMember & { clubs: { name: string } | null }>(
    'club_members',
    `select=${MEMBER_COLUMNS},clubs(name)&athlete_id=${eq(session.user.id)}&left_at=is.null&order=joined_at.asc`,
    session.accessToken,
  ).catch((error: unknown) => { throw clubError(error); });
  return rows.map(({ clubs, ...member }) => ({ ...member, club_name: clubs?.name ?? null }));
}

export async function setClubSharing(client: SupabaseRest, session: CloudSession, clubId: string, sharing: { analyses: boolean; practiceLog: boolean }): Promise<void> {
  await client.rpc('set_club_sharing', { p_club_id: clubId, p_share_analyses: sharing.analyses, p_share_practice_log: sharing.practiceLog }, session.accessToken);
}

export async function leaveClub(client: SupabaseRest, session: CloudSession, clubId: string): Promise<void> {
  await client.rpc('leave_club', { p_club_id: clubId }, session.accessToken);
}
