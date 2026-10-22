export type SaleMusicAudioSource = 'preset' | 'mp3' | 'youtube';
export type SaleMusicPresetTone = 'cash' | 'chime' | 'bell';

export interface SaleMusicSettings {
  source: SaleMusicAudioSource;
  preset: SaleMusicPresetTone;
  url: string;
  durationSeconds: number;
  volume: number;
  youtubeStart: string;
  youtubeEnd: string;
}

export const DEFAULT_SALE_MUSIC_SETTINGS: SaleMusicSettings = {
  source: 'preset',
  preset: 'cash',
  url: '',
  durationSeconds: 30,
  volume: 80,
  youtubeStart: '00:00',
  youtubeEnd: '00:30',
};

export function parseSaleMusicTimecode(value: string): number | null {
  const parts = String(value || '').trim().split(':');
  if (parts.length < 1 || parts.length > 3 || parts.some((part) => !/^\d+$/.test(part))) return null;
  const values = parts.map(Number);
  if (parts.length > 1 && values.at(-1)! >= 60) return null;
  if (parts.length === 3 && values[1] >= 60) return null;
  if (parts.length === 1) return values[0];
  if (parts.length === 2) return values[0] * 60 + values[1];
  return values[0] * 3600 + values[1] * 60 + values[2];
}

export function normalizeSaleMusicSettings(input: unknown): SaleMusicSettings {
  const value = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const source: SaleMusicAudioSource = ['preset', 'mp3', 'youtube'].includes(String(value.source))
    ? value.source as SaleMusicAudioSource
    : DEFAULT_SALE_MUSIC_SETTINGS.source;
  const preset: SaleMusicPresetTone = ['cash', 'chime', 'bell'].includes(String(value.preset))
    ? value.preset as SaleMusicPresetTone
    : DEFAULT_SALE_MUSIC_SETTINGS.preset;
  const duration = Number(value.durationSeconds);
  const volume = Number(value.volume);
  return {
    source,
    preset,
    url: String(value.url || '').trim().slice(0, 2048),
    durationSeconds: Math.min(300, Math.max(1, Number.isFinite(duration) ? duration : 30)),
    volume: Math.min(100, Math.max(0, Number.isFinite(volume) ? volume : 80)),
    youtubeStart: String(value.youtubeStart || DEFAULT_SALE_MUSIC_SETTINGS.youtubeStart).trim(),
    youtubeEnd: String(value.youtubeEnd || DEFAULT_SALE_MUSIC_SETTINGS.youtubeEnd).trim(),
  };
}

export function validateSaleMusicSettings(settings: SaleMusicSettings): string | null {
  if (settings.source !== 'preset') {
    try {
      const url = new URL(settings.url);
      if (!['http:', 'https:'].includes(url.protocol)) return 'A URL do áudio deve usar HTTP ou HTTPS.';
      if (settings.source === 'youtube' && !(
        url.hostname === 'youtu.be' ||
        url.hostname === 'youtube.com' ||
        url.hostname.endsWith('.youtube.com')
      )) return 'Informe uma URL válida do YouTube.';
    } catch {
      return settings.source === 'youtube' ? 'Informe uma URL válida do YouTube.' : 'Informe uma URL pública válida do MP3.';
    }
  }
  if (settings.source === 'youtube') {
    const start = parseSaleMusicTimecode(settings.youtubeStart);
    const end = parseSaleMusicTimecode(settings.youtubeEnd);
    if (start === null || end === null) return 'Use horários válidos para o trecho do YouTube.';
    if (end <= start) return 'O final do trecho precisa ser posterior ao início.';
  }
  return null;
}
