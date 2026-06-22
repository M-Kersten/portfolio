import { useEffect, useState } from 'react';

export type AssetStatus = 'checking' | 'present' | 'absent';

/**
 * HEAD-checks whether a baked model exists at `url`. Lets the twin load the real
 * 3DBAG `.glb` when it has been dropped in, and fall back to the honest
 * procedural placeholder when it hasn't — with no GLTFLoader 404 noise.
 */
export function useAssetExists(url: string): AssetStatus {
  const [status, setStatus] = useState<AssetStatus>('checking');

  useEffect(() => {
    let alive = true;
    setStatus('checking');
    fetch(url, { method: 'HEAD' })
      .then((res) => alive && setStatus(res.ok ? 'present' : 'absent'))
      .catch(() => alive && setStatus('absent'));
    return () => {
      alive = false;
    };
  }, [url]);

  return status;
}
