/** The site's phone breakpoint — the same 760px the hero / node-HUD / hotspot
 *  stylesheets switch to their mobile layout at. The load intro (the camera
 *  dolly-in + the centred premise card) is a desktop flourish; on a phone the
 *  site just appears, so both the CameraRig dolly and the IntroCard opt out via
 *  this check. Read at load — the moment the intro would otherwise start. */
export const MOBILE_QUERY = '(max-width: 760px)';

export function isMobileViewport(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches;
}
