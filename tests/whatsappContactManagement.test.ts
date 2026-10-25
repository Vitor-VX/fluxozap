import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWhatsAppBlockUsersPayload,
  isValidWhatsAppRegistrationPin,
  normalizeWhatsAppUser,
} from '../src/services/whatsappContactManagement';

test('normaliza o contato para o formato internacional usado pela Meta', () => {
  assert.equal(normalizeWhatsAppUser('+55 (69) 99999-1234'), '+5569999991234');
  assert.deepEqual(buildWhatsAppBlockUsersPayload('5569999991234'), {
    messaging_product: 'whatsapp',
    block_users: [{ user: '+5569999991234' }],
  });
});

test('recusa contatos fora do tamanho E.164', () => {
  assert.throws(() => normalizeWhatsAppUser('123'), /entre 8 e 15 dígitos/);
  assert.throws(() => normalizeWhatsAppUser('1234567890123456'), /entre 8 e 15 dígitos/);
});

test('aceita somente PIN de registro com seis dígitos', () => {
  assert.equal(isValidWhatsAppRegistrationPin('123456'), true);
  assert.equal(isValidWhatsAppRegistrationPin('12345'), false);
  assert.equal(isValidWhatsAppRegistrationPin('12345a'), false);
});
