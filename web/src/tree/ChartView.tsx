import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import { buildForest, findUnit } from '../data/graph';
import { CARD_H, CARD_W, layoutForest } from '../data/layout';
import { lifeSpan, num, personName, truncate } from '../data/format';
import { TreeScreen } from './TreeScreen';
import { useTree } from './TreeContext';

// Generation colours. Every card also says its generation in words.
const FILLS = ['#e3f1ea', '#fbe9dc', '#e6ecf8', '#f6e6f0', '#f3efd6', '#e2f0f2'];
const STROKES = ['#1d5a45', '#b5532f', '#34569a', '#9a3a78', '#7a6a10', '#2a7a86'];

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2.5;
const READABLE_ZOOM = 0.7;

interface View {
  x: number;
  y: number;
  k: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function Chart() {
  const { t, lang } = useI18n();
  const { graph, people } = useTree();
  const unknown = t('unknownName');
  const approx = t('fApprox');

  const forest = useMemo(() => buildForest(graph), [graph]);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);

  const shown = useMemo(() => {
    if (!branchId) return forest;
    const unit = findUnit(forest, branchId);
    return unit ? [unit] : forest;
  }, [forest, branchId]);
  const layout = useMemo(() => layoutForest(shown), [shown]);

  const boxRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const drag = useRef<{ startX: number; startY: number; view: View; moved: boolean } | null>(null);
  const moved = useRef(false);

  const fit = useCallback(() => {
    const box = boxRef.current;
    if (!box) return;
    const pad = 20;
    const cw = box.clientWidth;
    const ch = box.clientHeight;
    const wanted = Math.min((cw - pad * 2) / layout.width, (ch - pad * 2) / layout.height);
    // Never shrink below a readable size: a big tree is panned instead of becoming unreadable.
    const k = clamp(wanted, READABLE_ZOOM, 1);
    const x = layout.width * k + pad * 2 <= cw ? (cw - layout.width * k) / 2 : pad;
    const y = layout.height * k + pad * 2 <= ch ? (ch - layout.height * k) / 2 : pad;
    setView({ x, y, k });
  }, [layout]);

  useEffect(() => {
    fit();
  }, [fit]);

  const zoomAt = useCallback((cx: number, cy: number, factor: number) => {
    setView((v) => {
      const k = clamp(v.k * factor, MIN_ZOOM, MAX_ZOOM);
      const ratio = k / v.k;
      return { k, x: cx - (cx - v.x) * ratio, y: cy - (cy - v.y) * ratio };
    });
  }, []);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = box.getBoundingClientRect();
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.12 : 1 / 1.12);
    };
    box.addEventListener('wheel', onWheel, { passive: false });
    return () => box.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const zoomCentre = (factor: number) => {
    const box = boxRef.current;
    if (box) zoomAt(box.clientWidth / 2, box.clientHeight / 2, factor);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    moved.current = false;
    drag.current = { startX: e.clientX, startY: e.clientY, view, moved: false };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || e.buttons === 0) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (Math.abs(dx) + Math.abs(dy) > 5) moved.current = true;
    if (moved.current) setView({ ...d.view, x: d.view.x + dx, y: d.view.y + dy });
  };
  const onPointerEnd = () => {
    drag.current = null;
  };

  // Centre the chart on a person once the layout that contains them is ready.
  useEffect(() => {
    if (!pendingFocus) return;
    const card = layout.cards.find((c) => c.id === pendingFocus);
    const box = boxRef.current;
    if (card && box) {
      setView((v) => {
        const k = Math.max(v.k, READABLE_ZOOM);
        return {
          k,
          x: box.clientWidth / 2 - (card.x + CARD_W / 2) * k,
          y: box.clientHeight / 2 - (card.y + CARD_H / 2) * k,
        };
      });
    }
    setPendingFocus(null);
  }, [pendingFocus, layout]);

  const focusPerson = (id: string) => {
    setSelectedId(id);
    if (!layout.cards.some((c) => c.id === id)) setBranchId(null);
    setPendingFocus(id);
    setQuery('');
  };

  const select = (id: string) => {
    if (moved.current) return;
    setSelectedId((cur) => (cur === id ? null : id));
  };

  const q = query.trim().toLowerCase();
  const matches = q
    ? people
        .filter((p) => [p.nameBn, p.nameEn, p.nickname].some((n) => n?.toLowerCase().includes(q)))
        .slice(0, 6)
    : [];

  const selected = selectedId ? graph.people.get(selectedId) : undefined;
  const branchPerson = branchId ? graph.people.get(branchId) : undefined;

  return (
    <section>
      <label className="field search">
        <span className="sr-only">{t('searchPeople')}</span>
        <input
          type="search"
          value={query}
          placeholder={t('searchPeople')}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {q && (
        <ul className="plain-list card search-results">
          {matches.length === 0 && <li className="muted">{t('noMatches')}</li>}
          {matches.map((p) => (
            <li key={p.id}>
              <button type="button" className="link" onClick={() => focusPerson(p.id)}>
                {personName(p, lang, unknown)}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="chart-toolbar">
        <button type="button" className="btn small" onClick={() => zoomCentre(1.25)}>
          {t('chartZoomIn')} +
        </button>
        <button type="button" className="btn small" onClick={() => zoomCentre(1 / 1.25)}>
          {t('chartZoomOut')} −
        </button>
        <button type="button" className="btn small" onClick={fit}>
          {t('chartFit')}
        </button>
        {branchId && (
          <button type="button" className="btn small" onClick={() => setBranchId(null)}>
            {t('chartShowAll')}
          </button>
        )}
      </div>
      {branchPerson && (
        <p className="muted small">
          {t('chartBranchOf')} {personName(branchPerson, lang, unknown)}
        </p>
      )}

      <div
        ref={boxRef}
        className="chart-box"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerLeave={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        <svg className="chart-svg" role="group" aria-label={t('chartDescription')}>
          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            {layout.childLines.map((l, i) => (
              <polyline key={i} points={l.points} className="chart-line" />
            ))}
            {layout.spouseLines.map((l, i) => (
              <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} className="chart-line spouse" />
            ))}
            {layout.cards.map((c) => {
              const p = graph.people.get(c.id);
              if (!p) return null;
              const name = personName(p, lang, unknown);
              const span = lifeSpan(p, lang, approx);
              const isSel = c.id === selectedId;
              const onKey = (e: KeyboardEvent<SVGGElement>) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelectedId((cur) => (cur === c.id ? null : c.id));
                }
              };
              return (
                <g
                  key={c.id}
                  transform={`translate(${c.x} ${c.y})`}
                  className="chart-card"
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSel}
                  aria-label={`${name}, ${t('genLabel')} ${num(c.gen + 1, lang)}`}
                  onClick={() => select(c.id)}
                  onKeyDown={onKey}
                >
                  <rect
                    width={CARD_W}
                    height={CARD_H}
                    rx={10}
                    fill={FILLS[c.gen % 6]}
                    stroke={STROKES[c.gen % 6]}
                    strokeWidth={isSel ? 4 : 1.5}
                  />
                  <text x={CARD_W / 2} y={23} textAnchor="middle" className="card-name">
                    {truncate(name, 16)}
                  </text>
                  <text x={CARD_W / 2} y={40} textAnchor="middle" className="card-span">
                    {span}
                  </text>
                  <text x={CARD_W / 2} y={55} textAnchor="middle" className="card-gen">
                    {t('genLabel')} {num(c.gen + 1, lang)}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      <p className="muted small">{t('chartHint')}</p>

      {selected && (
        <div className="card selected-panel" role="status">
          <strong>{personName(selected, lang, unknown)}</strong>
          <span className="muted small"> {lifeSpan(selected, lang, approx)}</span>
          <div className="panel-actions">
            <Link className="btn primary small" to={`/home/person/${selected.id}`}>
              {t('openProfile')}
            </Link>
            <button type="button" className="btn small" onClick={() => setBranchId(selected.id)}>
              {t('chartShowBranch')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export function ChartPage() {
  return (
    <TreeScreen>
      <Chart />
    </TreeScreen>
  );
}
