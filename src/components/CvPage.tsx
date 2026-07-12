import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { site, capabilities, cv, caseBySlug } from '../content';
import { HOTSPOTS } from '../scene/framing';
import { asset } from '../lib/asset';

// The CV page (/cv) — an A4 sheet in the site's visual language, assembled
// from the same content as the site: career from site.json, the three scales
// from capabilities.json, project one-liners from cases.json, plus the
// CV-only extras in cv.json. `npm run cv` snapshots it (and its ?dark twin)
// into public/cv.pdf / public/cv-dark.pdf; on screen it doubles as a
// shareable web CV with a small toolbar that print/PDF never sees.

const ACCENT: Record<string, string> = {
  city: 'var(--cv-c1)',
  room: 'var(--cv-c2)',
  chip: 'var(--cv-c3)',
};

/** "2024-06" + "2024-11" → "2024-06 — 2024-11"; open/future end → "now". */
function fmtRange(from: string, to: string | null) {
  const thisMonth = new Date().toISOString().slice(0, 7);
  return `${from} — ${!to || to >= thisMonth ? 'now' : to}`;
}

export function CvPage() {
  const dark = new URLSearchParams(useLocation().search).has('dark');

  useEffect(() => {
    const prev = document.title;
    document.title = `CV — ${site.hero.name}`;
    return () => {
      document.title = prev;
    };
  }, []);

  const career = [...(site.career ?? [])].reverse(); // newest first
  const projects = cv.projects.map((slug) => caseBySlug(slug)).filter((c) => c !== undefined);
  const siteHost = cv.contact.find((c) => c.href?.startsWith('https://'))?.label ?? 'merijnkersten.nl';

  return (
    <main id="main" className="cv-stage">
      {/* screen-only chrome — @media print hides it, so the PDF never sees it */}
      <nav className="cv-tools">
        <Link to="/">← back to the site</Link>
        <Link to={dark ? '/cv' : '/cv?dark'}>{dark ? 'light version' : 'dark version'}</Link>
        <a href={asset(dark ? '/cv-dark.pdf' : '/cv.pdf')} download>
          download PDF
        </a>
      </nav>

      <article className="cv" data-theme={dark ? 'dark' : undefined}>
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

        {/* the three scales — same ladder as the maquette + capabilities band */}
        <section className="cv-scales">
          {capabilities.map((c) => {
            const [name, rest] = c.title.split(':');
            return (
              <div key={c.layer} className="cv-scale">
                <div className="cv-lbl" style={{ color: ACCENT[c.layer] }}>
                  <s style={{ background: ACCENT[c.layer] }} />
                  {c.index} · {name}
                </div>
                <p>{(rest ?? '').trim()}</p>
                <div className="cv-tags">{c.tags.join(' · ')}</div>
              </div>
            );
          })}
        </section>

        <div className="cv-cols">
          {/* experience — the site's timeline, as a route line with month pins */}
          <section className="cv-xp" aria-label="Experience">
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
                {job.blurb && <p>{job.blurb}</p>}
              </div>
            ))}
          </section>

          <aside className="cv-side">
            <section>
              <div className="cv-lbl">Stack</div>
              <ul>
                {cv.stack.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </section>
            <section>
              <div className="cv-lbl">Selected projects</div>
              <ul>
                {projects.map((p) => (
                  <li key={p.slug} className="cv-proj">
                    <b style={{ color: ACCENT[p.layer] }}>{p.title}</b>
                    <span>{p.outcome}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <div className="cv-lbl">Education</div>
              <ul>
                {cv.education.map((e) => (
                  <li key={e.school}>
                    <b>{e.school}</b> — {e.degree}
                  </li>
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
          </aside>
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
