import { useEffect, useMemo, useRef, useState } from 'react';

function filterSuggestions(suggestions, query, maxItems) {
  const q = String(query || '').trim().toLowerCase();
  const list = Array.isArray(suggestions) ? suggestions : [];
  if (!q) return list.slice(0, maxItems);
  const starts = [];
  const contains = [];
  for (const item of list) {
    const label = String(item || '').trim();
    if (!label) continue;
    const lower = label.toLowerCase();
    if (lower === q) continue;
    if (lower.startsWith(q)) starts.push(label);
    else if (lower.includes(q)) contains.push(label);
  }
  return [...starts, ...contains].slice(0, maxItems);
}

/**
 * Text input with a typeahead list so previously used values
 * (cities, states, sources) can be picked with consistent spelling.
 */
export default function SuggestInput({
  value,
  onChange,
  suggestions = [],
  placeholder = '',
  required = false,
  className = '',
  name,
  id,
  autoComplete = 'off',
  theme = 'light',
  maxItems = 8,
  disabled = false,
}) {
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const matches = useMemo(
    () => filterSuggestions(suggestions, value, maxItems),
    [suggestions, value, maxItems]
  );

  useEffect(() => {
    setHighlight(0);
  }, [value, open]);

  useEffect(() => {
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const pick = (label) => {
    onChange(label);
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && matches.length) {
      setOpen(true);
      e.preventDefault();
      return;
    }
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((i) => Math.min(matches.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' && matches[highlight]) {
      e.preventDefault();
      pick(matches[highlight]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const dark = theme === 'dark';
  const menuStyle = dark
    ? {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 'calc(100% + 4px)',
        zIndex: 30,
        background: '#141414',
        border: '1px solid rgba(212,168,67,0.35)',
        borderRadius: 8,
        maxHeight: 220,
        overflowY: 'auto',
        boxShadow: '0 12px 28px rgba(0,0,0,0.45)',
      }
    : null;

  return (
    <div ref={wrapRef} className={dark ? undefined : 'relative'} style={dark ? { position: 'relative' } : undefined}>
      <input
        id={id}
        name={name}
        type="text"
        value={value}
        disabled={disabled}
        required={required}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className={className}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {open && matches.length > 0 && (
        dark ? (
          <ul style={menuStyle} role="listbox">
            {matches.map((item, idx) => {
              const active = idx === highlight;
              return (
                <li
                  key={item}
                  role="option"
                  aria-selected={active}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(item);
                  }}
                  onMouseEnter={() => setHighlight(idx)}
                  style={{
                    padding: '9px 14px',
                    fontSize: 13,
                    cursor: 'pointer',
                    color: active ? '#D4A843' : 'rgba(255,255,255,0.92)',
                    background: active ? 'rgba(212,168,67,0.12)' : 'transparent',
                  }}
                >
                  {item}
                </li>
              );
            })}
          </ul>
        ) : (
          <ul
            role="listbox"
            className="absolute left-0 right-0 z-30 mt-1 max-h-52 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
          >
            {matches.map((item, idx) => {
              const active = idx === highlight;
              return (
                <li
                  key={item}
                  role="option"
                  aria-selected={active}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(item);
                  }}
                  onMouseEnter={() => setHighlight(idx)}
                  className={`cursor-pointer px-3 py-1.5 text-sm ${
                    active ? 'bg-violet-50 text-violet-900' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {item}
                </li>
              );
            })}
          </ul>
        )
      )}
    </div>
  );
}
