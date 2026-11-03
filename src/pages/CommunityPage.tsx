import { useEffect, useMemo, useState } from 'react';
import { describeCloudError } from '../cloud/account/cloudSync';
import { listMyClubs, listMyMemberships } from '../cloud/account/clubs';
import { useCloudAccount } from '../cloud/account/useCloudAccount';
import { ActionButton } from '../components/ActionButton';
import { AppIcon } from '../components/AppIcon';
import { BracketPanel } from '../components/community/BracketPanel';
import { ChatPanel } from '../components/community/ChatPanel';
import { ForumPanel } from '../components/community/ForumPanel';
import { LeaderboardPanel } from '../components/community/LeaderboardPanel';
import { ModerationPanel } from '../components/community/ModerationPanel';
import { PollsPanel } from '../components/community/PollsPanel';
import type { ClubContext } from '../components/community/shared';
import { PageHeader } from '../components/PageHeader';
import '../styles/video.css';
import '../styles/community.css';

type CommunityPageProps = {
  onProfile?: () => void;
  onClub?: () => void;
  onPrivacy?: () => void;
};

type Tab = 'chat' | 'forum' | 'polls' | 'board' | 'bracket' | 'moderation';
const TABS: Array<{ key: Tab; label: string; coachOnly?: boolean }> = [
  { key: 'chat', label: 'Chat' }, { key: 'forum', label: 'Forum' }, { key: 'polls', label: 'Polls & predictions' },
  { key: 'board', label: 'Leaderboard' }, { key: 'bracket', label: 'Bracket' }, { key: 'moderation', label: 'Moderation', coachOnly: true },
];

/**
 * Community, inside a club: live chat, a forum, polls and friendly predictions, a leaderboard and a shoot-off
 * bracket. It is for the members of one club and their coach only, and needs the optional account.
 */
export function CommunityPage({ onProfile, onClub, onPrivacy }: CommunityPageProps = {}) {
  const account = useCloudAccount();
  const { client, freshSession, session } = account;
  const api = useMemo(() => (client ? { client, freshSession } : null), [client, freshSession]);
  const userId = session?.user.id ?? null;
  const [clubs, setClubs] = useState<Array<Omit<ClubContext, 'userId'>> | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('chat');
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!api || !userId) return undefined;
    let cancelled = false;
    void (async () => {
      try {
        const fresh = await api.freshSession();
        if (!fresh) { if (!cancelled) setClubs([]); return; }
        const [coached, memberships] = await Promise.all([listMyClubs(api.client, fresh), listMyMemberships(api.client, fresh)]);
        if (cancelled) return;
        const list = [
          ...coached.map((club) => ({ id: club.id, name: club.name, isCoach: true })),
          ...memberships.filter((membership) => !coached.some((club) => club.id === membership.club_id)).map((membership) => ({ id: membership.club_id, name: membership.club_name ?? 'Club', isCoach: false })),
        ];
        setClubs(list);
        setSelected((current) => (current && list.some((club) => club.id === current) ? current : list[0]?.id ?? null));
      } catch (error) {
        if (!cancelled) { setClubs([]); setProblem(describeCloudError(error)); }
      }
    })();
    return () => { cancelled = true; };
  }, [api, userId]);

  const club = clubs?.find((item) => item.id === selected) ?? null;
  const context: ClubContext | null = club && userId ? { ...club, userId } : null;
  const visibleTabs = TABS.filter((item) => !item.coachOnly || club?.isCoach);
  const activeTab = visibleTabs.some((item) => item.key === tab) ? tab : 'chat';

  return (
    <div className="training-page community-page">
      <PageHeader
        title="Community"
        subtitle="Chat, forum, polls, predictions and a leaderboard, just for your club. Optional, and only with an account."
        actions={onPrivacy ? <ActionButton variant="ghost" type="button" onClick={onPrivacy}><AppIcon name="shield" size={16} /> Privacy</ActionButton> : undefined}
      />
      {!api ? <p className="va-muted">Community needs the optional account, which is not set up on this site.</p>
        : !account.ready ? <p className="va-muted">Loading…</p>
          : !session ? (
            <section className="va-panel">
              <p className="va-muted">Sign in on your Profile page, then join a club to use the community.</p>
              {onProfile ? <div className="va-actions"><ActionButton variant="primary" type="button" onClick={onProfile}><AppIcon name="user" size={16} /> Go to Profile</ActionButton></div> : null}
            </section>
          ) : clubs === null ? <p className="va-muted">Loading your clubs…</p>
            : !context ? (
              <section className="va-panel">
                {problem ? <p className="va-import-status" role="alert">{problem}</p> : null}
                <p className="va-muted">The community lives inside a club. Join your coach’s club with an invite code, or start a club as a coach, and it appears here.</p>
                {onClub ? <div className="va-actions"><ActionButton variant="primary" type="button" onClick={onClub}><AppIcon name="plus" size={16} /> Go to My club</ActionButton></div> : null}
              </section>
            ) : (
              <>
                <section className="va-panel community-rules" aria-label="Community rules">
                  {clubs.length > 1 ? (
                    <label className="community-club-picker"><span>Club</span>
                      <select value={context.id} onChange={(event) => setSelected(event.target.value)}>{clubs.map((item) => <option key={item.id} value={item.id}>{item.name}{item.isCoach ? ' (you coach)' : ''}</option>)}</select>
                    </label>
                  ) : <p className="community-club-name"><AppIcon name="shield" size={16} /> <strong>{context.name}</strong>{context.isCoach ? ' · you are the coach' : ''}</p>}
                  <p className="va-faint">Only this club’s members and coach can see anything here. There are no private messages and links are not allowed. Posts show only the name you chose when you joined. Your coach can hide posts and mute members, and anyone can report a post. Leaving the club ends your access.</p>
                </section>
                <div className="va-viewtabs" role="tablist" aria-label="Community sections">
                  {visibleTabs.map((item) => <button key={item.key} type="button" role="tab" aria-selected={activeTab === item.key} className={activeTab === item.key ? 'is-selected' : ''} onClick={() => setTab(item.key)}>{item.label}</button>)}
                </div>
                <div role="tabpanel" key={`${context.id}-${activeTab}`}>
                  {activeTab === 'chat' ? <ChatPanel api={api} club={context} />
                    : activeTab === 'forum' ? <ForumPanel api={api} club={context} />
                      : activeTab === 'polls' ? <PollsPanel api={api} club={context} />
                        : activeTab === 'board' ? <LeaderboardPanel api={api} club={context} />
                          : activeTab === 'bracket' ? <BracketPanel api={api} club={context} />
                            : <ModerationPanel api={api} club={context} />}
                </div>
              </>
            )}
    </div>
  );
}
