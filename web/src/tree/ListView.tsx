import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import { buildForest, type Graph, type UnitNode } from '../data/graph';
import { formatDate, lifeSpan, num, personName } from '../data/format';
import { relationshipBadges } from '../data/labels';
import type { Person } from '../data/types';
import { TreeScreen } from './TreeScreen';
import { useTree } from './TreeContext';

/** Unusual links (adoptive, step, foster, disputed) between this unit and a child. */
function childBadges(graph: Graph, unit: UnitNode, child: Person) {
  const members = new Set([unit.person.id, ...unit.spouses.map((s) => s.id)]);
  const rels = (graph.parentRels.get(child.id) ?? []).filter((r) => members.has(r.personA));
  const keys = new Set(rels.flatMap((r) => relationshipBadges(r.kind, r.status)));
  return [...keys];
}

interface RowProps {
  node: UnitNode;
  depth: number;
  badges: ReturnType<typeof childBadges>;
  graph: Graph;
  collapsed: Set<string>;
  toggle: (id: string) => void;
}

function Row({ node, depth, badges, graph, collapsed, toggle }: RowProps) {
  const { t, lang } = useI18n();
  const unknown = t('unknownName');
  const approx = t('fApprox');
  const isCollapsed = collapsed.has(node.person.id);
  const hasKids = node.children.length > 0;
  const span = lifeSpan(node.person, lang, approx);

  return (
    <li>
      <div className={`list-row gen-${node.gen % 6}`}>
        {hasKids ? (
          <button
            type="button"
            className="toggle"
            aria-expanded={!isCollapsed}
            aria-label={`${isCollapsed ? t('expand') : t('collapse')}: ${personName(node.person, lang, unknown)}`}
            onClick={() => toggle(node.person.id)}
          >
            {isCollapsed ? '▸' : '▾'}
          </button>
        ) : (
          <span className="toggle-space" aria-hidden="true" />
        )}
        <div className="row-body">
          <div className="row-main">
            <Link to={`/home/person/${node.person.id}`} className="person-link">
              {personName(node.person, lang, unknown)}
            </Link>
            {span && <span className="muted small"> {span}</span>}
            {badges.map((key) => (
              <span key={key} className="badge">
                {t(key)}
              </span>
            ))}
          </div>
          {node.spouses.map((s) => (
            <div key={s.id} className="row-spouse small">
              <span className="muted">{t('spouseWord')}: </span>
              <Link to={`/home/person/${s.id}`} className="person-link">
                {personName(s, lang, unknown)}
              </Link>
              {lifeSpan(s, lang, approx) && <span className="muted"> {lifeSpan(s, lang, approx)}</span>}
            </div>
          ))}
          <div className="gen-tag small">
            {t('genLabel')} {num(node.gen + 1, lang)}
            {hasKids && isCollapsed && ` · ${num(node.children.length, lang)}`}
          </div>
        </div>
      </div>
      {hasKids && !isCollapsed && (
        <ul className="list-children">
          {node.children.map((child) => (
            <Row
              key={child.person.id}
              node={child}
              depth={depth + 1}
              badges={childBadges(graph, node, child.person)}
              graph={graph}
              collapsed={collapsed}
              toggle={toggle}
            />
          ))}
        </ul>
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
              depth={0}
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
