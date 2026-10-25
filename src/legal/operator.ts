// Operator and legal-text configuration for the Impressum (§ 5 DDG), privacy
// notice (Art. 13 GDPR), terms and safety pages. These values are public by
// nature, so EXPO_PUBLIC_* is appropriate; no secret may ever be placed here.
// Production builds refuse to run until every required field is filled and
// the operator has confirmed that a lawyer reviewed the texts.
export type OperatorEnvironment = Record<string, string | undefined>;
export type OperatorConfig = {
  name: string;
  address: string;
  email: string;
  representative: string;
  register: string;
  vatId: string;
  privacyContact: string;
  supervisoryAuthority: string;
  legalReviewed: boolean;
  placeholder: boolean;
};

export const OPERATOR_FIELDS = {
  name: 'EXPO_PUBLIC_STUORA_OPERATOR_NAME',
  address: 'EXPO_PUBLIC_STUORA_OPERATOR_ADDRESS',
  email: 'EXPO_PUBLIC_STUORA_OPERATOR_EMAIL',
  representative: 'EXPO_PUBLIC_STUORA_OPERATOR_REPRESENTATIVE',
  privacyContact: 'EXPO_PUBLIC_STUORA_PRIVACY_CONTACT',
  supervisoryAuthority: 'EXPO_PUBLIC_STUORA_SUPERVISORY_AUTHORITY',
} as const;
const OPTIONAL_FIELDS = {
  register: 'EXPO_PUBLIC_STUORA_OPERATOR_REGISTER',
  vatId: 'EXPO_PUBLIC_STUORA_OPERATOR_VAT_ID',
} as const;
export const LEGAL_REVIEW_FLAG = 'EXPO_PUBLIC_STUORA_LEGAL_REVIEWED';
const PLACEHOLDER = /\[\[|TODO|TBD|example\.(com|org|test)|placeholder/i;

const clean = (value: string | undefined) => (value ?? '').trim().replace(/\s+/g, ' ').slice(0, 300);

export function readOperatorConfig(env: OperatorEnvironment): OperatorConfig {
  const required = Object.fromEntries(Object.entries(OPERATOR_FIELDS).map(([k, name]) => [k, clean(env[name])])) as Record<keyof typeof OPERATOR_FIELDS, string>;
  const optional = Object.fromEntries(Object.entries(OPTIONAL_FIELDS).map(([k, name]) => [k, clean(env[name])])) as Record<keyof typeof OPTIONAL_FIELDS, string>;
  const placeholder = Object.values(required).some(v => !v || PLACEHOLDER.test(v)) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(required.email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(required.privacyContact);
  const show = (v: string, label: string) => (v && !PLACEHOLDER.test(v) ? v : `[[${label} — to be completed by the operator]]`);
  return {
    name: show(required.name, 'Operator legal name'),
    address: show(required.address, 'Postal address for service'),
    email: show(required.email, 'Contact email'),
    representative: show(required.representative, 'Authorised representative'),
    privacyContact: show(required.privacyContact, 'Privacy contact email'),
    supervisoryAuthority: show(required.supervisoryAuthority, 'Competent data-protection supervisory authority'),
    register: optional.register,
    vatId: optional.vatId,
    legalReviewed: env[LEGAL_REVIEW_FLAG] === 'confirmed',
    placeholder,
  };
}

/** Throws for production builds that still contain placeholder legal data. */
export function assertLegalReady(mode: string | undefined, env: OperatorEnvironment): void {
  if (mode !== 'production') return;
  const config = readOperatorConfig(env);
  const missing = [
    ...Object.entries(OPERATOR_FIELDS).filter(([key]) => /^\[\[/.test(config[key as keyof typeof OPERATOR_FIELDS])).map(([, name]) => name),
    ...(config.legalReviewed ? [] : [LEGAL_REVIEW_FLAG + '=confirmed']),
  ];
  if (config.placeholder || missing.length) {
    throw new Error(`Stuora configuration: production requires completed legal pages. Missing or placeholder: ${missing.join(', ') || 'contact email format'}.`);
  }
}
