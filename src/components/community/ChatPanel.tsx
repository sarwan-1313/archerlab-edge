import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { deleteItem, listChat, reportItem, sendChat, setItemHidden, type ChatMessage } from '../../cloud/account/community';
import { CHAT_MAX, textProblem } from '../../community/community';
import { ActionButton } from '../ActionButton';
import { AppIcon } from '../AppIcon';
import { formatWhen, useClubCall, useRefresh, type PanelProps } from './shared';

const POLL_MS = 5000;

const sameMessages = (a: ChatMessage[], b: ChatMessage[]) => a.length === b.length && a.every((message, index) => message.id === b[index].id && message.hidden_at === b[index].hidden_at);

/** Live chat for the club. It checks for new messages every few seconds while this page is open and visible. */
export function ChatPanel({ api, club }: PanelProps) {
  const { call, status, setStatus } = useClubCall(api);
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const lastCount = useRef(0);

  const load = useCallback(() => {
    void call((session, client) => listChat(client, session, club.id)).then((rows) => {
      if (rows) setMessages((current) => (current && sameMessages(current, rows) ? current : rows));
    });
  }, [call, club.id]);
  useRefresh(load, POLL_MS);

  useEffect(() => {
    if (messages && messages.length !== lastCount.current) {
      lastCount.current = messages.length;
      endRef.current?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [messages]);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const problem = textProblem(draft, CHAT_MAX);
    if (problem) { setStatus(problem); return; }
    setSending(true);
    const sent = await call((session, client) => sendChat(client, session, club.id, draft));
    setSending(false);
    if (sent) { setDraft(''); setNote(null); load(); }
  };

  const remove = async (message: ChatMessage) => { await call((session, client) => deleteItem(client, session, 'club_chat', message.id)); load(); };
  const hide = async (message: ChatMessage) => { await call((session, client) => setItemHidden(client, session, 'club_chat', message.id, !message.hidden_at)); load(); };
  const report = async (message: ChatMessage) => {
    const done = await call((session, client) => reportItem(client, session, club.id, 'club_chat', message.id));
    if (done !== undefined) setNote('Reported. Your coach will look at it.');
  };

  return (
    <section className="va-panel community-panel" aria-labelledby="community-chat-title">
      <h2 id="community-chat-title"><AppIcon name="share" size={18} /> Club chat</h2>
      <p className="va-muted">For this club only. New messages appear every few seconds. No links, and be kind: your coach can hide messages and mute members.</p>
      <div className="community-log" role="log" aria-live="polite" aria-label="Club chat messages">
        {messages === null ? <p className="va-faint">Loading…</p> : messages.length === 0 ? <p className="va-faint">No messages yet. Say hello!</p> : messages.map((message) => {
          const mine = message.author_id === club.userId;
          return (
            <article key={message.id} className={`community-message${mine ? ' is-mine' : ''}${message.hidden_at ? ' is-hidden' : ''}`}>
              <header><strong>{message.author_name}</strong><small>{formatWhen(message.created_at)}{message.hidden_at ? ' · hidden from members' : ''}</small></header>
              <p>{message.body}</p>
              <footer>
                {!mine ? <button type="button" onClick={() => void report(message)}>Report</button> : null}
                {mine || club.isCoach ? <button type="button" onClick={() => void remove(message)}>Delete</button> : null}
                {club.isCoach && !mine ? <button type="button" onClick={() => void hide(message)}>{message.hidden_at ? 'Show' : 'Hide'}</button> : null}
              </footer>
            </article>
          );
        })}
        <div ref={endRef} />
      </div>
      {status ? <p className="va-import-status" role="alert">{status}</p> : null}
      {note ? <p className="va-import-status" role="status">{note}</p> : null}
      <form className="community-compose" onSubmit={(event) => void send(event)}>
        <label className="community-compose__field"><span className="va-faint">Message ({draft.trim().length}/{CHAT_MAX})</span>
          <input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={CHAT_MAX} placeholder="Write to your club" autoComplete="off" disabled={sending} />
        </label>
        <ActionButton variant="primary" type="submit" disabled={sending || !draft.trim()}><AppIcon name="share" size={16} /> Send</ActionButton>
      </form>
    </section>
  );
}
