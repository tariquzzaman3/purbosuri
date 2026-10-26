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
  /** Contact details the person chose to show to everyone in the tree. */
  publicContact?: Contact;
  createdBy: string;
}

export interface Contact {
  phone?: string;
  facebook?: string;
  email?: string;
}

/** Switches the manager (and, for one of them, admins) can change for a tree. Missing means the default. */
export interface TreeSettings {
  /** Admins may invite people. Default on. */
  adminsCanInvite?: boolean;
  /** Participants may invite people as participants. Default off. */
  participantsCanInvite?: boolean;
  /** How many days an invitation stays valid (1 to 30). Default 7. */
  inviteDays?: number;
}

export interface JoinRequest {
  uid: string;
  displayName: string;
  fatherName?: string;
  motherName?: string;
  contact?: Contact;
  contactOf?: 'self' | 'father' | 'mother' | 'other';
  role: 'reviewer' | 'contributor';
  status: 'pending' | 'approved' | 'rejected';
  personId?: string;
}

export interface Invite {
  id: string;
  role: 'reviewer' | 'contributor';
  treeName: string;
  createdBy: string;
  expiresAt?: Date;
  usedBy?: string;
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
  /** Which of the person's five tree slots this tree takes. */
  slot?: number;
  settings?: TreeSettings;
}

/** The editable fields of a person, as the form handles them. */
export type PersonFields = Omit<Person, 'id' | 'createdBy' | 'publicContact'>;
