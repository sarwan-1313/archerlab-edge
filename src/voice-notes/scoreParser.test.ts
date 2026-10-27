import { describe, expect, it } from 'vitest';
import { formatParsedScore, parseScore } from './scoreParser';

const read = (text: string) => {
  const parsed = parseScore(text);
  return parsed ? formatParsedScore(parsed) : null;
};

describe('parseScore', () => {
  it.each([
    ['Ten.', '10'],
    ['nine', '9'],
    ['That was a seven, pulled left.', '7'],
    ['Scored 8, felt the clicker late', '8'],
    ['10', '10'],
    [' 6 ', '6'],
  ])('reads %j as %s', (text, expected) => {
    expect(read(text)).toBe(expected);
  });

  it.each([['X'], ['x!'], ['Inner ten, nice release'], ['It was an X'], ['ex']])('reads %j as X', (text) => {
    expect(read(text)).toBe('X');
  });

  it.each([['Miss.'], ['missed the boss completely']])('reads %j as a miss', (text) => {
    expect(read(text)).toBe('M');
  });

  it('takes the first score said', () => {
    expect(read('nine, the last one was a ten')).toBe('9');
  });

  it('ignores numbers that cannot be arrow scores', () => {
    expect(read('took 25 seconds to settle')).toBeNull();
  });

  it('does not read ordinary words that sound like numbers as scores', () => {
    expect(read('I went for a smoother release, too slow to anchor')).toBeNull();
    expect(read("I'm happy with that")).toBeNull();
  });

  it('reads those words when they are clearly said as a score', () => {
    expect(read('a four')).toBe('4');
    expect(read('that one was for')).toBe('4');
  });

  it('returns null when nothing in the note is a score', () => {
    expect(read('felt good, bow arm stayed up')).toBeNull();
    expect(read('')).toBeNull();
  });
});
