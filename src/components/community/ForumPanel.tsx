import { useCallback, useMemo, useState, type FormEvent } from 'react';
import { createReply, createThread, deleteItem, listPosts, reportItem, setItemHidden } from '../../cloud/account/community';
import { POST_MAX, TITLE_MAX, groupThreads, textProblem, type ClubPost } from '../../community/community';
import { ActionButton } from '../ActionButton';
import { AppIcon } from '../AppIcon';
import { formatWhen, useClubCall, useRefresh, type PanelProps } from './shared';

/** Forum threads for match days, shoots and anything else the club wants to talk through. */
export function ForumPanel({ api, club }: PanelProps) {
  const { call, status, setStatus } = useClubCall(api);
  const [posts, setPosts] = useState<ClubPost[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(() => { void call((session, client) => listPosts(client, session, club.id)).then((rows) => { if (rows) setPosts(rows); }); }, [call, club.id]);
  useRefresh(load, 30_000);
  const threads = useMemo(() => groupThreads(posts ?? []), [posts]);
  const open = threads.find((thread) => thread.thread.id === openId) ?? null;

  const start = async (event: FormEvent) => {
    event.preventDefault();
    const problem = textProblem(title, TITLE_MAX, 'The title') ?? textProblem(body, POST_MAX);
    if (problem) { setStatus(problem); return; }
    setBusy(true);
    const made = await call((session, client) => createThread(client, session, club.id, title, body));
    setBusy(false);
    if (made) { setTitle(''); setBody(''); setOpenId(made.id); load(); }
  };

  const answer = async (event: FormEvent) => {
    event.preventDefault();
    if (!open) return;
    const problem = textProblem(reply, POST_MAX, 'Your reply');
    if (problem) { setStatus(problem); return; }
    setBusy(true);
    const made = await call((session, client) => createReply(client, session, club.id, open.thread.id, reply));
    setBusy(false);
    if (made) { setReply(''); load(); }
  };

  const remove = async (post: ClubPost) => { await call((session, client) => deleteItem(client, session, 'club_posts', post.id)); if (!post.parent_id) setOpenId(null); load(); };
  const hide = async (post: ClubPost) => { await call((session, client) => setItemHidden(client, session, 'club_posts', post.id, !post.hidden_at)); load(); };
  const report = async (post: ClubPost) => {
    const done = await call((session, client) => reportItem(client, session, club.id, 'club_posts', post.id));
    if (done !== undefined) setNote('Reported. Your coach will look at it.');
  };

  const actions = (post: ClubPost) => (
    <span className="community-actions">
      {post.author_id !== club.userId ? <button type="button" onClick={() => void report(post)}>Report</button> : null}
      {post.author_id === club.userId || club.isCoach ? <button type="button" onClick={() => void remove(post)}>Delete</button> : null}
      {club.isCoach && post.author_id !== club.userId ? <button type="button" onClick={() => void hide(post)}>{post.hidden_at ? 'Show' : 'Hide'}</button> : null}
    </span>
  );

  return (
    <section className="va-panel community-panel" aria-labelledby="community-forum-title">
      <h2 id="community-forum-title"><AppIcon name="calendar" size={18} /> Forum</h2>
      <p className="va-muted">Longer conversations: match-day plans, results chat, kit questions. No links.</p>
      {status ? <p className="va-import-status" role="alert">{status}</p> : null}
      {note ? <p className="va-import-status" role="status">{note}</p> : null}
      {open ? (
        <div className="community-thread">
          <button type="button" className="community-back" onClick={() => setOpenId(null)}>← All threads</button>
          <article className={`community-post${open.thread.hidden_at ? ' is-hidden' : ''}`}>
            <h3>{open.thread.title}</h3>
            <header><strong>{open.thread.author_name}</strong><small>{formatWhen(open.thread.created_at)}{open.thread.hidden_at ? ' · hidden from members' : ''}</small></header>
            <p>{open.thread.body}</p>
            {actions(open.thread)}
          </article>
          {open.replies.map((post) => (
            <article key={post.id} className={`community-post community-post--reply${post.hidden_at ? ' is-hidden' : ''}`}>
              <header><strong>{post.author_name}</strong><small>{formatWhen(post.created_at)}{post.hidden_at ? ' · hidden from members' : ''}</small></header>
              <p>{post.body}</p>
              {actions(post)}
            </article>
          ))}
          <form className="community-compose" onSubmit={(event) => void answer(event)}>
            <label className="community-compose__field"><span className="va-faint">Reply</span>
              <textarea value={reply} onChange={(event) => setReply(event.target.value)} maxLength={POST_MAX} rows={3} disabled={busy} />
            </label>
            <ActionButton variant="primary" type="submit" disabled={busy || !reply.trim()}>Reply</ActionButton>
          </form>
        </div>
      ) : (
        <>
          {posts === null ? <p className="va-faint">Loading…</p> : threads.length === 0 ? <p className="va-faint">No threads yet. Start one below.</p> : (
            <ul className="community-threads">
              {threads.map(({ thread, replies, lastActivity }) => (
                <li key={thread.id}>
                  <button type="button" onClick={() => setOpenId(thread.id)}>
                    <strong>{thread.title}</strong>
                    <small>{thread.author_name} · {replies.length} repl{replies.length === 1 ? 'y' : 'ies'} · {formatWhen(lastActivity)}{thread.hidden_at ? ' · hidden' : ''}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form className="community-compose community-compose--stack" onSubmit={(event) => void start(event)}>
            <h3>Start a thread</h3>
            <label><span className="va-faint">Title</span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={TITLE_MAX} disabled={busy} /></label>
            <label><span className="va-faint">First post</span><textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={POST_MAX} rows={4} disabled={busy} /></label>
            <ActionButton variant="primary" type="submit" disabled={busy || !title.trim() || !body.trim()}>Post thread</ActionButton>
          </form>
        </>
      )}
    </section>
  );
}
