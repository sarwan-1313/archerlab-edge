import { useCallback, useEffect, useRef, useState } from 'react';
import { connectHeartRate, heartRateSupported, type HeartRateConnection } from './heartRate';

/** A Bluetooth heart-rate monitor for the life of the page that uses it. */
export function useHeartRate() {
  const [bpm, setBpm] = useState<number | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const connection = useRef<HeartRateConnection | null>(null);

  const disconnect = useCallback(() => {
    connection.current?.disconnect();
    connection.current = null;
    setName(null);
    setBpm(null);
  }, []);

  const connect = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      connection.current = await connectHeartRate(setBpm, () => { connection.current = null; setName(null); setBpm(null); });
      setName(connection.current.name);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      if (!/cancel|chosen|NotFoundError/i.test(message)) setError(message);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => () => connection.current?.disconnect(), []);

  return { supported: heartRateSupported(), connected: Boolean(name), name, bpm, error, busy, connect, disconnect };
}
