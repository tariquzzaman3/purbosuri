export type Role = 'owner' | 'reviewer' | 'contributor' | 'viewer';

/** A date that may be partly or fully unknown. Never silently turned into an exact date. */
export interface FlexDate {
  year?: number;
  month?: number;
  day?: number;
  approx?: boolean;
}

export type Verification = 'documented' | 'recollection' | 'estimated' | 'disputed' | 'unverified';

export interface Person {
  id: string;
  nameBn?: string;
  nameEn?: string;
  nickname?: string;
  birth?: FlexDate;
  /** Place among siblings, 1 = eldest. Breaks ties for twins and unknown dates. */
  birthOrder?: number;
  death?: FlexDate;
  birthPlace?: string;
  residence?: string;
  deathPlace?: string;
  occupation?: string;
  bio?: string;
  living?: boolean;
  verification?: Verification;
  createdBy: string;
}

export type RelType = 'parent' | 'spouse' | 'sibling' | 'other';
export type RelKind = 'biological' | 'adoptive' | 'step' | 'foster' | 'unknown';
export type RelStatus = 'confirmed' | 'uncertain' | 'disputed';

/** For type 'parent', personA is a parent of personB. */
export interface Relationship {
  id: string;
  personA: string;
  personB: string;
  type: RelType;
  kind?: RelKind;
  status?: RelStatus;
  createdBy: string;
}

export interface TreeRef {
  id: string;
  name: string;
  /** Who created the tree (the admin). Known once the tree itself has loaded. */
  ownerUid?: string;
}

/** The editable fields of a person, as the form handles them. */
export type PersonFields = Omit<Person, 'id' | 'createdBy'>;
