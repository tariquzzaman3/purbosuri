import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { useI18n, type TKey } from '../i18n';
import { formatDate, num, personName, truncate } from '../data/format';
import {
  addComment,
  approveMemory,
  createMemory,
  deleteComment,
  deleteMemory,
  setReaction,
  updateMemory,
  type ReactionType,
} from '../data/mutations';
import { upcomingEvents } from '../data/calendar';
import type { FlexDate, Memory } from '../data/types';
import { useTree } from './TreeContext';
import { useMemories } from './useMemories';
import { useComments, useReactions } from './useReactions';

const toInputDate = (d?: FlexDate): string =>
  d?.year && d.month && d.day
    ? `${String(d.year).padStart(4, '0')}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`
    : '';

const fromInputDate = (s: string): FlexDate | undefined => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) } : undefined;
};

function Composer({ editing, onDone, collapsible = false }: { editing?: Memory; onDone: () => void; collapsible?: boolean }) {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { current, people, canEdit, myName } = useTree();
  const [title, setTitle] = useState(editing?.title ?? '');
  const [body, setBody] = useState(editing?.body ?? '');
  const [date, setDate] = useState(toInputDate(editing?.date));
  const [place, setPlace] = useState(editing?.place ?? '');
  const [ids, setIds] = useState<string[]>(editing?.personIds ?? []);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [open, setOpen] = useState(!collapsible);
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
      else await createMemory(current.id, user.uid, myName, canEdit, fields);
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
      if (collapsible) setOpen(false);
    } catch {
      setError(t('memFailed'));
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    const first = (user?.displayName || '').split(' ')[0];
    return (
      <section className="card composer-collapsed">
        <span className="avatar" aria-hidden="true">
          {(user?.displayName || user?.email || '?').slice(0, 1).toUpperCase()}
        </span>
        <button type="button" className="composer-prompt" onClick={() => setOpen(true)}>
          {t('memComposePrompt')}
          {first ? `, ${first}?` : ''}
        </button>
        {note && (
          <p className="msg ok" role="status">
            {note}
          </p>
        )}
      </section>
    );
  }

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
      {(editing || collapsible) && (
        <button
          type="button"
          className="btn"
          onClick={() => {
            if (collapsible) setOpen(false);
            onDone();
          }}
        >
          {t('mCancel')}
        </button>
      )}
    </section>
  );
}

const PREVIEW_CHARS = 280;
const PREVIEW_LINES = 5;

const REACTIONS: Array<{ id: ReactionType; emoji: string; label: TKey }> = [
  { id: 'like', emoji: '👍', label: 'reactLike' },
  { id: 'love', emoji: '❤️', label: 'reactLove' },
  { id: 'sad', emoji: '😢', label: 'reactSad' },
];

function Comments({ treeId, memoryId, canWrite }: { treeId: string; memoryId: string; canWrite: boolean }) {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { canEdit, myName } = useTree();
  const comments = useComments(treeId, memoryId, true);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const send = async () => {
    if (!user || !text.trim()) return;
    setBusy(true);
    setError(false);
    try {
      await addComment(treeId, memoryId, user.uid, myName, text);
      setText('');
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="comments">
      {comments.map((c) => (
        <div key={c.id} className="comment">
          <span className="avatar small" aria-hidden="true">
            {(c.authorName || '?').slice(0, 1).toUpperCase()}
          </span>
          <div className="comment-bubble">
            <strong>{c.authorName || '—'}</strong>
            <p>{c.text}</p>
            <span className="muted small">
              {c.createdAt?.toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-GB')}
              {(c.authorUid === user?.uid || canEdit) && (
                <>
                  {' · '}
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => {
                      if (window.confirm(t('memConfirmDeleteComment'))) void deleteComment(treeId, memoryId, c.id);
                    }}
                  >
                    {t('memDelete')}
                  </button>
                </>
              )}
            </span>
          </div>
        </div>
      ))}
      {canWrite && (
        <div className="comment-form">
          <input
            type="text"
            value={text}
            maxLength={2000}
            placeholder={t('memCommentPlaceholder')}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void send();
            }}
          />
          <button type="button" className="btn primary small" disabled={busy || !text.trim()} onClick={() => void send()}>
            {t('memCommentSend')}
          </button>
        </div>
      )}
      {error && <p className="msg error">{t('memFailed')}</p>}
    </div>
  );
}

/** One story, shown like a post: author, a short preview, reactions and comments. */
export function MemoryCard({ m }: { m: Memory }) {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { current, graph, canEdit, canContribute } = useTree();
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [error, setError] = useState(false);
  const treeId = current?.id;
  const mine = m.authorUid === user?.uid;
  const waiting = m.status === 'pending';
  const published = !waiting;
  const canChange = canEdit || (mine && waiting);
  const canEditIt = canEdit || mine;
  const reactions = useReactions(treeId, m.id, published);
  const comments = useComments(treeId, m.id, published);

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
  const long = m.body.length > PREVIEW_CHARS || m.body.split('\n').length > PREVIEW_LINES;
  const preview = truncate(m.body.split('\n').slice(0, PREVIEW_LINES).join('\n'), PREVIEW_CHARS);
  const myReaction = user ? reactions[user.uid] : undefined;
  const counts = REACTIONS.map((r) => ({ ...r, n: Object.values(reactions).filter((x) => x === r.id).length })).filter(
    (r) => r.n > 0,
  );

  const react = (type: ReactionType) => {
    if (!user || !treeId) return;
    void run(() => setReaction(treeId, m.id, user.uid, myReaction === type ? null : type, myReaction !== undefined));
  };

  return (
    <article className="card memory">
      <div className="post-head">
        <span className="avatar" aria-hidden="true">
          {(m.authorName || '?').slice(0, 1).toUpperCase()}
        </span>
        <div>
          <strong>{m.authorName || '—'}</strong>
          <div className="muted small">
            {m.createdAt ? m.createdAt.toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-GB') : ''}
            {waiting && <span className="badge">{t('memWaiting')}</span>}
          </div>
        </div>
      </div>
      {m.title && <h3 className="post-title">{m.title}</h3>}
      <p className="memory-body">{expanded || !long ? m.body : preview}</p>
      {long && (
        <button type="button" className="link-btn" onClick={() => setExpanded((v) => !v)}>
          {expanded ? t('memReadLess') : t('memReadMore')}
        </button>
      )}
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

      {published && (
        <>
          {(counts.length > 0 || comments.length > 0) && (
            <div className="post-stats muted small">
              <span>{counts.map((r) => `${r.emoji} ${num(r.n, lang)}`).join('  ')}</span>
              {comments.length > 0 && (
                <button type="button" className="link-btn" onClick={() => setShowComments(true)}>
                  {num(comments.length, lang)} {t('memComments')}
                </button>
              )}
            </div>
          )}
          <div className="post-actions">
            {REACTIONS.map((r) => (
              <button
                key={r.id}
                type="button"
                disabled={!canContribute}
                className={myReaction === r.id ? 'react-btn active' : 'react-btn'}
                aria-pressed={myReaction === r.id}
                onClick={() => react(r.id)}
              >
                <span aria-hidden="true">{r.emoji}</span> {t(r.label)}
              </button>
            ))}
            <button type="button" className="react-btn" onClick={() => setShowComments((v) => !v)}>
              {t('memComment')}
            </button>
          </div>
          {showComments && treeId && <Comments treeId={treeId} memoryId={m.id} canWrite={canContribute} />}
        </>
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

const DAYS_AHEAD = 60;

/** Bars across the top: what is coming up in the next weeks. */
function UpcomingStrip({ published }: { published: Memory[] }) {
  const { t, lang } = useI18n();
  const { people, graph } = useTree();
  const today = useMemo(() => new Date(), []);
  const events = useMemo(
    () => upcomingEvents(people, published, today, DAYS_AHEAD).slice(0, 10),
    [people, published, today],
  );
  const fmt = new Intl.DateTimeFormat(lang === 'bn' ? 'bn-BD' : 'en-GB', { day: 'numeric', month: 'short' });
  const kindKey: Record<string, TKey> = { birthday: 'calBirthday', remembrance: 'calRemembrance', memory: 'calMemory' };

  return (
    <section className="upcoming" aria-label={t('calTitle')}>
      <h3>{t('calTitle')}</h3>
      {events.length === 0 ? (
        <p className="muted small">{t('calNone')}</p>
      ) : (
        <ul className="upcoming-list">
          {events.map((e) => {
            const p = e.personId ? graph.people.get(e.personId) : undefined;
            const memory = e.memoryId ? published.find((m) => m.id === e.memoryId) : undefined;
            const label = p ? personName(p, lang, t('unknownName')) : memory?.title || memory?.body.slice(0, 30) || '—';
            const content = (
              <>
                <span className="upcoming-date">{fmt.format(e.date)}</span>
                <span className="upcoming-name">{label}</span>
                <span className="muted small">
                  {t(kindKey[e.kind])}
                  {e.years !== undefined && e.years > 0 ? ` · ${num(e.years, lang)} ${t('calYears')}` : ''}
                </span>
              </>
            );
            return (
              <li key={`${e.kind}-${e.personId ?? e.memoryId}`}>
                {p ? (
                  <Link className="upcoming-item" to={`/home/person/${p.id}`}>
                    {content}
                  </Link>
                ) : (
                  <div className="upcoming-item">{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Written stories of the family: upcoming days, a place to write, then the feed. */
export function MemoriesPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { current, ready, role, canContribute, canEdit } = useTree();
  const { published, waiting } = useMemories(current?.id, user?.uid, canEdit);

  if (!ready || !current) return <p className="muted">{t('treeLoading')}</p>;
  if (!role) return <p className="msg error">{t('errPermission')}</p>;

  return (
    <div className="memories-page">
      <UpcomingStrip published={published} />
      {canContribute && <Composer collapsible onDone={() => undefined} />}

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
