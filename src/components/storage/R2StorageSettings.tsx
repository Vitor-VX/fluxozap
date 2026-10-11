import React, { useState, useEffect } from 'react';
import {
  Cloud,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Server,
  Key,
  HardDrive,
  Copy,
  Check,
  Zap,
} from 'lucide-react';
import { R2Config } from '../../types/flow';

export const R2StorageSettings: React.FC = () => {
  const [config, setConfig] = useState<R2Config & { isConfigured: boolean; maskedSecret: string }>({
    accountId: '',
    accessKeyId: '',
    secretAccessKey: '',
    bucketName: '',
    publicUrl: '',
    isConfigured: false,
    maskedSecret: '',
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [feedback, setFeedback] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/r2/config');
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
      }
    } catch (err) {
      console.error('Error fetching R2 config:', err);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setFeedback(null);

    try {
      const res = await fetch('/api/r2/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      setFeedback({
        success: data.success,
        message: data.message || 'Configurações salvas.',
      });
      if (data.config) {
        setConfig(data.config);
      }
    } catch (err: any) {
      setFeedback({
        success: false,
        message: err.message || 'Erro ao salvar configuração do R2.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setFeedback(null);

    try {
      const res = await fetch('/api/r2/test', { method: 'POST' });
      const data = await res.json();
      setFeedback({
        success: data.success,
        message: data.message,
      });
    } catch (err: any) {
      setFeedback({
        success: false,
        message: err.message || 'Erro ao testar conexão com Cloudflare R2.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-6 text-xs">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-600 text-white flex items-center justify-center shadow-xs">
                <Cloud className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-slate-900">
                    Cloudflare R2 Storage (Mídias e Arquivos)
                  </h2>
                  <span className="text-[11px] font-mono font-bold text-orange-800 bg-orange-100/80 px-2 py-0.5 rounded-md">
                    S3-Compatible
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Armazene áudios de voz, fotos, documentos e vídeos recebidos dos clientes ou enviados pelo atendente no Cloudflare R2 com tráfego gratuito (Zero Egress Fees).
                </p>
              </div>
            </div>

            <a
              href="https://dash.cloudflare.com/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-colors shrink-0"
            >
              <span>dash.cloudflare.com</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* Live Status Card */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Server className="w-4 h-4 text-orange-600" />
            Status do Storage Cloudflare R2
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-[10px] text-slate-400 block mb-0.5">Status do Cliente</span>
              <div className="flex items-center gap-1.5 font-bold">
                {config.isConfigured ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-emerald-700">Configurado e Ativo</span>
                  </>
                ) : (
                  <>
                    <span className="w-2 h-2 rounded-full bg-slate-400" />
                    <span className="text-slate-600">Usando Armazenamento Local</span>
                  </>
                )}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-[10px] text-slate-400 block mb-0.5">Bucket Configurado</span>
              <span className="font-semibold text-slate-800 font-mono truncate block">
                {config.bucketName || 'Nenhum'}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-[10px] text-slate-400 block mb-0.5">Domínio Público de Mídia</span>
              <span className="font-semibold text-slate-800 font-mono truncate block">
                {config.publicUrl || 'r2.cloudflarestorage.com'}
              </span>
            </div>
          </div>

          {feedback && (
            <div
              className={`p-3 rounded-xl border flex items-center gap-2.5 ${
                feedback.success
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              {feedback.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span className="font-medium">{feedback.message}</span>
            </div>
          )}
        </div>

        {/* Credentials Form */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Key className="w-4 h-4 text-blue-600" />
            Credenciais do Cloudflare R2
          </h3>
          <p className="text-xs text-slate-500">
            Obtidas em <strong>Cloudflare Dashboard &gt; R2 Object Storage &gt; Manage R2 API Tokens</strong>:
          </p>

          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Cloudflare Account ID
                </label>
                <input
                  type="text"
                  value={config.accountId}
                  onChange={(e) => setConfig({ ...config, accountId: e.target.value })}
                  placeholder="Ex: a1b2c3d4e5f6g7h8i9j0k1l2"
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-slate-900 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Encontrado na barra lateral da página inicial do Cloudflare Dashboard.
                </p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nome do Bucket R2
                </label>
                <input
                  type="text"
                  value={config.bucketName}
                  onChange={(e) => setConfig({ ...config, bucketName: e.target.value })}
                  placeholder="Ex: fluxozap-midias"
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-slate-900 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Nome exato do bucket criado no Cloudflare R2.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  R2 Access Key ID
                </label>
                <input
                  type="text"
                  value={config.accessKeyId}
                  onChange={(e) => setConfig({ ...config, accessKeyId: e.target.value })}
                  placeholder="Ex: 8a7b6c5d4e3f..."
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-slate-900 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-slate-700">R2 Secret Access Key</label>
                  {config.maskedSecret && (
                    <span className="text-[10px] text-emerald-600 font-mono">
                      ✓ Salvo ({config.maskedSecret})
                    </span>
                  )}
                </div>
                <input
                  type="password"
                  value={config.secretAccessKey}
                  onChange={(e) => setConfig({ ...config, secretAccessKey: e.target.value })}
                  placeholder={config.maskedSecret ? '•••••••••••••••• (deixe em branco para manter)' : 'Chave secreta do token R2'}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-slate-900 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                URL Pública de Acesso do Bucket (Public R2.dev ou Domínio Personalizado)
              </label>
              <input
                type="text"
                value={config.publicUrl}
                onChange={(e) => setConfig({ ...config, publicUrl: e.target.value })}
                placeholder="Ex: https://pub-123456789.r2.dev ou https://midia.meudominio.com"
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-slate-900 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Ative o subdomínio <strong>R2.dev</strong> nas configurações do seu bucket para que as fotos e áudios fiquem publicamente acessíveis ao WhatsApp da Meta.
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={isLoading}
                className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-lg text-xs cursor-pointer shadow-xs transition-colors flex items-center gap-2"
              >
                {isLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <HardDrive className="w-3.5 h-3.5" />}
                Salvar Configurações do R2
              </button>

              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTesting}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 font-semibold rounded-lg text-xs cursor-pointer transition-colors flex items-center gap-2"
              >
                {isTesting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 text-orange-600" />}
                Testar Acesso ao Bucket R2
              </button>
            </div>
          </form>
        </div>

        {/* Step by step guide */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-900">
              Como Criar e Obter as Chaves no Cloudflare R2
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <span className="font-bold text-slate-900 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-orange-600 text-white flex items-center justify-center text-[10px]">
                  1
                </span>
                Criar o Bucket
              </span>
              <p className="text-slate-600 text-[11px] leading-relaxed">
                No painel da Cloudflare, acesse <strong>R2 &gt; Create bucket</strong>. Escolha um nome em minúsculas (ex: <code>fluxozap-media</code>).
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <span className="font-bold text-slate-900 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-orange-600 text-white flex items-center justify-center text-[10px]">
                  2
                </span>
                Ativar Acesso Público
              </span>
              <p className="text-slate-600 text-[11px] leading-relaxed">
                Dentro do seu Bucket, vá na aba <strong>Settings &gt; Public Access</strong> e clique em <strong>Allow Access</strong> no subdomínio <code>r2.dev</code>.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <span className="font-bold text-slate-900 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-orange-600 text-white flex items-center justify-center text-[10px]">
                  3
                </span>
                Gerar Token de API R2
              </span>
              <p className="text-slate-600 text-[11px] leading-relaxed">
                Volte na aba principal do R2, clique em <strong>Manage R2 API Tokens &gt; Create API token</strong> com permissão <strong>Object Read &amp; Write</strong> e copie a chave.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
