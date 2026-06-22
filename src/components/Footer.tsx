import { site } from '../content';

export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer__inner">
        <span>
          © {new Date().getFullYear()} {site.brand}
        </span>
        <span className="footer__credit">
          Building data © {site.twinSource.dataset} ({site.twinSource.release}). Aerial imagery © PDOK where shown.
        </span>
      </div>
    </footer>
  );
}
