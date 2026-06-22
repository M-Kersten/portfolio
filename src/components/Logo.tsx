import { useId } from 'react';
import { Link } from 'react-router-dom';

/** The aperture / lens mark from the MK logo — a disc with a crescent notch
 *  bitten from the upper-right. Inherits currentColor. */
export function ApertureMark({ className }: { className?: string }) {
  const raw = useId();
  const maskId = `aperture-${raw.replace(/[:]/g, '')}`;
  return (
    <svg className={className} viewBox="0 0 24 24" role="img" aria-hidden="true" focusable="false">
      <defs>
        <mask id={maskId}>
          <rect width="24" height="24" fill="black" />
          <circle cx="11" cy="13" r="10" fill="white" />
          <circle cx="20.5" cy="4.5" r="6.2" fill="black" />
        </mask>
      </defs>
      <rect width="24" height="24" fill="currentColor" mask={`url(#${maskId})`} />
    </svg>
  );
}

/** Header lockup: MK wordmark + aperture. Drop a real vector at public/logo.svg
 *  and swap this for an <img> if you want the exact letterforms. */
export function Logo() {
  return (
    <Link to="/" className="logo" aria-label="Merijn Kersten — home">
      <span className="logo__mk">MK</span>
      <ApertureMark className="logo__aperture" />
    </Link>
  );
}
