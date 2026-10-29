import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { describeCloudError } from '../cloud/account/cloudSync';
import { memberLabel, summarizeRoster, type RosterRow, type RosterSummary } from '../cloud/account/clubRoster';
import {
  CLUB_NAME_MAX, DISPLAY_NAME_MAX, createClub, createInvite, deleteInvite, isInviteActive, joinClub, leaveClub, listInvites, listMemberPracticeLogs,
  listMemberReports, listMembers, listMyClubs, listMyMemberships, setClubSharing, type Club, type ClubInvite, type MyMembership,
} from '../cloud/account/clubs';
import type { CloudSession, SupabaseRest } from '../cloud/account/supabaseRest';
import { useCloudAccount } from '../cloud/account/useCloudAccount';
import { ActionButton } from '../components/ActionButton';
import { AppIcon } from '../components/AppIcon';
import { PageHeader } from '../components/PageHeader';
import { formatDate } from '../video-analysis/format';
import { LEVEL_LABEL } from '../video-analysis/scoring';
import '../styles/video.css';

/**
 * Clubs: athletes join a coach's club with an invite code and choose what the
 * coach sees; a coach follows the athletes who share with the club. Everything
 * here needs the optional account; access is enforced by row-level security.
 */

type ClubPageProps = {
  onProfile?: () => void;
  onPrivacy?: () => void;
  /** Opens a member's shared report in Video Analysis (with comments). */
  onOpenReport?: (reportId: string) => void;
};

type Api = { client: SupabaseRest; freshSession: () => Promise<CloudSession | null> };

const EXPIRED = 'Your sign-in has expired. Sign in again on your Profile page.';

/** What the coach can and cannot see; shown before joining and next to each membership. */
function WhatTheCoachSees({ isMinor }: { isMinor: boolean }) {
  return (
    <ul className="club-explainer">
      <li><AppIcon name="check" size={16} /> <span><strong>Always:</strong> the name you enter below{isMinor ? '' : ' and your sign-in email'} and the date you joined.{isMinor ? ' Because you are under 18, your email is never shown to the coach.' : ''}</span></li>
      <li><AppIcon name="film" size={16} /> <span><strong>Only if you turn on “Share my analyses with my club”:</strong> the video reports you back up to your account (form scores, estimated level, focus areas, shot timings and the clip’s file name), and comments on them. The coach can comment too. They never see your videos, and cannot change or delete anything.</span></li>
      <li><AppIcon name="calendar" size={16} /> <span><strong>Only if you turn on “Share my practice log with my club”:</strong> your backed-up practice log, used to show your arrows and sessions per week.</span></li>
      <li><AppIcon name="close" size={16} /> <span><strong>Never:</strong> anything that is only on this device, your profile, other club members’ data, or anything after you leave.</span></li>
    </ul>
  );
}

function JoinForm({ api, onJoined }: { api: Api; onJoined: () => void }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [isMinor, setIsMinor] = useState<boolean | null>(null);
  const [guardian, setGuardian] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const ready = code.trim() && name.trim() && isMinor !== null && understood && (!isMinor || guardian);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready || isMinor === null) return;
    setBusy(true);
    setStatus(null);
    try {
      const session = await api.freshSession();
      if (!session) { setStatus(EXPIRED); return; }
      await joinClub(api.client, session, { code, displayName: name, isMinor, guardianConfirmed: guardian });
      setCode('');
      setUnderstood(false);
      setGuardian(false);
      setStatus('You joined the club. Sharing is off: turn it on below when you are ready.');
      onJoined();
    } catch (error) {
      setStatus(describeCloudError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="va-panel training-form" onSubmit={(event) => void submit(event)} aria-labelledby="club-join-title">
      <h2 id="club-join-title"><AppIcon name="plus" size={20} /> Join a club</h2>
      <p className="va-muted">Your coach gives you an invite code. Before you join, here is what they will be able to see.</p>
      <div className="training-form__grid">
        <label><span>Invite code</span><input value={code} onChange={(event) => setCode(event.target.value)} autoComplete="off" autoCapitalize="characters" placeholder="ABCD2345" maxLength={12} disabled={busy} /></label>
        <label><span>Name your coach will see</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={DISPLAY_NAME_MAX} placeholder="e.g. Asha K." disabled={busy} /></label>
      </div>
      <fieldset className="club-age" disabled={busy}>
        <legend>How old are you?</legend>
        <label className="va-toggle"><input type="radio" name="club-age" checked={isMinor === false} onChange={() => setIsMinor(false)} /><span>18 or over</span></label>
        <label className="va-toggle"><input type="radio" name="club-age" checked={isMinor === true} onChange={() => setIsMinor(true)} /><span>Under 18</span></label>
      </fieldset>
      {isMinor !== null ? <WhatTheCoachSees isMinor={isMinor} /> : null}
      {isMinor ? (
        <label className="va-toggle va-consent"><input type="checkbox" checked={guardian} disabled={busy} onChange={(event) => setGuardian(event.target.checked)} /><span>A parent or guardian has agreed to me joining this club.<small>Ask them before you tick this. They can help you decide what to share.</small></span></label>
      ) : null}
      <label className="va-toggle va-consent"><input type="checkbox" checked={understood} disabled={busy} onChange={(event) => setUnderstood(event.target.checked)} /><span>I understand what the coach will see.<small>Sharing starts off. You can change it or leave the club at any time.</small></span></label>
      {status ? <p className="va-import-status" role="status">{status}</p> : null}
      <div className="va-actions">
        <ActionButton variant="primary" type="submit" disabled={busy || !ready}><AppIcon name="check" size={16} /> {busy ? 'Joining…' : 'Join club'}</ActionButton>
      </div>
    </form>
  );
}

function MembershipCard({ api, membership, onChanged }: { api: Api; membership: MyMembership; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const clubName = membership.club_name ?? 'your club';

  const run = async (action: (session: CloudSession) => Promise<void>, done: string) => {
    setBusy(true);
    setStatus(null);
    try {
      const session = await api.freshSession();
      if (!session) { setStatus(EXPIRED); return; }
      await action(session);
      setStatus(done);
      onChanged();
    } catch (error) {
      setStatus(describeCloudError(error));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (key: 'analyses' | 'practiceLog', on: boolean) => {
    const sharing = { analyses: membership.share_analyses, practiceLog: membership.share_practice_log, [key]: on };
    const what = key === 'analyses' ? 'analyses' : 'practice log';
    void run((session) => setClubSharing(api.client, session, membership.club_id, sharing), on ? `Your coach can now see your backed-up ${what}.` : `Your coach can no longer see your ${what}.`);
  };

  const leave = () => {
    if (!window.confirm(`Leave ${clubName}?\n\nYour coach will stop seeing you, your reports and your practice log at once. Comments already written stay on your reports. You can rejoin later with a new invite code.`)) return;
    void run((session) => leaveClub(api.client, session, membership.club_id), `You left ${clubName}.`);
  };

  return (
    <section className="va-panel club-membership" aria-labelledby={`club-${membership.club_id}`}>
      <h2 id={`club-${membership.club_id}`}><AppIcon name="user" size={20} /> {clubName} <small>joined {formatDate(Date.parse(membership.joined_at))} as {membership.display_name}</small></h2>
      <label className="va-toggle"><input type="checkbox" checked={membership.share_analyses} disabled={busy} onChange={(event) => toggle('analyses', event.target.checked)} /><span>Share my analyses with my club<small>Your coach sees the video reports you back up to your account, and can comment on them. Never your videos.</small></span></label>
      <label className="va-toggle"><input type="checkbox" checked={membership.share_practice_log} disabled={busy} onChange={(event) => toggle('practiceLog', event.target.checked)} /><span>Share my practice log with my club<small>Your coach sees arrows and sessions per week from the practice log you back up on your Profile page.</small></span></label>
      <details className="club-details"><summary>What the coach sees</summary><WhatTheCoachSees isMinor={membership.is_minor} /></details>
      {status ? <p className="va-import-status" role="status">{status}</p> : null}
      <div className="va-actions"><ActionButton variant="danger" type="button" disabled={busy} onClick={leave}>Leave club</ActionButton></div>
    </section>
  );
}

function AthleteSection({ api }: { api: Api }) {
  const [memberships, setMemberships] = useState<MyMembership[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    void api.freshSession().then((session) => (session ? listMyMemberships(api.client, session) : []))
      .then((rows) => { if (!cancelled) setMemberships(rows); })
      .catch((error: unknown) => { if (!cancelled) setStatus(describeCloudError(error)); });
    return () => { cancelled = true; };
  }, [api, revision]);

  return (
    <>
      {status ? <p className="va-import-status" role="alert">{status}</p> : null}
      {memberships?.map((membership) => <MembershipCard key={membership.club_id} api={api} membership={membership} onChanged={refresh} />)}
      <JoinForm api={api} onJoined={refresh} />
    </>
  );
}

function Sparkline({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return <span className="va-faint">{values.length ? values[0].toFixed(0) : '--'}</span>;
  const low = Math.min(...values);
  const high = Math.max(...values);
  const step = 100 / (values.length - 1);
  const path = values.map((value, index) => `${index ? 'L' : 'M'}${(index * step).toFixed(2)} ${(18 - ((value - low) / Math.max(1e-9, high - low)) * 16).toFixed(2)}`).join(' ');
  return (
    <svg className="club-spark" viewBox="0 0 100 20" preserveAspectRatio="none" role="img" aria-label={`${label}: ${values.map((value) => value.toFixed(0)).join(', ')}`}>
      <path d={path} className="training-chart__line" />
    </svg>
  );
}

function trendLabel(trend: number | null): string {
  if (trend === null) return '';
  if (Math.abs(trend) < 1) return 'steady';
  return `${trend > 0 ? '+' : '−'}${Math.abs(trend).toFixed(0)}`;
}

function RosterTable({ summary, selected, onSelect }: { summary: RosterSummary; selected: string | null; onSelect: (athleteId: string) => void }) {
  return (
    <ul className="club-roster" aria-label="Athletes">
      {summary.rows.map((row) => (
        <li key={row.member.athlete_id}>
          <button type="button" className={`club-roster__row${selected === row.member.athlete_id ? ' is-selected' : ''}`} aria-expanded={selected === row.member.athlete_id} onClick={() => onSelect(row.member.athlete_id)}>
            <span className="club-roster__name"><strong>{memberLabel(row.member)}</strong><small>{row.member.share_analyses ? `${row.reports.length} shared report${row.reports.length === 1 ? '' : 's'}` : 'Not sharing analyses'}</small></span>
            <span><small>Level</small><strong>{row.latestLevel ? LEVEL_LABEL[row.latestLevel] : '--'}</strong></span>
            <span className="club-roster__trend"><small>Form score {trendLabel(row.formTrend)}</small><Sparkline values={row.formScores} label={`${row.member.display_name}'s form scores`} /></span>
            <span>{row.volume ? <><small>This week</small><strong>{row.volume.arrowsThisWeek} arrows</strong><small>{row.volume.sessionsThisWeek} session{row.volume.sessionsThisWeek === 1 ? '' : 's'}</small></> : <><small>This week</small><small>Log not shared</small></>}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function AthleteReports({ row, onOpenReport }: { row: RosterRow; onOpenReport?: (reportId: string) => void }) {
  return (
    <section className="va-panel" aria-labelledby="club-athlete-title">
      <h2 id="club-athlete-title"><AppIcon name="film" size={20} /> {memberLabel(row.member)} <small>shared reports</small></h2>
      {!row.member.share_analyses ? <p className="va-muted">{row.member.display_name} has not turned on sharing their analyses with the club.</p>
        : !row.reports.length ? <p className="va-muted">Nothing shared yet. Reports appear here once {row.member.display_name} backs them up to their account.</p>
          : (
            <ul className="va-share__list">
              {row.reports.map((report) => (
                <li key={report.id}>
                  <span><strong>{report.summary.fileName}</strong><small>{formatDate(report.summary.createdAt)} · {report.summary.shots} shots · form {report.summary.overall ?? '--'}{report.summary.level ? ` · ${LEVEL_LABEL[report.summary.level]}` : ''}{report.summary.focus.length ? ` · focus: ${report.summary.focus.slice(0, 2).join(', ')}` : ''}</small></span>
                  <ActionButton variant="secondary" type="button" onClick={() => onOpenReport?.(report.id)}>Open and comment</ActionButton>
                </li>
              ))}
            </ul>
          )}
      <p className="va-faint">Form scores and levels are unvalidated estimates from movement only.</p>
    </section>
  );
}

function InvitePanel({ api, club }: { api: Api; club: Club }) {
  const [invites, setInvites] = useState<ClubInvite[]>([]);
  const [days, setDays] = useState(14);
  const [maxUses, setMaxUses] = useState(30);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const session = await api.freshSession();
    if (session) setInvites(await listInvites(api.client, session, club.id));
  }, [api, club.id]);

  useEffect(() => { refresh().catch((error: unknown) => setStatus(describeCloudError(error))); }, [refresh]);

  const run = async (action: (session: CloudSession) => Promise<unknown>) => {
    setBusy(true);
    setStatus(null);
    try {
      const session = await api.freshSession();
      if (!session) { setStatus(EXPIRED); return; }
      await action(session);
      await refresh();
    } catch (error) {
      setStatus(describeCloudError(error));
    } finally {
      setBusy(false);
    }
  };

  const active = invites.filter((invite) => isInviteActive(invite));
  return (
    <section className="va-panel" aria-labelledby="club-invites-title">
      <h2 id="club-invites-title"><AppIcon name="link" size={20} /> Invite athletes</h2>
      <p className="va-muted">Give athletes a code in person or in your club’s group. ArcherLab does not send anything. Each athlete chooses what to share with you.</p>
      <form className="training-form__grid" onSubmit={(event) => { event.preventDefault(); void run((session) => createInvite(api.client, session, { clubId: club.id, days, maxUses })); }}>
        <label><span>Valid for (days)</span><input type="number" min={1} max={90} value={days} onChange={(event) => setDays(Number(event.target.value))} disabled={busy} /></label>
        <label><span>Uses</span><input type="number" min={1} max={500} value={maxUses} onChange={(event) => setMaxUses(Number(event.target.value))} disabled={busy} /></label>
        <div className="va-actions"><ActionButton variant="primary" type="submit" disabled={busy}><AppIcon name="plus" size={16} /> New code</ActionButton></div>
      </form>
      {status ? <p className="va-import-status" role="status">{status}</p> : null}
      {active.length ? (
        <ul className="va-share__list" aria-label="Active invite codes">
          {active.map((invite) => (
            <li key={invite.id}>
              <span><strong className="club-code">{invite.code}</strong><small>until {formatDate(Date.parse(invite.expires_at))} · used {invite.uses} of {invite.max_uses}</small></span>
              <ActionButton variant="ghost" type="button" disabled={busy} onClick={() => void run((session) => deleteInvite(api.client, session, invite.id))}>Delete</ActionButton>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function CoachClub({ api, club, onOpenReport }: { api: Api; club: Club; onOpenReport?: (reportId: string) => void }) {
  const [summary, setSummary] = useState<RosterSummary | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const session = await api.freshSession();
      if (!session) return null;
      const members = await listMembers(api.client, session, club.id);
      const [reports, logs] = await Promise.all([
        listMemberReports(api.client, session, members.filter((member) => member.share_analyses).map((member) => member.athlete_id)),
        listMemberPracticeLogs(api.client, session, members.filter((member) => member.share_practice_log).map((member) => member.athlete_id)),
      ]);
      return summarizeRoster(members, reports, logs);
    })()
      .then((next) => { if (!cancelled && next) setSummary(next); })
      .catch((error: unknown) => { if (!cancelled) setStatus(describeCloudError(error)); });
    return () => { cancelled = true; };
  }, [api, club.id]);

  const selectedRow = summary?.rows.find((row) => row.member.athlete_id === selected) ?? null;
  const sharing = summary?.rows.filter((row) => row.member.share_analyses).length ?? 0;

  return (
    <>
      <section className="session-summary-cards training-stats" aria-label={`${club.name} at a glance`}>
        <article><span>Athletes</span><strong>{summary?.rows.length ?? '--'}</strong><small>{sharing} sharing analyses</small></article>
        <article><span>Most common focus area</span><strong className="club-focus">{summary?.topFocus?.title ?? '--'}</strong><small>{summary?.topFocus ? `in the latest report of ${summary.topFocus.athletes} athlete${summary.topFocus.athletes === 1 ? '' : 's'}` : 'from shared reports'}</small></article>
      </section>
      {status ? <p className="va-import-status" role="alert">{status}</p> : null}
      <section className="va-panel" aria-labelledby="club-roster-title">
        <h2 id="club-roster-title"><AppIcon name="user" size={20} /> {club.name} <small>athletes</small></h2>
        {summary === null ? <p className="va-muted">Loading…</p>
          : summary.rows.length ? <RosterTable summary={summary} selected={selected} onSelect={(id) => setSelected((current) => (current === id ? null : id))} />
            : <p className="va-muted">No athletes yet. Create an invite code below and give it to your athletes.</p>}
        <p className="va-faint">Athletes under 18 are shown by display name only. Levels and form scores are unvalidated estimates.</p>
      </section>
      {selectedRow ? <AthleteReports row={selectedRow} onOpenReport={onOpenReport} /> : null}
      <InvitePanel api={api} club={club} />
    </>
  );
}

function CoachSection({ api, onOpenReport }: { api: Api; onOpenReport?: (reportId: string) => void }) {
  const [clubs, setClubs] = useState<Club[] | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api.freshSession().then((session) => (session ? listMyClubs(api.client, session) : []))
      .then((rows) => { if (!cancelled) setClubs(rows); })
      .catch((error: unknown) => { if (!cancelled) setStatus(describeCloudError(error)); });
    return () => { cancelled = true; };
  }, [api]);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const session = await api.freshSession();
      if (!session) { setStatus(EXPIRED); return; }
      const club = await createClub(api.client, session, name);
      setClubs((current) => [...(current ?? []), club]);
      setName('');
    } catch (error) {
      setStatus(describeCloudError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {clubs?.map((club) => <CoachClub key={club.id} api={api} club={club} onOpenReport={onOpenReport} />)}
      <form className="va-panel training-form" onSubmit={(event) => void create(event)} aria-labelledby="club-create-title">
        <h2 id="club-create-title"><AppIcon name="plus" size={20} /> {clubs?.length ? 'Start another club' : 'Start a club'} <small>for coaches</small></h2>
        <p className="va-muted">Follow the athletes of a training ground in one place. You see each athlete only as far as they choose to share, and they can leave at any time.</p>
        <div className="training-form__grid">
          <label><span>Club name</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={CLUB_NAME_MAX} placeholder="e.g. Riverside Archers" disabled={busy} /></label>
        </div>
        {status ? <p className="va-import-status" role="status">{status}</p> : null}
        <div className="va-actions"><ActionButton variant="secondary" type="submit" disabled={busy || !name.trim()}><AppIcon name="plus" size={16} /> Create club</ActionButton></div>
      </form>
    </>
  );
}

export function ClubPage({ onProfile, onPrivacy, onOpenReport }: ClubPageProps = {}) {
  const account = useCloudAccount();
  const [tab, setTab] = useState<'athlete' | 'coach'>('athlete');
  const { client, freshSession } = account;
  const api = useMemo(() => (client ? { client, freshSession } : null), [client, freshSession]);

  return (
    <div className="training-page club-page">
      <PageHeader
        title="My club"
        subtitle="Join your coach’s club, or follow your athletes as a coach. Optional, and only with an account."
        actions={onPrivacy ? <ActionButton variant="ghost" type="button" onClick={onPrivacy}><AppIcon name="shield" size={16} /> Privacy</ActionButton> : undefined}
      />
      {!api ? <p className="va-muted">Clubs need the optional account, which is not set up on this site.</p>
        : !account.ready ? <p className="va-muted">Loading…</p>
          : !account.session ? (
            <section className="va-panel">
              <p className="va-muted">Sign in on your Profile page to join or run a club.</p>
              {onProfile ? <div className="va-actions"><ActionButton variant="primary" type="button" onClick={onProfile}><AppIcon name="user" size={16} /> Go to Profile</ActionButton></div> : null}
            </section>
          ) : (
            <>
              <div className="va-viewtabs" role="tablist" aria-label="Club role">
                <button type="button" role="tab" aria-selected={tab === 'athlete'} className={tab === 'athlete' ? 'is-selected' : ''} onClick={() => setTab('athlete')}>I’m an athlete</button>
                <button type="button" role="tab" aria-selected={tab === 'coach'} className={tab === 'coach' ? 'is-selected' : ''} onClick={() => setTab('coach')}>I’m a coach</button>
              </div>
              {tab === 'athlete' ? <AthleteSection api={api} /> : <CoachSection api={api} onOpenReport={onOpenReport} />}
            </>
          )}
    </div>
  );
}
