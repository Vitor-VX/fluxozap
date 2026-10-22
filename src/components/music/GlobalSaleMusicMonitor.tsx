import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_SALE_MUSIC_SETTINGS,
  normalizeSaleMusicSettings,
  parseSaleMusicTimecode,
  type SaleMusicPresetTone,
  type SaleMusicSettings,
} from '../../services/saleMusicSettings';

type MusicSettings = SaleMusicSettings;
type PresetTone = SaleMusicPresetTone;

interface SaleNotification {
  id: string;
  accountName: string;
  amount: number;
  currency: string;
  method: string;
}

const SETTINGS_KEY = 'fluxozap:sale-music:settings';
const PROCESSED_KEY = 'fluxozap:sale-music:processed-events';
function readLocalSettings(): MusicSettings | null {
  try {
    const saved = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || 'null');
    return saved ? normalizeSaleMusicSettings(saved) : null;
  } catch { return null; }
}

function youtubeVideoId(value: string): string {
  try {
    const url = new URL(value.trim());
    if (url.hostname === 'youtu.be') return url.pathname.split('/').filter(Boolean)[0] || '';
    if (url.hostname.endsWith('youtube.com')) {
      if (url.pathname === '/watch') return url.searchParams.get('v') || '';
      const parts = url.pathname.split('/').filter(Boolean);
      if (['embed', 'shorts', 'live'].includes(parts[0])) return parts[1] || '';
    }
  } catch { /* invalid URL */ }
  return '';
}

export const GlobalSaleMusicMonitor: React.FC = () => {
  const [settings, setSettings] = useState<MusicSettings>(() => readLocalSettings() || DEFAULT_SALE_MUSIC_SETTINGS);
  const [enabled, setEnabled] = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [youtubeReady, setYoutubeReady] = useState(false);
  const cursorRef = useRef('');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const youtubeFrameRef = useRef<HTMLIFrameElement | null>(null);
  const stopTimerRef = useRef<number | null>(null);
  const pendingEventsRef = useRef<SaleNotification[]>([]);
  const youtubeId = useMemo(() => youtubeVideoId(settings.url), [settings.url]);

  const stopPlayback = () => {
    if (stopTimerRef.current) window.clearTimeout(stopTimerRef.current);
    stopTimerRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    youtubeFrameRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'stopVideo', args: [] }), '*');
  };

  const playPreset = async () => {
    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
    const context = audioContextRef.current || new AudioContextCtor();
    audioContextRef.current = context;
    await context.resume();
    const patterns: Record<PresetTone, Array<[number, number, number]>> = {
      cash: [[880, 0, 0.14], [1175, 0.16, 0.18], [1568, 0.36, 0.32]],
      chime: [[659, 0, 0.25], [784, 0.18, 0.3], [1047, 0.4, 0.45]],
      bell: [[1047, 0, 0.55], [1319, 0.08, 0.65]],
    };
    const start = context.currentTime;
    patterns[settings.preset].forEach(([frequency, delay, duration]) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start + delay);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.01, settings.volume / 100) * 0.22, start + delay + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + delay + duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start + delay);
      oscillator.stop(start + delay + duration + 0.03);
    });
  };

  const playConfiguredSound = async () => {
    stopPlayback();
    if (settings.source === 'preset') return playPreset();
    if (settings.source === 'mp3') {
      if (!settings.url.trim()) throw new Error('Configure uma URL de MP3 em /musica.');
      const audio = new Audio(settings.url.trim());
      audio.volume = settings.volume / 100;
      audioRef.current = audio;
      await audio.play();
      stopTimerRef.current = window.setTimeout(stopPlayback, settings.durationSeconds * 1000);
      return;
    }
    const startAt = parseSaleMusicTimecode(settings.youtubeStart);
    const endAt = parseSaleMusicTimecode(settings.youtubeEnd);
    if (!youtubeId || !youtubeReady || startAt === null || endAt === null || endAt <= startAt) {
      throw new Error('Revise o link e o trecho do YouTube em /musica.');
    }
    youtubeFrameRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'setVolume', args: [settings.volume] }), '*');
    youtubeFrameRef.current?.contentWindow?.postMessage(JSON.stringify({
      event: 'command',
      func: 'loadVideoById',
      args: [{ videoId: youtubeId, startSeconds: startAt, endSeconds: endAt }],
    }), '*');
    stopTimerRef.current = window.setTimeout(stopPlayback, (endAt - startAt) * 1000);
  };

  const processedEvents = (): Set<string> => {
    try { return new Set(JSON.parse(window.localStorage.getItem(PROCESSED_KEY) || '[]')); }
    catch { return new Set(); }
  };

  const rememberEvents = (ids: string[]) => {
    const values = Array.from(new Set([...processedEvents(), ...ids])).slice(-200);
    window.localStorage.setItem(PROCESSED_KEY, JSON.stringify(values));
  };

  const initializeMonitoring = async () => {
    try {
      const response = await fetch('/api/sale-notifications', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Falha ao ativar alertas.');
      cursorRef.current = payload.cursor;
      setEnabled(true);
    } catch (error: any) {
      console.error('[Alerta de vendas] Não foi possível iniciar o monitoramento:', error);
    }
  };

  const synchronizeGlobalSettings = async (): Promise<void> => {
    const response = await fetch('/api/sale-music/config', { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar a música global.');
    let resolved: MusicSettings | null = payload.configured
      ? normalizeSaleMusicSettings(payload.settings)
      : null;
    const localSettings = readLocalSettings();
    if (!resolved && localSettings) {
      const migrationResponse = await fetch('/api/sale-music/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: localSettings }),
      });
      const migrationPayload = await migrationResponse.json();
      if (!migrationResponse.ok) throw new Error(migrationPayload.error || 'Não foi possível migrar a música salva.');
      resolved = normalizeSaleMusicSettings(migrationPayload.settings);
    }
    const next = resolved || DEFAULT_SALE_MUSIC_SETTINGS;
    setSettings((current) => JSON.stringify(current) === JSON.stringify(next) ? current : next);
    if (resolved) window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(resolved));
  };

  useEffect(() => {
    let disposed = false;
    const initialize = async () => {
      try {
        await synchronizeGlobalSettings();
        if (!disposed) await initializeMonitoring();
      } catch (error) {
        console.error('[Alerta de vendas] Não foi possível iniciar o monitor global:', error);
      }
    };
    initialize();
    const settingsInterval = window.setInterval(() => {
      synchronizeGlobalSettings().catch((error) => {
        console.error('[Alerta de vendas] Não foi possível atualizar a música global:', error);
      });
    }, 15000);
    return () => { disposed = true; window.clearInterval(settingsInterval); };
  }, []);

  useEffect(() => {
    if (audioUnlocked) return;
    const unlock = async () => {
      try {
        const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
        audioContextRef.current ||= new AudioContextCtor();
        await audioContextRef.current.resume();
        setAudioUnlocked(true);
        const pending = pendingEventsRef.current;
        if (pending.length) {
          await playConfiguredSound();
          rememberEvents(pending.map((event) => event.id));
          pendingEventsRef.current = [];
        }
      } catch (error) {
        console.error('[Alerta de vendas] O navegador ainda não liberou o áudio:', error);
      }
    };
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
    window.addEventListener('touchstart', unlock, { capture: true });
    return () => {
      window.removeEventListener('pointerdown', unlock, { capture: true });
      window.removeEventListener('keydown', unlock, { capture: true });
      window.removeEventListener('touchstart', unlock, { capture: true });
    };
  }, [audioUnlocked, settings, youtubeReady]);

  useEffect(() => setYoutubeReady(false), [youtubeId]);

  useEffect(() => {
    if (!audioUnlocked || !youtubeReady || !pendingEventsRef.current.length) return;
    const pending = [...pendingEventsRef.current];
    playConfiguredSound()
      .then(() => {
        rememberEvents(pending.map((event) => event.id));
        pendingEventsRef.current = [];
      })
      .catch((error) => console.error('[Alerta de vendas] Falha ao reproduzir evento pendente:', error));
  }, [audioUnlocked, youtubeReady, settings]);

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    const poll = async () => {
      if (!cursorRef.current) return;
      try {
        const response = await fetch(`/api/sale-notifications?after=${encodeURIComponent(cursorRef.current)}`, { cache: 'no-store' });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Falha ao consultar vendas.');
        if (disposed) return;
        cursorRef.current = payload.cursor;
        const processed = processedEvents();
        const events: SaleNotification[] = (payload.events || []).filter((event: SaleNotification) => !processed.has(event.id));
        if (!events.length) return;
        try {
          await playConfiguredSound();
          rememberEvents(events.map((event) => event.id));
          pendingEventsRef.current = [];
        } catch (error) {
          pendingEventsRef.current = events;
          throw error;
        }
      } catch (error) {
        console.error('[Alerta de vendas]', error);
      }
    };
    const interval = window.setInterval(poll, 4000);
    return () => { disposed = true; window.clearInterval(interval); };
  }, [enabled, settings, youtubeReady]);

  useEffect(() => () => stopPlayback(), []);

  return (
    <>
      {settings.source === 'youtube' && youtubeId && (
        <iframe
          ref={youtubeFrameRef}
          title="Player global do alerta de vendas"
          src={`https://www.youtube.com/embed/${youtubeId}?enablejsapi=1&playsinline=1&start=${parseSaleMusicTimecode(settings.youtubeStart) || 0}&end=${parseSaleMusicTimecode(settings.youtubeEnd) || 0}&origin=${encodeURIComponent(window.location.origin)}`}
          allow="autoplay"
          onLoad={() => setYoutubeReady(true)}
          className="pointer-events-none fixed h-px w-px opacity-0"
        />
      )}
    </>
  );
};
