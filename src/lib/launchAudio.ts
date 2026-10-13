// The launch film's sound, on the site's sound engine (lib/sound.ts): the
// countdown read out from the press of LAUNCH, the deluge's water, the roar
// following the engines' thrust (muffled once the camera's far off, close
// again at the tower for the catch), the clamps letting go and the arms
// taking the booster. LaunchHud drives it every frame from the film's clock.
import { BOOSTER_ENGINES, SHIP_ENGINES, T, boosterEngines, deluge, shipEngines } from '../scene/launchPlan';
import { loop, play, type Loop } from './sound';

const b = new Float32Array(BOOSTER_ENGINES);
const s = new Float32Array(SHIP_ENGINES);

export function launchAudio() {
  let roar: Loop | null = null;
  let water: Loop | null = null;
  let counted = false;
  let released = false;
  let caught = false;
  return {
    /** One frame of the film, at film time t. */
    update(t: number) {
      if (!counted) {
        counted = true;
        play('launch-count', { bus: 'launch' });
        roar = loop('launch-roar', 'launch');
        water = loop('launch-deluge', 'launch');
      }
      boosterEngines(t, b);
      shipEngines(t, s);
      let bt = 0;
      for (const x of b) bt += x;
      bt /= BOOSTER_ENGINES;
      let st = 0;
      for (const x of s) st += x;
      st /= SHIP_ENGINES;
      // how close the microphone is: on the ground through the climb past the
      // tower, far once the film turns time-lapse, close again for the catch
      const home = t >= T.ret;
      const near = home ? 0.8 : t < T.clear ? 1 : 0.35;
      roar?.set(Math.min(1, (home ? bt : Math.max(bt, st * 0.6)) * 1.15) * near, 0.15);
      water?.set(deluge(t) * 0.8, 0.3);
      if (!released && t >= T.release) {
        released = true;
        play('launch-release', { bus: 'launch' });
      }
      if (!caught && t >= T.catch) {
        caught = true;
        play('launch-catch', { bus: 'launch' });
      }
    },
    /** The film's over (or skipped). */
    stop() {
      roar?.stop(1.2);
      water?.stop(0.6);
    },
  };
}
