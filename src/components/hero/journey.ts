// The scroll journey down the hero, as the page sees it. The hero is a tall
// track over the fixed canvas, and its panels (HeroStage) are the journey's
// beats: the entrance (the city, under your name), then each floor with its
// text (city, room, chip). A beat is a stretch of scrolling that holds one
// framing, so its length is its panel's height, set once in hero.css. Which
// floor the camera frames on each beat is BEAT_STEP (scene/framing.ts).
import { LAYER_STEP, type LayerId } from '../../scene/framing';

/** The beat a floor's own text is on (the entrance is beat 0). */
export const beatOfLayer = (layer: LayerId) => LAYER_STEP[layer] + 1;

const panels = (hero: HTMLElement) => [...hero.querySelectorAll<HTMLElement>('.hero__panel')];

/** The beat the scroll is on: the last panel whose top has reached the top of
 *  the screen. The last beat holds while the next section comes up over it. */
export function beatAt(hero: HTMLElement, list: HTMLElement[] = panels(hero)): number {
  const scrolled = -hero.getBoundingClientRect().top;
  let beat = 0;
  for (let i = 1; i < list.length; i++) if (scrolled >= list[i].offsetTop - 1) beat = i;
  return beat;
}

/** Where to scroll to stand on a beat: `at` of the way through it (0 its
 *  start, 0.5 its middle). */
export function beatTop(hero: HTMLElement, beat: number, at = 0.5): number {
  const top = hero.getBoundingClientRect().top + window.scrollY;
  const p = panels(hero)[beat];
  return p ? top + p.offsetTop + p.offsetHeight * at : top;
}
