import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useSceneSelector } from '../scene/store';
import { resolvePlace } from '../data/places';
import { useWebGLSupport } from '../lib/useWebGLSupport';

// The twin as a live web map (MapLibre). A self-contained dark style over
// OpenFreeMap's keyless OpenMapTiles vector tiles — no external style.json to
// 404, no API key. Buildings are extruded in 3D and coloured by height; water +
// roads give context. Attribution is shown by MapLibre.
//
// "Live tiles" — it needs the viewer's browser to reach tiles.openfreemap.org,
// unlike the firewall-proof baked model.

const FALLBACK_CENTER: [number, number] = [5.0414, 52.3083]; // Weesp

const HEIGHT = ['coalesce', ['get', 'render_height'], ['get', 'height'], 6];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const STYLE: any = {
  version: 8,
  sources: {
    omt: {
      type: 'vector',
      url: 'https://tiles.openfreemap.org/planet',
      attribution: '© OpenStreetMap contributors · OpenFreeMap',
    },
  },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': '#0a0d10' } },
    { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { 'fill-color': '#0c1a23' } },
    {
      id: 'roads',
      type: 'line',
      source: 'omt',
      'source-layer': 'transportation',
      minzoom: 10,
      paint: {
        'line-color': '#1c2832',
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.3, 16, 2.4],
      },
    },
    {
      id: 'buildings',
      type: 'fill-extrusion',
      source: 'omt',
      'source-layer': 'building',
      minzoom: 13,
      paint: {
        'fill-extrusion-color': ['interpolate', ['linear'], HEIGHT, 3, '#163139', 12, '#1d818a', 28, '#27e8f2'],
        'fill-extrusion-height': HEIGHT,
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': 0.9,
      },
    },
  ],
};

export default function TwinMap() {
  const placeId = useSceneSelector((s) => s.placeId);
  const resetNonce = useSceneSelector((s) => s.resetNonce);
  const webgl = useWebGLSupport();
  const place = resolvePlace(placeId);

  const center: [number, number] = place.map?.center ?? FALLBACK_CENTER;
  const zoom = place.map?.zoom ?? 15;
  const pitch = place.view.pitch ?? 50;
  const bearing = place.view.bearing ?? 0;

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const firstReset = useRef(true);

  useEffect(() => {
    if (!webgl || !containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE,
      center,
      zoom,
      pitch,
      bearing,
      maxPitch: 70,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    // Swallow tile/network errors so a flaky tile doesn't spam the console; the
    // dark background layer still stands if tiles fail.
    map.on('error', () => {});

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeId, webgl]);

  // "Reset view" (resetNonce bump) flies the map back to the framed shot.
  useEffect(() => {
    if (firstReset.current) {
      firstReset.current = false;
      return;
    }
    mapRef.current?.flyTo({ center, zoom, pitch, bearing, duration: 1200, essential: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetNonce]);

  if (!webgl) {
    return (
      <div className="twin-map twin-map--fallback">
        <p>
          The live map needs WebGL.{' '}
          <a
            href={`https://www.openstreetmap.org/#map=15/${center[1]}/${center[0]}`}
            target="_blank"
            rel="noreferrer"
          >
            Open {place.label} on OpenStreetMap&nbsp;→
          </a>
        </p>
      </div>
    );
  }

  return <div className="twin-map" ref={containerRef} role="application" aria-label={`Live map of ${place.label}`} />;
}
