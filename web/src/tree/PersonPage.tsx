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
import { formatDate, lifeSpan, num, personName } from '../data/format';
import { KIND_KEYS, VERIFICATION_KEYS, relationshipBadges } from '../data/labels';
import { addRelationship, deletePerson, removeRelationship, savePublicContact } from '../data/mutations';
import type { Person, RelKind, Relationship } from '../data/types';
import { TreeScreen } from './TreeScreen';
import { useTree } from './TreeContext';

const WARNING_KEYS: Record<WarningCode, TKey> = {
  duplicate: 'warnDuplicate',
  parentYounger: 'warnParentYounger',
  manyBioParents: 'warnManyBio',
  spouseIsRelative: 'warnSpouseRelative',
};

/** The contact details a person chose to show to everyone in the tree; the person can edit their own. */
function ContactBox({ person }: { person: Person }) {
  const { t } = useI18n();
  const { current, myPersonId } = useTree();
  const mine = myPersonId === person.id;
  const shown = person.publicContact;
  const [phone, setPhone] = useState(shown?.phone ?? '');
  const [facebook, setFacebook] = useState(shown?.facebook ?? '');
  const [email, setEmail] = useState(shown?.email ?? '');
  const [note, setNote] = useState<string | null>(null);
  const treeId = current?.id;

  if (!mine && !(shown && (shown.phone || shown.facebook || shown.email))) return null;

  const save = async (clear: boolean) => {
    if (!treeId) return;
    setNote(null);
    try {
      await savePublicContact(treeId, person.id, clear ? {} : { phone, facebook, email });
      if (clear) {
        setPhone('');
        setFacebook('');
        setEmail('');
      }
      setNote(t('contactSaved'));
    } catch {
      setNote(t('errSave'));
    }
  };

  return (
    <section className="card">
      <h3>{t('contactTitle')}</h3>
      {shown && (shown.phone || shown.facebook || shown.email) && (
        <>
          <dl className="details">
            <Detail label={t('cPhone')} value={shown.phone} />
            <Detail label={t('cFacebook')} value={shown.facebook} />
            <Detail label={t('cEmail')} value={shown.email} />
          </dl>
          <p className="muted small">{t('contactShownNote')}</p>
        </>
      )}
      {mine && (
        <div className="contact-edit">
          <h4>{t('contactMine')}</h4>
          <p className="muted small">{t('contactMineHint')}</p>
          <label className="field">
            <span>{t('cPhone')}</span>
            <input type="tel" inputMode="tel" value={phone} maxLength={40} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <label className="field">
            <span>{t('cFacebook')}</span>
            <input type="text" value={facebook} maxLength={200} onChange={(e) => setFacebook(e.target.value)} />
          </label>
          <label className="field">
            <span>{t('cEmail')}</span>
            <input type="email" inputMode="email" value={email} maxLength={200} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <div className="panel-actions">
            <button type="button" className="btn primary small" onClick={() => void save(false)}>
              {t('contactSave')}
            </button>
            {shown && (
              <button type="button" className="btn small" onClick={() => void save(true)}>
                {t('contactHide')}
              </button>
            )}
          </div>
          {note && <p className="muted small" role="status">{note}</p>}
        </div>
      )}
    </section>
  );
}

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
          <Detail
            label={t('fBirthOrder')}
            value={person.birthOrder ? num(person.birthOrder, lang) : undefined}
          />
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

      <ContactBox person={person} />

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
