import { describe, expect, it } from 'vitest';
import {
  buildBracket, buildLeaderboard, cleanOptions, containsLink, groupThreads, parseEntrants, periodStart, pollState, rankStandings, roundName,
  setBracketWinner, tallyPoll, textProblem, type ClubPost, type ClubResult,
} from './community';

describe('what can be posted', () => {
  it('refuses links, empty text and long text with a plain message', () => {
    expect(containsLink('see https://example.com')).toBe(true);
    expect(containsLink('WWW.example.com')).toBe(true);
    expect(containsLink('great end today: 9, 10, X')).toBe(false);
    expect(textProblem('  ', 500)).toContain('empty');
    expect(textProblem('x'.repeat(501), 500)).toContain('500');
    expect(textProblem('look at www.site.org', 500)).toContain('Links');
    expect(textProblem('Nice shooting!', 500)).toBeNull();
  });

  it('cleans poll options', () => {
    expect(cleanOptions(['  Asha ', 'asha', '', 'Ben', 'x'.repeat(100)]).map((option) => option.length)).toEqual([4, 3, 60]);
    expect(cleanOptions(Array.from({ length: 12 }, (_, index) => `o${index}`))).toHaveLength(8);
  });
});

describe('polls and predictions', () => {
  const poll = { id: 'p1', options: ['A', 'B', 'C'] };
  it('counts votes and names a leader only when there is one', () => {
    const rows = [{ poll_id: 'p1', option_index: 0, votes: 2 }, { poll_id: 'p1', option_index: 2, votes: 5 }, { poll_id: 'other', option_index: 1, votes: 9 }, { poll_id: 'p1', option_index: 7, votes: 3 }];
    expect(tallyPoll(poll, rows)).toEqual({ counts: [2, 0, 5], total: 7, leader: 2 });
    expect(tallyPoll(poll, [{ poll_id: 'p1', option_index: 0, votes: 1 }, { poll_id: 'p1', option_index: 1, votes: 1 }]).leader).toBeNull();
    expect(tallyPoll(poll, []).leader).toBeNull();
  });

  it('knows whether a poll is open, closed or settled', () => {
    const now = Date.parse('2026-11-02T12:00:00Z');
    expect(pollState({ closes_at: '2026-11-03T00:00:00Z', correct_option: null }, now)).toBe('open');
    expect(pollState({ closes_at: '2026-11-01T00:00:00Z', correct_option: null }, now)).toBe('closed');
    expect(pollState({ closes_at: '2026-11-03T00:00:00Z', correct_option: 1 }, now)).toBe('settled');
  });

  it('ranks predictions, sharing a rank on a tie', () => {
    const ranked = rankStandings([
      { display_name: 'Ben', correct: 3, answered: 5 },
      { display_name: 'Asha', correct: 3, answered: 5 },
      { display_name: 'Cy', correct: 4, answered: 8 },
      { display_name: 'Di', correct: 3, answered: 4 },
    ]);
    expect(ranked.map((row) => `${row.rank} ${row.display_name}`)).toEqual(['1 Cy', '2 Di', '3 Asha', '3 Ben']);
  });
});

describe('the forum', () => {
  const post = (id: string, parent: string | null, at: string): ClubPost => ({ id, club_id: 'c', parent_id: parent, author_id: 'a', author_name: 'Asha', title: parent ? null : `T${id}`, body: 'b', created_at: at, hidden_at: null });
  it('groups replies under their thread and puts the busiest first', () => {
    const threads = groupThreads([post('t1', null, '2026-11-01T10:00'), post('t2', null, '2026-11-01T11:00'), post('r1', 't1', '2026-11-01T12:00'), post('orphan', 'gone', '2026-11-01T13:00')]);
    expect(threads.map((thread) => thread.thread.id)).toEqual(['t1', 't2']);
    expect(threads[0].replies.map((reply) => reply.id)).toEqual(['r1']);
  });
});

describe('the leaderboard', () => {
  const result = (author: string, name: string, score: number, max: number, arrows: number, on: string): ClubResult => ({ id: `${author}${on}${score}`, club_id: 'c', author_id: author, author_name: name, round_label: 'Round', score, max_score: max, arrows, shot_on: on, created_at: on });
  const now = new Date(2026, 10, 4, 12); // Wednesday 4 Nov 2026
  const results = [
    result('a', 'Asha', 540, 600, 60, '2026-11-03'),
    result('a', 'Asha', 280, 300, 30, '2026-10-20'),
    result('b', 'Ben', 330, 360, 36, '2026-11-02'),
    result('c', 'Cy', 100, 360, 36, '2026-11-04'),
  ];

  it('finds the start of the week and month', () => {
    expect(periodStart('week', now)).toBe('2026-11-02');
    expect(periodStart('month', now)).toBe('2026-11-01');
    expect(periodStart('all', now)).toBeNull();
    expect(periodStart('week', new Date(2026, 10, 8, 9))).toBe('2026-11-02'); // Sunday belongs to the week that began Monday
  });

  it('compares results as a share of each round and respects the period', () => {
    const week = buildLeaderboard(results, 'best', 'week', now);
    expect(week.map((row) => row.name)).toEqual(['Ben', 'Asha', 'Cy']);
    expect(week[0].bestPct).toBeCloseTo(91.67, 1);
    const all = buildLeaderboard(results, 'best', 'all', now);
    expect(all[0]).toMatchObject({ name: 'Asha', results: 2, arrows: 90 });
    expect(all[0].bestPct).toBeCloseTo(93.33, 1);
    expect(all[0].averagePct).toBeCloseTo(91.67, 1);
  });

  it('ranks volume and shares a rank on equal values', () => {
    const volume = buildLeaderboard(results, 'volume', 'all', now);
    expect(volume.map((row) => [row.name, row.rank])).toEqual([['Asha', 1], ['Ben', 2], ['Cy', 2]]);
    expect(buildLeaderboard([], 'best', 'all', now)).toEqual([]);
  });
});

describe('the bracket', () => {
  it('lays out eight entrants with the top seeds meeting last', () => {
    const view = buildBracket(8);
    expect(view.rounds.map((round) => round.length)).toEqual([4, 2, 1]);
    expect(view.rounds[0].map((match) => [match.a, match.b])).toEqual([[0, 7], [3, 4], [1, 6], [2, 5]]);
    expect(view.champion).toBeNull();
    expect(roundName(0, 3)).toBe('Quarter-finals');
    expect(roundName(1, 3)).toBe('Semi-finals');
    expect(roundName(2, 3)).toBe('Final');
    expect(roundName(0, 4)).toBe('Round of 16');
  });

  it('gives the top seeds a bye when the field is not a power of two', () => {
    const view = buildBracket(5);
    expect(view.rounds[0].filter((match) => match.bye).map((match) => match.winner).sort()).toEqual([0, 1, 2]);
    expect(view.rounds[0][1]).toMatchObject({ a: 3, b: 4, bye: false, winner: null });
    expect(view.rounds[1][0]).toMatchObject({ a: 0, b: null });
  });

  it('moves winners on, names a champion, and drops results that stop making sense', () => {
    let winners: Record<string, number> = {};
    winners = setBracketWinner(4, winners, 'r0m0', 0);
    winners = setBracketWinner(4, winners, 'r0m1', 1);
    expect(buildBracket(4, winners).rounds[1][0]).toMatchObject({ a: 0, b: 1 });
    winners = setBracketWinner(4, winners, 'r1m0', 1);
    expect(buildBracket(4, winners).champion).toBe(1);
    // Changing an early result removes the final's winner, because entrant 1 is no longer in it.
    winners = setBracketWinner(4, winners, 'r0m1', 2);
    expect(winners).toEqual({ r0m0: 0, r0m1: 2 });
    expect(buildBracket(4, winners).champion).toBeNull();
    // A winner who is not in the match is ignored, and a result can be cleared.
    expect(buildBracket(4, { r0m0: 2 }).rounds[0][0]).toMatchObject({ a: 0, b: 3, winner: null }); // entrant 2 is not in that match
    expect(setBracketWinner(4, winners, 'r0m0', null)).toEqual({ r0m1: 2 });
  });

  it('reads entrants from typed text', () => {
    expect(parseEntrants('Asha, Ben\nCy\n\nasha')).toEqual(['Asha', 'Ben', 'Cy']);
    expect(parseEntrants(Array.from({ length: 30 }, (_, index) => `P${index}`).join(','))).toHaveLength(16);
  });
});
