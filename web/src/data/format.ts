import type { FlexDate, Person } from './types';
import type { Lang } from '../i18n';

const digitFormats: Record<Lang, Intl.NumberFormat> = {
  bn: new Intl.NumberFormat('bn-BD', { useGrouping: false }),
  en: new Intl.NumberFormat('en-US', { useGrouping: false }),
};

export const num = (n: number, lang: Lang): string => digitFormats[lang].format(n);

const MONTHS: Record<Lang, string[]> = {
  bn: ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};

/** Name to show. Prefers the name in the chosen language, then the other one. */
export function personName(p: Person, lang: Lang, unknown: string): string {
  const first = lang === 'bn' ? p.nameBn : p.nameEn;
  const second = lang === 'bn' ? p.nameEn : p.nameBn;
  return first?.trim() || second?.trim() || p.nickname?.trim() || unknown;
}

/**
 * A date as written by a person: only the parts that are known, never filled in.
 * Approximate dates keep their label so they are not mistaken for exact ones.
 */
export function formatDate(d: FlexDate | undefined, lang: Lang, approxLabel: string): string {
  if (!d || d.year === undefined) return '';
  let text = num(d.year, lang);
  if (d.month !== undefined) {
    const month = MONTHS[lang][d.month - 1] ?? '';
    text = d.day !== undefined ? `${num(d.day, lang)} ${month} ${text}` : `${month} ${text}`;
  }
  return d.approx ? `${approxLabel} ${text}` : text;
}

/** "1920 – 1995", "born 1950", "– 1995", or empty when nothing is known. */
export function lifeSpan(p: Person, lang: Lang, approxLabel: string): string {
  const born = p.birth?.year !== undefined ? formatDate({ year: p.birth.year, approx: p.birth.approx }, lang, approxLabel) : '';
  const died = p.death?.year !== undefined ? formatDate({ year: p.death.year, approx: p.death.approx }, lang, approxLabel) : '';
  if (born && died) return `${born} – ${died}`;
  if (born) return p.living === false ? `${born} –` : born;
  if (died) return `– ${died}`;
  return '';
}

/** Cuts text to a number of visible characters without splitting a Bangla conjunct. */
export function truncate(text: string, max: number): string {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segments = Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), (s) => s.segment);
    if (segments.length <= max) return text;
    return `${segments.slice(0, max - 1).join('')}…`;
  }
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
