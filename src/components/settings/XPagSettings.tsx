import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  BadgeDollarSign,
  CheckCircle2,
  Copy,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';

interface XPagConfigView {
  clientId: string;
  clientSecret: string;
  hasClientSecret: boolean;
  maskedClientSecret: string;
  enabled: boolean;
  environment: 'sandbox' | 'production';
  webhookUrl: string;
  isPublicWebhook: boolean;
}

export const XPagSettings: React.FC = () => {
  const [config, setConfig] = useState<XPagConfigView>({
    clientId: '',
    clientSecret: '',
    hasClientSecret: false,
    maskedClientSecret: '',
    enabled: false,
    environment: 'production',
    webhookUrl: '',
    isPublicWebhook: false,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const loadConfig = async () => {
    const response = await fetch('/api/xpag/config');
    if (!response.ok) return;
    const data = await response.json();
    setConfig((current) => ({
      ...current,
      clientId: data.clientId || '',
      clientSecret: '',
      hasClientSecret: Boolean(data.hasClientSecret),
      maskedClientSecret: data.maskedClientSecret || '',
      enabled: Boolean(data.enabled),
      environment: data.environment === 'sandbox' ? 'sandbox' : 'production',
      webhookUrl: data.webhookUrl || '',
      isPublicWebhook: Boolean(data.isPublicWebhook),
    }));
  };

  useEffect(() => {
    loadConfig().catch(console.error);
  }, []);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setResult(null);
    try {
      const response = await fetch('/api/xpag/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: config.clientId,
          clientSecret: config.clientSecret,
          enabled: config.enabled,
          environment: config.environment,
        }),
      });
      const data = await response.json();
      setResult({ success: response.ok, message: data.message || data.error });
      if (response.ok) await loadConfig();
    } catch (error: any) {
      setResult({ success: false, message: error.message });
    } finally {
      setIsSaving(false);
    }
  };

  const testConnection = async () => {
    setIsTesting(true);
    setResult(null);
    try {
      const response = await fetch('/api/xpag/test', { method: 'POST' });
      const data = await response.json();
      setResult({ success: response.ok, message: data.message || `${data.error}${data.errorCode ? ` (${data.errorCode})` : ''}` });
    } catch (error: any) {
      setResult({ success: false, message: error.message });
    } finally {
      setIsTesting(false);
    }
  };

  const copyWebhook = async () => {
    if (!config.webhookUrl) return;
    await navigator.clipboard.writeText(config.webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-600 text-white flex items-center justify-center shadow-xs">
            <BadgeDollarSign className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Pagamentos Brasil e México · XPag Global</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Gere PIX em BRL, cobranças SPEI e vouchers OXXO em MXN diretamente nos blocos do funil.
            </p>
          </div>
        </div>

        <form onSubmit={save} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-5 text-xs">
          <div>
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-violet-600" /> Credenciais da API
            </h3>
            <p className="text-slate-500 mt-1">Gere o Client ID e o Client Secret no painel XPag em Integrações → API.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Client ID</label>
              <input
                value={config.clientId}
                onChange={(event) => setConfig({ ...config, clientId: event.target.value })}
                placeholder="xpag_..."
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Client Secret</label>
              <input
                type="password"
                value={config.clientSecret}
                onChange={(event) => setConfig({ ...config, clientSecret: event.target.value })}
                placeholder={config.hasClientSecret ? `Salvo (${config.maskedClientSecret}) — deixe vazio para manter` : 'Client Secret'}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Ambiente da credencial</label>
              <select
                value={config.environment}
                onChange={(event) => setConfig({ ...config, environment: event.target.value as 'sandbox' | 'production' })}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg bg-white"
              >
                <option value="sandbox">Sandbox (sem dinheiro real)</option>
                <option value="production">Produção</option>
              </select>
            </div>
            <label className="flex items-center gap-3 p-3.5 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(event) => setConfig({ ...config, enabled: event.target.checked })}
                className="w-4 h-4 accent-violet-600"
              />
              <span>
                <strong className="block text-slate-800">Integração ativa</strong>
                <span className="text-[11px] text-slate-500">Permite criar cobranças nos funis publicados.</span>
              </span>
            </label>
          </div>

          {result && (
            <div className={`p-3.5 rounded-xl border flex items-start gap-2 ${result.success ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'}`}>
              {result.success ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
              <span className="font-semibold">{result.message}</span>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button disabled={isSaving} className="px-5 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white font-semibold flex items-center gap-2 cursor-pointer">
              {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Salvar XPag
            </button>
            <button type="button" onClick={testConnection} disabled={isTesting} className="px-4 py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 font-semibold flex items-center gap-2 cursor-pointer">
              {isTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Testar credenciais
            </button>
          </div>
        </form>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-3 text-xs">
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" /> Webhook seguro e reconciliação
          </h3>
          <p className="text-slate-600 leading-relaxed">
            Cada cobrança recebe uma chave de webhook exclusiva, vinculada ao telefone e à sessão da pessoa. A URL abaixo mostra o formato gerado; quando a XPag notifica o pagamento, o servidor localiza a pessoa por essa chave e consulta a transação novamente com autenticação antes de continuar o funil.
          </p>
          <div className="flex gap-2">
            <input readOnly value={config.webhookUrl} className="flex-1 px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 font-mono text-[11px]" />
            <button type="button" onClick={copyWebhook} className="px-3 py-2 rounded-lg border border-slate-300 bg-slate-100 hover:bg-slate-200 flex items-center gap-1.5 cursor-pointer">
              <Copy className="w-3.5 h-3.5" /> {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
          {!config.isPublicWebhook && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900">
              Acesse o FluxoZap pela URL HTTPS pública (por exemplo, seu domínio ou túnel) antes de publicar o funil. A XPag não consegue chamar localhost.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
