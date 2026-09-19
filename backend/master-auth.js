import { createHash, timingSafeEqual } from 'node:crypto';

const MASTER_DEFINITIONS = [
  { id: 'thiago', name: 'Thiago', emailKey: 'MASTER_THIAGO_EMAIL', passwordKey: 'MASTER_THIAGO_PASSWORD' },
  { id: 'cristiano', name: 'Cristiano', emailKey: 'MASTER_CRISTIANO_EMAIL', passwordKey: 'MASTER_CRISTIANO_PASSWORD' },
];

const normalizeEmail = value => String(value || '').trim().toLowerCase();
const secureEqual = (left, right) => {
  const leftHash = createHash('sha256').update(String(left || '')).digest();
  const rightHash = createHash('sha256').update(String(right || '')).digest();
  return timingSafeEqual(leftHash, rightHash);
};

export const loadMasterAccounts = (env = process.env) => MASTER_DEFINITIONS.map(definition => ({
  id: definition.id,
  name: definition.name,
  email: normalizeEmail(env[definition.emailKey]),
  password: String(env[definition.passwordKey] || ''),
  configured: Boolean(normalizeEmail(env[definition.emailKey]) && env[definition.passwordKey]),
}));

export const mastersAreConfigured = accounts => (
  accounts.length === MASTER_DEFINITIONS.length
  && accounts.every(account => account.configured)
  && new Set(accounts.map(account => account.email)).size === accounts.length
);

export const findMasterByEmail = (accounts, email) => {
  const candidate = normalizeEmail(email);
  return accounts.find(account => account.configured && secureEqual(account.email, candidate)) || null;
};

export const findMasterByCredentials = (accounts, email, password) => {
  const master = findMasterByEmail(accounts, email);
  return master && secureEqual(master.password, password) ? master : null;
};

export const publicMaster = master => ({ id: master.id, name: master.name, email: master.email, role: 'master' });
