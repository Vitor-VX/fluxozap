import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Copy, Key, Loader2, QrCode, RefreshCw, Send, Server, Smartphone, Terminal, Unplug } from 'lucide-react';
import { UazapiConfig } from '../../types/flow';

interface Props {
  onOpenLogs?: () => void;
  onConnectionUpdated?: () => void;
  activeAccountId?: string;
}

type Notice = { success: boolean; message: string } | null;

export const MetaApiSettings: React.FC<Props> = ({ onOpenLogs, onConnectionUpdated, activeAccountId }) => {
  const [config, setConfig] = useState<UazapiConfig>({ serverUrl: '', adminToken: '' });
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState('');
  const [status, setStatus] = useState<any>(null);
  const [qrCode, setQrCode] = useState('');
  const [testPhone, setTestPhone] = useState('');
  const webhookUrl = `${window.location.origin}/api/webhooks/uazapi`;

  const loadConfig = async () => {
    const response = await fetch('/api/uazapi/config');
    if (!response.ok) return;
    const data = await response.json();
    setConfig((current) => ({ ...current, ...data, adminToken: '' }));
  };

  const loadStatus = async (showError = true) => {
    if (!activeAccountId) return;
    try {
      const response = await fetch(`/api/accounts/${encodeURIComponent(activeAccountId)}/status`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível consultar a instância.');
      setStatus(data);
      setQrCode(data.instance?.qrcode || '');
      onConnectionUpdated?.();
    } catch (error: any) {
      if (showError) setNotice({ success: false, message: error.message });
    }
  };

  useEffect(() => { loadConfig().catch(() => undefined); }, []);
  useEffect(() => {
    setStatus(null); setQrCode(''); setNotice(null);
    loadStatus(false).catch(() => undefined);
  }, [activeAccountId]);
  useEffect(() => {
    if (!activeAccountId || status?.instance?.status !== 'connecting') return;
    const timer = window.setInterval(() => loadStatus(false), 4000);
    return () => window.clearInterval(timer);
  }, [activeAccountId, status?.instance?.status]);

  const request = async (key: string, url: string, init?: RequestInit) => {
    setBusy(key); setNotice(null);
    try {
      const response = await fetch(url, init);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'A operação não pôde ser concluída.');
      return data;
    } catch (error: any) {
      setNotice({ success: false, message: error.message });
      return null;
    } finally { setBusy(''); }
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const data = await request('save', '/api/uazapi/config', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serverUrl: config.serverUrl, adminToken: config.adminToken }),
    });
    if (data) { setNotice({ success: true, message: data.message }); await loadConfig(); }
  };

  const test = async () => {
    const data = await request('test', '/api/uazapi/test', { method: 'POST' });
    if (data) setNotice({ success: true, message: `${data.message}${typeof data.instances === 'number' ? ` ${data.instances} instância(s) encontrada(s).` : ''}` });
  };

  const connect = async () => {
    if (!activeAccountId) return;
    const data = await request('connect', `/api/accounts/${encodeURIComponent(activeAccountId)}/connect`, { method: 'POST' });
    if (!data) return;
    setQrCode(data.instance?.qrcode || data.qrcode || '');
    setNotice({ success: true, message: 'Conexão iniciada. Leia o QR Code em Aparelhos conectados no WhatsApp.' });
    await loadStatus(false);
  };

  const disconnect = async () => {
    if (!activeAccountId || !confirm('Desconectar esta instância? Um novo QR Code será necessário.')) return;
    const data = await request('disconnect', `/api/accounts/${encodeURIComponent(activeAccountId)}/disconnect`, { method: 'POST' });
    if (data) { setStatus({ instance: { status: 'disconnected' } }); setQrCode(''); setNotice({ success: true, message: 'Instância desconectada.' }); onConnectionUpdated?.(); }
  };

  const configureWebhook = async () => {
    if (!activeAccountId) return;
    const data = await request('webhook', `/api/accounts/${encodeURIComponent(activeAccountId)}/configure-webhook`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ publicOrigin: window.location.origin }),
    });
    if (data) setNotice({ success: true, message: data.message });
  };

  const sendTest = async () => {
    const data = await request('send', '/api/send-live', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId: activeAccountId, phoneNumber: testPhone }),
    });
    if (data) setNotice({ success: true, message: data.message || 'Fluxo enviado.' });
  };

  const currentStatus = status?.instance?.status || status?.account?.connectionStatus || 'desconhecido';
  const connected = currentStatus === 'connected' || status?.status?.connected === true;
  const Spinner = () => <Loader2 className="h-3.5 w-3.5 animate-spin" />;

  return <div className="h-full overflow-y-auto bg-slate-50 p-6"><div className="mx-auto max-w-4xl space-y-6">
    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs">
      <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-600 text-white"><Smartphone className="h-5 w-5" /></div><div><h2 className="text-lg font-bold text-slate-900">Integração WhatsApp pela UazAPI</h2><p className="mt-0.5 text-xs text-slate-500">Instâncias isoladas, conexão por QR Code e webhooks por linha.</p></div></div>
      {onOpenLogs && <button type="button" onClick={onOpenLogs} className="flex items-center gap-2 rounded-xl bg-slate-100 px-3.5 py-2 text-xs font-semibold text-slate-800"><Terminal className="h-4 w-4" /> Logs</button>}
    </div>

    {notice && <div className={`flex items-start gap-2 rounded-xl border p-3.5 text-xs ${notice.success ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-rose-200 bg-rose-50 text-rose-900'}`}>{notice.success ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}<strong>{notice.message}</strong></div>}

    <form onSubmit={save} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs">
      <div><h3 className="flex items-center gap-2 text-sm font-bold text-slate-900"><Server className="h-4 w-4 text-emerald-600" /> Servidor UazAPI</h3><p className="mt-1 text-xs text-slate-500">As credenciais ficam somente no backend.</p></div>
      <label className="block text-xs font-semibold text-slate-700">Server URL<input value={config.serverUrl} onChange={(e) => setConfig({ ...config, serverUrl: e.target.value })} placeholder="https://seu-subdominio.uazapi.com" className="mt-1 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 font-mono text-xs" /></label>
      <label className="block text-xs font-semibold text-slate-700">Admin Token<div className="mt-1 flex items-center gap-2"><Key className="h-4 w-4 text-slate-400" /><input type="password" value={config.adminToken} onChange={(e) => setConfig({ ...config, adminToken: e.target.value })} placeholder={config.hasAdminToken ? `${config.maskedAdminToken} — deixe vazio para manter` : 'Admin token'} className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 font-mono text-xs" /></div></label>
      <div className="flex gap-2"><button disabled={busy === 'save'} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white">{busy === 'save' && <Spinner />} Salvar</button><button type="button" onClick={test} disabled={busy === 'test' || !config.isConfigured} className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-xs font-semibold">{busy === 'test' ? <Spinner /> : <RefreshCw className="h-3.5 w-3.5" />} Testar servidor</button></div>
    </form>

    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs">
      <div className="flex items-center justify-between"><div><h3 className="flex items-center gap-2 text-sm font-bold"><QrCode className="h-4 w-4 text-emerald-600" /> Conexão da linha selecionada</h3><p className="mt-1 text-xs text-slate-500">Estado: <strong className={connected ? 'text-emerald-700' : 'text-amber-700'}>{currentStatus}</strong></p></div><button type="button" onClick={() => loadStatus()} className="rounded-lg border border-slate-300 p-2"><RefreshCw className="h-4 w-4" /></button></div>
      {qrCode && !connected && <div className="mx-auto max-w-sm rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center"><img src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`} alt="QR Code do WhatsApp" className="mx-auto aspect-square w-full rounded-xl bg-white object-contain p-2" /><p className="mt-3 text-xs font-semibold text-emerald-900">WhatsApp → Aparelhos conectados → Conectar aparelho</p></div>}
      <div className="flex gap-2"><button type="button" onClick={connect} disabled={!activeAccountId || connected || busy === 'connect'} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50">{busy === 'connect' ? <Spinner /> : <QrCode className="h-3.5 w-3.5" />} {currentStatus === 'disconnected' ? 'Reconectar e gerar QR Code' : 'Gerar novo QR Code'}</button><button type="button" onClick={disconnect} disabled={!connected || busy === 'disconnect'} className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-700 disabled:opacity-50">{busy === 'disconnect' ? <Spinner /> : <Unplug className="h-3.5 w-3.5" />} Desconectar</button></div>
    </div>

    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6"><h3 className="text-sm font-bold">Webhook da UazAPI</h3><div className="flex gap-2"><input readOnly value={webhookUrl} className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-xs" /><button type="button" onClick={() => navigator.clipboard.writeText(webhookUrl)} className="rounded-lg border border-slate-300 px-3"><Copy className="h-4 w-4" /></button></div><button type="button" onClick={configureWebhook} disabled={!activeAccountId || busy === 'webhook'} className="rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50">Configurar automaticamente</button><p className="text-[11px] text-slate-500">A URL precisa ser pública e HTTPS.</p></div>

    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6"><h3 className="flex items-center gap-2 text-sm font-bold"><Send className="h-4 w-4 text-emerald-600" /> Testar fluxo ativo</h3><div className="flex gap-2"><input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="5511999999999" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3.5 py-2.5 font-mono text-xs" /><button type="button" onClick={sendTest} disabled={!activeAccountId || !testPhone.trim() || busy === 'send'} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50">{busy === 'send' && <Spinner />} Enviar</button></div></div>
  </div></div>;
};
