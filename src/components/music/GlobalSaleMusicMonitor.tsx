import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Music2, X } from 'lucide-react';

type AudioSource = 'preset' | 'mp3' | 'youtube';
type PresetTone = 'cash' | 'chime' | 'bell';

interface MusicSettings {
  source: AudioSource;
  preset: PresetTone;
  url: string;
  durationSeconds: number;
  volume: number;
  youtubeStart: string;
  youtubeEnd: string;
}

interface SaleNotification {
  id: string;
  accountName: string;
  amount: number;
  currency: string;
  method: string;
}

const SETTINGS_KEY = 'fluxozap:sale-music:settings';
const PROCESSED_KEY = 'fluxozap:sale-music:processed-events';
const DEFAULT_SETTINGS: MusicSettings = {
  source: 'preset', preset: 'cash', url: '', durationSeconds: 30, volume: 80,
  youtubeStart: '00:00', youtubeEnd: '00:30',
};

function readSettings(): MusicSettings {
  try {
    const saved = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || 'null');
    return saved ? { ...DEFAULT_SETTINGS, ...saved } : DEFAULT_SETTINGS;
  } catch { return DEFAULT_SETTINGS; }
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

function parseTimecode(value: string): number | null {
  const parts = value.trim().split(':');
  if (parts.length < 1 || parts.length > 3 || parts.some((part) => !/^\d+$/.test(part))) return null;
  const values = parts.map(Number);
  if (parts.length > 1 && values.at(-1)! >= 60) return null;
  if (parts.length === 3 && values[1] >= 60) return null;
  if (parts.length === 1) return values[0];
  if (parts.length === 2) return values[0] * 60 + values[1];
  return values[0] * 3600 + values[1] * 60 + values[2];
}

function formatMoney(amount: number, currency: string): string {
  try { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(amount); }
  catch { return `${currency} ${amount.toFixed(2)}`; }
}

export const GlobalSaleMusicMonitor: React.FC = () => {
  const [settings, setSettings] = useState<MusicSettings>(readSettings);
  const [enabled, setEnabled] = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [youtubeReady, setYoutubeReady] = useState(false);
  const [lastSale, setLastSale] = useState<SaleNotification | null>(null);
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
    const startAt = parseTimecode(settings.youtubeStart);
    const endAt = parseTimecode(settings.youtubeEnd);
    if (!youtubeId || !youtubeReady || startAt === null || endAt === null || endAt <= startAt) {
      throw new Error('Revise o link e o trecho do YouTube em /musica.');
    }
    youtubeFrameRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'setVolume', args: [settings.volume] }), '*');
    youtubeFrameRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'seekTo', args: [startAt, true] }), '*');
    youtubeFrameRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*');
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

  useEffect(() => { initializeMonitoring(); }, []);

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

  useEffect(() => {
    const syncSettings = (event: StorageEvent) => {
      if (event.key === SETTINGS_KEY) setSettings(readSettings());
    };
    window.addEventListener('storage', syncSettings);
    return () => window.removeEventListener('storage', syncSettings);
  }, []);

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
        setLastSale(events.at(-1)!);
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
      {enabled && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-xl border border-emerald-300 bg-white px-3 py-2 text-xs shadow-lg dark:border-emerald-800 dark:bg-slate-900">
          <Music2 className="h-4 w-4 text-emerald-500" />
          <div><p className="font-bold text-slate-800 dark:text-slate-100">{audioUnlocked ? 'Alertas sonoros ativos' : 'Monitor ativo · som libera no primeiro clique'}</p>{lastSale && <p className="text-slate-500">{formatMoney(lastSale.amount, lastSale.currency)} · {lastSale.accountName}</p>}</div>
          <button type="button" onClick={() => { setEnabled(false); stopPlayback(); }} className="ml-1 text-slate-400 hover:text-slate-700" title="Desativar alertas"><X className="h-4 w-4" /></button>
        </div>
      )}

      {settings.source === 'youtube' && youtubeId && (
        <iframe
          ref={youtubeFrameRef}
          title="Player global do alerta de vendas"
          src={`https://www.youtube.com/embed/${youtubeId}?enablejsapi=1&playsinline=1&origin=${encodeURIComponent(window.location.origin)}`}
          allow="autoplay"
          onLoad={() => setYoutubeReady(true)}
          className="pointer-events-none fixed h-px w-px opacity-0"
        />
      )}
    </>
  );
};
