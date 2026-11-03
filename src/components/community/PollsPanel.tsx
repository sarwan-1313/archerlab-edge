import { useCallback, useMemo, useState, type FormEvent } from 'react';
import {
  castVote, closePoll, createPoll, deleteItem, listPolls, myVotes, pollTally, predictionStandings, reportItem, setItemHidden, settlePrediction,
} from '../../cloud/account/community';
import {
  MAX_OPTIONS, QUESTION_MAX, cleanOptions, pollState, rankStandings, tallyPoll, type ClubPoll, type PollKind, type RankedStanding, type TallyRow,
} from '../../community/community';
import { ActionButton } from '../ActionButton';
import { AppIcon } from '../AppIcon';
import { formatWhen, useClubCall, useRefresh, type PanelProps } from './shared';

const CLOSE_CHOICES = [
  { label: '1 hour', hours: 1 }, { label: '1 day', hours: 24 }, { label: '3 days', hours: 72 }, { label: '1 week', hours: 168 }, { label: '30 days', hours: 720 },
];

/** Polls, and friendly predictions that are settled once the result is known. Who voted for what stays private. */
export function PollsPanel({ api, club }: PanelProps) {
  const { call, status } = useClubCall(api);
  const [polls, setPolls] = useState<ClubPoll[] | null>(null);
  const [tally, setTally] = useState<TallyRow[]>([]);
  const [mine, setMine] = useState<Map<string, number>>(new Map());
  const [standings, setStandings] = useState<RankedStanding[]>([]);
  const [kind, setKind] = useState<PollKind>('prediction');
  const [question, setQuestion] = useState('');
  const [optionText, setOptionText] = useState('');
  const [hours, setHours] = useState(24);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(() => {
    void call(async (session, client) => {
      const [list, totals, picks, table] = await Promise.all([
        listPolls(client, session, club.id), pollTally(client, session, club.id), myVotes(client, session, club.id), predictionStandings(client, session, club.id),
      ]);
      return { list, totals, picks, table };
    }).then((data) => {
      if (!data) return;
      setPolls(data.list); setTally(data.totals); setMine(data.picks); setStandings(rankStandings(data.table));
    });
  }, [call, club.id]);
  useRefresh(load, 20_000);

  const options = useMemo(() => cleanOptions(optionText.split('\n')), [optionText]);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const made = await call((session, client) => createPoll(client, session, { clubId: club.id, kind, question, options, closesAt: new Date(Date.now() + hours * 3_600_000) }));
    setBusy(false);
    if (made) { setQuestion(''); setOptionText(''); setNote(null); load(); }
  };

  const vote = async (poll: ClubPoll, index: number) => { await call((session, client) => castVote(client, session, poll.id, index)); load(); };
  const settle = async (poll: ClubPoll, index: number) => { await call((session, client) => settlePrediction(client, session, poll.id, index)); load(); };
  const close = async (poll: ClubPoll) => { await call((session, client) => closePoll(client, session, poll.id)); load(); };
  const remove = async (poll: ClubPoll) => { await call((session, client) => deleteItem(client, session, 'club_polls', poll.id)); load(); };
  const hide = async (poll: ClubPoll) => { await call((session, client) => setItemHidden(client, session, 'club_polls', poll.id, !poll.hidden_at)); load(); };
  const report = async (poll: ClubPoll) => {
    const done = await call((session, client) => reportItem(client, session, club.id, 'club_polls', poll.id));
    if (done !== undefined) setNote('Reported. Your coach will look at it.');
  };

  return (
    <>
      <section className="va-panel community-panel" aria-labelledby="community-polls-title">
        <h2 id="community-polls-title"><AppIcon name="target" size={18} /> Polls &amp; predictions</h2>
        <p className="va-muted">Ask the club a question, or make a friendly prediction (who wins Saturday’s shoot?). Predictions are settled later and score points on the standings below. Nobody sees how others voted, only the totals.</p>
        {status ? <p className="va-import-status" role="alert">{status}</p> : null}
        {note ? <p className="va-import-status" role="status">{note}</p> : null}
        <form className="community-compose community-compose--stack" onSubmit={(event) => void create(event)}>
          <h3>New</h3>
          <div className="scoring-rounds" role="radiogroup" aria-label="Type">
            {(['prediction', 'poll'] as PollKind[]).map((value) => (
              <button key={value} type="button" role="radio" aria-checked={kind === value} className={`scoring-round${kind === value ? ' is-selected' : ''}`} onClick={() => setKind(value)}>
                <strong>{value === 'prediction' ? 'Prediction' : 'Poll'}</strong><small>{value === 'prediction' ? 'Has a right answer, scored later' : 'Just asking opinions'}</small>
              </button>
            ))}
          </div>
          <label><span className="va-faint">Question</span><input value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={QUESTION_MAX} placeholder={kind === 'prediction' ? 'Who will win Saturday’s shoot-off?' : 'Which day should we train?'} disabled={busy} /></label>
          <label><span className="va-faint">Options, one per line (2 to {MAX_OPTIONS})</span><textarea value={optionText} onChange={(event) => setOptionText(event.target.value)} rows={4} disabled={busy} /></label>
          <label><span className="va-faint">Closes in</span>
            <select value={hours} onChange={(event) => setHours(Number(event.target.value))} disabled={busy}>{CLOSE_CHOICES.map((choice) => <option key={choice.hours} value={choice.hours}>{choice.label}</option>)}</select>
          </label>
          <ActionButton variant="primary" type="submit" disabled={busy || !question.trim() || options.length < 2}>{kind === 'prediction' ? 'Post prediction' : 'Post poll'}</ActionButton>
        </form>
      </section>

      {polls === null ? <p className="va-faint">Loading…</p> : polls.length === 0 ? <p className="va-faint">Nothing yet. Post the first one.</p> : polls.map((poll) => {
        const state = pollState(poll);
        const counts = tallyPoll(poll, tally);
        const picked = mine.get(poll.id);
        const mayManage = club.isCoach || poll.author_id === club.userId;
        const showResults = state !== 'open' || picked !== undefined || mayManage;
        return (
          <section key={poll.id} className={`va-panel community-poll${poll.hidden_at ? ' is-hidden' : ''}`} aria-label={poll.question}>
            <header>
              <h3>{poll.question}</h3>
              <small>{poll.kind === 'prediction' ? 'Prediction' : 'Poll'} · {poll.author_name} · {state === 'open' ? `closes ${formatWhen(poll.closes_at)}` : state === 'closed' ? 'closed, waiting for the result' : 'settled'}{poll.hidden_at ? ' · hidden from members' : ''}</small>
            </header>
            <ul className="community-options">
              {poll.options.map((option, index) => {
                const share = counts.total ? Math.round((counts.counts[index] / counts.total) * 100) : 0;
                const right = poll.correct_option === index;
                return (
                  <li key={option} className={`${picked === index ? 'is-picked ' : ''}${right ? 'is-right' : ''}`}>
                    {state === 'open' ? (
                      <button type="button" aria-pressed={picked === index} onClick={() => void vote(poll, index)}>{option}{picked === index ? ' ✓' : ''}</button>
                    ) : <span>{option}{right ? ' ✓ correct' : ''}{picked === index ? ' (your pick)' : ''}</span>}
                    {showResults ? <span className="community-options__bar" aria-hidden="true"><i style={{ width: `${share}%` }} /></span> : null}
                    {showResults ? <small>{counts.counts[index]} · {share}%</small> : null}
                    {state !== 'settled' && poll.kind === 'prediction' && mayManage ? <button type="button" className="community-options__settle" onClick={() => void settle(poll, index)}>This was right</button> : null}
                  </li>
                );
              })}
            </ul>
            <footer className="community-actions">
              {state === 'open' && picked === undefined ? <small className="va-faint">Tap an option to vote. You can change your vote until it closes.</small> : null}
              <small className="va-faint">{counts.total} vote{counts.total === 1 ? '' : 's'}</small>
              {state === 'open' && mayManage ? <button type="button" onClick={() => void close(poll)}>Close now</button> : null}
              {poll.author_id !== club.userId ? <button type="button" onClick={() => void report(poll)}>Report</button> : null}
              {mayManage ? <button type="button" onClick={() => void remove(poll)}>Delete</button> : null}
              {club.isCoach && poll.author_id !== club.userId ? <button type="button" onClick={() => void hide(poll)}>{poll.hidden_at ? 'Show' : 'Hide'}</button> : null}
            </footer>
          </section>
        );
      })}

      <section className="va-panel community-panel" aria-labelledby="community-standings-title">
        <h2 id="community-standings-title"><AppIcon name="crown" size={18} /> Prediction standings</h2>
        {standings.length === 0 ? <p className="va-faint">No settled predictions yet. Standings appear once a prediction has its result.</p> : (
          <ol className="community-board">
            {standings.map((row) => <li key={row.display_name}><span className="community-board__rank">{row.rank}</span><strong>{row.display_name}</strong><span>{row.correct} right of {row.answered}</span></li>)}
          </ol>
        )}
      </section>
    </>
  );
}
