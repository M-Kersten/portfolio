import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { cases, caseBySlug, site } from '../content';
import { FocusCard } from './FocusCard';
import { ProjectsCloud } from './ProjectsCloud';
import { Scramble } from './Scramble';

// The fullscreen "all projects" view (/projects) — reached from the button under
// the timeline. A standalone route (no header / no 3D), a constellation of every
// project; clicking a node opens the same case card the timeline uses.
export function ProjectsPage() {
  const [open, setOpen] = useState<string | null>(null);
  const study = open ? caseBySlug(open) : undefined;
  const items = cases; // the full index — highlights + the long tail

  useEffect(() => {
    const prev = document.title;
    document.title = `Projects — ${site.hero.name}`;
    return () => {
      document.title = prev;
    };
  }, []);

  return (
    <main id="main" className="pc-stage">
      <header className="pc-top">
        <Link className="pc-back" to="/">
          <span aria-hidden="true">←</span> Home
        </Link>
        <h1 className="pc-title">
          <Scramble text="Every project" />
        </h1>
        <span className="pc-count">{items.length} projects</span>
      </header>

      <ProjectsCloud items={items} onOpen={setOpen} />

      {study && <FocusCard study={study} onClose={() => setOpen(null)} onJump={setOpen} />}
    </main>
  );
}
