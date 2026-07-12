import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { site, cv } from '../content';
import { HOTSPOTS } from '../scene/framing';
import { asset } from '../lib/asset';

// The CV page (/cv) — an A4 document in the site's visual language, focused
// on work history and education. It is assembled from the same content as
// the site: career from site.json, plus the CV-only extras in cv.json.
// `npm run cv` prints it to public/cv.pdf (as many pages as the content
// needs); on screen it doubles as a shareable web CV with a small toolbar
// that print/PDF never sees.

/** "2024-06" + "2024-11" → "2024-06 — 2024-11"; open/future end → "now". */
function fmtRange(from: string, to: string | null) {
  const thisMonth = new Date().toISOString().slice(0, 7);
  return `${from} — ${!to || to >= thisMonth ? 'now' : to}`;
}

/** The site's blurbs are deliberately casual ("i worked…"); on a CV the
 *  standalone i reads as a typo, so it gets its capital here only. */
const formal = (text: string) => text.replace(/(^|\s)i(?=[\s'’])/g, '$1I');

export function CvPage() {
  useEffect(() => {
    const prev = document.title;
    document.title = `CV — ${site.hero.name}`;
    // Lets print CSS give the whole page canvas the paper background + a
    // light colour-scheme (html carries the site's dark scheme otherwise).
    document.documentElement.dataset.cv = '1';
    document.body.dataset.cv = '1';
    return () => {
      document.title = prev;
      delete document.documentElement.dataset.cv;
      delete document.body.dataset.cv;
    };
  }, []);

  const career = [...(site.career ?? [])].reverse(); // newest first
  const siteHost = cv.contact.find((c) => c.href?.startsWith('https://'))?.label ?? 'merijnkersten.nl';

  return (
    <main id="main" className="cv-stage">
      {/* screen-only chrome — @media print hides it, so the PDF never sees it */}
      <nav className="cv-tools">
        <Link to="/">← back to the site</Link>
        <a href={asset('/cv.pdf')} download>
          download PDF
        </a>
      </nav>

      <article className="cv">
        <header>
          <div className="cv-top">
            <span>Curriculum vitae — {new Date().getFullYear()}</span>
            <span>{siteHost}</span>
          </div>
          <div className="cv-frame">
            <u className="cv-ck cv-tl" /><u className="cv-ck cv-tr" /><u className="cv-ck cv-bl" /><u className="cv-ck cv-br" />
            <h1>{site.hero.name}</h1>
            <p className="cv-tagline">{cv.tagline}</p>
            <div className="cv-contact">
              {cv.contact.map((c) =>
                c.href ? (
                  <a key={c.label} href={c.href}>
                    {c.label}
                  </a>
                ) : (
                  <span key={c.label}>{c.label}</span>
                ),
              )}
            </div>
          </div>
        </header>

        {/* work history — the site's timeline as a route line with month pins */}
        <section aria-label="Experience">
          <div className="cv-lbl cv-sec">Experience</div>
          <div className="cv-xp">
            <div className="cv-route" />
            {career.map((job) => (
              <div key={`${job.company}${job.from}`} className="cv-job">
                <s />
                <div className="cv-when">{fmtRange(job.from, job.to)}</div>
                <h3>{job.role ?? job.company}</h3>
                <div className="cv-co">
                  {job.company}
                  {job.location ? ` · ${job.location}` : ''}
                </div>
                {job.blurb && <p>{formal(job.blurb)}</p>}
              </div>
            ))}
          </div>
        </section>

        <section aria-label="Education">
          <div className="cv-lbl cv-sec">Education</div>
          <ul className="cv-edu">
            {cv.education.map((e) => (
              <li key={e.school}>
                <b>{e.school}</b> — {e.degree}
              </li>
            ))}
          </ul>
        </section>

        <div className="cv-extras">
          <section>
            <div className="cv-lbl">Stack</div>
            <ul>
              {cv.stack.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </section>
          <section>
            <div className="cv-lbl">Languages</div>
            <ul>
              {cv.languages.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </section>
          <section>
            <div className="cv-lbl">Off the clock</div>
            <ul>
              <li>{cv.offTheClock}</li>
            </ul>
          </section>
        </div>

        <footer className="cv-foot">
          <span className="cv-pips" aria-hidden="true">
            {HOTSPOTS.map((h) => (
              <i key={h.slug} />
            ))}
          </span>
          <span>
            signals {HOTSPOTS.length}/{HOTSPOTS.length} — full project dossiers at {siteHost}
          </span>
        </footer>
      </article>
    </main>
  );
}
