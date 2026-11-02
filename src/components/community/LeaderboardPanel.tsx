import { useCallback, useMemo, useState, type FormEvent } from 'react';
import { deleteItem, listResults, shareResult } from '../../cloud/account/community';
import { ROUND_LABEL_MAX, buildLeaderboard, type BoardKind, type BoardPeriod, type ClubResult } from '../../community/community';
import { ROUNDS, maxRoundScore } from '../../scoring/rounds';
import { ActionButton } from '../ActionButton';
import { AppIcon } from '../AppIcon';
import { useClubCall, useRefresh, type PanelProps } from './shared';

const BOARDS: Array<{ kind: BoardKind; label: string; note: string }> = [
  { kind: 'best', label: 'Best round', note: 'Highest single result, as a % of the round’s maximum' },
  { kind: 'average', label: 'Average', note: 'Average of all results in the period, as a %' },
  { kind: 'volume', label: 'Most arrows', note: 'Arrows shot, from the results shared' },
];
const PERIODS: Array<{ key: BoardPeriod; label: string }> = [{ key: 'week', label: 'This week' }, { key: 'month', label: 'This month' }, { key: 'all', label: 'All time' }];

const today = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };

/** A friendly club leaderboard from results members choose to share. Self-reported, so it is for fun, not an official ranking. */
export function LeaderboardPanel({ api, club }: PanelProps) {
  const { call, status } = useClubCall(api);
  const [results, setResults] = useState<ClubResult[] | null>(null);
  const [kind, setKind] = useState<BoardKind>('best');
  const [period, setPeriod] = useState<BoardPeriod>('week');
  const [roundId, setRoundId] = useState(ROUNDS[0].id);
  const [label, setLabel] = useState(ROUNDS[0].name);
  const [score, setScore] = useState('');
  const [maxScore, setMaxScore] = useState(String(maxRoundScore(ROUNDS[0])));
  const [arrows, setArrows] = useState(String(ROUNDS[0].ends * ROUNDS[0].arrowsPerEnd));
  const [shotOn, setShotOn] = useState(today());
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => { void call((session, client) => listResults(client, session, club.id)).then((rows) => { if (rows) setResults(rows); }); }, [call, club.id]);
  useRefresh(load, 60_000);
  const rows = useMemo(() => buildLeaderboard(results ?? [], kind, period), [results, kind, period]);
  const mineList = useMemo(() => (results ?? []).filter((result) => result.author_id === club.userId).slice(0, 10), [results, club.userId]);

  const pickRound = (id: string) => {
    setRoundId(id);
    const round = ROUNDS.find((item) => item.id === id);
    if (round) { setLabel(round.name); setMaxScore(String(maxRoundScore(round))); setArrows(String(round.ends * round.arrowsPerEnd)); }
  };

  const share = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const done = await call((session, client) => shareResult(client, session, { clubId: club.id, roundLabel: label, score: Number(score), maxScore: Number(maxScore), arrows: Number(arrows), shotOn }));
    setBusy(false);
    if (done) { setScore(''); load(); }
  };
  const remove = async (result: ClubResult) => { await call((session, client) => deleteItem(client, session, 'club_results', result.id)); load(); };

  const current = BOARDS.find((board) => board.kind === kind) ?? BOARDS[0];
  return (
    <>
      <section className="va-panel community-panel" aria-labelledby="community-board-title">
        <h2 id="community-board-title"><AppIcon name="crown" size={18} /> Club leaderboard</h2>
        <p className="va-muted">Results are shared by members themselves and not checked, so this is for friendly competition. Each result is compared as a percentage of its round’s maximum, so different rounds can sit on one board.</p>
        <div className="scoring-rounds" role="radiogroup" aria-label="Leaderboard">
          {BOARDS.map((board) => (
            <button key={board.kind} type="button" role="radio" aria-checked={kind === board.kind} className={`scoring-round${kind === board.kind ? ' is-selected' : ''}`} onClick={() => setKind(board.kind)}><strong>{board.label}</strong></button>
          ))}
        </div>
        <div className="va-viewtabs" role="radiogroup" aria-label="Period">
          {PERIODS.map((item) => <button key={item.key} type="button" role="radio" aria-checked={period === item.key} className={period === item.key ? 'is-selected' : ''} onClick={() => setPeriod(item.key)}>{item.label}</button>)}
        </div>
        <p className="va-faint">{current.note}</p>
        {status ? <p className="va-import-status" role="alert">{status}</p> : null}
        {results === null ? <p className="va-faint">Loading…</p> : rows.length === 0 ? <p className="va-faint">No results shared for this period yet. Be the first below.</p> : (
          <ol className="community-board">
            {rows.map((row) => (
              <li key={row.authorId} className={row.authorId === club.userId ? 'is-mine' : undefined}>
                <span className="community-board__rank">{row.rank}</span>
                <strong>{row.name}</strong>
                <span>{kind === 'best' ? `${row.bestPct.toFixed(1)}%` : kind === 'average' ? `${row.averagePct.toFixed(1)}%` : `${row.arrows} arrows`}<small> · {row.results} result{row.results === 1 ? '' : 's'}</small></span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <form className="va-panel community-panel community-compose--stack" onSubmit={(event) => void share(event)} aria-labelledby="community-share-title">
        <h2 id="community-share-title"><AppIcon name="share" size={18} /> Share a result</h2>
        <p className="va-muted">Only what you enter here is shared with the club: the round, your score, the arrows and the date, under the name you chose when you joined.</p>
        <div className="training-form__grid">
          <label><span>Round</span>
            <select value={roundId} onChange={(event) => pickRound(event.target.value)} disabled={busy}>{ROUNDS.map((round) => <option key={round.id} value={round.id}>{round.name}</option>)}</select>
          </label>
          <label><span>Name shown</span><input value={label} onChange={(event) => setLabel(event.target.value)} maxLength={ROUND_LABEL_MAX} disabled={busy} /></label>
          <label><span>Your score</span><input inputMode="numeric" value={score} onChange={(event) => setScore(event.target.value.replace(/\D/g, ''))} disabled={busy} /></label>
          <label><span>Round maximum</span><input inputMode="numeric" value={maxScore} onChange={(event) => setMaxScore(event.target.value.replace(/\D/g, ''))} disabled={busy} /></label>
          <label><span>Arrows shot</span><input inputMode="numeric" value={arrows} onChange={(event) => setArrows(event.target.value.replace(/\D/g, ''))} disabled={busy} /></label>
          <label><span>Date</span><input type="date" value={shotOn} max={today()} onChange={(event) => setShotOn(event.target.value)} disabled={busy} /></label>
        </div>
        {status ? <p className="va-import-status" role="alert">{status}</p> : null}
        <ActionButton variant="primary" type="submit" disabled={busy || !score || !label.trim() || !shotOn}>Share with the club</ActionButton>
        {mineList.length ? (
          <>
            <h3>Your shared results</h3>
            <ul className="community-results">
              {mineList.map((result) => <li key={result.id}><span>{result.shot_on} · {result.round_label} · {result.score}/{result.max_score} ({result.arrows} arrows)</span><button type="button" onClick={() => void remove(result)}>Remove</button></li>)}
            </ul>
          </>
        ) : null}
      </form>
    </>
  );
}
