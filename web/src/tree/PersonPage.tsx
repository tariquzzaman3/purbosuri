import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { useI18n, type TKey } from '../i18n';
import {
  relationshipWarnings,
  siblingIds,
  wouldCreateCycle,
  type WarningCode,
} from '../data/graph';
import { formatDate, lifeSpan, personName } from '../data/format';
import { KIND_KEYS, VERIFICATION_KEYS, relationshipBadges } from '../data/labels';
import { addRelationship, deletePerson, removeRelationship } from '../data/mutations';
import type { Person, RelKind, Relationship } from '../data/types';
import { TreeScreen } from './TreeScreen';
import { useTree } from './TreeContext';

const WARNING_KEYS: Record<WarningCode, TKey> = {
  duplicate: 'warnDuplicate',
  parentYounger: 'warnParentYounger',
  manyBioParents: 'warnManyBio',
  spouseIsRelative: 'warnSpouseRelative',
};

function Detail({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

interface RelatedItem {
  person: Person;
  rel?: Relationship;
}

function RelatedList({
  title,
  items,
  onRemove,
}: {
  title: string;
  items: RelatedItem[];
  onRemove?: (rel: Relationship) => void;
}) {
  const { t, lang } = useI18n();
  return (
    <section className="card">
      <h3>{title}</h3>
      {items.length === 0 ? (
        <p className="muted">{t('none')}</p>
      ) : (
        <ul className="plain-list">
          {items.map(({ person, rel }) => (
            <li key={person.id + (rel?.id ?? '')}>
              <Link to={`/home/person/${person.id}`} className="person-link">
                {personName(person, lang, t('unknownName'))}
              </Link>
              <span className="muted small"> {lifeSpan(person, lang, t('fApprox'))}</span>
              {rel &&
                relationshipBadges(rel.kind, rel.status).map((key) => (
                  <span key={key} className="badge">
                    {t(key)}
                  </span>
                ))}
              {rel && onRemove && (
                <button type="button" className="link small" onClick={() => onRemove(rel)}>
                  {t('removeRel')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function LinkExisting({ person }: { person: Person }) {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { current, people, graph } = useTree();
  const [otherId, setOtherId] = useState('');
  const [as, setAs] = useState<'parent' | 'child' | 'spouse'>('parent');
  const [kind, setKind] = useState<RelKind>('biological');
  const [warnings, setWarnings] = useState<WarningCode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const others = people.filter((p) => p.id !== person.id);
  if (others.length === 0 || !current || !user) return null;

  const build = () => {
    // The chosen person's role towards this person.
    if (as === 'parent') return { type: 'parent' as const, a: otherId, b: person.id };
    if (as === 'child') return { type: 'parent' as const, a: person.id, b: otherId };
    return { type: 'spouse' as const, a: person.id, b: otherId };
  };

  const submit = async (confirmed: boolean) => {
    if (!otherId) return;
    setError(null);
    const { type, a, b } = build();
    if (type === 'parent' && wouldCreateCycle(graph, a, b)) {
      setError(t('errCycle'));
      setWarnings([]);
      return;
    }
    const found = relationshipWarnings(graph, { type, kind: type === 'parent' ? kind : undefined, a, b });
    if (found.length > 0 && !confirmed) {
      setWarnings(found);
      return;
    }
    setBusy(true);
    try {
      await addRelationship(current.id, user.uid, {
        type,
        personA: a,
        personB: b,
        kind: type === 'parent' ? kind : undefined,
      });
      setOtherId('');
      setWarnings([]);
    } catch {
      setError(t('errSave'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <h3>{t('linkExisting')}</h3>
      <label className="field">
        <span>{t('linkPick')}</span>
        <select value={otherId} onChange={(e) => { setOtherId(e.target.value); setWarnings([]); }}>
          <option value="">—</option>
          {others.map((p) => (
            <option key={p.id} value={p.id}>
              {personName(p, lang, t('unknownName'))}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>{t('linkOtherIs')}</span>
        <select value={as} onChange={(e) => { setAs(e.target.value as typeof as); setWarnings([]); }}>
          <option value="parent">{t('relParent')}</option>
          <option value="child">{t('relChild')}</option>
          <option value="spouse">{t('relSpouse')}</option>
        </select>
      </label>
      {as !== 'spouse' && (
        <label className="field">
          <span>{t('kindLabel')}</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as RelKind)}>
            {(Object.keys(KIND_KEYS) as RelKind[]).map((k) => (
              <option key={k} value={k}>
                {t(KIND_KEYS[k])}
              </option>
            ))}
          </select>
        </label>
      )}
      {error && (
        <p className="msg error" role="alert">
          {error}
        </p>
      )}
      {warnings.length > 0 && (
        <div className="banner warn" role="alert">
          <strong>{t('warnTitle')}</strong>
          <ul>
            {warnings.map((w) => (
              <li key={w}>{t(WARNING_KEYS[w])}</li>
            ))}
          </ul>
          <button type="button" className="btn small" disabled={busy} onClick={() => void submit(true)}>
            {t('warnContinue')}
          </button>
        </div>
      )}
      <button
        type="button"
        className="btn primary"
        disabled={busy || !otherId}
        onClick={() => void submit(false)}
      >
        {busy ? t('saving') : t('linkDo')}
      </button>
    </section>
  );
}

function Profile({ person }: { person: Person }) {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const { current, graph, rels, canContribute, canEdit } = useTree();
  const unknown = t('unknownName');
  const approx = t('fApprox');
  const [error, setError] = useState<string | null>(null);

  const pick = (ids: string[]): Person[] =>
    ids.map((id) => graph.people.get(id)).filter((p): p is Person => p !== undefined);

  const parentItems: RelatedItem[] = (graph.parentRels.get(person.id) ?? []).flatMap((rel) => {
    const p = graph.people.get(rel.personA);
    return p ? [{ person: p, rel }] : [];
  });
  const childItems: RelatedItem[] = (graph.childRels.get(person.id) ?? []).flatMap((rel) => {
    const p = graph.people.get(rel.personB);
    return p ? [{ person: p, rel }] : [];
  });
  const spouseItems: RelatedItem[] = rels
    .filter((r) => r.type === 'spouse' && (r.personA === person.id || r.personB === person.id))
    .flatMap((rel) => {
      const p = graph.people.get(rel.personA === person.id ? rel.personB : rel.personA);
      return p ? [{ person: p, rel }] : [];
    });
  const siblingItems: RelatedItem[] = pick(siblingIds(graph, person.id)).map((p) => ({ person: p }));

  const onRemove = async (rel: Relationship) => {
    if (!current || !window.confirm(t('confirmRemoveRel'))) return;
    try {
      await removeRelationship(current.id, rel.id);
    } catch {
      setError(t('errPermission'));
    }
  };

  const onDelete = async () => {
    if (!current || !window.confirm(t('confirmDeletePerson'))) return;
    try {
      await deletePerson(current.id, person.id, rels);
      navigate('/home');
    } catch {
      setError(t('errPermission'));
    }
  };

  const status =
    person.living === true ? t('personLiving') : person.living === false ? t('fStatusDeceased') : '';

  return (
    <>
      <Link to="/home" className="link">
        ← {t('backToTree')}
      </Link>

      <section className="card">
        <h2>{personName(person, lang, unknown)}</h2>
        {person.nameBn && person.nameEn && (
          <p className="muted">{lang === 'bn' ? person.nameEn : person.nameBn}</p>
        )}
        <p className="muted">{lifeSpan(person, lang, approx)}</p>
        {error && (
          <p className="msg error" role="alert">
            {error}
          </p>
        )}
        {canEdit && (
          <div className="panel-actions">
            <Link className="btn small" to={`/home/person/${person.id}/edit`}>
              {t('editPerson')}
            </Link>
            <button type="button" className="btn small danger" onClick={() => void onDelete()}>
              {t('deletePerson')}
            </button>
          </div>
        )}
      </section>

      <section className="card">
        <h3>{t('secDetails')}</h3>
        <dl className="details">
          <Detail label={t('fNickname')} value={person.nickname} />
          <Detail label={t('fStatus')} value={status} />
          <Detail label={t('fBirth')} value={formatDate(person.birth, lang, approx)} />
          <Detail label={t('fBirthPlace')} value={person.birthPlace} />
          <Detail label={t('fDeath')} value={formatDate(person.death, lang, approx)} />
          <Detail label={t('fDeathPlace')} value={person.deathPlace} />
          <Detail label={t('fResidence')} value={person.residence} />
          <Detail label={t('fOccupation')} value={person.occupation} />
          <Detail label={t('fBio')} value={person.bio} />
          <Detail
            label={t('fVerification')}
            value={person.verification ? t(VERIFICATION_KEYS[person.verification]) : undefined}
          />
        </dl>
      </section>

      <RelatedList title={t('secParents')} items={parentItems} onRemove={canEdit ? (r) => void onRemove(r) : undefined} />
      <RelatedList title={t('secSpouses')} items={spouseItems} onRemove={canEdit ? (r) => void onRemove(r) : undefined} />
      <RelatedList title={t('secChildren')} items={childItems} onRemove={canEdit ? (r) => void onRemove(r) : undefined} />
      <RelatedList title={t('secSiblings')} items={siblingItems} />

      {canContribute && (
        <section className="card">
          <div className="panel-actions">
            <Link className="btn small" to={`/home/add?rel=parent&of=${person.id}`}>
              + {t('addParent')}
            </Link>
            <Link className="btn small" to={`/home/add?rel=spouse&of=${person.id}`}>
              + {t('addSpouse')}
            </Link>
            <Link className="btn small" to={`/home/add?rel=child&of=${person.id}`}>
              + {t('addChild')}
            </Link>
          </div>
        </section>
      )}

      {canContribute && <LinkExisting person={person} />}

      <section className="card">
        <h3>{t('secMemories')}</h3>
        <p className="muted">{t('memoriesLater')}</p>
      </section>
    </>
  );
}

export function PersonPage() {
  const { t } = useI18n();
  const { id } = useParams();
  const { graph } = useTree();
  const person = id ? graph.people.get(id) : undefined;
  return (
    <TreeScreen allowEmpty>
      {person ? (
        <Profile person={person} />
      ) : (
        <section className="card">
          <p>{t('personNotFound')}</p>
          <Link to="/home" className="link">
            ← {t('backToTree')}
          </Link>
        </section>
      )}
    </TreeScreen>
  );
}
