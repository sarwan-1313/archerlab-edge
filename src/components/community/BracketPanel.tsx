import { useCallback, useState, type FormEvent } from 'react';
import { createBracket, deleteItem, listBrackets, saveBracketWinners, type ClubBracket } from '../../cloud/account/community';
import { BRACKET_MAX, BRACKET_MIN, buildBracket, parseEntrants, roundName, setBracketWinner } from '../../community/community';
import { ActionButton } from '../ActionButton';
import { AppIcon } from '../AppIcon';
import { useClubCall, useRefresh, type PanelProps } from './shared';

function BracketView({ bracket, isCoach, onPick }: { bracket: ClubBracket; isCoach: boolean; onPick: (matchId: string, winner: number | null) => void }) {
  const view = buildBracket(bracket.entrants.length, bracket.winners);
  const name = (index: number | null) => (index === null ? '—' : bracket.entrants[index] ?? '—');
  return (
    <div className="community-bracket" role="group" aria-label={`${bracket.title} bracket`}>
      {view.rounds.map((round, roundIndex) => (
        <div key={roundIndex} className="community-bracket__round">
          <h4>{roundName(roundIndex, view.rounds.length)}</h4>
          {round.map((match) => (
            <div key={match.id} className="community-bracket__match">
              {[match.a, match.b].map((entrant, side) => {
                const won = entrant !== null && match.winner === entrant;
                const text = `${name(entrant)}${won ? ' ✓' : ''}`;
                if (entrant !== null && isCoach && !match.bye && match.a !== null && match.b !== null) {
                  return <button key={side} type="button" className={won ? 'is-winner' : undefined} aria-pressed={won} onClick={() => onPick(match.id, won ? null : entrant)}>{text}</button>;
                }
                return <span key={side} className={won ? 'is-winner' : entrant === null ? 'is-empty' : undefined}>{text}{match.bye && entrant !== null ? ' (bye)' : ''}</span>;
              })}
            </div>
          ))}
        </div>
      ))}
      {view.champion !== null ? <p className="community-bracket__champion" role="status"><AppIcon name="crown" size={18} /> Champion: <strong>{name(view.champion)}</strong></p> : null}
    </div>
  );
}

/** A shoot-off bracket the coach runs and the whole club follows. Pair it with a prediction on the Polls tab. */
export function BracketPanel({ api, club }: PanelProps) {
  const { call, status, setStatus } = useClubCall(api);
  const [brackets, setBrackets] = useState<ClubBracket[] | null>(null);
  const [title, setTitle] = useState('');
  const [entrantText, setEntrantText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => { void call((session, client) => listBrackets(client, session, club.id)).then((rows) => { if (rows) setBrackets(rows); }); }, [call, club.id]);
  useRefresh(load, 30_000);
  const entrants = parseEntrants(entrantText);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (entrants.length < BRACKET_MIN) { setStatus(`Enter at least ${BRACKET_MIN} names, one per line.`); return; }
    setBusy(true);
    const made = await call((session, client) => createBracket(client, session, club.id, title, entrants));
    setBusy(false);
    if (made) { setTitle(''); setEntrantText(''); load(); }
  };

  const pick = async (bracket: ClubBracket, matchId: string, winner: number | null) => {
    const winners = setBracketWinner(bracket.entrants.length, bracket.winners, matchId, winner);
    setBrackets((current) => current?.map((item) => (item.id === bracket.id ? { ...item, winners } : item)) ?? current);
    await call((session, client) => saveBracketWinners(client, session, bracket.id, winners));
    load();
  };
  const remove = async (bracket: ClubBracket) => { await call((session, client) => deleteItem(client, session, 'club_brackets', bracket.id)); load(); };

  return (
    <section className="va-panel community-panel" aria-labelledby="community-bracket-title">
      <h2 id="community-bracket-title"><AppIcon name="target" size={18} /> Shoot-off bracket</h2>
      <p className="va-muted">{club.isCoach ? 'Set up a single-elimination bracket (the first name is the top seed) and tap the winner of each match as it is shot.' : 'Follow the club’s shoot-off. Your coach updates it as matches finish.'} Make a prediction for the champion on the Polls tab.</p>
      {status ? <p className="va-import-status" role="alert">{status}</p> : null}
      {brackets === null ? <p className="va-faint">Loading…</p> : brackets.length === 0 ? <p className="va-faint">{club.isCoach ? 'No bracket yet. Create one below.' : 'No bracket yet.'}</p> : brackets.map((bracket) => (
        <article key={bracket.id} className="community-bracket-card">
          <header><h3>{bracket.title}</h3>{club.isCoach ? <button type="button" onClick={() => void remove(bracket)}>Delete</button> : null}</header>
          <BracketView bracket={bracket} isCoach={club.isCoach} onPick={(matchId, winner) => void pick(bracket, matchId, winner)} />
        </article>
      ))}
      {club.isCoach ? (
        <form className="community-compose community-compose--stack" onSubmit={(event) => void create(event)}>
          <h3>New bracket</h3>
          <label><span className="va-faint">Title</span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} placeholder="Saturday shoot-off" disabled={busy} /></label>
          <label><span className="va-faint">Names, one per line, top seed first ({BRACKET_MIN} to {BRACKET_MAX})</span><textarea value={entrantText} onChange={(event) => setEntrantText(event.target.value)} rows={6} disabled={busy} /></label>
          <p className="va-faint">{entrants.length} name{entrants.length === 1 ? '' : 's'}. Fewer than a full bracket? The top seeds get a bye.</p>
          <ActionButton variant="primary" type="submit" disabled={busy || !title.trim() || entrants.length < BRACKET_MIN}>Create bracket</ActionButton>
        </form>
      ) : null}
    </section>
  );
}
