import { useEffect, useState } from 'react';
import { byDate, cases, caseBySlug, site } from '../../content';
import { Exhibit } from '../exhibit/Exhibit';
import { Footer } from '../shell/Footer';
import { Header } from '../shell/Header';
import { ProjectsIndex } from './ProjectsIndex';
import { SectionHead } from '../shell/SectionHead';

// The collection (/projects): every project, the ten exhibits in the model and
// the rest. Reached from the button under the timeline. A standalone route (no 3D): a filterable index of every project,
// where the homepage carries the atmosphere and this page carries the answers.
// It wears the rest of the site's chrome — the same header and footer, and an
// opening built like every home section's (kicker, measuring rule, display
// title, lead) — so it reads as one more room of the same building rather than
// an admin screen. Clicking a card opens the same case card the timeline uses.
//
// The heading lives here rather than in site.json: the CMS round-trips that
// file against a fixed model, and a key it doesn't know would be dropped on the
// next publish.
const TITLE = 'The collection';
const LEAD = 'Here’s where I keep all my projects.';

export function ProjectsPage() {
  const [open, setOpen] = useState<string | null>(null);
  const study = open ? caseBySlug(open) : undefined;
  const items = cases; // the full index — highlights + the long tail

  useEffect(() => {
    const prev = document.title;
    document.title = `The collection — ${site.hero.name}`;
    return () => {
      document.title = prev;
    };
  }, []);

  return (
    <>
      <Header />
      <main id="main" className="pc-stage">
        <section className="section pc">
          <div className="container">
            <SectionHead id="work" level={1} title={TITLE} lead={LEAD} />
            <ProjectsIndex items={items} onOpen={setOpen} />
          </div>
        </section>
        <Footer />
        {study && <Exhibit study={study} place="page" collection={byDate(cases)} onClose={() => setOpen(null)} onWalk={setOpen} />}
      </main>
    </>
  );
}
