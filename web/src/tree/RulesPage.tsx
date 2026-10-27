import { useState } from 'react';
import { useI18n, type TKey } from '../i18n';
import { saveTreeSettings } from '../data/mutations';
import type { TreeSettings } from '../data/types';
import { useTree } from './TreeContext';

interface Fixed {
  title: TKey;
  why: TKey;
  /** The day this was decided, in the project's conversations. */
  decided: string;
}

const FIXED: Fixed[] = [
  { title: 'fxPrivateT', why: 'fxPrivateW', decided: '2026-10-22' },
  { title: 'fxEmailT', why: 'fxEmailW', decided: '2026-10-22' },
  { title: 'fxDeleteT', why: 'fxDeleteW', decided: '2026-10-22' },
  { title: 'fxFiveT', why: 'fxFiveW', decided: '2026-10-26' },
  { title: 'fxOneT', why: 'fxOneW', decided: '2026-10-26' },
  { title: 'fxManagerSafeT', why: 'fxManagerSafeW', decided: '2026-10-26' },
  { title: 'fxRolesT', why: 'fxRolesW', decided: '2026-10-26' },
  { title: 'fxJoinT', why: 'fxJoinW', decided: '2026-10-26' },
  { title: 'fxSingleT', why: 'fxSingleW', decided: '2026-10-26' },
  { title: 'fxContactT', why: 'fxContactW', decided: '2026-10-26' },
  { title: 'fxApproveT', why: 'fxApproveW', decided: '2026-10-27' },
  { title: 'fxConnectedT', why: 'fxConnectedW', decided: '2026-10-27' },
];

/** Every rule of the tree in one place: why it exists, when it was decided, and who can change it. */
export function RulesPage() {
  const { t, lang } = useI18n();
  const { current, canEdit, ready, role, settings } = useTree();
  const [note, setNote] = useState<string | null>(null);
  const treeId = current?.id;
  const isManager = role === 'owner';

  if (!ready || !treeId) return <p className="muted">{t('treeLoading')}</p>;
  if (!canEdit) return <p className="msg error">{t('rulesOnlyAdmins')}</p>;

  const save = async (patch: Partial<TreeSettings>) => {
    setNote(null);
    try {
      await saveTreeSettings(treeId, { ...settings, ...patch });
      setNote(t('rulesSaved'));
    } catch {
      setNote(t('errSave'));
    }
  };

  const day = (iso: string) =>
    new Date(iso).toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

  return (
    <div className="rules-page">
      <h2>{t('rulesTitle')}</h2>
      <p className="muted small">{current?.name}</p>
      <p>{t('rulesIntro')}</p>
      {note && (
        <p className="msg ok" role="status">
          {note}
        </p>
      )}

      <h3>{t('rulesChangeable')}</h3>

      <section className="card rule">
        <label className="radio">
          <input
            type="checkbox"
            checked={settings.adminsCanInvite !== false}
            disabled={!isManager}
            onChange={(e) => void save({ adminsCanInvite: e.target.checked })}
          />
          <strong>{t('rcAdminsInviteT')}</strong>
        </label>
        <p className="muted small">
          {t('rulesWhy')}: {t('rcAdminsInviteW')}
        </p>
        <p className="muted small">
          {t('rulesDecided')}: {day('2026-10-26')} · {t('rulesWho')}: {t('whoManager')}
        </p>
      </section>

      <section className="card rule">
        <label className="radio">
          <input
            type="checkbox"
            checked={settings.participantsCanInvite === true}
            onChange={(e) => void save({ participantsCanInvite: e.target.checked })}
          />
          <strong>{t('rcPartsInviteT')}</strong>
        </label>
        <p className="muted small">
          {t('rulesWhy')}: {t('rcPartsInviteW')}
        </p>
        <p className="muted small">
          {t('rulesDecided')}: {day('2026-10-26')} · {t('rulesWho')}: {t('whoManagerAdmin')}
        </p>
      </section>

      <section className="card rule">
        <label className="inline-select">
          <strong>{t('rcInviteDaysT')}</strong>
          <select
            value={settings.inviteDays ?? 7}
            disabled={!isManager}
            onChange={(e) => void save({ inviteDays: Number(e.target.value) })}
          >
            {[1, 3, 7, 14, 21, 30].map((n) => (
              <option key={n} value={n}>
                {n} {t('rulesDays')}
              </option>
            ))}
          </select>
        </label>
        <p className="muted small">
          {t('rulesWhy')}: {t('rcInviteDaysW')}
        </p>
        <p className="muted small">
          {t('rulesDecided')}: {day('2026-10-26')} · {t('rulesWho')}: {t('whoManager')}
        </p>
      </section>

      <h3>{t('rulesFixed')}</h3>
      {FIXED.map((f) => (
        <section key={f.title} className="card rule">
          <strong>{t(f.title)}</strong>
          <p className="muted small">
            {t('rulesWhy')}: {t(f.why)}
          </p>
          <p className="muted small">
            {t('rulesDecided')}: {day(f.decided)} · {t('rulesWho')}: {t('whoFixed')}
          </p>
        </section>
      ))}
    </div>
  );
}
