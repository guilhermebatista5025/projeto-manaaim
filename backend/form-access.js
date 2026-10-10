import { createHash, timingSafeEqual } from 'node:crypto';

const FORM_USER_DEFINITIONS = [
  { id: 'guilherme', name: 'Guilherme', emailKey: 'FORM_GUILHERME_EMAIL' },
  { id: 'douglas', name: 'Douglas', emailKey: 'FORM_DOUGLAS_EMAIL' },
  { id: 'jeane', name: 'Jeane', emailKey: 'FORM_JEANE_EMAIL' },
  { id: 'franciele', name: 'Franciele', emailKey: 'FORM_FRANCIELE_EMAIL' },
  { id: 'lucilene', name: 'Lucilene', emailKey: 'FORM_LUCILENE_EMAIL' },
  { id: 'cleidiane', name: 'Cleidiane', emailKey: 'FORM_CLEIDIANE_EMAIL' },
  { id: 'cantina-manaaim', name: 'Cantina Maanaim', emailKey: 'FORM_CANTINA_MANAAIM_EMAIL' },
];

const normalizeEmail = value => String(value || '').trim().toLowerCase();
const secureEqual = (left, right) => {
  const leftHash = createHash('sha256').update(String(left || '')).digest();
  const rightHash = createHash('sha256').update(String(right || '')).digest();
  return timingSafeEqual(leftHash, rightHash);
};

export const loadFormAccounts = (env = process.env) => FORM_USER_DEFINITIONS.map(definition => ({
  id: definition.id,
  name: definition.name,
  email: normalizeEmail(env[definition.emailKey]),
  configured: Boolean(normalizeEmail(env[definition.emailKey])),
}));

export const findFormAccountByEmail = (accounts, email) => {
  const candidate = normalizeEmail(email);
  return accounts.find(account => account.configured && secureEqual(account.email, candidate)) || null;
};

export const publicFormAccount = account => ({
  id: account.id,
  name: account.name,
  email: account.email,
  role: 'formulario',
});
