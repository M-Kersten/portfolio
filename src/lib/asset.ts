// Resolve a public-folder path against the deploy base (Vite's BASE_URL), so
// the same code serves from "/" (Vercel) and "/portfolio/" (GitHub Pages).
export function asset(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return base + (path.startsWith('/') ? path : '/' + path);
}
