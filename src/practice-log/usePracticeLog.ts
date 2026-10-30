import { useCallback, useEffect, useState } from 'react';
import { listPracticeEntries, readPracticeGoals, subscribePracticeLog } from './storage';
import { EMPTY_GOALS, type PracticeEntry, type PracticeGoals } from './types';

/** The practice log and goals, kept up to date as entries are added anywhere in the app. */
export function usePracticeLog() {
  const [entries, setEntries] = useState<PracticeEntry[]>([]);
  const [goals, setGoals] = useState<PracticeGoals>(EMPTY_GOALS);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  const reload = useCallback(() => {
    Promise.all([listPracticeEntries(), readPracticeGoals()]).then(([nextEntries, nextGoals]) => {
      setEntries(nextEntries);
      setGoals(nextGoals);
      setStatus('ready');
    }, () => setStatus('error'));
  }, []);

  useEffect(() => {
    reload();
    return subscribePracticeLog(reload);
  }, [reload]);

  return { entries, goals, status };
}
