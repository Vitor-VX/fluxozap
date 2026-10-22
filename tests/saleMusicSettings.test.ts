import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeSaleMusicSettings,
  parseSaleMusicTimecode,
  validateSaleMusicSettings,
} from '../src/services/saleMusicSettings';

test('normaliza limites e preserva a configuração válida do YouTube', () => {
  const settings = normalizeSaleMusicSettings({
    source: 'youtube',
    preset: 'bell',
    url: ' https://www.youtube.com/watch?v=abc123 ',
    durationSeconds: 900,
    volume: 150,
    youtubeStart: '1:10',
    youtubeEnd: '1:30',
  });
  assert.equal(settings.url, 'https://www.youtube.com/watch?v=abc123');
  assert.equal(settings.durationSeconds, 300);
  assert.equal(settings.volume, 100);
  assert.equal(validateSaleMusicSettings(settings), null);
});

test('rejeita intervalo invertido do YouTube', () => {
  const settings = normalizeSaleMusicSettings({
    source: 'youtube',
    url: 'https://youtu.be/abc123',
    youtubeStart: '01:30',
    youtubeEnd: '01:10',
  });
  assert.equal(validateSaleMusicSettings(settings), 'O final do trecho precisa ser posterior ao início.');
});

test('rejeita domínio externo quando a fonte declarada é YouTube', () => {
  const settings = normalizeSaleMusicSettings({
    source: 'youtube',
    url: 'https://example.com/audio.mp3',
    youtubeStart: '00:00',
    youtubeEnd: '00:30',
  });
  assert.equal(validateSaleMusicSettings(settings), 'Informe uma URL válida do YouTube.');
});

test('interpreta segundos, MM:SS e HH:MM:SS', () => {
  assert.equal(parseSaleMusicTimecode('45'), 45);
  assert.equal(parseSaleMusicTimecode('1:10'), 70);
  assert.equal(parseSaleMusicTimecode('1:02:03'), 3723);
  assert.equal(parseSaleMusicTimecode('1:99'), null);
});
