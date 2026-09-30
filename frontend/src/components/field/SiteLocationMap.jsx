import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const DEFAULT_CENTER = [11.0168, 76.9558];
const DEFAULT_ZOOM = 13;
const PIN_ZOOM = 17;

const pinIcon = L.divIcon({
  className: 'field-site-pin',
  html: '<span class="field-site-pin-dot"></span>',
  iconSize: [22, 28],
  iconAnchor: [11, 26],
});

function parseCoord(value) {
  if (value == null || String(value).trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatCoord(value) {
  return String(Number(value.toFixed(6)));
}

function resultLabel(feature) {
  const p = feature?.properties || {};
  return [p.name, p.street, p.city || p.town || p.village, p.state, p.country]
    .filter(Boolean)
    .filter((part, i, arr) => arr.indexOf(part) === i)
    .join(', ');
}

export default function SiteLocationMap({
  latitude,
  longitude,
  radiusM = 200,
  onChange,
  disabled = false,
  followUser = false,
}) {
  const wrapRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const circleRef = useRef(null);
  const youAreHereRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const disabledRef = useRef(disabled);
  const followUserRef = useRef(followUser);
  const askedLocateRef = useRef(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [locateState, setLocateState] = useState(followUser ? 'locating' : 'idle');

  onChangeRef.current = onChange;
  disabledRef.current = disabled;
  followUserRef.current = followUser;

  const lat = parseCoord(latitude);
  const lng = parseCoord(longitude);
  const hasPoint =
    lat != null && lng != null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  const radius = Math.max(50, Math.min(5000, Number(radiusM) || 200));

  useEffect(() => {
    const node = wrapRef.current;
    if (!node || mapRef.current) return;

    const map = L.map(node, {
      scrollWheelZoom: true,
      attributionControl: true,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);

    const markYouAreHere = (latlng, accuracy) => {
      if (youAreHereRef.current) {
        map.removeLayer(youAreHereRef.current);
      }
      const group = L.layerGroup().addTo(map);
      L.circle(latlng, {
        radius: Math.max(Number(accuracy) || 40, 20),
        color: '#2563eb',
        weight: 1,
        fillColor: '#60a5fa',
        fillOpacity: 0.12,
      }).addTo(group);
      L.circleMarker(latlng, {
        radius: 7,
        color: '#fff',
        weight: 2,
        fillColor: '#2563eb',
        fillOpacity: 1,
      }).addTo(group);
      youAreHereRef.current = group;
    };

    const startLocate = (panToUser) => {
      setLocateState('locating');
      map.locate({
        setView: panToUser,
        maxZoom: PIN_ZOOM,
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 15000,
      });
    };

    map.on('locationfound', (event) => {
      markYouAreHere(event.latlng, event.accuracy);
      setLocateState('found');
      if (disabledRef.current || markerRef.current || !followUserRef.current) return;
      const next = onChangeRef.current;
      if (typeof next === 'function') {
        next({
          latitude: formatCoord(event.latlng.lat),
          longitude: formatCoord(event.latlng.lng),
        });
      }
    });

    map.on('locationerror', () => {
      setLocateState((prev) => (prev === 'found' ? prev : 'denied'));
    });

    map.on('click', (event) => {
      if (disabledRef.current) return;
      const next = onChangeRef.current;
      if (typeof next === 'function') {
        next({
          latitude: formatCoord(event.latlng.lat),
          longitude: formatCoord(event.latlng.lng),
        });
      }
    });

    const LocateControl = L.Control.extend({
      onAdd() {
        const btn = L.DomUtil.create('button', 'leaflet-bar field-locate-btn');
        btn.type = 'button';
        btn.title = 'Show my current location';
        btn.setAttribute('aria-label', 'Show my current location');
        btn.innerHTML = '<span aria-hidden="true">◎</span>';
        L.DomEvent.disableClickPropagation(btn);
        L.DomEvent.on(btn, 'click', (event) => {
          L.DomEvent.stop(event);
          startLocate(true);
        });
        return btn;
      },
    });
    map.addControl(new LocateControl({ position: 'topleft' }));

    mapRef.current = map;
    if (!askedLocateRef.current) {
      askedLocateRef.current = true;
      startLocate(Boolean(followUserRef.current));
    }

    const resize = window.setTimeout(() => map.invalidateSize(), 80);
    const resizeAgain = window.setTimeout(() => map.invalidateSize(), 300);

    return () => {
      window.clearTimeout(resize);
      window.clearTimeout(resizeAgain);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
      youAreHereRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!hasPoint) {
      if (markerRef.current) {
        map.removeLayer(markerRef.current);
        markerRef.current = null;
      }
      if (circleRef.current) {
        map.removeLayer(circleRef.current);
        circleRef.current = null;
      }
      return;
    }

    const point = L.latLng(lat, lng);
    const previous = markerRef.current?.getLatLng();
    const moved = !previous || previous.distanceTo(point) > 1;

    if (!markerRef.current) {
      const marker = L.marker(point, {
        icon: pinIcon,
        draggable: !disabledRef.current,
      }).addTo(map);
      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        const next = onChangeRef.current;
        if (typeof next === 'function') {
          next({
            latitude: formatCoord(pos.lat),
            longitude: formatCoord(pos.lng),
          });
        }
      });
      markerRef.current = marker;
    } else {
      markerRef.current.setLatLng(point);
      if (markerRef.current.dragging) {
        if (disabledRef.current) markerRef.current.dragging.disable();
        else markerRef.current.dragging.enable();
      }
    }

    if (!circleRef.current) {
      circleRef.current = L.circle(point, {
        radius,
        color: '#2563eb',
        weight: 1,
        fillColor: '#3b82f6',
        fillOpacity: 0.15,
      }).addTo(map);
    } else {
      circleRef.current.setLatLng(point);
      circleRef.current.setRadius(radius);
    }

    if (moved) {
      const zoom = map.getZoom();
      map.setView(point, zoom < 14 ? PIN_ZOOM : zoom);
      map.invalidateSize();
    }
  }, [hasPoint, lat, lng, radius]);

  const pickResult = (feature) => {
    const coords = feature?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return;
    const [nextLng, nextLat] = coords;
    onChange?.({
      latitude: formatCoord(Number(nextLat)),
      longitude: formatCoord(Number(nextLng)),
    });
    setResults([]);
    setQuery(resultLabel(feature));
  };

  const runSearch = async () => {
    const q = query.trim();
    if (q.length < 3 || searching) return;
    try {
      setSearching(true);
      setSearchError(null);
      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&lang=en`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Place search failed');
      const json = await res.json().catch(() => ({}));
      const features = Array.isArray(json.features) ? json.features : [];
      setResults(features);
      if (features.length === 0) {
        setSearchError('No places found. Try a street or area name, or click the map.');
      }
    } catch (err) {
      setResults([]);
      setSearchError(err.message || 'Place search failed');
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="sm:col-span-2 space-y-2">
      <p className="text-xs text-slate-600">Mark on map</p>
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSearchError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              runSearch();
            }
          }}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          placeholder="Search a place or address"
          disabled={disabled}
        />
        <button
          type="button"
          onClick={runSearch}
          disabled={disabled || searching || query.trim().length < 3}
          className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {searching ? 'Searching…' : 'Search'}
        </button>
      </div>
      {searchError && <p className="text-[11px] text-amber-700">{searchError}</p>}
      {results.length > 0 && (
        <ul className="max-h-36 overflow-y-auto rounded-lg border border-slate-200 bg-white text-xs">
          {results.map((feature, index) => (
            <li key={`${resultLabel(feature)}-${index}`}>
              <button
                type="button"
                onClick={() => pickResult(feature)}
                className="w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-50"
              >
                {resultLabel(feature) || 'Unnamed place'}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div
        ref={wrapRef}
        className="h-64 w-full overflow-hidden rounded-lg border border-slate-200"
        style={{ minHeight: 256 }}
      />
      <p className="text-[11px] text-slate-500">
        {locateState === 'locating'
          ? 'Finding your current location…'
          : locateState === 'found'
            ? 'Showing your current location. Drag the pin if the site is a little further away.'
            : locateState === 'denied'
              ? 'Could not read GPS. Search a place, click the map, or use Use my location.'
              : 'Click the map or drag the pin to fill latitude and longitude.'}{' '}
        The larger blue circle is the punch radius. Map © OpenStreetMap (free).
      </p>
    </div>
  );
}
