import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findMasterByCredentials,
  findMasterByEmail,
  loadMasterAccounts,
  mastersAreConfigured,
  publicMaster,
} from './master-auth.js';

const env = {
  MASTER_THIAGO_EMAIL: 'Thiago@Manaaim.com',
  MASTER_THIAGO_PASSWORD: 'senha-forte-1',
  MASTER_CRISTIANO_EMAIL: 'cristiano@manaaim.com',
  MASTER_CRISTIANO_PASSWORD: 'senha-forte-2',
};

test('carrega exatamente os dois masters e normaliza os e-mails', () => {
  const accounts = loadMasterAccounts(env);
  assert.equal(mastersAreConfigured(accounts), true);
  assert.deepEqual(accounts.map(account => account.email), ['thiago@manaaim.com', 'cristiano@manaaim.com']);
});

test('valida e-mail sem diferenciar maiúsculas, mas exige a senha exata', () => {
  const accounts = loadMasterAccounts(env);
  assert.equal(findMasterByCredentials(accounts, ' THIAGO@manaaim.com ', 'senha-forte-1')?.id, 'thiago');
  assert.equal(findMasterByCredentials(accounts, 'thiago@manaaim.com', 'Senha-forte-1'), null);
  assert.equal(findMasterByCredentials(accounts, 'outro@manaaim.com', 'senha-forte-1'), null);
});

test('não considera válida uma configuração incompleta ou duplicada', () => {
  assert.equal(mastersAreConfigured(loadMasterAccounts({})), false);
  assert.equal(mastersAreConfigured(loadMasterAccounts({ ...env, MASTER_CRISTIANO_EMAIL: env.MASTER_THIAGO_EMAIL })), false);
});

test('expõe somente os dados públicos do master', () => {
  const master = findMasterByEmail(loadMasterAccounts(env), 'cristiano@manaaim.com');
  assert.deepEqual(publicMaster(master), {
    id: 'cristiano', name: 'Cristiano', email: 'cristiano@manaaim.com', role: 'master',
  });
  assert.equal('password' in publicMaster(master), false);
});
