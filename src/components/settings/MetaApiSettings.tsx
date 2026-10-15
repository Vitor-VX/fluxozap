import React, { useState, useEffect, useRef } from 'react';
import {
  Key,
  Smartphone,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Copy,
  ExternalLink,
  Send,
  Loader2,
  RefreshCw,
  Terminal,
  ShieldAlert,
  Database,
} from 'lucide-react';
import { MetaConfig } from '../../types/flow';

interface MetaApiSettingsProps {
  onOpenLogs?: () => void;
  onConnectionUpdated?: () => void;
  activeAccountId?: string;
}

export const MetaApiSettings: React.FC<MetaApiSettingsProps> = ({ onOpenLogs, onConnectionUpdated, activeAccountId }) => {
  const [config, setConfig] = useState<MetaConfig>({
    phoneNumberId: '',
    accessToken: '',
    wabaId: '',
    verifyToken: 'fluxozap_webhook_secret_2026',
    testPhoneNumber: '',
  });

  const [maskedToken, setMaskedToken] = useState('');
  const [hasAccessToken, setHasAccessToken] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSendingLive, setIsSendingLive] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    details?: any;
    diagnosticTip?: string;
  } | null>(null);
  const [sendLiveResult, setSendLiveResult] = useState<{
    success: boolean;
    message: string;
    diagnosticTip?: string;
    metaResponse?: any;
  } | null>(null);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [activeAccountName, setActiveAccountName] = useState('');
  const [datasetName, setDatasetName] = useState('FluxoZap CTWA');
  const [ctwaDataset, setCtwaDataset] = useState<{ id: string; name?: string } | null>(null);
  const [datasetLoading, setDatasetLoading] = useState(false);
  const [datasetResult, setDatasetResult] = useState<{ success: boolean; message: string } | null>(null);
  const activeAccountRef = useRef(activeAccountId);

  const webhookUrl = `${window.location.origin}/api/webhook`;

  const fetchConfig = async () => {
    try {
      if (!activeAccountId) return;
      const res = await fetch(`/api/config?accountId=${encodeURIComponent(activeAccountId)}`);
      if (res.ok) {
        const data = await res.json();
        if (activeAccountRef.current !== activeAccountId) return;
        setConfig({
          phoneNumberId: data.phoneNumberId || '',
          displayPhoneNumber: data.displayPhoneNumber || '',
          accessToken: '',
          wabaId: data.wabaId || '',
          verifyToken: data.verifyToken || 'fluxozap_webhook_secret_2026',
          testPhoneNumber: data.testPhoneNumber || '',
        });
        setActiveAccountName(data.accountName || '');
        setMaskedToken(data.maskedToken || '');
        setHasAccessToken(data.hasAccessToken);
      }
    } catch (err) {
      console.error('Error fetching config:', err);
    }
  };

  const fetchCtwaDataset = async (silent = false) => {
    if (!activeAccountId) return;
    if (!silent) setDatasetLoading(true);
    setDatasetResult(null);
    try {
      const res = await fetch(`/api/config/ctwa-dataset?accountId=${encodeURIComponent(activeAccountId)}`);
      const data = await res.json();
      if (activeAccountRef.current !== activeAccountId) return;
      if (!res.ok) throw new Error(data.error || 'Não foi possível consultar o Dataset CTWA.');
      setCtwaDataset(data.dataset || null);
      if (!silent) setDatasetResult({ success: true, message: data.dataset ? 'Dataset CTWA localizado nesta WABA.' : 'Esta WABA ainda não possui um Dataset CTWA.' });
    } catch (err: any) {
      setCtwaDataset(null);
      if (!silent) setDatasetResult({ success: false, message: err.message });
    } finally {
      if (!silent) setDatasetLoading(false);
    }
  };

  const createCtwaDataset = async () => {
    if (!activeAccountId || !window.confirm(`Criar o Dataset CTWA “${datasetName || 'FluxoZap CTWA'}” para esta WABA?`)) return;
    setDatasetLoading(true);
    setDatasetResult(null);
    try {
      const res = await fetch('/api/config/ctwa-dataset', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: activeAccountId, datasetName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Não foi possível criar o Dataset CTWA.');
      setCtwaDataset(data.dataset || null);
      setDatasetResult({ success: true, message: data.message || 'Dataset CTWA criado com sucesso.' });
    } catch (err: any) {
      setDatasetResult({ success: false, message: err.message });
    } finally {
      setDatasetLoading(false);
    }
  };

  useEffect(() => {
    activeAccountRef.current = activeAccountId;
    setTestResult(null);
    setSendLiveResult(null);
    setMaskedToken('');
    setHasAccessToken(false);
    setActiveAccountName('');
    setCtwaDataset(null);
    setDatasetResult(null);
    fetchConfig();
    fetchCtwaDataset(true);
  }, [activeAccountId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...config, accountId: activeAccountId }),
      });
      const data = await res.json();
      if (res.ok) {
        setTestResult({
          success: true,
          message: 'Configurações da Meta WhatsApp API salvas com sucesso!',
        });
        await fetchConfig();
        onConnectionUpdated?.();
      } else {
        setTestResult({
          success: false,
          message: data.error || 'Erro ao salvar credenciais.',
        });
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/config/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumberId: config.phoneNumberId,
          accessToken: config.accessToken,
          accountId: activeAccountId,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setTestResult({
          success: true,
          message: data.message,
          details: data.data,
        });
        await fetchConfig();
        onConnectionUpdated?.();
      } else {
        setTestResult({
          success: false,
          message: data.error || 'Falha ao validar credenciais da Meta.',
          diagnosticTip: data.diagnosticTip,
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Erro de conexão.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSendLiveTest = async () => {
    if (!config.testPhoneNumber.trim()) {
      setSendLiveResult({
        success: false,
        message: 'Preencha o número de telefone de teste com DDD (ex: 5511999999999).',
        diagnosticTip: 'O número precisa do código do país (55 para Brasil), DDD e os 9 dígitos (ex: 5511999999999).',
      });
      return;
    }

    setIsSendingLive(true);
    setSendLiveResult(null);

    try {
      const res = await fetch('/api/send-live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: config.testPhoneNumber, accountId: activeAccountId }),
      });
      const data = await res.json();
      if (res.ok) {
        setSendLiveResult({
          success: true,
          message: `Fluxo enviado para ${config.testPhoneNumber}! Verifique o seu WhatsApp.`,
        });
      } else {
        setSendLiveResult({
          success: false,
          message: data.error || 'Falha ao enviar mensagem pelo WhatsApp Oficial.',
          diagnosticTip: data.diagnosticTip,
          metaResponse: data.metaResponse,
        });
      }
    } catch (err: any) {
      setSendLiveResult({
        success: false,
        message: err.message || 'Erro ao comunicar com o servidor.',
      });
    } finally {
      setIsSendingLive(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 2000);
  };

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Page Header */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Integração WhatsApp Cloud API (Oficial da Meta)
              </h2>
              <p className="text-xs text-emerald-700 font-semibold mt-0.5">
                Configurando: {activeAccountName || 'linha selecionada'}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure as credenciais da Meta Developers para envio automático de mensagens e recebimento de respostas no WhatsApp Oficial.
              </p>
            </div>
          </div>

          {onOpenLogs && (
            <button
              type="button"
              onClick={onOpenLogs}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold cursor-pointer transition-colors shrink-0"
            >
              <Terminal className="w-4 h-4 text-slate-700" />
              <span>Ver Logs da API</span>
            </button>
          )}
        </div>

        {/* Credentials Form */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs">
          <h3 className="text-sm font-bold text-slate-900 mb-1 flex items-center gap-2">
            <Key className="w-4 h-4 text-emerald-600" />
            Chaves de API da Meta
          </h3>
          <p className="text-xs text-slate-500 mb-5">
            Obtidas em <strong>Meta for Developers</strong> &gt; Seu Aplicativo &gt; WhatsApp &gt; Configuração da API.
          </p>

          <div className={`mb-5 p-3.5 rounded-xl border ${
            config.displayPhoneNumber
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-amber-50 border-amber-200 text-amber-900'
          }`}>
            <p className="text-xs font-bold">
              {config.displayPhoneNumber
                ? `Número conectado pela Meta: ${config.displayPhoneNumber}`
                : 'Nenhum número validado e conectado'}
            </p>
            <p className="text-[11px] mt-1 leading-relaxed opacity-80">
              {config.displayPhoneNumber
                ? 'Esta linha usa exatamente o display_phone_number retornado pela API da Meta para o Phone Number ID abaixo.'
                : 'Salve as credenciais desta linha e use “Testar Conexão”. O número real aparecerá depois que a Meta validar este Phone Number ID.'}
            </p>
          </div>

          <form onSubmit={handleSave} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Phone Number ID (ID do Número de Telefone)
                </label>
                <input
                  type="text"
                  value={config.phoneNumberId}
                  onChange={(e) => setConfig({ ...config, phoneNumberId: e.target.value })}
                  placeholder="Ex: 104234567890123"
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-mono text-xs"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  ID numérico fornecido no painel da Meta para o seu número do WhatsApp.
                </p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  WhatsApp Business Account ID (WABA ID)
                </label>
                <input
                  type="text"
                  value={config.wabaId}
                  onChange={(e) => setConfig({ ...config, wabaId: e.target.value })}
                  placeholder="Ex: 109876543210987"
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-mono text-xs"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  ID da conta comercial do WhatsApp associada ao aplicativo.
                </p>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-semibold text-slate-700">
                  Meta Access Token (Token de Acesso do Sistema)
                </label>
                {hasAccessToken && (
                  <span className="text-[11px] text-emerald-600 font-medium">
                    ✓ Token salvo ({maskedToken})
                  </span>
                )}
              </div>
              <input
                type="password"
                value={config.accessToken}
                onChange={(e) => setConfig({ ...config, accessToken: e.target.value })}
                placeholder={hasAccessToken ? '•••••••••••••••••••••••• (deixe em branco para manter o atual)' : 'EAABw...'}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-mono text-xs"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Gere um token permanente em Usuários do Sistema com <code>whatsapp_business_messaging</code>, <code>whatsapp_business_management</code> e <code>whatsapp_business_manage_events</code>.
              </p>
            </div>

            {testResult && (
              <div
                className={`p-3.5 rounded-xl border flex flex-col gap-2 ${
                  testResult.success
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-rose-50 border-rose-200 text-rose-900'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  {testResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <p className="font-semibold">{testResult.message}</p>
                    {testResult.details && (
                      <div className="mt-2 text-[11px] space-y-0.5 opacity-90 font-mono">
                        <p>Nome verificado: {testResult.details.verifiedName || 'N/A'}</p>
                        <p>Número exibido: {testResult.details.displayPhoneNumber || 'N/A'}</p>
                        <p>Qualidade: {testResult.details.qualityRating || 'GREEN'}</p>
                      </div>
                    )}
                  </div>
                </div>

                {!testResult.success && testResult.diagnosticTip && (
                  <div className="mt-1 p-3 bg-amber-50 rounded-lg border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                    <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-bold text-[11px] uppercase tracking-wider text-amber-800 mb-0.5">
                        Diagnóstico da Meta:
                      </p>
                      <p className="leading-relaxed whitespace-pre-line">{testResult.diagnosticTip}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer shadow-xs transition-colors flex items-center gap-2"
              >
                {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                Salvar Credenciais
              </button>

              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTesting}
                className="px-4 py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold cursor-pointer border border-slate-300 transition-colors flex items-center gap-2"
              >
                {isTesting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                Testar Conexão com a Meta API
              </button>
            </div>
          </form>
        </div>

        {/* Live Test WhatsApp Message */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center gap-2">
            <Send className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-900">
              Disparar Teste para WhatsApp Real
            </h3>
          </div>
          <p className="text-xs text-slate-600">
            Envie o fluxo ativo agora mesmo diretamente para o seu celular pelo WhatsApp Oficial para validar a experiência na prática.
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={config.testPhoneNumber}
              onChange={(e) => setConfig({ ...config, testPhoneNumber: e.target.value })}
              placeholder="Ex: 5511999999999 (Código do país + DDD + Número)"
              className="flex-1 px-3.5 py-2.5 border border-slate-300 rounded-lg text-slate-900 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
            <button
              type="button"
              onClick={handleSendLiveTest}
              disabled={isSendingLive}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg text-xs cursor-pointer shadow-xs transition-colors flex items-center justify-center gap-2 shrink-0"
            >
              {isSendingLive ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Disparar no Meu WhatsApp
            </button>
          </div>

          {sendLiveResult && (
            <div
              className={`p-3.5 rounded-xl border text-xs space-y-2.5 ${
                sendLiveResult.success
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              <div className="flex items-start gap-2.5">
                {sendLiveResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <span className="font-semibold block">{sendLiveResult.message}</span>
                </div>
              </div>

              {!sendLiveResult.success && sendLiveResult.diagnosticTip && (
                <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-bold text-[11px] uppercase tracking-wider text-amber-800 mb-0.5">
                      Diagnóstico do Erro do WhatsApp:
                    </p>
                    <p className="leading-relaxed whitespace-pre-line font-medium">
                      {sendLiveResult.diagnosticTip}
                    </p>
                  </div>
                </div>
              )}

              {onOpenLogs && !sendLiveResult.success && (
                <div className="pt-1 flex justify-end">
                  <button
                    type="button"
                    onClick={onOpenLogs}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-800 hover:text-rose-950 underline cursor-pointer"
                  >
                    <Terminal className="w-3.5 h-3.5" />
                    <span>Ver Resposta Bruta da Meta nos Logs</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Webhook Configuration for Incoming WhatsApp Messages */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900">
              Configuração de Webhook (Receber Mensagens do WhatsApp)
            </h3>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Para que o FluxoZap receba as respostas dos usuários e execute os blocos de{' '}
            <strong>Aguardar Resposta</strong> automaticamente, configure o Webhook no painel da Meta Developers:
          </p>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                URL de Retorno de Chamada (Callback URL)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={webhookUrl}
                  className="flex-1 px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 font-mono text-xs select-all"
                />
                <button
                  type="button"
                  onClick={() => copyToClipboard(webhookUrl)}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg font-medium text-slate-700 flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copiedWebhook ? 'Copiado!' : 'Copiar'}</span>
                </button>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Token de Verificação (Verify Token)
              </label>
              <input
                type="text"
                value={config.verifyToken}
                onChange={(e) => setConfig({ ...config, verifyToken: e.target.value })}
                className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-slate-900 font-mono text-xs"
              />
            </div>

            <div className="p-3 bg-blue-50 rounded-xl border border-blue-100 text-[11px] text-blue-900 space-y-1">
              <p className="font-semibold">Passo a passo no portal da Meta Developers:</p>
              <ol className="list-decimal pl-4 space-y-1 text-blue-800">
                <li>Acesse <strong>WhatsApp &gt; Configuração &gt; Editar Webhook</strong>.</li>
                <li>Cole a <strong>URL de Retorno</strong> e o <strong>Token de Verificação</strong> acima e clique em Verificar e Salvar.</li>
                <li>Em Campos do Webhook, clique em Gerenciar e assine o campo <code>messages</code>.</li>
              </ol>
            </div>
          </div>
        </div>

        {/* CTWA Dataset associated with the selected WhatsApp Business Account */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-violet-600" />
            <h3 className="text-sm font-bold text-slate-900">Dataset de Conversões do WhatsApp (CTWA)</h3>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Consulte ou crie o Dataset ligado diretamente à WABA desta linha. Ele é separado do Pixel configurado em <strong>Meta Conversões</strong> e será priorizado nos eventos de compra que tiverem <code>ctwa_clid</code>.
          </p>

          <div className="grid gap-3 md:grid-cols-2 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">WABA selecionada</label>
              <input readOnly value={config.wabaId || 'Salve o WABA ID acima'} className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg bg-slate-50 text-slate-800 font-mono" />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Dataset atual</label>
              <input readOnly value={ctwaDataset?.id || 'Nenhum Dataset localizado'} className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg bg-slate-50 text-slate-800 font-mono" />
            </div>
          </div>

          {!ctwaDataset && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nome do novo Dataset</label>
              <input value={datasetName} onChange={(event) => setDatasetName(event.target.value)} maxLength={100} className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-slate-900 text-xs" />
            </div>
          )}

          {datasetResult && (
            <div className={`rounded-xl border p-3 text-xs ${datasetResult.success ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-rose-200 bg-rose-50 text-rose-900'}`}>
              {datasetResult.message}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => fetchCtwaDataset(false)} disabled={datasetLoading} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
              {datasetLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Consultar Dataset
            </button>
            {!ctwaDataset && (
              <button type="button" onClick={createCtwaDataset} disabled={datasetLoading || !config.wabaId} className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-60">
                <Database className="w-3.5 h-3.5" /> Criar Dataset CTWA
              </button>
            )}
          </div>
          <p className="text-[11px] text-slate-500">A criação usa o token oficial desta linha e exige acesso à WABA com permissões de gerenciamento do WhatsApp e eventos.</p>
        </div>
      </div>
    </div>
  );
};
