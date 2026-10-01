import { useEffect, useMemo, useState } from 'react';
import { cases, caseBySlug, site } from '../content';
import { FocusCard } from './FocusCard';
import { Footer } from './Footer';
import { Header } from './Header';
import { ProjectsIndex } from './ProjectsIndex';
import { SectionHead } from './SectionHead';

// The fullscreen "all projects" view (/projects) — reached from the button under
// the timeline. A standalone route (no 3D): a filterable index of every project,
// where the homepage carries the atmosphere and this page carries the answers.
// It wears the rest of the site's chrome — the same header and footer, and an
// opening built like every home section's (kicker, measuring rule, display
// title, lead) — so it reads as one more room of the same building rather than
// an admin screen. Clicking a card opens the same case card the timeline uses.
//
// The heading lives here rather than in site.json: the CMS round-trips that
// file against a fixed model, and a key it doesn't know would be dropped on the
// next publish.
const TITLE = "The director's cut";
const LEAD = 'The timeline is the theatrical release. This is everything: the hits, the deep cuts and the side quests.';

export function ProjectsPage() {
  const [open, setOpen] = useState<string | null>(null);
  const study = open ? caseBySlug(open) : undefined;
  const items = cases; // the full index — highlights + the long tail
  const since = useMemo(() => Math.min(...items.map((c) => Number(c.year?.slice(0, 4)) || Infinity)), [items]);

  useEffect(() => {
    const prev = document.title;
    document.title = `Projects — ${site.hero.name}`;
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
            <SectionHead id="work" level={1} title={TITLE} lead={LEAD} note={`${items.length} projects · ${since} → now`} />
            <ProjectsIndex items={items} onOpen={setOpen} />
          </div>
        </section>
        <Footer />
        {study && <FocusCard study={study} onClose={() => setOpen(null)} onJump={setOpen} />}
      </main>
    </>
  );
}
