import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import { ROLE_KEYS } from '../data/labels';
import { CreateTree } from './CreateTree';
import { useTree } from './TreeContext';

function Notice({ text, alert = false }: { text: string; alert?: boolean }) {
  return (
    <p className={alert ? 'msg error' : 'muted'} role={alert ? 'alert' : 'status'}>
      {text}
    </p>
  );
}

function TreeHeader() {
  const { t } = useI18n();
  const { trees, current, chooseTree, role, canContribute, canEdit } = useTree();
  return (
    <section className="tree-header">
      <div className="tree-title">
        {trees.length > 1 ? (
          <select
            aria-label={t('treeSwitchLabel')}
            value={current?.id}
            onChange={(e) => chooseTree(e.target.value)}
          >
            {trees.map((tree) => (
              <option key={tree.id} value={tree.id}>
                {tree.name}
              </option>
            ))}
          </select>
        ) : (
          <h2>{current?.name}</h2>
        )}
        {role && (
          <span className="badge role">
            {t('roleLabel')}: {t(ROLE_KEYS[role])}
          </span>
        )}
      </div>
      <div className="tree-actions">
        {canContribute && (
          <Link className="btn primary small" to="/home/add">
            + {t('addPerson')}
          </Link>
        )}
        <Link className="btn small" to="/home/new-tree">
          {t('treeNewButton')}
        </Link>
      </div>
      {!canContribute && <p className="muted small">{t('viewOnlyNote')}</p>}
      {canContribute && !canEdit && <p className="muted small">{t('contributorNote')}</p>}
    </section>
  );
}

function EmptyPeople() {
  const { t } = useI18n();
  const { canContribute } = useTree();
  return (
    <section className="card">
      <h2>{t('emptyPeopleTitle')}</h2>
      <p>{t('emptyPeopleBody')}</p>
      {canContribute && (
        <Link className="btn primary" to="/home/add">
          + {t('addPerson')}
        </Link>
      )}
    </section>
  );
}

/**
 * Shared frame for every family tree screen: loads the tree, handles the
 * "no tree yet", loading and error states, and shows the header.
 */
export function TreeScreen({ children, allowEmpty = false }: { children: ReactNode; allowEmpty?: boolean }) {
  const { t } = useI18n();
  const tree = useTree();

  if (!tree.treesLoaded) return <Notice text={t('treeLoading')} />;
  if (tree.trees.length === 0) {
    return tree.error ? <Notice alert text={t('treeLoadError')} /> : <CreateTree />;
  }
  if (!tree.ready) return <Notice text={t('treeLoading')} />;
  if (tree.error || tree.role === null) return <Notice alert text={t('treeLoadError')} />;

  return (
    <>
      <TreeHeader />
      {tree.people.length === 0 && !allowEmpty ? <EmptyPeople /> : children}
    </>
  );
}
