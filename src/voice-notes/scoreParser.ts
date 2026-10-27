/**
 * Finds an arrow score in a transcribed voice note: "ten", "X", "nine", "a seven", "10", "miss".
 * The result is only a suggestion; the athlete confirms it before it is saved.
 */
export interface ParsedScore {
  score: number;
  isX: boolean;
  /** The words the score was read from, to show the athlete. */
  matched: string;
}

const WORDS: Record<string, number> = {
  zero: 0, nil: 0, one: 1, won: 1, two: 2, to: 2, too: 2, three: 3, four: 4, for: 4, five: 5, six: 6,
  seven: 7, eight: 8, ate: 8, nine: 9, ten: 10,
};

// Words that only count as numbers when they are clearly said as a score ("a four"), not as ordinary words
// ("the last one", "too slow").
const AMBIGUOUS = new Set(['one', 'won', 'to', 'too', 'for', 'ate']);

const X_PATTERN = /\b(?:x|ex|inner ten|inner 10|x ring|bullseye)\b/;
// Not a bare "m": "I'm" becomes "i m" once punctuation is removed.
const MISS_PATTERN = /\b(?:miss|missed)\b/;

function normalise(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** The first score said in the note, or null when there is none. */
export function parseScore(text: string): ParsedScore | null {
  const clean = normalise(text);
  if (!clean) return null;

  const tokens = clean.split(' ');
  const candidates: Array<{ at: number; score: ParsedScore }> = [];

  const x = X_PATTERN.exec(clean);
  if (x) candidates.push({ at: x.index, score: { score: 10, isX: true, matched: x[0] } });
  const miss = MISS_PATTERN.exec(clean);
  if (miss) candidates.push({ at: miss.index, score: { score: 0, isX: false, matched: miss[0] } });

  let offset = 0;
  tokens.forEach((token, i) => {
    const at = offset;
    offset += token.length + 1;
    if (/^\d{1,2}$/.test(token)) {
      const value = Number(token);
      if (value <= 10) candidates.push({ at, score: { score: value, isX: false, matched: token } });
      return;
    }
    if (!(token in WORDS)) return;
    if (AMBIGUOUS.has(token)) {
      const previous = tokens[i - 1];
      const next = tokens[i + 1];
      const saidAsScore = previous === 'a' || previous === 'scored' || previous === 'score' || previous === 'shot' || next === undefined;
      if (!saidAsScore) return;
    }
    candidates.push({ at, score: { score: WORDS[token], isX: false, matched: token } });
  });

  if (!candidates.length) return null;
  candidates.sort((a, b) => a.at - b.at);
  // "inner ten" is read as X, not as the plain ten inside it.
  const first = candidates[0];
  const xHere = candidates.find((candidate) => candidate.score.isX && Math.abs(candidate.at - first.at) <= 6);
  return (xHere ?? first).score;
}

/** "X", "M" or the number, as the score is written elsewhere in the app. */
export function formatParsedScore(score: ParsedScore): string {
  return score.isX ? 'X' : score.score === 0 ? 'M' : String(score.score);
}
