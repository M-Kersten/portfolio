import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useSceneSelector } from '../scene/store';
import { resolvePlace } from '../data/places';
import { useWebGLSupport } from '../lib/useWebGLSupport';

// The twin as a live web map (MapLibre). A dark Carto basemap centred on the
// district, with the OSM/OpenMapTiles `building` layer extruded in 3D and
// coloured by height. Keyless. Replaces the offline-baked .glb twin.
//
// This is "live tiles" — it needs the viewer's browser to reach the tile host,
// unlike the firewall-proof baked model. Attribution is shown by MapLibre.

const STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const FALLBACK_CENTER: [number, number] = [5.0414, 52.3083]; // Weesp

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
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');

    map.on('load', () => {
      // 3D buildings: find the basemap's vector source and extrude its building
      // layer, coloured by height. If the basemap carries no heights this is a
      // no-op and the flat dark map still stands.
      try {
        const sources = map.getStyle().sources as Record<string, { type?: string }>;
        const vectorId = Object.keys(sources).find((k) => sources[k].type === 'vector');
        if (!vectorId) return;
        const height = ['coalesce', ['get', 'render_height'], ['get', 'height'], 6];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const layer: any = {
          id: 'twin-buildings',
          type: 'fill-extrusion',
          source: vectorId,
          'source-layer': 'building',
          minzoom: 13,
          paint: {
            'fill-extrusion-color': ['interpolate', ['linear'], height, 3, '#163139', 12, '#1d818a', 28, '#27e8f2'],
            'fill-extrusion-height': height,
            'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0],
            'fill-extrusion-opacity': 0.88,
          },
        };
        map.addLayer(layer);
      } catch {
        /* basemap has no building heights — the dark map still stands */
      }
    });

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
