import { site } from '../content';

export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer__inner">
        <span>
          © {new Date().getFullYear()} {site.brand}
        </span>
        {/* Way in to the CMS. Kept quiet — it's for one person, and it's the
            only thing down here that isn't about the site itself. nofollow so
            crawlers don't chase a sign-in wall. */}
        <a
          className="footer__admin"
          href="https://merijn-cms.azurewebsites.net/"
          target="_blank"
          rel="noreferrer nofollow"
        >
          Edit
        </a>
      </div>
    </footer>
  );
}
