import { useI18n } from '../i18n';
import type { EndKind, FlexDate, SpouseDates } from '../data/types';

/** Accepts Bangla digits as well as 0-9. */
const asciiDigits = (s: string): string =>
  s.replace(/[০-৯]/g, (ch) => String(ch.charCodeAt(0) - '০'.charCodeAt(0))).trim();

export interface SpouseDatesInput {
  start: string;
  endKind: EndKind | '';
  end: string;
  /** null while untouched: the suggested number is used. */
  order: string | null;
}

export const emptySpouseDates = (): SpouseDatesInput => ({ start: '', endKind: '', end: '', order: null });

const toInput = (d?: FlexDate): string =>
  d?.year && d.month && d.day
    ? `${String(d.year).padStart(4, '0')}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`
    : '';

const fromInput = (s: string): FlexDate | undefined => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) } : undefined;
};

export const spouseDatesToInput = (r: SpouseDates): SpouseDatesInput => ({
  start: toInput(r.startDate),
  endKind: r.endKind ?? '',
  end: toInput(r.endDate),
  order: r.marriageOrder?.toString() ?? '',
});

/** What goes into the record; anything left empty is simply not there. */
export function spouseDatesFromInput(v: SpouseDatesInput, suggested = ''): SpouseDates {
  const out: SpouseDates = {};
  const n = Number(asciiDigits(v.order ?? suggested));
  if (Number.isInteger(n) && n >= 1 && n <= 50) out.marriageOrder = n;
  const start = fromInput(v.start);
  const end = fromInput(v.end);
  if (start) out.startDate = start;
  if (v.endKind) out.endKind = v.endKind;
  if (end && v.endKind) out.endDate = end;
  return out;
}

/** Marriage date, and how and when the marriage ended. All optional. */
export function SpouseDatesFields({
  value,
  onChange,
  suggestedOrder = '',
}: {
  value: SpouseDatesInput;
  onChange: (v: SpouseDatesInput) => void;
  suggestedOrder?: string;
}) {
  const { t } = useI18n();
  return (
    <fieldset className="field">
      <legend>{t('spouseDatesTitle')}</legend>
      <label className="field">
        <span>{t('spouseOrder')}</span>
        <small>{t('spouseOrderHint')}</small>
        <input
          type="text"
          inputMode="numeric"
          maxLength={2}
          value={value.order ?? suggestedOrder}
          onChange={(e) => onChange({ ...value, order: e.target.value })}
        />
      </label>
      <label className="field">
        <span>{t('spouseMarriage')}</span>
        <input type="date" value={value.start} onChange={(e) => onChange({ ...value, start: e.target.value })} />
      </label>
      <label className="field">
        <span>{t('spouseEnded')}</span>
        <select
          value={value.endKind}
          onChange={(e) => onChange({ ...value, endKind: e.target.value as EndKind | '' })}
        >
          <option value="">{t('spouseNotEnded')}</option>
          <option value="divorce">{t('spouseDivorce')}</option>
          <option value="separation">{t('spouseSeparation')}</option>
          <option value="death">{t('spouseDeathOf')}</option>
        </select>
      </label>
      {value.endKind && (
        <label className="field">
          <span>{t('spouseEndDate')}</span>
          <input type="date" value={value.end} onChange={(e) => onChange({ ...value, end: e.target.value })} />
        </label>
      )}
    </fieldset>
  );
}
