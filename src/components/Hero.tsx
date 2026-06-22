import { Link } from 'react-router-dom';
import { site } from '../content';

// The 30-second path is real HTML, never locked behind the canvas (§12): name,
// the three pillars, proof points and contact are all readable text. The 3D
// behind it (the persistent canvas) is enhancement.
export function Hero() {
  const { hero } = site;
  return (
    <section id="hero" className="hero">
      <div className="container hero__copy">
        <h1 className="hero__name">{hero.name}</h1>
        <p className="hero__tagline" dangerouslySetInnerHTML={{ __html: hero.tagline }} />
        <ul className="hero__metric">
          {hero.metrics.map((m, i) => (
            <li key={i} dangerouslySetInnerHTML={{ __html: m }} />
          ))}
        </ul>
        <div className="hero__actions">
          <Link className="btn" to={{ pathname: '/', hash: '#work' }}>
            See the work
          </Link>
          <Link className="btn btn--ghost" to={{ pathname: '/work/municipal-twin' }}>
            Explore the live twin →
          </Link>
        </div>
      </div>
      <Link className="hero__scrollcue" to={{ pathname: '/', hash: '#capabilities' }}>
        Scroll
      </Link>
    </section>
  );
}
