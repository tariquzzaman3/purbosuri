import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import { buildForest, findUnit } from '../data/graph';
import { CARD_H, CARD_W, layoutForest } from '../data/layout';
import { lifeSpan, num, personName } from '../data/format';
import { TreeScreen } from './TreeScreen';
import { useTree } from './TreeContext';

// Generation colours. Every card also says its generation in words.
const FILLS = ['#e3f1ea', '#fbe9dc', '#e6ecf8', '#f6e6f0', '#f3efd6', '#e2f0f2'];
const STROKES = ['#1d5a45', '#b5532f', '#34569a', '#9a3a78', '#7a6a10', '#2a7a86'];

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2.5;
const READABLE_ZOOM = 0.7;

// Cards grow to fit the name. These match the text sizes in styles.css.
const NAME_FONT = '700 15px "Noto Sans Bengali", system-ui, sans-serif';
const SPAN_FONT = '400 12px "Noto Sans Bengali", system-ui, sans-serif';
const GEN_FONT = '400 11px "Noto Sans Bengali", system-ui, sans-serif';
const CARD_PAD = 28;
const MIN_CARD_W = 120;
const MAX_CARD_W = 320;

interface View {
  x: number;
  y: number;
  k: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

// ---------- measuring text so a card can fit its name ----------

let measureCtx: CanvasRenderingContext2D | null | undefined;

function textWidth(text: string, font: string): number {
  if (measureCtx === undefined) {
    try {
      measureCtx = document.createElement('canvas').getContext('2d');
    } catch {
      measureCtx = null;
    }
  }
  if (!measureCtx) return text.length * 9; // rough guess if measuring is impossible
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
}

/** Only shortens a name (with …) when even the widest card could not hold it. */
function fitText(text: string, font: string, maxPx: number): string {
  if (textWidth(text, font) <= maxPx) return text;
  let s = text;
  while (s.length > 1 && textWidth(`${s}…`, font) > maxPx) s = s.slice(0, -1);
  return `${s}…`;
}

/** True once the Bangla font has loaded, so measurements use the real glyph widths. */
function useFontsReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    const done = () => {
      if (live) setReady(true);
    };
    try {
      if (!document.fonts) {
        done();
      } else {
        void Promise.all([
          document.fonts.load(NAME_FONT, 'আ'),
          document.fonts.load(SPAN_FONT, '১'),
        ]).then(done, done);
      }
    } catch {
      done();
    }
    return () => {
      live = false;
    };
  }, []);
  return ready;
}

// ---------- screen orientation (only some phones allow locking it) ----------

interface OrientationApi {
  type?: string;
  lock?: (orientation: 'landscape' | 'portrait') => Promise<void>;
  unlock?: () => void;
}

const orientation = (): OrientationApi | undefined =>
  typeof screen === 'undefined' ? undefined : (screen.orientation as unknown as OrientationApi | undefined);

// ---------- small icons for the control buttons ----------

function Icon({ d, circle }: { d: string; circle?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {circle && <circle cx="12" cy="12" r="2" fill="currentColor" />}
    </svg>
  );
}

const ICON_FIT = 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5';
const ICON_FULL = 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5';
const ICON_CLOSE = 'M6 6l12 12M18 6L6 18';
const ICON_ROTATE = 'M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5';

function Chart() {
  const { t, lang } = useI18n();
  const { graph, people } = useTree();
  const unknown = t('unknownName');
  const approx = t('fApprox');
  const fontsReady = useFontsReady();

  const forest = useMemo(() => buildForest(graph), [graph]);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const shown = useMemo(() => {
    if (!branchId) return forest;
    const unit = findUnit(forest, branchId);
    return unit ? [unit] : forest;
  }, [forest, branchId]);

  // Each card is as wide as its name needs, between a minimum and a maximum.
  const cardInfo = useMemo(() => {
    const info = new Map<string, { name: string; span: string; w: number }>();
    const genWidth = textWidth(`${t('genLabel')} ${num(88, lang)}`, GEN_FONT);
    for (const p of graph.people.values()) {
      const fullName = personName(p, lang, unknown);
      const span = lifeSpan(p, lang, approx);
      const wanted = Math.max(textWidth(fullName, NAME_FONT), textWidth(span, SPAN_FONT), genWidth);
      const w = clamp(Math.ceil(wanted) + CARD_PAD, MIN_CARD_W, MAX_CARD_W);
      info.set(p.id, { name: fitText(fullName, NAME_FONT, w - CARD_PAD), span, w });
    }
    return info;
    // fontsReady is listed so cards are measured again once the real font arrives.
  }, [graph, lang, unknown, approx, t, fontsReady]);

  const layout = useMemo(
    () => layoutForest(shown, (id) => cardInfo.get(id)?.w ?? CARD_W),
    [shown, cardInfo],
  );

  const frameRef = useRef<HTMLDivElement>(null);
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

  // ---------- full screen ----------
  // A fixed full-window layer works everywhere (including iPhones). Where the browser
  // allows it, the real Fullscreen API is used on top of that.

  const enterFull = useCallback(async () => {
    setFull(true);
    try {
      await frameRef.current?.requestFullscreen?.();
    } catch {
      // The full-window layer is already showing, so nothing is lost.
    }
  }, []);

  const exitFull = useCallback(async () => {
    setFull(false);
    try {
      orientation()?.unlock?.();
    } catch {
      // Not supported: nothing to undo.
    }
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
    } catch {
      // Already closed.
    }
  }, []);

  useEffect(() => {
    if (!full) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') void exitFull();
    };
    // The person pressed Esc or the browser's own back gesture.
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) setFull(false);
    };
    // The chart changes size when the phone turns, so fit it again.
    const onResize = () => fit();
    document.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    window.addEventListener('resize', onResize);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      window.removeEventListener('resize', onResize);
    };
  }, [full, exitFull, fit]);

  // Fit the chart to its new size whenever full screen turns on or off.
  useEffect(() => {
    const id = window.requestAnimationFrame(() => window.requestAnimationFrame(fit));
    return () => window.cancelAnimationFrame(id);
  }, [full, fit]);

  const canRotate = full && typeof orientation()?.lock === 'function';

  const rotate = async () => {
    const o = orientation();
    const next = o?.type?.startsWith('landscape') ? 'portrait' : 'landscape';
    try {
      await o?.lock?.(next);
    } catch {
      setNotice(t('chartRotateFail'));
      window.setTimeout(() => setNotice(null), 4000);
    }
  };

  // ---------- dragging ----------

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
          x: box.clientWidth / 2 - (card.x + card.w / 2) * k,
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
      {branchPerson && (
        <p className="muted small">
          {t('chartBranchOf')} {personName(branchPerson, lang, unknown)}
        </p>
      )}

      <div ref={frameRef} className={full ? 'chart-frame full' : 'chart-frame'}>
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
                <polyline key={i} points={l.points} className="chart-line spouse" />
              ))}
              {layout.cards.map((c) => {
                const p = graph.people.get(c.id);
                const info = cardInfo.get(c.id);
                if (!p || !info) return null;
                const isSel = c.id === selectedId;
                const genText = c.isSpouse
                  ? `⚭ ${t('spouseWord')}`
                  : `${t('genLabel')} ${num(c.gen + 1, lang)}`;
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
                    aria-label={`${personName(p, lang, unknown)}, ${genText}`}
                    onClick={() => select(c.id)}
                    onKeyDown={onKey}
                  >
                    <rect
                      width={c.w}
                      height={CARD_H}
                      rx={10}
                      fill={FILLS[c.gen % 6]}
                      stroke={STROKES[c.gen % 6]}
                      strokeWidth={isSel ? 4 : 1.5}
                      strokeDasharray={c.isSpouse ? '6 4' : undefined}
                    />
                    <text x={c.w / 2} y={23} textAnchor="middle" className="card-name">
                      {info.name}
                    </text>
                    <text x={c.w / 2} y={40} textAnchor="middle" className="card-span">
                      {info.span}
                    </text>
                    <text x={c.w / 2} y={55} textAnchor="middle" className="card-gen">
                      {genText}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        </div>

        <div className="chart-glass" role="toolbar" aria-label={t('chartControls')}>
          <button
            type="button"
            className="glass-btn"
            aria-label={t('chartZoomIn')}
            title={t('chartZoomIn')}
            onClick={() => zoomCentre(1.25)}
          >
            +
          </button>
          <button
            type="button"
            className="glass-btn"
            aria-label={t('chartZoomOut')}
            title={t('chartZoomOut')}
            onClick={() => zoomCentre(1 / 1.25)}
          >
            −
          </button>
          <button
            type="button"
            className="glass-btn"
            aria-label={t('chartFit')}
            title={t('chartFit')}
            onClick={fit}
          >
            <Icon d={ICON_FIT} circle />
          </button>
          {branchId && (
            <button type="button" className="glass-btn text" onClick={() => setBranchId(null)}>
              {t('chartShowAll')}
            </button>
          )}
          {full ? (
            <button
              type="button"
              className="glass-btn"
              aria-label={t('chartExitFullscreen')}
              title={t('chartExitFullscreen')}
              onClick={() => void exitFull()}
            >
              <Icon d={ICON_CLOSE} />
            </button>
          ) : (
            <button
              type="button"
              className="glass-btn"
              aria-label={t('chartFullscreen')}
              title={t('chartFullscreen')}
              onClick={() => void enterFull()}
            >
              <Icon d={ICON_FULL} />
            </button>
          )}
          {canRotate && (
            <button
              type="button"
              className="glass-btn"
              aria-label={t('chartRotate')}
              title={t('chartRotate')}
              onClick={() => void rotate()}
            >
              <Icon d={ICON_ROTATE} />
            </button>
          )}
        </div>

        {notice && (
          <div className="chart-notice" role="status">
            {notice}
          </div>
        )}

        {selected && (
          <div className="chart-select" role="status">
            <div>
              <strong>{personName(selected, lang, unknown)}</strong>
              <span className="muted small"> {lifeSpan(selected, lang, approx)}</span>
            </div>
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
      </div>
      <p className="muted small">{t('chartHint')}</p>
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
