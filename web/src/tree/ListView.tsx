import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import { buildForest, type Graph, type UnitNode } from '../data/graph';
import { formatDate, lifeSpan, num, personName } from '../data/format';
import { relationshipBadges } from '../data/labels';
import { TreeScreen } from './TreeScreen';
import { useTree } from './TreeContext';

/** Unusual links (adoptive, step, foster, disputed) between a child and the parent(s) it hangs from. */
function childBadges(graph: Graph, unit: UnitNode, child: UnitNode) {
  const members = new Set([unit.person.id, child.fromId ?? unit.person.id]);
  const rels = (graph.parentRels.get(child.person.id) ?? []).filter((r) => members.has(r.personA));
  const keys = new Set(rels.flatMap((r) => relationshipBadges(r.kind, r.status)));
  return [...keys];
}

interface RowProps {
  node: UnitNode;
  badges: ReturnType<typeof childBadges>;
  graph: Graph;
  collapsed: Set<string>;
  toggle: (id: string) => void;
}

function Row({ node, badges, graph, collapsed, toggle }: RowProps) {
  const { t, lang } = useI18n();
  const unknown = t('unknownName');
  const approx = t('fApprox');
  const id = node.person.id;
  const isCollapsed = collapsed.has(id);
  const hasBelow = node.children.length > 0 || node.spouses.length > 0 || node.refs.length > 0;
  const span = lifeSpan(node.person, lang, approx);

  const kidsOf = (ownerId: string) => node.children.filter((c) => (c.fromId ?? id) === ownerId);
  const renderKids = (kids: UnitNode[]) =>
    kids.length > 0 && (
      <ul className="list-children">
        {kids.map((child) => (
          <Row
            key={child.person.id}
            node={child}
            badges={childBadges(graph, node, child)}
            graph={graph}
            collapsed={collapsed}
            toggle={toggle}
          />
        ))}
      </ul>
    );

  return (
    <li>
      <div className={`list-row gen-${node.gen % 6}`}>
        {hasBelow ? (
          <button
            type="button"
            className="toggle"
            aria-expanded={!isCollapsed}
            aria-label={`${isCollapsed ? t('expand') : t('collapse')}: ${personName(node.person, lang, unknown)}`}
            onClick={() => toggle(id)}
          >
            {isCollapsed ? '▸' : '▾'}
          </button>
        ) : (
          <span className="toggle-space" aria-hidden="true" />
        )}
        <div className="row-body">
          <div className="row-main">
            <Link to={`/home/person/${id}`} className="person-link">
              {personName(node.person, lang, unknown)}
            </Link>
            {span && <span className="muted small"> {span}</span>}
            {badges.map((key) => (
              <span key={key} className="badge">
                {t(key)}
              </span>
            ))}
          </div>
          <div className="gen-tag small">
            {t('genLabel')} {num(node.gen + 1, lang)}
            {hasBelow && isCollapsed && ` · ${num(node.children.length, lang)}`}
          </div>
        </div>
      </div>

      {hasBelow && !isCollapsed && (
        <>
          {/* Each spouse follows the person, half a step in, with their own children below. */}
          {[
            ...node.spouses.map((s) => ({ s, ref: false })),
            ...node.refs.map((s) => ({ s, ref: true })),
          ].map(({ s, ref }) => {
            const kids = kidsOf(s.id);
            const sCollapsed = collapsed.has(s.id);
            const sSpan = lifeSpan(s, lang, approx);
            return (
              <div key={s.id} className="spouse-block">
                <div className={`list-row spouse-row gen-${node.gen % 6}`}>
                  {kids.length > 0 ? (
                    <button
                      type="button"
                      className="toggle"
                      aria-expanded={!sCollapsed}
                      aria-label={`${sCollapsed ? t('expand') : t('collapse')}: ${personName(s, lang, unknown)}`}
                      onClick={() => toggle(s.id)}
                    >
                      {sCollapsed ? '▸' : '▾'}
                    </button>
                  ) : (
                    <span className="toggle-space" aria-hidden="true" />
                  )}
                  <div className="row-body">
                    <div className="row-main">
                      <span className="muted small">⚭ {t('spouseWord')}:</span>
                      <Link to={`/home/person/${s.id}`} className="person-link">
                        {personName(s, lang, unknown)}
                      </Link>
                      {sSpan && <span className="muted small"> {sSpan}</span>}
                      {ref && <span className="badge">{t('spouseElsewhere')}</span>}
                      {sCollapsed && kids.length > 0 && (
                        <span className="muted small"> · {num(kids.length, lang)}</span>
                      )}
                    </div>
                  </div>
                </div>
                {!sCollapsed && renderKids(kids)}
              </div>
            );
          })}
          {renderKids(kidsOf(id))}
        </>
      )}
    </li>
  );
}

function ListContent() {
  const { t, lang } = useI18n();
  const { graph, people } = useTree();
  const forest = useMemo(() => buildForest(graph), [graph]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const q = query.trim().toLowerCase();
  const matches = q
    ? people.filter((p) =>
        [p.nameBn, p.nameEn, p.nickname].some((n) => n?.toLowerCase().includes(q)),
      )
    : [];

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

      {q ? (
        matches.length === 0 ? (
          <p className="muted">{t('noMatches')}</p>
        ) : (
          <ul className="plain-list card">
            {matches.map((p) => (
              <li key={p.id}>
                <Link to={`/home/person/${p.id}`} className="person-link">
                  {personName(p, lang, t('unknownName'))}
                </Link>
                <span className="muted small">
                  {' '}
                  {formatDate(p.birth, lang, t('fApprox'))}
                </span>
              </li>
            ))}
          </ul>
        )
      ) : (
        <ul className="list-root">
          {forest.map((node) => (
            <Row
              key={node.person.id}
              node={node}
              badges={[]}
              graph={graph}
              collapsed={collapsed}
              toggle={toggle}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

export function ListPage() {
  return (
    <TreeScreen>
      <ListContent />
    </TreeScreen>
  );
}
