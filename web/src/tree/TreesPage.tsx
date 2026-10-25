import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { useI18n } from '../i18n';
import { num } from '../data/format';
import { MAX_OWNED_TREES, deleteTree, renameTree } from '../data/mutations';
import type { TreeRef } from '../data/types';
import { CreateTree } from './CreateTree';
import { useTree } from './TreeContext';

function TreeItem({ tree, mine }: { tree: TreeRef; mine: boolean }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { current, chooseTree } = useTree();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'view' | 'rename' | 'delete'>('view');
  const [name, setName] = useState(tree.name);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isCurrent = current?.id === tree.id;

  const open = () => {
    chooseTree(tree.id);
    navigate('/home');
  };

  const rename = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await renameTree(tree.id, name);
      setMode('view');
    } catch {
      setError(t('errSave'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!user) return;
    if (typed.trim() !== tree.name.trim()) {
      setError(t('treeDeleteMismatch'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteTree(tree.id, user.uid);
    } catch {
      setError(t('errSave'));
      setBusy(false);
    }
  };

  return (
    <li className={isCurrent ? 'tree-item current' : 'tree-item'}>
      {mode === 'rename' ? (
        <div>
          <label className="field">
            <span>{t('treeNameLabel')}</span>
            <input type="text" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
          </label>
          {error && <p className="msg error">{error}</p>}
          <button className="btn primary small" type="button" disabled={busy} onClick={() => void rename()}>
            {t('mSave')}
          </button>
          <button className="btn small" type="button" onClick={() => setMode('view')}>
            {t('mCancel')}
          </button>
        </div>
      ) : mode === 'delete' ? (
        <div className="danger-box">
          <h3>{t('treeDeleteTitle')}</h3>
          <p>{t('treeDeleteWarn')}</p>
          <p>
            <strong>{tree.name}</strong>
          </p>
          <input type="text" value={typed} onChange={(e) => setTyped(e.target.value)} aria-label={t('treeNameLabel')} />
          {error && <p className="msg error">{error}</p>}
          <button className="btn danger small" type="button" disabled={busy} onClick={() => void remove()}>
            {t('treeDeleteConfirm')}
          </button>
          <button className="btn small" type="button" disabled={busy} onClick={() => setMode('view')}>
            {t('mCancel')}
          </button>
        </div>
      ) : (
        <>
          <div className="tree-item-head">
            <strong>{tree.name}</strong>
            {isCurrent && <span className="badge">{t('treeCurrent')}</span>}
            {!mine && <span className="badge">{t('treeSharedWithMe')}</span>}
          </div>
          <div className="tree-item-actions">
            {!isCurrent && (
              <button className="btn primary small" type="button" onClick={open}>
                {t('treeOpen')}
              </button>
            )}
            {mine && (
              <>
                <button className="btn small" type="button" onClick={() => { setName(tree.name); setMode('rename'); }}>
                  {t('treeRename')}
                </button>
                <button className="btn danger small" type="button" onClick={() => { setTyped(''); setError(null); setMode('delete'); }}>
                  {t('treeDelete')}
                </button>
              </>
            )}
          </div>
          {!mine && <p className="muted small">{t('treeOnlyAdmin')}</p>}
        </>
      )}
    </li>
  );
}

export function TreesPage() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { trees, ownedCount, treesLoaded } = useTree();
  const [creating, setCreating] = useState(false);
  const atLimit = ownedCount >= MAX_OWNED_TREES;

  if (!treesLoaded) return <p className="muted">{t('treeLoading')}</p>;

  const mine = trees.filter((x) => x.ownerUid === user?.uid);
  const others = trees.filter((x) => x.ownerUid !== user?.uid);

  return (
    <div className="trees-page">
      <h2>{t('treesTitle')}</h2>
      <p className="muted small">
        {t('treesOwnedLabel')}: {num(ownedCount, lang)}/{num(MAX_OWNED_TREES, lang)} · {t('treesLimitNote')}
      </p>

      {creating ? (
        <CreateTree onCreated={() => setCreating(false)} />
      ) : atLimit ? (
        <p className="msg error">{t('treesLimitReached')}</p>
      ) : (
        <button className="btn primary" type="button" onClick={() => setCreating(true)}>
          + {t('treeNewButton')}
        </button>
      )}

      <ul className="tree-list">
        {mine.map((x) => (
          <TreeItem key={x.id} tree={x} mine />
        ))}
        {others.map((x) => (
          <TreeItem key={x.id} tree={x} mine={false} />
        ))}
      </ul>
    </div>
  );
}
