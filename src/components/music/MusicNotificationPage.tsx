import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BellRing, CheckCircle2, ExternalLink, Music2, Play, Radio, Save, Square, Volume2 } from 'lucide-react';

type AudioSource = 'preset' | 'mp3' | 'youtube';
type PresetTone = 'cash' | 'chime' | 'bell';

interface MusicSettings {
  source: AudioSource;
  preset: PresetTone;
  url: string;
  durationSeconds: number;
  volume: number;
}

interface SaleNotification {
  id: string;
  confirmedAt: string;
  accountName: string;
  amount: number;
  currency: string;
  method: string;
}

const SETTINGS_KEY = 'fluxozap:sale-music:settings';
const PROCESSED_KEY = 'fluxozap:sale-music:processed-events';
const DEFAULT_SETTINGS: MusicSettings = { source: 'preset', preset: 'cash', url: '', durationSeconds: 30, volume: 80 };

function loadSettings(): MusicSettings {
  try {
    const value = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || 'null');
    return value ? { ...DEFAULT_SETTINGS, ...value } : DEFAULT_SETTINGS;
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

function money(amount: number, currency: string): string {
  try { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(amount); }
  catch { return `${currency} ${amount.toFixed(2)}`; }
}

export const MusicNotificationPage: React.FC = () => {
  const [settings, setSettings] = useState<MusicSettings>(loadSettings);
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState('Clique em “Ativar alertas” para começar.');
  const [lastSale, setLastSale] = useState<SaleNotification | null>(null);
  const [saved, setSaved] = useState(false);
  const [youtubeReady, setYoutubeReady] = useState(false);
  const cursorRef = useRef('');
  const pollingRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const stopTimerRef = useRef<number | null>(null);
  const youtubeFrameRef = useRef<HTMLIFrameElement | null>(null);
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
      oscillator.type = 'sine';
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
    if (!settings.url.trim()) throw new Error('Informe uma URL de áudio.');
    if (settings.source === 'youtube') {
      if (!youtubeId) throw new Error('Informe uma URL válida do YouTube.');
      if (!youtubeReady) throw new Error('O player do YouTube ainda está carregando. Tente novamente em instantes.');
      youtubeFrameRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'setVolume', args: [settings.volume] }), '*');
      youtubeFrameRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*');
    } else {
      const audio = new Audio(settings.url.trim());
      audio.volume = settings.volume / 100;
      audioRef.current = audio;
      await audio.play();
    }
    stopTimerRef.current = window.setTimeout(stopPlayback, settings.durationSeconds * 1000);
  };

  const saveSettings = () => {
    const normalized = {
      ...settings,
      durationSeconds: Math.min(300, Math.max(1, Number(settings.durationSeconds) || 30)),
      volume: Math.min(100, Math.max(0, Number(settings.volume) || 0)),
    };
    setSettings(normalized);
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalized));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  };

  const getProcessed = (): Set<string> => {
    try { return new Set(JSON.parse(window.localStorage.getItem(PROCESSED_KEY) || '[]')); }
    catch { return new Set(); }
  };

  const rememberProcessed = (ids: string[]) => {
    const values = Array.from(new Set([...getProcessed(), ...ids])).slice(-200);
    window.localStorage.setItem(PROCESSED_KEY, JSON.stringify(values));
  };

  const pollSales = async () => {
    if (!cursorRef.current) return;
    try {
      const response = await fetch(`/api/sale-notifications?after=${encodeURIComponent(cursorRef.current)}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Falha ao consultar vendas.');
      cursorRef.current = payload.cursor;
      const processed = getProcessed();
      const events: SaleNotification[] = (payload.events || []).filter((event: SaleNotification) => !processed.has(event.id));
      if (events.length === 0) return;
      rememberProcessed(events.map((event) => event.id));
      const latest = events.at(-1)!;
      setLastSale(latest);
      setStatus(`${events.length === 1 ? 'Nova venda confirmada' : `${events.length} novas vendas confirmadas`}!`);
      await playConfiguredSound();
    } catch (error: any) {
      setStatus(error.message || 'Não foi possível consultar novas vendas.');
    }
  };

  const enableAlerts = async () => {
    try {
      const response = await fetch('/api/sale-notifications', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Não foi possível iniciar o monitoramento.');
      cursorRef.current = payload.cursor;
      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current ||= new AudioContextCtor();
      await audioContextRef.current.resume();
      setEnabled(true);
      setStatus('Alertas ativos. Aguardando uma nova venda em qualquer linha.');
    } catch (error: any) {
      setStatus(error.message || 'Não foi possível ativar os alertas.');
    }
  };

  useEffect(() => {
    if (!enabled) return;
    pollingRef.current = window.setInterval(pollSales, 4000);
    return () => {
      if (pollingRef.current) window.clearInterval(pollingRef.current);
      pollingRef.current = null;
    };
  }, [enabled, settings]);

  useEffect(() => setYoutubeReady(false), [youtubeId]);

  useEffect(() => () => stopPlayback(), []);

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-10 text-slate-100">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-400">FluxoZap</p>
            <h1 className="mt-1 flex items-center gap-3 text-3xl font-bold"><Music2 className="h-8 w-8 text-emerald-400" />Alerta musical de vendas</h1>
            <p className="mt-2 text-sm text-slate-400">Esta página monitora vendas confirmadas de todas as linhas do WhatsApp.</p>
          </div>
          <a href="/" className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-900">
            Abrir painel <ExternalLink className="h-4 w-4" />
          </a>
        </header>

        <section className={`rounded-2xl border p-5 ${enabled ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-slate-800 bg-slate-900'}`}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className={`grid h-11 w-11 place-items-center rounded-xl ${enabled ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400'}`}><Radio className={`h-5 w-5 ${enabled ? 'animate-pulse' : ''}`} /></span>
              <div><p className="font-bold">{enabled ? 'Monitoramento ativo' : 'Monitoramento pausado'}</p><p className="text-sm text-slate-400">{status}</p></div>
            </div>
            <button type="button" onClick={enabled ? () => { setEnabled(false); stopPlayback(); setStatus('Alertas pausados.'); } : enableAlerts} className={`rounded-xl px-5 py-2.5 text-sm font-bold ${enabled ? 'bg-slate-800 text-slate-200' : 'bg-emerald-400 text-slate-950 hover:bg-emerald-300'}`}>
              {enabled ? 'Pausar alertas' : 'Ativar alertas'}
            </button>
          </div>
        </section>

        <section className="space-y-5 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div><h2 className="flex items-center gap-2 text-lg font-bold"><BellRing className="h-5 w-5 text-amber-400" />Configurar som</h2><p className="mt-1 text-sm text-slate-400">A configuração fica salva neste navegador.</p></div>
          <div className="grid gap-3 sm:grid-cols-3">
            {([['preset', 'Toque padrão'], ['mp3', 'Link MP3'], ['youtube', 'YouTube']] as const).map(([value, label]) => (
              <button key={value} type="button" onClick={() => setSettings((current) => ({ ...current, source: value }))} className={`rounded-xl border px-4 py-3 text-sm font-bold ${settings.source === value ? 'border-emerald-400 bg-emerald-400/10 text-emerald-300' : 'border-slate-700 bg-slate-950 text-slate-400'}`}>{label}</button>
            ))}
          </div>

          {settings.source === 'preset' ? (
            <label className="block text-sm font-semibold text-slate-300">Toque
              <select value={settings.preset} onChange={(event) => setSettings((current) => ({ ...current, preset: event.target.value as PresetTone }))} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none focus:border-emerald-400">
                <option value="cash">Caixa registradora</option><option value="chime">Sucesso suave</option><option value="bell">Sino de venda</option>
              </select>
            </label>
          ) : (
            <label className="block text-sm font-semibold text-slate-300">{settings.source === 'youtube' ? 'URL do YouTube' : 'URL pública do arquivo MP3'}
              <input type="url" value={settings.url} onChange={(event) => setSettings((current) => ({ ...current, url: event.target.value }))} placeholder={settings.source === 'youtube' ? 'https://www.youtube.com/watch?v=...' : 'https://exemplo.com/musica.mp3'} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none focus:border-emerald-400" />
              {settings.source === 'youtube' && settings.url && !youtubeId && <span className="mt-1 block text-xs text-rose-400">Link do YouTube inválido.</span>}
            </label>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold text-slate-300">Duração máxima
              <div className="mt-2 flex items-center gap-2"><input type="number" min={1} max={300} value={settings.durationSeconds} onChange={(event) => setSettings((current) => ({ ...current, durationSeconds: Number(event.target.value) }))} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none focus:border-emerald-400" /><span className="text-slate-500">segundos</span></div>
            </label>
            <label className="text-sm font-semibold text-slate-300">Volume: {settings.volume}%
              <div className="mt-2 flex h-[46px] items-center gap-3 rounded-xl border border-slate-700 bg-slate-950 px-4"><Volume2 className="h-4 w-4 text-slate-500" /><input type="range" min={0} max={100} value={settings.volume} onChange={(event) => setSettings((current) => ({ ...current, volume: Number(event.target.value) }))} className="w-full accent-emerald-400" /></div>
            </label>
          </div>

          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => playConfiguredSound().catch((error) => setStatus(error.message))} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm font-bold hover:border-emerald-500"><Play className="h-4 w-4" />Testar som</button>
            <button type="button" onClick={stopPlayback} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-bold text-slate-400 hover:bg-slate-800"><Square className="h-4 w-4" />Parar</button>
            <button type="button" onClick={saveSettings} className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-emerald-300">{saved ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}{saved ? 'Salvo' : 'Salvar configuração'}</button>
          </div>
        </section>

        {lastSale && <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5"><p className="text-xs font-bold uppercase tracking-wider text-emerald-400">Última venda anunciada</p><p className="mt-2 text-2xl font-bold">{money(lastSale.amount, lastSale.currency)}</p><p className="mt-1 text-sm text-slate-300">{lastSale.accountName} · {lastSale.method}</p></section>}

        {settings.source === 'youtube' && youtubeId && (
          <iframe
            ref={youtubeFrameRef}
            title="Player do alerta"
            src={`https://www.youtube.com/embed/${youtubeId}?enablejsapi=1&playsinline=1&origin=${encodeURIComponent(window.location.origin)}`}
            allow="autoplay"
            onLoad={() => setYoutubeReady(true)}
            className="pointer-events-none fixed h-px w-px opacity-0"
          />
        )}
      </div>
    </main>
  );
};
