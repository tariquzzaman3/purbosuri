import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import { CreateTree } from './CreateTree';
import { useTree } from './TreeContext';

function Notice({ text, alert = false }: { text: string; alert?: boolean }) {
  return (
    <p className={alert ? 'msg error' : 'muted'} role={alert ? 'alert' : 'status'}>
      {text}
    </p>
  );
}

/** A round "+" button for adding a person, so the chart itself stays uncluttered. */
function AddFab() {
  const { t } = useI18n();
  const { canContribute } = useTree();
  if (!canContribute) return null;
  return (
    <Link className="fab" to="/home/add" aria-label={t('addPerson')} title={t('addPerson')}>
      +
    </Link>
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
      {tree.people.length === 0 && !allowEmpty ? <EmptyPeople /> : children}
      {tree.people.length > 0 && <AddFab />}
    </>
  );
}
