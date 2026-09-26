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

// WebGL2 specifically: it's all three.js renders with, so a browser offering
// only WebGL1 gets the poster rather than a renderer that fails to start.
function detect(): boolean {
  try {
    if (new URLSearchParams(window.location.search).has('nogl')) return false;
    const canvas = document.createElement('canvas');
    // Why a context was refused, when the browser says (e.g. it blocked this
    // site after a GPU reset) — dispatched during getContext.
    let reason = '';
    canvas.addEventListener('webglcontextcreationerror', (e) => {
      reason = (e as WebGLContextEvent).statusMessage || reason;
    });
    const gl = canvas.getContext('webgl2');
    if (!gl) console.warn(`WebGL2 is unavailable${reason ? ` (${reason})` : ''}; showing the static poster.`);
    return !!gl;
  } catch {
    return false;
  }
}
