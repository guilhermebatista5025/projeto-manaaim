import test from 'node:test';
import assert from 'node:assert/strict';
import { findFormAccountByEmail, loadFormAccounts, publicFormAccount } from './form-access.js';

test('prepara Guilherme e os seis usuários do formulário sem expor senhas', () => {
  const accounts = loadFormAccounts({
    FORM_GUILHERME_EMAIL: ' Guilherme@Manaaim.com ',
    FORM_DOUGLAS_EMAIL: 'douglas@manaaim.com',
  });
  assert.equal(accounts.length, 7);
  assert.equal(accounts[0].email, 'guilherme@manaaim.com');
  assert.equal(accounts[0].configured, true);
  assert.equal(accounts[2].configured, false);
  assert.equal('password' in accounts[0], false);
});

test('identifica o usuário do formulário por e-mail normalizado', () => {
  const accounts = loadFormAccounts({ FORM_GUILHERME_EMAIL: 'guilherme@manaaim.com' });
  const account = findFormAccountByEmail(accounts, ' GUILHERME@manaaim.com ');
  assert.equal(account?.name, 'Guilherme');
  assert.equal(findFormAccountByEmail(accounts, 'desconhecido@manaaim.com'), null);
  assert.deepEqual(publicFormAccount(account), {
    id: 'guilherme', name: 'Guilherme', email: 'guilherme@manaaim.com', role: 'formulario',
  });
});
