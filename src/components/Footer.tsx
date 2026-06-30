import { site } from '../content';

export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer__inner">
        <span>
          © {new Date().getFullYear()} {site.brand}
        </span>
      </div>
    </footer>
  );
}
