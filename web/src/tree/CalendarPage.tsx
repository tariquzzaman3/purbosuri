import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { useI18n, type TKey } from '../i18n';
import { num, personName } from '../data/format';
import { upcomingEvents, type CalendarEvent } from '../data/calendar';
import { useTree } from './TreeContext';
import { useMemories } from './useMemories';

const KIND_KEYS: Record<CalendarEvent['kind'], TKey> = {
  birthday: 'calBirthday',
  remembrance: 'calRemembrance',
  memory: 'calMemory',
};

const DAYS = 90;

/** What is coming up in the family: birthdays, remembrance days and the days of memories. */
export function CalendarPage() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { current, ready, role, people, graph, canEdit } = useTree();
  const { published } = useMemories(current?.id, user?.uid, canEdit);

  const today = useMemo(() => new Date(), []);
  const events = useMemo(() => upcomingEvents(people, published, today, DAYS), [people, published, today]);

  if (!ready || !current) return <p className="muted">{t('treeLoading')}</p>;
  if (!role) return <p className="msg error">{t('errPermission')}</p>;

  const fmt = new Intl.DateTimeFormat(lang === 'bn' ? 'bn-BD' : 'en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const isToday = (d: Date) => d.toDateString() === today.toDateString();

  return (
    <div className="calendar-page">
      <h2>{t('calTitle')}</h2>
      <p className="muted small">{current.name}</p>
      <p className="muted">{t('calIntro')}</p>
      {events.length === 0 ? (
        <p className="muted">{t('calNone')}</p>
      ) : (
        <ul className="tree-list">
          {events.map((e) => {
            const p = e.personId ? graph.people.get(e.personId) : undefined;
            const memory = e.memoryId ? published.find((m) => m.id === e.memoryId) : undefined;
            return (
              <li key={`${e.kind}-${e.personId ?? e.memoryId}`} className="tree-item">
                <div className="tree-item-head">
                  <strong>{fmt.format(e.date)}</strong>
                  {isToday(e.date) && <span className="badge">{t('calToday')}</span>}
                  <span className="badge role">{t(KIND_KEYS[e.kind])}</span>
                </div>
                {p ? (
                  <Link className="link" to={`/home/person/${p.id}`}>
                    {personName(p, lang, t('unknownName'))}
                  </Link>
                ) : (
                  <Link className="link" to="/home/memories">
                    {memory?.title || memory?.body.slice(0, 60) || '—'}
                  </Link>
                )}
                {e.years !== undefined && e.years > 0 && (
                  <span className="muted small">
                    {' '}
                    · {num(e.years, lang)} {t('calYears')}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
