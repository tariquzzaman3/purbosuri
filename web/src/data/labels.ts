import type { TKey } from '../i18n';
import type { RelKind, RelStatus, Role, Verification } from './types';

export const KIND_KEYS: Record<RelKind, TKey> = {
  biological: 'kindBiological',
  adoptive: 'kindAdoptive',
  step: 'kindStep',
  foster: 'kindFoster',
  unknown: 'kindUnknown',
};

export const VERIFICATION_KEYS: Record<Verification, TKey> = {
  documented: 'vDocumented',
  recollection: 'vRecollection',
  estimated: 'vEstimated',
  disputed: 'vDisputed',
  unverified: 'vUnverified',
};

export const ROLE_KEYS: Record<Role, TKey> = {
  owner: 'roleOwner',
  reviewer: 'roleReviewer',
  contributor: 'roleContributor',
  viewer: 'roleViewer',
};

/** Only unusual relationships get a label, so the common case stays uncluttered. */
export function relationshipBadges(kind?: RelKind, status?: RelStatus): TKey[] {
  const keys: TKey[] = [];
  if (kind && kind !== 'biological') keys.push(KIND_KEYS[kind]);
  if (status === 'disputed') keys.push('vDisputed');
  if (status === 'uncertain') keys.push('vUnverified');
  return keys;
}
