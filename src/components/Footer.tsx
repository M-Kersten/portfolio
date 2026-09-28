import { useState } from 'react';
import { site } from '../content';

const EDIT_KEY = 'mk:edit';

/** The way in to the CMS is for one person, so the public page doesn't carry
 *  it: open any page with `?edit` and it shows in this browser from then on
 *  (`?edit=off` puts it away again). It used to sit here for every visitor,
 *  faint enough to fail contrast, and an admin link on a public page besides. */
function useEditLink(): boolean {
  const [on] = useState(() => {
    try {
      const q = new URLSearchParams(window.location.search).get('edit');
      if (q === 'off') localStorage.removeItem(EDIT_KEY);
      else if (q !== null) localStorage.setItem(EDIT_KEY, '1');
      return localStorage.getItem(EDIT_KEY) === '1';
    } catch {
      return false; // storage blocked: no link, which is the public default anyway
    }
  });
  return on;
}

export function Footer() {
  const edit = useEditLink();
  return (
    <footer className="footer">
      <div className="container footer__inner">
        <span>
          © {new Date().getFullYear()} {site.brand}
        </span>
        {/* nofollow so crawlers don't chase a sign-in wall */}
        {edit && (
          <a
            className="footer__admin ui-link"
            href="https://merijn-cms.azurewebsites.net/"
            target="_blank"
            rel="noreferrer nofollow"
          >
            Edit
          </a>
        )}
      </div>
    </footer>
  );
}
