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

test('normaliza e valida o trecho configurado do MP3', () => {
  const settings = normalizeSaleMusicSettings({
    source: 'mp3',
    url: 'https://cdn.example.com/alerta.mp3',
    mp3Start: '2:11',
    mp3End: '2:30',
  });
  assert.equal(settings.mp3Start, '2:11');
  assert.equal(settings.mp3End, '2:30');
  assert.equal(validateSaleMusicSettings(settings), null);
});

test('rejeita trecho invertido ou maior que cinco minutos no MP3', () => {
  const inverted = normalizeSaleMusicSettings({
    source: 'mp3', url: 'https://cdn.example.com/alerta.mp3', mp3Start: '2:30', mp3End: '2:11',
  });
  assert.equal(validateSaleMusicSettings(inverted), 'O final do trecho do MP3 precisa ser posterior ao início.');
  const tooLong = normalizeSaleMusicSettings({
    source: 'mp3', url: 'https://cdn.example.com/alerta.mp3', mp3Start: '0:00', mp3End: '5:01',
  });
  assert.equal(validateSaleMusicSettings(tooLong), 'O trecho do MP3 pode ter no máximo 5 minutos.');
});

test('exige importar uma URL do YouTube antes de salvá-la como MP3', () => {
  const settings = normalizeSaleMusicSettings({
    source: 'mp3', url: 'https://youtu.be/abc123', mp3Start: '0:10', mp3End: '0:30',
  });
  assert.equal(validateSaleMusicSettings(settings), 'Importe o trecho do YouTube para o R2 antes de salvar.');
});
