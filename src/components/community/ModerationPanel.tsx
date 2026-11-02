import { useCallback, useState } from 'react';
import { clearReport, deleteItem, listMuteStates, listReports, setItemHidden, setMemberMuted, type ClubReport, type MemberMute } from '../../cloud/account/community';
import { AppIcon } from '../AppIcon';
import { formatWhen, useClubCall, useRefresh, type PanelProps } from './shared';

const KIND_LABEL = { club_chat: 'Chat message', club_posts: 'Forum post', club_polls: 'Poll' } as const;

/** Coach only: reports from members, and who is muted. Hiding takes an item away from members but keeps it for the coach. */
export function ModerationPanel({ api, club }: PanelProps) {
  const { call, status } = useClubCall(api);
  const [reports, setReports] = useState<ClubReport[] | null>(null);
  const [members, setMembers] = useState<MemberMute[]>([]);

  const load = useCallback(() => {
    void call(async (session, client) => ({ reports: await listReports(client, session, club.id), members: await listMuteStates(client, session, club.id) }))
      .then((data) => { if (data) { setReports(data.reports); setMembers(data.members); } });
  }, [call, club.id]);
  useRefresh(load, 30_000);

  const hide = async (report: ClubReport) => { await call((session, client) => setItemHidden(client, session, report.item_table, report.item_id, true)); await call((session, client) => clearReport(client, session, report.id)); load(); };
  const remove = async (report: ClubReport) => { await call((session, client) => deleteItem(client, session, report.item_table, report.item_id)); await call((session, client) => clearReport(client, session, report.id)); load(); };
  const dismiss = async (report: ClubReport) => { await call((session, client) => clearReport(client, session, report.id)); load(); };
  const mute = async (athleteId: string, muted: boolean) => { await call((session, client) => setMemberMuted(client, session, club.id, athleteId, muted)); load(); };

  return (
    <section className="va-panel community-panel" aria-labelledby="community-mod-title">
      <h2 id="community-mod-title"><AppIcon name="shield" size={18} /> Moderation</h2>
      <p className="va-muted">Members can report anything in the club. You can hide it from members (you still see it), delete it, or mute the person. A muted member can read but not post, vote or share results.</p>
      {status ? <p className="va-import-status" role="alert">{status}</p> : null}
      <h3>Reports</h3>
      {reports === null ? <p className="va-faint">Loading…</p> : reports.length === 0 ? <p className="va-faint">No reports. All quiet.</p> : (
        <ul className="community-reports">
          {reports.map((report) => {
            const author = members.find((member) => member.athlete_id === report.item_author_id);
            return (
              <li key={report.id}>
                <p><strong>{KIND_LABEL[report.item_table]}</strong> by {report.item_author_name ?? 'a member'} · reported {formatWhen(report.created_at)}</p>
                <blockquote>{report.excerpt ?? '(no text)'}</blockquote>
                <span className="community-actions">
                  <button type="button" onClick={() => void hide(report)}>Hide from members</button>
                  <button type="button" onClick={() => void remove(report)}>Delete</button>
                  {author ? <button type="button" onClick={() => void mute(author.athlete_id, !author.muted)}>{author.muted ? 'Unmute' : 'Mute'} {author.display_name}</button> : null}
                  <button type="button" onClick={() => void dismiss(report)}>Dismiss</button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <h3>Members</h3>
      {members.length === 0 ? <p className="va-faint">No members yet.</p> : (
        <ul className="community-results">
          {members.map((member) => <li key={member.athlete_id}><span>{member.display_name}{member.muted ? ' · muted' : ''}</span><button type="button" onClick={() => void mute(member.athlete_id, !member.muted)}>{member.muted ? 'Unmute' : 'Mute'}</button></li>)}
        </ul>
      )}
    </section>
  );
}
