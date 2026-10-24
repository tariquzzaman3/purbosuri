import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth';
import { useI18n } from '../i18n';
import { createTree } from '../data/mutations';
import { useTree } from './TreeContext';

export function CreateTree({ onCreated }: { onCreated?: () => void }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { chooseTree, trees } = useTree();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!name.trim()) {
      setError(t('errTreeName'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const id = await createTree(user.uid, user.displayName ?? '', name);
      chooseTree(id);
      onCreated?.();
    } catch {
      setError(t('errSave'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <h2>{trees.length === 0 ? t('treeNoneTitle') : t('treeNewButton')}</h2>
      <p className="muted">{t('treeNoneBody')}</p>
      <form onSubmit={(e) => void onSubmit(e)} noValidate>
        <label className="field">
          <span>{t('treeNameLabel')}</span>
          <small>{t('treeNameHint')}</small>
          <input
            type="text"
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        {error && (
          <p className="msg error" role="alert">
            {error}
          </p>
        )}
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? t('saving') : t('treeCreate')}
        </button>
      </form>
    </section>
  );
}
