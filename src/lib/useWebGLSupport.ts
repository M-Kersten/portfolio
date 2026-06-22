import { useEffect, useState } from 'react';

/**
 * Detects whether WebGL is usable. Returns `null` while checking (first paint),
 * then `true`/`false`. Append `?nogl` to the URL to force the static fallback
 * for testing (§4 "Fallback", §11). The page is never empty either way.
 */
export function useWebGLSupport(): boolean | null {
  const [supported, setSupported] = useState<boolean | null>(null);
  useEffect(() => setSupported(detect()), []);
  return supported;
}

function detect(): boolean {
  try {
    if (new URLSearchParams(window.location.search).has('nogl')) return false;
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl');
    return !!gl;
  } catch {
    return false;
  }
}
