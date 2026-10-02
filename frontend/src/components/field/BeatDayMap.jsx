import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const DEFAULT_CENTER = [11.0168, 76.9558];

const startIcon = L.divIcon({
  className: 'field-beat-pin',
  html: '<span class="field-beat-pin-dot field-beat-pin-start">S</span>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});
const visitIcon = L.divIcon({
  className: 'field-beat-pin',
  html: '<span class="field-beat-pin-dot field-beat-pin-visit">V</span>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});
const endIcon = L.divIcon({
  className: 'field-beat-pin',
  html: '<span class="field-beat-pin-dot field-beat-pin-end">E</span>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

function pointsFromDay(day) {
  const pts = [];
  if (day.start?.latitude != null) {
    pts.push({
      lat: day.start.latitude,
      lng: day.start.longitude,
      kind: 'start',
      label: `Start · ${day.name || ''}`,
      time: day.started_at,
    });
  }
  (day.visits || []).forEach((visit, index) => {
    pts.push({
      lat: visit.latitude,
      lng: visit.longitude,
      kind: 'visit',
      label: visit.label || `Visit ${index + 1}`,
      time: visit.visited_at,
    });
  });
  if (day.end?.latitude != null) {
    pts.push({
      lat: day.end.latitude,
      lng: day.end.longitude,
      kind: 'end',
      label: `End · ${day.name || ''}`,
      time: day.ended_at,
    });
  }
  return pts;
}

export default function BeatDayMap({ days = [], selectedEmployeeId = null }) {
  const wrapRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);

  const visible = useMemo(() => {
    if (selectedEmployeeId == null) return days;
    return days.filter((day) => Number(day.employee_id) === Number(selectedEmployeeId));
  }, [days, selectedEmployeeId]);

  useEffect(() => {
    const node = wrapRef.current;
    if (!node || mapRef.current) return;
    const map = L.map(node, { scrollWheelZoom: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);
    map.setView(DEFAULT_CENTER, 12);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    const t = setTimeout(() => map.invalidateSize(), 80);
    return () => {
      clearTimeout(t);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const bounds = [];
    visible.forEach((day) => {
      const pts = pointsFromDay(day);
      pts.forEach((pt) => {
        const icon = pt.kind === 'start' ? startIcon : pt.kind === 'end' ? endIcon : visitIcon;
        const marker = L.marker([pt.lat, pt.lng], { icon }).addTo(layer);
        const when = pt.time ? new Date(pt.time).toLocaleTimeString() : '';
        marker.bindPopup(`<strong>${pt.label}</strong><br/>${when}`);
        bounds.push([pt.lat, pt.lng]);
      });
      if (pts.length >= 2) {
        L.polyline(
          pts.map((pt) => [pt.lat, pt.lng]),
          { color: '#2563eb', weight: 3, opacity: 0.7 }
        ).addTo(layer);
      }
    });
    if (bounds.length === 1) {
      map.setView(bounds[0], 15);
    } else if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [28, 28], maxZoom: 16 });
    }
    setTimeout(() => map.invalidateSize(), 50);
  }, [visible]);

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <style>{`
        .field-beat-pin { background: transparent; border: 0; }
        .field-beat-pin-dot {
          display: flex; align-items: center; justify-content: center;
          width: 22px; height: 22px; border-radius: 999px; color: #fff;
          font: 700 10px/1 sans-serif; box-shadow: 0 1px 4px rgba(15,23,42,.35);
        }
        .field-beat-pin-start { background: #059669; }
        .field-beat-pin-visit { background: #2563eb; }
        .field-beat-pin-end { background: #dc2626; }
      `}</style>
      <div ref={wrapRef} className="h-72 w-full bg-slate-100" />
    </div>
  );
}
