import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from './api';

export function useResource<T>(loader: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    let current = true;
    setLoading(true); setError(null);
    void loader().then(value => { if (current) setData(value); }).catch(failure => { if (current) setError(errorMessage(failure)); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [loader, revision]);
  return { data, error, loading, refresh };
}
