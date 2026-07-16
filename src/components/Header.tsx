import { useState } from 'react';
import { Link } from 'react-router-dom';
import { site } from '../content';
import { Logo } from './Logo';
import { Search } from './Search';
import { SocialLinks } from './SocialLinks';

export function Header() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <header className="header">
      <div className="container header__inner">
        <Logo />

        <div className="header__right">
          <Search />

          <nav id="primary-nav" className="nav" data-open={open} aria-label="Primary">
            {site.nav.map((item) => (
              <Link key={item.href} to={{ pathname: '/', hash: item.href }} className="nav__link" onClick={close}>
                {item.label}
              </Link>
            ))}
            <SocialLinks className="nav__social" />
          </nav>

          <button
            type="button"
            className="nav__toggle"
            aria-expanded={open}
            aria-controls="primary-nav"
            onClick={() => setOpen((v) => !v)}
          >
            <span className="visually-hidden">Menu</span>
            <span aria-hidden="true">{open ? '✕' : '☰'}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
