import { Link } from 'react-router-dom';

// Merijn's real MK + aperture logo (public/logo.svg), inlined so the aperture
// can be animated on its own. Both the wordmark and the aperture inherit
// currentColor (white); the aperture "eye" blinks occasionally (off under
// reduced motion — see global.css).
export function Logo() {
  return (
    <Link to="/" className="logo" aria-label="Merijn Kersten — home">
      <svg className="logo__svg" viewBox="0 0 1073 518" role="img" aria-hidden="true" focusable="false">
        <path
          className="logo__mark"
          fill="currentColor"
          d="M899.87 0H757.06L533.58 258.97V0H531.29H424.07H380.35L265.63 188.7L151.69 0H0V517.98H107.28V137.63L202.01 292.28L244.19 359.63H287.85L329.28 292.28L424.01 137.63V517.98H424.07H531.29H533.58V260.48L603.89 343.34L755.58 517.98H898.39L676.39 260.48L899.87 0Z"
        />
        <path
          className="logo__aperture"
          fill="currentColor"
          d="M1016.33 245.03C985.412 245.03 960.362 219.97 960.362 189.06C960.362 168.18 972.292 150.68 989.242 141.06C975.812 136.18 961.522 133.08 946.412 133.08C876.882 133.08 820.512 189.45 820.512 258.98C820.512 328.51 876.882 384.88 946.412 384.88C1015.94 384.88 1072.31 328.51 1072.31 258.98C1072.31 243.87 1069.21 229.57 1064.33 216.14C1054.71 233.08 1037.22 245.02 1016.34 245.02L1016.33 245.03Z"
        />
      </svg>
      <span className="visually-hidden">Merijn Kersten — home</span>
    </Link>
  );
}
