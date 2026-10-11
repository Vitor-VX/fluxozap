import React, { useState, useEffect } from 'react';
import {
  Database,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Server,
  Layers,
  ArrowRight,
  HardDrive,
  Copy,
  Check,
  Zap,
} from 'lucide-react';
import { MongoStatus } from '../../types/flow';

export const MongoDbSettings: React.FC = () => {
  const [status, setStatus] = useState<MongoStatus>({
    status: 'disconnected',
    uriConfigured: false,
    maskedUri: '',
    modelName: 'WhatsApp',
  });
  const [inputUri, setInputUri] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/mongodb/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (err) {
      console.error('Error fetching MongoDB status:', err);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleConnect = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputUri.trim() && !status.uriConfigured) {
      setActionFeedback({
        success: false,
        message: 'Por favor, informe a Connection String do MongoDB Atlas.',
      });
      return;
    }

    setIsLoading(true);
    setActionFeedback(null);

    try {
      const res = await fetch('/api/mongodb/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uri: inputUri || undefined }),
      });
      const data = await res.json();
      if (data.status) {
        setStatus(data.status);
      }
      setActionFeedback({
        success: data.success,
        message: data.message,
      });
      if (data.success) {
        setInputUri('');
      }
    } catch (err: any) {
      setActionFeedback({
        success: false,
        message: err.message || 'Erro ao conectar ao MongoDB Atlas.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setIsLoading(true);
    setActionFeedback(null);
    try {
      const res = await fetch('/api/mongodb/disconnect', { method: 'POST' });
      const data = await res.json();
      if (data.status) setStatus(data.status);
      setActionFeedback({
        success: data.success,
        message: data.message,
      });
    } catch (err: any) {
      setActionFeedback({
        success: false,
        message: err.message || 'Erro ao desconectar.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleForceSync = async () => {
    setIsLoading(true);
    setActionFeedback(null);
    try {
      const res = await fetch('/api/mongodb/sync', { method: 'POST' });
      const data = await res.json();
      if (data.status) setStatus(data.status);
      setActionFeedback({
        success: data.success,
        message: data.message || (data.success ? 'Sincronizado com sucesso!' : data.error),
      });
    } catch (err: any) {
      setActionFeedback({
        success: false,
        message: err.message || 'Erro ao sincronizar.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const isConnected = status.status === 'connected';

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-6 text-xs">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-slate-900">
                    MongoDB Atlas (Cloud Database)
                  </h2>
                  <span className="text-[11px] font-mono font-bold text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded-md">
                    Model: WhatsApp
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Persistência em nuvem de todos os fluxos, sessões/leads de clientes, credenciais e logs da API no cluster do MongoDB Atlas.
                </p>
              </div>
            </div>

            <a
              href="https://account.mongodb.com/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-colors shrink-0"
            >
              <span>account.mongodb.com</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* Live Status Card */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Server className="w-4 h-4 text-emerald-600" />
              Status da Conexão
            </h3>
            <button
              type="button"
              onClick={fetchStatus}
              className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Verificar</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-[10px] text-slate-400 block mb-0.5">Estado do Cluster</span>
              <div className="flex items-center gap-1.5 font-bold">
                {isConnected ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-emerald-700">Conectado</span>
                  </>
                ) : status.status === 'connecting' ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
                    <span className="text-blue-700">Conectando...</span>
                  </>
                ) : status.status === 'error' ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                    <span className="text-rose-700">Erro</span>
                  </>
                ) : (
                  <>
                    <span className="w-2 h-2 rounded-full bg-slate-400" />
                    <span className="text-slate-600">Desconectado</span>
                  </>
                )}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-[10px] text-slate-400 block mb-0.5">Banco de Dados</span>
              <span className="font-semibold text-slate-800 font-mono truncate block">
                {status.databaseName || (isConnected ? 'fluxozap' : 'Nenhum')}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-[10px] text-slate-400 block mb-0.5">Model Específico</span>
              <span className="font-bold text-slate-900 font-mono">
                {status.modelName || 'WhatsApp'}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-[10px] text-slate-400 block mb-0.5">Latência / Ping</span>
              <span className="font-semibold text-slate-800 font-mono">
                {status.pingMs !== undefined ? `${status.pingMs}ms` : '—'}
              </span>
            </div>
          </div>

          {status.maskedUri && (
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between text-[11px]">
              <span className="text-slate-500">URI Conectada:</span>
              <span className="font-mono text-slate-700 truncate max-w-md">{status.maskedUri}</span>
            </div>
          )}

          {status.error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-semibold block">Erro na Conexão:</span>
                <span className="text-[11px] leading-relaxed">{status.error}</span>
              </div>
            </div>
          )}

          {actionFeedback && (
            <div
              className={`p-3 rounded-xl border flex items-center gap-2.5 ${
                actionFeedback.success
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              {actionFeedback.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span className="font-medium">{actionFeedback.message}</span>
            </div>
          )}
        </div>

        {/* Connection Form */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-blue-600" />
            Configurar Conexão (Connection String)
          </h3>
          <p className="text-xs text-slate-500">
            Copie a Connection String gerada no MongoDB Atlas e cole abaixo para ativar a sincronização em nuvem:
          </p>

          <form onSubmit={handleConnect} className="space-y-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                MongoDB Connection String (URI SRV)
              </label>
              <input
                type="text"
                value={inputUri}
                onChange={(e) => setInputUri(e.target.value)}
                placeholder="mongodb+srv://<usuario>:<senha>@cluster0.abcde.mongodb.net/fluxozap?retryWrites=true&w=majority"
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-slate-900 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Substitua <code>&lt;senha&gt;</code> pela senha real do usuário do banco de dados configurado no MongoDB Atlas.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={isLoading}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg text-xs cursor-pointer shadow-xs transition-colors flex items-center gap-2"
              >
                {isLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                {isConnected ? 'Atualizar Conexão' : 'Conectar ao MongoDB Atlas'}
              </button>

              {isConnected && (
                <>
                  <button
                    type="button"
                    onClick={handleForceSync}
                    disabled={isLoading}
                    className="px-4 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-semibold rounded-lg text-xs cursor-pointer transition-colors flex items-center gap-2"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                    Sincronizar Dados no Model WhatsApp
                  </button>

                  <button
                    type="button"
                    onClick={handleDisconnect}
                    disabled={isLoading}
                    className="px-4 py-2.5 bg-slate-100 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 text-slate-700 border border-slate-200 font-semibold rounded-lg text-xs cursor-pointer transition-colors"
                  >
                    Desconectar
                  </button>
                </>
              )}
            </div>
          </form>
        </div>

        {/* How to configure on MongoDB Atlas step-by-step */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-900">
              Passo a Passo no MongoDB Atlas (account.mongodb.com)
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
              <span className="font-bold text-slate-900 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">
                  1
                </span>
                Acesso de Rede (Network Access)
              </span>
              <p className="text-slate-600 text-[11px] leading-relaxed">
                No menu lateral do MongoDB Atlas, acesse <strong>Security &gt; Network Access</strong>. Clique em <strong>Add IP Address</strong> e selecione <strong>Allow Access from Anywhere (0.0.0.0/0)</strong> para permitir que o servidor conecte.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
              <span className="font-bold text-slate-900 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">
                  2
                </span>
                Usuário do Banco (Database Access)
              </span>
              <p className="text-slate-600 text-[11px] leading-relaxed">
                Acesse <strong>Security &gt; Database Access</strong> e crie um usuário (ex: <code>admin</code>) com senha segura e permissão de <strong>Read and write to any database</strong>.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
              <span className="font-bold text-slate-900 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">
                  3
                </span>
                Obter a Connection String
              </span>
              <p className="text-slate-600 text-[11px] leading-relaxed">
                Em <strong>Deployments &gt; Database</strong>, clique no botão <strong>Connect</strong> do seu Cluster &gt; selecione <strong>Drivers (Node.js)</strong> &gt; copie a URI gerada.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
              <span className="font-bold text-slate-900 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">
                  4
                </span>
                Model Mongoose WhatsApp
              </span>
              <p className="text-slate-600 text-[11px] leading-relaxed">
                O FluxoZap salva todos os documentos automaticamente dentro do model <strong className="font-mono text-emerald-800">WhatsApp</strong> (collection: <code>whatsapps</code>), contendo o fluxo, os clientes e as logs!
              </p>
            </div>
          </div>
        </div>

        {/* Structure overview */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-teal-600" />
            <h3 className="text-sm font-bold text-slate-900">
              Estrutura dos Documentos no Model "WhatsApp"
            </h3>
          </div>
          <p className="text-slate-600 text-xs">
            Cada instância no MongoDB Atlas possui a seguinte estrutura sob o model <strong>WhatsApp</strong>:
          </p>

          <pre className="p-4 rounded-xl bg-slate-900 text-slate-100 font-mono text-[11px] leading-relaxed overflow-x-auto">
{`// Mongoose Model: WhatsApp (collection: whatsapps)
{
  "_id": ObjectId("..."),
  "identifier": "default",
  "name": "Instância Principal WhatsApp",
  
  // Credenciais da API da Meta
  "config": {
    "phoneNumberId": "...",
    "accessToken": "...",
    "verifyToken": "..."
  },
  
  // Fluxo de mensagens React Flow
  "flow": {
    "nodes": [ /* nós de texto, imagem, documento, aguardar resposta */ ],
    "edges": [ /* conexões entre os blocos */ ]
  },
  
  // Clientes e conversas que chegaram pelo WhatsApp
  "sessions": [
    {
      "phoneNumber": "5511999999999",
      "variables": { "nome": "João", "interesse": "Sim" },
      "history": [ /* mensagens trocadas */ ]
    }
  ],
  
  // Logs e diagnósticos da Meta WhatsApp API
  "logs": [
    {
      "endpoint": "POST /v21.0/.../messages",
      "httpStatus": 200,
      "requestPayload": { ... },
      "responseBody": { ... }
    }
  ]
}`}
          </pre>
        </div>
      </div>
    </div>
  );
};
