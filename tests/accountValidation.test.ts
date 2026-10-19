import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeAccountName } from '../src/services/accountValidation';

test('normaliza o nome editado da linha', () => {
  assert.equal(normalizeAccountName('  Linha México  '), 'Linha México');
});

test('rejeita nome vazio ou composto apenas por espaços', () => {
  assert.throws(() => normalizeAccountName('   '), /não pode ficar vazio/);
  assert.throws(() => normalizeAccountName(undefined), /não pode ficar vazio/);
});
