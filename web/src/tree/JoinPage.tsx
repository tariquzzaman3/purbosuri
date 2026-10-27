import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { useAuth } from '../auth';
import { db } from '../firebase';
import { useI18n } from '../i18n';
import { submitJoin, type JoinForm } from '../data/mutations';
import { useTree } from './TreeContext';

type Loaded =
  | { state: 'loading' }
  | { state: 'invalid' | 'used' | 'expired' }
  | { state: 'ok'; role: 'reviewer' | 'contributor'; treeName: string; replaces?: string };

/** Where an invitation link lands: read the invitation, ask who you are, send it for approval. */
export function JoinPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { treeId = '', code = '' } = useParams();
  const { trees, nextSlot, treesLoaded } = useTree();

  const [invite, setInvite] = useState<Loaded>({ state: 'loading' });
  const [name, setName] = useState(user?.displayName ?? '');
  const [father, setFather] = useState('');
  const [mother, setMother] = useState('');
  const [contactOf, setContactOf] = useState<JoinForm['contactOf']>('self');
  const [phone, setPhone] = useState('');
  const [facebook, setFacebook] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        if (!db) throw new Error('not-configured');
        const snap = await getDoc(doc(db, 'trees', treeId, 'invites', code));
        if (!live) return;
        if (!snap.exists()) return setInvite({ state: 'invalid' });
        const d = snap.data();
        if (d.usedBy) return setInvite({ state: 'used' });
        const expires: Date | undefined = d.expiresAt?.toDate?.();
        if (expires && expires.getTime() < Date.now()) return setInvite({ state: 'expired' });
        setInvite({
          state: 'ok',
          role: d.role,
          treeName: String(d.treeName ?? ''),
          replaces: typeof d.replaces === 'string' ? d.replaces : undefined,
        });
      } catch {
        if (live) setInvite({ state: 'invalid' });
      }
    })();
    return () => {
      live = false;
    };
  }, [treeId, code]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || invite.state !== 'ok') return;
    if (!name.trim()) return setError(t('errJoinName'));
    if (![phone, facebook, email].some((v) => v.trim())) return setError(t('errJoinContact'));
    setBusy(true);
    setError(null);
    try {
      await submitJoin(treeId, user.uid, code, invite, {
        displayName: name.trim(),
        fatherName: father,
        motherName: mother,
        contactOf,
        contact: { phone, facebook, email },
      });
      navigate('/home/trees', { replace: true });
    } catch {
      setError(t('errJoin'));
      setBusy(false);
    }
  };

  if (invite.state === 'loading' || !treesLoaded) return <p className="muted">{t('joinLoading')}</p>;

  const blocked =
    invite.state === 'invalid'
      ? t('joinInvalid')
      : invite.state === 'used'
        ? t('joinUsed')
        : invite.state === 'expired'
          ? t('joinExpired')
          : trees.some((x) => x.id === treeId)
            ? t('joinAlready')
            : nextSlot === null
              ? t('joinFull')
              : null;

  if (blocked || invite.state !== 'ok') {
    return (
      <section className="card">
        <h2>{t('joinTitle')}</h2>
        <p className="msg error">{blocked}</p>
        <Link className="btn" to="/home/trees">
          {t('menuTrees')}
        </Link>
      </section>
    );
  }

  return (
    <section className="card">
      <h2>{t('joinTitle')}</h2>
      <p>
        {t('joinInto')} <strong>{invite.treeName}</strong>
      </p>
      <p className="muted small">
        {t('joinAs')}: {invite.role === 'reviewer' ? t('roleReviewer') : t('roleContributor')}
      </p>
      {invite.replaces && <p className="banner warn">{t('joinRecovery')}</p>}
      <p className="muted">{t('joinWhy')}</p>

      <form onSubmit={(e) => void submit(e)} noValidate>
        <label className="field">
          <span>{t('joinName')}</span>
          <input type="text" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="field">
          <span>{t('joinFather')}</span>
          <input type="text" value={father} maxLength={100} onChange={(e) => setFather(e.target.value)} />
        </label>
        <label className="field">
          <span>{t('joinMother')}</span>
          <input type="text" value={mother} maxLength={100} onChange={(e) => setMother(e.target.value)} />
        </label>

        <h3>{t('joinContactTitle')}</h3>
        <p className="muted small">{t('joinContactHint')}</p>
        <label className="field">
          <span>{t('joinContactOf')}</span>
          <select value={contactOf} onChange={(e) => setContactOf(e.target.value as JoinForm['contactOf'])}>
            <option value="self">{t('contactSelf')}</option>
            <option value="father">{t('contactFather')}</option>
            <option value="mother">{t('contactMother')}</option>
            <option value="other">{t('contactOther')}</option>
          </select>
        </label>
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

        {error && (
          <p className="msg error" role="alert">
            {error}
          </p>
        )}
        <button className="btn primary" type="submit" disabled={busy}>
          {t('joinSubmit')}
        </button>
      </form>
    </section>
  );
}
