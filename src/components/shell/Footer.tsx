import { site } from '../../content';

/** The CMS the site's content is edited in (it asks for a sign-in). */
const CMS = 'https://merijn-cms.azurewebsites.net/';

export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer__inner">
        <span>
          © {new Date().getFullYear()} {site.brand}
        </span>
        {/* the way into the CMS; nofollow so crawlers don't chase a sign-in wall */}
        <a className="footer__admin ui-link" href={CMS} target="_blank" rel="noreferrer nofollow">
          Edit
        </a>
      </div>
    </footer>
  );
}
