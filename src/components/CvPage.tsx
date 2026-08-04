import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { site, cvByLang } from '../content';
import { asset } from '../lib/asset';

// The CV page (/cv) — an A4 document in the site's visual language, focused on
// work history and education. Bilingual: English by default, Dutch at
// /cv?lang=nl. The work-history STRUCTURE comes from site.json; the language
// packs (cv.json / cv.nl.json) carry every string plus each entry's Dutch
// sector/detail. `npm run cv` prints both public/cv.pdf and public/cv-nl.pdf.

/** "2024-06" + "2024-11" → "2024-06 — 2024-11"; open/future end → the "now"
 *  label for the current language. */
function fmtRange(from: string, to: string | null, now: string) {
  const thisMonth = new Date().toISOString().slice(0, 7);
  return `${from} — ${!to || to >= thisMonth ? now : to}`;
}

/** The site's blurbs are deliberately casual ("i worked…"); on a CV the
 *  standalone i reads as a typo, so it gets its capital here only. (Harmless
 *  for Dutch, which has no standalone "i".) */
const formal = (text: string) => text.replace(/(^|\s)i(?=[\s'’])/g, '$1I');

export function CvPage() {
  const lang = new URLSearchParams(useLocation().search).get('lang') === 'nl' ? 'nl' : 'en';
  const cv = cvByLang[lang];
  const t = cv.ui;

  useEffect(() => {
    const prev = document.title;
    document.title = `CV — ${site.hero.name}`;
    document.documentElement.lang = lang;
    // Lets print CSS give the whole page canvas the paper background + a
    // light colour-scheme (html carries the site's dark scheme otherwise).
    document.documentElement.dataset.cv = '1';
    document.body.dataset.cv = '1';
    return () => {
      document.title = prev;
      document.documentElement.lang = 'en';
      delete document.documentElement.dataset.cv;
      delete document.body.dataset.cv;
    };
  }, [lang]);

  // Merge the language pack's per-entry text onto the site's career structure,
  // then reverse to newest-first. (site.career + cv.career share one order.)
  const career = (site.career ?? [])
    .map((job, i) => {
      const tr = cv.career?.[i];
      return { ...job, sector: tr?.sector ?? job.sector, detail: tr?.detail ?? job.detail };
    })
    .reverse();
  // Years of experience, computed from the earliest career start.
  const first = (site.career ?? []).reduce((a, j) => (j.from < a ? j.from : a), '9999-12');
  const years = Math.floor((Date.now() - new Date(`${first}-01`).getTime()) / 31557600000);

  return (
    <main id="main" className="cv-stage">
      {/* screen-only chrome — @media print hides it, so the PDF never sees it */}
      <nav className="cv-tools">
        <Link to="/">← {t.back}</Link>
        <span className="cv-langs" aria-label="Language">
          <Link to="/cv" data-on={lang === 'en' || undefined}>
            EN
          </Link>
          <Link to="/cv?lang=nl" data-on={lang === 'nl' || undefined}>
            NL
          </Link>
        </span>
        <a href={asset(lang === 'nl' ? '/cv-nl.pdf' : '/cv.pdf')} download>
          {t.download}
        </a>
      </nav>

      <article className="cv">
        {/* black header band — the dithered portrait (5.png) emerges from it */}
        <header className="cv-head">
          <div className="cv-id">
            <h1>{site.hero.name}</h1>
            <p className="cv-tagline">{cv.tagline}</p>
            {/* home base + phone lead; the web/social links sit quieter below */}
            <div className="cv-where">
              <span className="cv-loc">{cv.location}</span>
              {cv.phone && (
                <a className="cv-phone" href={`tel:${cv.phone.replace(/\s/g, '')}`}>
                  {cv.phone}
                </a>
              )}
            </div>
            <div className="cv-contact">
              {cv.links.map((c) =>
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
          {cv.photo && <img className="cv-photo" src={asset(cv.photo)} alt={site.hero.name} />}
        </header>

        <section aria-label={t.profile}>
          <h2 className="cv-lbl cv-sec">
            {t.profile} — {years}+ {t.yearsUnit}
          </h2>
          <p className="cv-profile">{cv.profile}</p>
        </section>

        {/* work history — flush-left entries, newest first */}
        <section aria-label={t.experience}>
          <h2 className="cv-lbl cv-sec">{t.experience}</h2>
          {career.map((job) => {
            const story = job.detail ?? job.blurb;
            const meta = [job.sector, job.tech?.join(' · ')].filter(Boolean).join('  —  ');
            return (
              <div key={`${job.company}${job.from}`} className="cv-job">
                {/* black company mark, aligned to the right edge; missing files
                    (e.g. no DTT logo) hide themselves rather than break */}
                {job.logo && (
                  <img
                    className="cv-logo"
                    src={asset(job.logo)}
                    alt={job.company}
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                )}
                <div className="cv-when">{fmtRange(job.from, job.to, t.now)}</div>
                <h3>{job.role ?? job.company}</h3>
                <div className="cv-co">
                  {job.company}
                  {job.location ? ` · ${job.location}` : ''}
                </div>
                {meta && <div className="cv-meta">{meta}</div>}
                {story && <p>{formal(story)}</p>}
              </div>
            );
          })}
        </section>

        <section aria-label={t.education} className="cv-keep">
          <h2 className="cv-lbl cv-sec">{t.education}</h2>
          {cv.education.map((e) => (
            <div key={e.school} className="cv-edu">
              {e.from && e.to && (
                <div className="cv-when">
                  {e.from} — {e.to}
                </div>
              )}
              <h3>{e.degree}</h3>
              <div className="cv-co">
                {e.school}
                {e.location ? ` · ${e.location}` : ''}
              </div>
              {e.note && <p>{e.note}</p>}
            </div>
          ))}
        </section>

        {cv.certificates && cv.certificates.length > 0 && (
          <section aria-label={t.certificates}>
            <h2 className="cv-lbl cv-sec">{t.certificates}</h2>
            <ul className="cv-certs">
              {cv.certificates.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </section>
        )}

        <div className="cv-extras">
          <section>
            <h2 className="cv-lbl">{t.stack}</h2>
            <ul className="cv-stack">
              {cv.stack.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </section>
          <section>
            <h2 className="cv-lbl">{t.languages}</h2>
            <ul>
              {cv.languages.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </section>
          <section>
            <h2 className="cv-lbl">{t.offTheClockLabel}</h2>
            <ul>
              <li>{cv.offTheClock}</li>
            </ul>
          </section>
        </div>
      </article>
    </main>
  );
}
