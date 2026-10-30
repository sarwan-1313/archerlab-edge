import { useState } from 'react';
import { COMMENT_MAX_LENGTH, commentAuthor, commentMoment, type ReportComment } from '../../cloud/account/coachReview';
import { formatDate } from '../../video-analysis/format';
import { ActionButton } from '../ActionButton';
import { AppIcon } from '../AppIcon';

export type CommentsPanelProps = {
  comments: ReportComment[];
  currentUserId: string;
  /** True for the athlete who owns the report; false for a coach it was shared with. */
  viewerIsOwner: boolean;
  ownerEmail: string | null;
  /** The athlete who owns the report, when known by id (club coaches see a display name, never a minor's email). */
  owner?: { id: string; label: string };
  busy: boolean;
  status: string | null;
  /** Saves a comment, at the replay's current moment when `atMoment` is set. Resolves true when saved. */
  onAdd: (body: string, atMoment: boolean) => Promise<boolean>;
  onDelete: (commentId: string) => void;
  onJump: (comment: ReportComment) => void;
  onRefresh: () => void;
};

/** Comments from the athlete and the coaches they shared the report with, pinned to moments of the replay. */
export function CommentsPanel({ comments, currentUserId, viewerIsOwner, ownerEmail, owner, busy, status, onAdd, onDelete, onJump, onRefresh }: CommentsPanelProps) {
  const [draft, setDraft] = useState('');
  const submit = async (atMoment: boolean) => {
    if (await onAdd(draft, atMoment)) setDraft('');
  };
  const empty = !draft.trim();

  return (
    <section className="va-panel va-comments" aria-labelledby="va-comments-title">
      <h2 id="va-comments-title"><AppIcon name="user" size={20} /> Comments <small>{viewerIsOwner ? 'you and the coaches you share with' : 'you, the athlete and their other coaches'}</small></h2>
      {comments.length ? (
        <ul className="va-comments__list">
          {comments.map((comment) => {
            const moment = commentMoment(comment);
            return (
              <li key={comment.id} className="va-comment">
                <header>
                  <strong>{commentAuthor(comment, currentUserId, viewerIsOwner, ownerEmail, owner)}</strong>
                  <span>{formatDate(Date.parse(comment.created_at))}</span>
                  {moment ? <button type="button" className="va-comment__jump" onClick={() => onJump(comment)} aria-label={`Show ${moment} in the replay`}><AppIcon name="play" size={12} /> {moment}</button> : null}
                  {comment.author_id === currentUserId ? <button type="button" className="va-comment__delete" disabled={busy} onClick={() => { if (window.confirm('Delete this comment?')) onDelete(comment.id); }}>Delete</button> : null}
                </header>
                <p>{comment.body}</p>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="va-muted">No comments yet. Pause the replay where something happens and comment at that moment; it is marked on the timeline.</p>
      )}
      <label className="va-field">
        <span>Your comment</span>
        <textarea value={draft} maxLength={COMMENT_MAX_LENGTH} onChange={(event) => setDraft(event.target.value)} disabled={busy} placeholder={viewerIsOwner ? 'A question for your coach, or a note to yourself' : 'What you see, and what to try next'} />
        <small>{draft.length}/{COMMENT_MAX_LENGTH}</small>
      </label>
      <div className="va-actions">
        <ActionButton variant="primary" type="button" disabled={busy || empty} onClick={() => void submit(true)}><AppIcon name="play" size={16} /> Comment at this moment</ActionButton>
        <ActionButton variant="secondary" type="button" disabled={busy || empty} onClick={() => void submit(false)}>Comment on the whole report</ActionButton>
        <ActionButton variant="ghost" type="button" disabled={busy} onClick={onRefresh}>Refresh</ActionButton>
      </div>
      {status ? <p className="va-import-status" role="status">{status}</p> : null}
    </section>
  );
}
