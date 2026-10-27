import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { useI18n } from '../i18n';
import { formatDate, personName } from '../data/format';
import { approveMemory, createMemory, deleteMemory, updateMemory } from '../data/mutations';
import type { FlexDate, Memory } from '../data/types';
import { useTree } from './TreeContext';
import { useMemories } from './useMemories';

const toInputDate = (d?: FlexDate): string =>
  d?.year && d.month && d.day
    ? `${String(d.year).padStart(4, '0')}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`
    : '';

const fromInputDate = (s: string): FlexDate | undefined => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) } : undefined;
};

function Composer({ editing, onDone }: { editing?: Memory; onDone: () => void }) {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { current, people, canEdit } = useTree();
  const [title, setTitle] = useState(editing?.title ?? '');
  const [body, setBody] = useState(editing?.body ?? '');
  const [date, setDate] = useState(toInputDate(editing?.date));
  const [place, setPlace] = useState(editing?.place ?? '');
  const [ids, setIds] = useState<string[]>(editing?.personIds ?? []);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const unknown = t('unknownName');

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = [...people].sort((a, b) => personName(a, lang, unknown).localeCompare(personName(b, lang, unknown)));
    return needle ? list.filter((p) => [p.nameBn, p.nameEn, p.nickname].some((n) => n?.toLowerCase().includes(needle))) : list;
  }, [people, q, lang, unknown]);

  const toggle = (id: string) => setIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const submit = async () => {
    if (!user || !current) return;
    if (!body.trim()) return setError(t('memNeedText'));
    setBusy(true);
    setError(null);
    const fields = { title, body, personIds: ids, date: fromInputDate(date), place };
    try {
      if (editing) await updateMemory(current.id, editing.id, canEdit, fields);
      else await createMemory(current.id, user.uid, user.displayName || user.email || '', canEdit, fields);
      if (editing) {
        onDone();
        return;
      }
      setTitle('');
      setBody('');
      setDate('');
      setPlace('');
      setIds([]);
      setNote(canEdit ? t('memPosted') : t('memSent'));
    } catch {
      setError(t('memFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <h3>{editing ? t('memEdit') : t('memNew')}</h3>
      {!canEdit && <p className="muted small">{editing ? t('memEditNote') : t('memWaitNote')}</p>}
      <label className="field">
        <span>{t('memFieldTitle')}</span>
        <input type="text" value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="field">
        <span>{t('memFieldBody')}</span>
        <textarea rows={6} value={body} maxLength={50000} onChange={(e) => setBody(e.target.value)} />
      </label>
      <label className="field">
        <span>{t('memFieldDate')}</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="field">
        <span>{t('memFieldPlace')}</span>
        <input type="text" value={place} maxLength={300} onChange={(e) => setPlace(e.target.value)} />
      </label>
      {people.length > 0 && (
        <fieldset className="field">
          <legend>{t('memFieldPeople')}</legend>
          <input type="search" value={q} placeholder={t('memSearchPeople')} onChange={(e) => setQ(e.target.value)} />
          <div className="people-pick">
            {shown.map((p) => (
              <label key={p.id} className="check">
                <input type="checkbox" checked={ids.includes(p.id)} onChange={() => toggle(p.id)} />
                <span>{personName(p, lang, unknown)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {error && <p className="msg error">{error}</p>}
      {note && (
        <p className="msg ok" role="status">
          {note}
        </p>
      )}
      <button type="button" className="btn primary" disabled={busy} onClick={() => void submit()}>
        {editing ? t('memSave') : canEdit ? t('memPost') : t('memSubmit')}
      </button>
      {editing && (
        <button type="button" className="btn" onClick={onDone}>
          {t('mCancel')}
        </button>
      )}
    </section>
  );
}

/** One story, shown like a post. */
export function MemoryCard({ m }: { m: Memory }) {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { current, graph, canEdit } = useTree();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState(false);
  const treeId = current?.id;
  const mine = m.authorUid === user?.uid;
  const waiting = m.status === 'pending';
  const canChange = canEdit || (mine && waiting);
  const canEditIt = canEdit || mine;

  if (editing) return <Composer editing={m} onDone={() => setEditing(false)} />;

  const run = async (action: () => Promise<void>) => {
    setError(false);
    try {
      await action();
    } catch {
      setError(true);
    }
  };

  const people = (m.personIds ?? []).flatMap((id) => {
    const p = graph.people.get(id);
    return p ? [p] : [];
  });
  const when = formatDate(m.date, lang, t('fApprox'));

  return (
    <article className="card memory">
      <div className="tree-item-head">
        <strong>{m.title || ''}</strong>
        {waiting && <span className="badge">{t('memWaiting')}</span>}
      </div>
      <p className="muted small">
        {t('memBy')}: {m.authorName || '—'}
        {m.createdAt ? ` · ${m.createdAt.toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-GB')}` : ''}
      </p>
      <p className="memory-body">{m.body}</p>
      {(when || m.place) && <p className="muted small">{[when, m.place].filter(Boolean).join(' · ')}</p>}
      {people.length > 0 && (
        <p className="small">
          {t('memAbout')}:{' '}
          {people.map((p, i) => (
            <span key={p.id}>
              {i > 0 && ', '}
              <Link className="link" to={`/home/person/${p.id}`}>
                {personName(p, lang, t('unknownName'))}
              </Link>
            </span>
          ))}
        </p>
      )}
      {error && <p className="msg error">{t('memFailed')}</p>}
      <div className="tree-item-actions">
        {canEdit && waiting && treeId && (
          <button type="button" className="btn primary small" onClick={() => void run(() => approveMemory(treeId, m.id))}>
            {t('memApprove')}
          </button>
        )}
        {canEditIt && (
          <button type="button" className="btn small" onClick={() => setEditing(true)}>
            {t('memEditBtn')}
          </button>
        )}
        {canChange && treeId && (
          <button
            type="button"
            className="btn danger small"
            onClick={() => {
              if (window.confirm(t('memConfirmDelete'))) void run(() => deleteMemory(treeId, m.id));
            }}
          >
            {t('memDelete')}
          </button>
        )}
      </div>
    </article>
  );
}

/** Written stories of the family, newest first, like a feed. */
export function MemoriesPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { current, ready, role, canContribute, canEdit } = useTree();
  const { published, waiting } = useMemories(current?.id, user?.uid, canEdit);

  if (!ready || !current) return <p className="muted">{t('treeLoading')}</p>;
  if (!role) return <p className="msg error">{t('errPermission')}</p>;

  return (
    <div className="memories-page">
      <h2>{t('memTitle')}</h2>
      <p className="muted small">{current.name}</p>
      <p>{t('memIntro')}</p>
      {canContribute && <Composer onDone={() => undefined} />}

      {waiting.length > 0 && (
        <>
          <h3>{t('memWaitingTitle')}</h3>
          {waiting.map((m) => (
            <MemoryCard key={m.id} m={m} />
          ))}
        </>
      )}

      {published.length === 0 ? (
        <p className="muted">{t('memEmpty')}</p>
      ) : (
        published.map((m) => <MemoryCard key={m.id} m={m} />)
      )}
    </div>
  );
}
