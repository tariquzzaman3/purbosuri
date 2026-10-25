import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { useI18n, type TKey } from '../i18n';
import { addPerson, updatePerson } from '../data/mutations';
import { personName } from '../data/format';
import { KIND_KEYS, VERIFICATION_KEYS } from '../data/labels';
import type { FlexDate, Person, PersonFields, RelKind, Verification } from '../data/types';
import { TreeScreen } from './TreeScreen';
import { useTree } from './TreeContext';

type As = 'parent' | 'child' | 'spouse';
type Status = 'unknown' | 'living' | 'deceased';

const AS_KEYS: Record<As, TKey> = {
  parent: 'relParent',
  child: 'relChild',
  spouse: 'relSpouse',
};

const VERIFICATIONS = Object.keys(VERIFICATION_KEYS) as Verification[];
const KINDS = Object.keys(KIND_KEYS) as RelKind[];

// ---------- dates: partly known dates stay partly known ----------

interface DateInput {
  year: string;
  month: string;
  day: string;
  approx: boolean;
}

const emptyDate = (): DateInput => ({ year: '', month: '', day: '', approx: false });

const fromDate = (d?: FlexDate): DateInput => ({
  year: d?.year?.toString() ?? '',
  month: d?.month?.toString() ?? '',
  day: d?.day?.toString() ?? '',
  approx: d?.approx ?? false,
});

/** Accepts Bangla digits as well as 0-9. */
const asciiDigits = (s: string): string =>
  s.replace(/[০-৯]/g, (ch) => String(ch.charCodeAt(0) - '০'.charCodeAt(0))).trim();

function toDate(input: DateInput): { ok: boolean; value?: FlexDate } {
  const y = asciiDigits(input.year);
  const m = asciiDigits(input.month);
  const d = asciiDigits(input.day);
  if (!y && !m && !d) return { ok: true };
  if (!y) return { ok: false }; // a month or day without a year means nothing
  const year = Number(y);
  if (!Number.isInteger(year) || year < 1 || year > 2200) return { ok: false };

  const value: FlexDate = { year };
  if (m) {
    const month = Number(m);
    if (!Number.isInteger(month) || month < 1 || month > 12) return { ok: false };
    value.month = month;
  }
  if (d) {
    if (value.month === undefined) return { ok: false };
    const day = Number(d);
    if (!Number.isInteger(day) || day < 1 || day > 31) return { ok: false };
    // Reject dates that do not exist, such as 31 April.
    const probe = new Date(0);
    probe.setUTCFullYear(year, value.month - 1, day);
    if (probe.getUTCMonth() !== value.month - 1) return { ok: false };
    value.day = day;
  }
  if (input.approx) value.approx = true;
  return { ok: true, value };
}

function DateFields({
  label,
  value,
  onChange,
}: {
  label: string;
  value: DateInput;
  onChange: (v: DateInput) => void;
}) {
  const { t } = useI18n();
  return (
    <fieldset className="field date-field">
      <legend>{label}</legend>
      <div className="date-row">
        <label>
          <span className="small">{t('fYear')}</span>
          <input
            type="text"
            inputMode="numeric"
            maxLength={4}
            value={value.year}
            onChange={(e) => onChange({ ...value, year: e.target.value })}
          />
        </label>
        <label>
          <span className="small">{t('fMonth')}</span>
          <input
            type="text"
            inputMode="numeric"
            maxLength={2}
            value={value.month}
            onChange={(e) => onChange({ ...value, month: e.target.value })}
          />
        </label>
        <label>
          <span className="small">{t('fDay')}</span>
          <input
            type="text"
            inputMode="numeric"
            maxLength={2}
            value={value.day}
            onChange={(e) => onChange({ ...value, day: e.target.value })}
          />
        </label>
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={value.approx}
          onChange={(e) => onChange({ ...value, approx: e.target.checked })}
        />
        <span>{t('fApprox')}</span>
      </label>
    </fieldset>
  );
}

function TextField({
  label,
  value,
  onChange,
  max,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="text" value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

// ---------- the form ----------

function statusOf(p?: Person): Status {
  if (p?.living === true) return 'living';
  if (p?.living === false) return 'deceased';
  return 'unknown';
}

function Form({ person }: { person?: Person }) {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { current, people, graph } = useTree();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const unknown = t('unknownName');

  // "Add a parent of X" arrives as ?rel=parent&of=X from a person's page.
  const presetAs = params.get('rel');
  const presetOf = params.get('of');
  const presetPerson =
    !person && presetOf && graph.people.has(presetOf) ? graph.people.get(presetOf) : undefined;

  const [nameBn, setNameBn] = useState(person?.nameBn ?? '');
  const [nameEn, setNameEn] = useState(person?.nameEn ?? '');
  const [nickname, setNickname] = useState(person?.nickname ?? '');
  const [status, setStatus] = useState<Status>(statusOf(person));
  const [birth, setBirth] = useState<DateInput>(person ? fromDate(person.birth) : emptyDate());
  const [death, setDeath] = useState<DateInput>(person ? fromDate(person.death) : emptyDate());
  const [birthOrder, setBirthOrder] = useState(person?.birthOrder?.toString() ?? '');
  const [birthPlace, setBirthPlace] = useState(person?.birthPlace ?? '');
  const [residence, setResidence] = useState(person?.residence ?? '');
  const [deathPlace, setDeathPlace] = useState(person?.deathPlace ?? '');
  const [occupation, setOccupation] = useState(person?.occupation ?? '');
  const [bio, setBio] = useState(person?.bio ?? '');
  const [verification, setVerification] = useState<Verification | ''>(person?.verification ?? '');

  const [otherId, setOtherId] = useState(presetPerson?.id ?? '');
  const [as, setAs] = useState<As>(
    presetAs === 'parent' || presetAs === 'child' || presetAs === 'spouse' ? presetAs : 'child',
  );
  const [kind, setKind] = useState<RelKind>('biological');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!current || !user) return;

    const b = toDate(birth);
    const d = status === 'living' ? { ok: true as const, value: undefined } : toDate(death);
    if (!b.ok || !d.ok) {
      setError(t('errDate'));
      return;
    }

    // Birth order is optional: 1 to 30, Bangla or English digits.
    let order: number | undefined;
    const orderText = asciiDigits(birthOrder);
    if (orderText) {
      order = Number(orderText);
      if (!Number.isInteger(order) || order < 1 || order > 30) {
        setError(t('errBirthOrder'));
        return;
      }
    }

    const fields: PersonFields = {
      nameBn,
      nameEn,
      nickname,
      birth: b.value,
      birthOrder: order,
      death: d.value,
      birthPlace,
      residence,
      deathPlace: status === 'living' ? '' : deathPlace,
      occupation,
      bio,
      living: status === 'unknown' ? undefined : status === 'living',
      verification: verification || undefined,
    };

    setBusy(true);
    setError(null);
    try {
      if (person) {
        await updatePerson(current.id, person.id, fields);
        navigate(`/home/person/${person.id}`);
      } else {
        const relation = otherId
          ? { existingId: otherId, as, kind: as === 'spouse' ? undefined : kind }
          : undefined;
        const id = await addPerson(current.id, user.uid, fields, relation);
        navigate(`/home/person/${id}`);
      }
    } catch {
      setError(t('errSave'));
    } finally {
      setBusy(false);
    }
  };

  const others = people.filter((p) => p.id !== person?.id);
  const other = otherId ? graph.people.get(otherId) : undefined;

  let relationBlock: ReactNode = null;
  if (!person && others.length > 0) {
    relationBlock = (
      <fieldset className="field">
        <legend>{t('formRelationTitle')}</legend>
        <label className="field">
          <span>{t('linkPick')}</span>
          <select value={otherId} onChange={(e) => setOtherId(e.target.value)}>
            <option value="">—</option>
            {others.map((p) => (
              <option key={p.id} value={p.id}>
                {personName(p, lang, unknown)}
              </option>
            ))}
          </select>
        </label>
        {other && (
          <>
            <label className="field">
              <span>
                {personName(other, lang, unknown)}
                {t('possessive')}
              </span>
              <select value={as} onChange={(e) => setAs(e.target.value as As)}>
                {(Object.keys(AS_KEYS) as As[]).map((key) => (
                  <option key={key} value={key}>
                    {t(AS_KEYS[key])}
                  </option>
                ))}
              </select>
            </label>
            {as !== 'spouse' && (
              <label className="field">
                <span>{t('kindLabel')}</span>
                <select value={kind} onChange={(e) => setKind(e.target.value as RelKind)}>
                  {KINDS.map((k) => (
                    <option key={k} value={k}>
                      {t(KIND_KEYS[k])}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </>
        )}
      </fieldset>
    );
  }

  return (
    <section className="card">
      <h2>{person ? t('editPerson') : t('addPerson')}</h2>
      <p className="muted">{t('formOptionalNote')}</p>
      <form onSubmit={(e) => void onSubmit(e)} noValidate>
        <TextField label={t('fNameBn')} value={nameBn} onChange={setNameBn} max={200} />
        <TextField label={t('fNameEn')} value={nameEn} onChange={setNameEn} max={200} />
        <TextField label={t('fNickname')} value={nickname} onChange={setNickname} max={200} />

        <label className="field">
          <span>{t('fStatus')}</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as Status)}>
            <option value="unknown">{t('fStatusUnknown')}</option>
            <option value="living">{t('fStatusLiving')}</option>
            <option value="deceased">{t('fStatusDeceased')}</option>
          </select>
        </label>

        <DateFields label={t('fBirth')} value={birth} onChange={setBirth} />
        <label className="field">
          <span>{t('fBirthOrder')}</span>
          <small>{t('fBirthOrderHint')}</small>
          <input
            type="text"
            inputMode="numeric"
            maxLength={2}
            value={birthOrder}
            onChange={(e) => setBirthOrder(e.target.value)}
          />
        </label>
        {status !== 'living' && <DateFields label={t('fDeath')} value={death} onChange={setDeath} />}

        <TextField label={t('fBirthPlace')} value={birthPlace} onChange={setBirthPlace} max={300} />
        <TextField label={t('fResidence')} value={residence} onChange={setResidence} max={300} />
        {status !== 'living' && (
          <TextField label={t('fDeathPlace')} value={deathPlace} onChange={setDeathPlace} max={300} />
        )}
        <TextField label={t('fOccupation')} value={occupation} onChange={setOccupation} max={300} />

        <label className="field">
          <span>{t('fBio')}</span>
          <textarea rows={5} value={bio} maxLength={10000} onChange={(e) => setBio(e.target.value)} />
        </label>

        <label className="field">
          <span>{t('fVerification')}</span>
          <select
            value={verification}
            onChange={(e) => setVerification(e.target.value as Verification | '')}
          >
            <option value="">—</option>
            {VERIFICATIONS.map((v) => (
              <option key={v} value={v}>
                {t(VERIFICATION_KEYS[v])}
              </option>
            ))}
          </select>
        </label>

        {relationBlock}

        {error && (
          <p className="msg error" role="alert">
            {error}
          </p>
        )}

        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? t('saving') : t('save')}
        </button>
        <Link className="btn" to={person ? `/home/person/${person.id}` : '/home'}>
          {t('cancel')}
        </Link>
      </form>
    </section>
  );
}

function Guarded({ edit, personId }: { edit: boolean; personId?: string }) {
  const { t } = useI18n();
  const { graph, canContribute, canEdit } = useTree();
  const person = personId ? graph.people.get(personId) : undefined;

  if (edit && !person) {
    return (
      <section className="card">
        <p>{t('personNotFound')}</p>
        <Link to="/home" className="link">
          ← {t('backToTree')}
        </Link>
      </section>
    );
  }
  if (edit ? !canEdit : !canContribute) {
    return (
      <p className="msg error" role="alert">
        {t('errPermission')}
      </p>
    );
  }
  // The key restarts the form when a different person is opened.
  return <Form key={person?.id ?? 'new'} person={person} />;
}

export function AddPersonPage() {
  return (
    <TreeScreen allowEmpty>
      <Guarded edit={false} />
    </TreeScreen>
  );
}

export function EditPersonPage() {
  const { id } = useParams();
  return (
    <TreeScreen allowEmpty>
      <Guarded edit personId={id} />
    </TreeScreen>
  );
}
