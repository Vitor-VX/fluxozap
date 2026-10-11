import React, { useState, useEffect } from 'react';
import {
  Terminal,
  RefreshCw,
  Trash2,
  Copy,
  Check,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ArrowUpRight,
  ArrowDownLeft,
  Search,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';
import { ApiLogEntry } from '../../types/flow';

interface LogsViewerProps {
  activeAccountId?: string;
  activeAccountName?: string;
}

export const LogsViewer: React.FC<LogsViewerProps> = ({ activeAccountId, activeAccountName }) => {
  const [logs, setLogs] = useState<ApiLogEntry[]>([]);
  const [selectedLog, setSelectedLog] = useState<ApiLogEntry | null>(null);
  const [filter, setFilter] = useState<'all' | 'errors' | 'outbound' | 'inbound'>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [errorsCount, setErrorsCount] = useState(0);

  const fetchLogs = async (silent: boolean = false) => {
    if (!silent) setIsLoading(true);
    try {
      const params = new URLSearchParams({ filter });
      if (activeAccountId) params.set('accountId', activeAccountId);
      const res = await fetch(`/api/logs?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
        setErrorsCount(data.errorsCount || 0);

        // Keep selected log updated or select the first one if none selected
        if (data.logs && data.logs.length > 0) {
          setSelectedLog((prev) => {
            if (!prev) return data.logs[0];
            const found = data.logs.find((l: ApiLogEntry) => l.id === prev.id);
            return found || data.logs[0];
          });
        }
      }
    } catch (err) {
      console.error('Error fetching logs:', err);
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => {
    setLogs([]);
    setSelectedLog(null);
    fetchLogs();
  }, [filter, activeAccountId]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchLogs(true);
    }, 3000);
    return () => clearInterval(interval);
  }, [autoRefresh, filter, activeAccountId]);

  const handleClearLogs = async () => {
    if (!confirm('Deseja realmente limpar todos os logs da API?')) return;
    try {
      const res = await fetch('/api/logs', { method: 'DELETE' });
      if (res.ok) {
        setLogs([]);
        setSelectedLog(null);
        setErrorsCount(0);
      }
    } catch (err) {
      console.error('Error clearing logs:', err);
    }
  };

  const copyToClipboard = (text: string, sectionId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(sectionId);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  return (
    <div className="flex h-full bg-slate-100 overflow-hidden text-xs">
      {/* Left List of Logs */}
      <div className="w-96 bg-white border-r border-slate-200 flex flex-col h-full shrink-0">
        {/* Header */}
        <div className="p-4 border-b border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-slate-800" />
              <h3 className="text-sm font-bold text-slate-900">Logs da API Meta</h3>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => fetchLogs(false)}
                title="Atualizar agora"
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 cursor-pointer transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
              <button
                type="button"
                onClick={handleClearLogs}
                title="Limpar logs"
                className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 cursor-pointer transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {activeAccountId && (
            <div className="mb-2 px-2.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-800 font-semibold truncate">
              Linha: {activeAccountName || activeAccountId}
            </div>
          )}

          {/* Filter Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`flex-1 py-1 px-1.5 text-center font-medium rounded-md transition-colors cursor-pointer text-[11px] ${
                filter === 'all'
                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Todos ({logs.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('errors')}
              className={`flex-1 py-1 px-1.5 text-center font-medium rounded-md transition-colors cursor-pointer text-[11px] ${
                filter === 'errors'
                  ? 'bg-white text-rose-700 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Erros {errorsCount > 0 && <span className="text-rose-600 font-bold">({errorsCount})</span>}
            </button>
            <button
              type="button"
              onClick={() => setFilter('outbound')}
              className={`flex-1 py-1 px-1.5 text-center font-medium rounded-md transition-colors cursor-pointer text-[11px] ${
                filter === 'outbound'
                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Envios
            </button>
            <button
              type="button"
              onClick={() => setFilter('inbound')}
              className={`flex-1 py-1 px-1.5 text-center font-medium rounded-md transition-colors cursor-pointer text-[11px] ${
                filter === 'inbound'
                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Webhooks
            </button>
          </div>

          <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5"
              />
              <span>Atualizar em tempo real</span>
            </label>
            <span className="text-[10px] text-slate-400">Total: {logs.length} eventos</span>
          </div>
        </div>

        {/* Logs List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {logs.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <Terminal className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="font-medium text-slate-600">Nenhum log registrado</p>
              <p className="text-[11px] mt-1 text-slate-400">
                Dispare um teste no WhatsApp ou teste a conexão na aba de Configurações para visualizar os dados retornados pela Meta.
              </p>
            </div>
          ) : (
            logs.map((log) => {
              const isSelected = selectedLog?.id === log.id;
              const isError = !log.success;

              return (
                <button
                  key={log.id}
                  type="button"
                  onClick={() => setSelectedLog(log)}
                  className={`w-full text-left p-3 hover:bg-slate-50 transition-colors flex items-start gap-2.5 cursor-pointer ${
                    isSelected ? 'bg-blue-50/70 border-r-2 border-blue-600' : ''
                  }`}
                >
                  <div className="shrink-0 mt-0.5">
                    {isError ? (
                      <div className="w-5 h-5 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center">
                        <XCircle className="w-3.5 h-3.5" />
                      </div>
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-mono text-[11px] font-semibold text-slate-900 truncate">
                        {log.endpoint}
                      </span>
                      <span
                        className={`font-mono text-[10px] px-1.5 py-0.2 rounded font-semibold ${
                          log.httpStatus === 200
                            ? 'bg-emerald-100 text-emerald-800'
                            : log.httpStatus
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {log.httpStatus ? `HTTP ${log.httpStatus}` : isError ? 'ERRO' : 'OK'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-1">
                      {log.direction === 'outbound' ? (
                        <span className="inline-flex items-center gap-0.5 text-blue-600 font-medium">
                          <ArrowUpRight className="w-3 h-3" /> Envio
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 text-purple-600 font-medium">
                          <ArrowDownLeft className="w-3 h-3" /> Recebido
                        </span>
                      )}
                      {log.recipient && (
                        <>
                          <span>·</span>
                          <span className="font-mono truncate">{log.recipient}</span>
                        </>
                      )}
                      <span>·</span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(log.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </span>
                    </div>

                    {log.metaErrorMessage && (
                      <p className="text-[11px] text-rose-600 font-medium mt-1 truncate">
                        {log.metaErrorCode ? `[Código ${log.metaErrorCode}] ` : ''}
                        {log.metaErrorMessage}
                      </p>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right Log Inspector */}
      <div className="flex-1 flex flex-col h-full bg-white overflow-hidden">
        {selectedLog ? (
          <>
            {/* Topbar of Selected Log */}
            <div className="h-14 border-b border-slate-200 px-6 flex items-center justify-between shrink-0 bg-white">
              <div className="flex items-center gap-3">
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs ${
                    selectedLog.success
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {selectedLog.success ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <AlertTriangle className="w-4 h-4" />
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 font-mono">
                    {selectedLog.endpoint}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    ID: {selectedLog.id} · {new Date(selectedLog.timestamp).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    copyToClipboard(
                      JSON.stringify(selectedLog, null, 2),
                      'full_log'
                    )
                  }
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium cursor-pointer transition-colors"
                >
                  {copiedSection === 'full_log' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiar Log Completo</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Scrollable details */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-slate-50">
              {/* Intelligent Diagnostic Box (When Error) */}
              {!selectedLog.success && selectedLog.diagnosticTip && (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 shadow-2xs space-y-2">
                  <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
                    <ShieldAlert className="w-4 h-4 text-amber-600" />
                    <span>Diagnóstico e Solução Recomendada:</span>
                  </div>
                  <p className="text-amber-900 text-xs leading-relaxed whitespace-pre-line font-medium">
                    {selectedLog.diagnosticTip}
                  </p>
                  {selectedLog.metaFbTraceId && (
                    <p className="text-[10px] text-amber-700 font-mono pt-1 border-t border-amber-200/60">
                      Facebook Trace ID: {selectedLog.metaFbTraceId}
                    </p>
                  )}
                </div>
              )}

              {/* Status and Metadata Summary */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Resumo da Transação
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                    <span className="text-[10px] text-slate-400 block mb-0.5">Status HTTP</span>
                    <span
                      className={`font-bold font-mono ${
                        selectedLog.httpStatus === 200
                          ? 'text-emerald-700'
                          : 'text-rose-700'
                      }`}
                    >
                      {selectedLog.httpStatus || 'N/A'}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                    <span className="text-[10px] text-slate-400 block mb-0.5">Destinatário</span>
                    <span className="font-semibold font-mono text-slate-800 truncate block">
                      {selectedLog.recipient || 'N/A'}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                    <span className="text-[10px] text-slate-400 block mb-0.5">Tipo de Mensagem</span>
                    <span className="font-semibold text-slate-800 capitalize">
                      {selectedLog.messageType || selectedLog.type}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                    <span className="text-[10px] text-slate-400 block mb-0.5">Código Meta</span>
                    <span className="font-bold font-mono text-rose-700">
                      {selectedLog.metaErrorCode || 'N/A'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Request Payload Sent to Meta */}
              {selectedLog.requestPayload && (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-100/70 border-b border-slate-200 flex items-center justify-between">
                    <span className="font-bold text-slate-700 text-xs">
                      1. Payload Enviado para a Meta (Requisição)
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        copyToClipboard(
                          JSON.stringify(selectedLog.requestPayload, null, 2),
                          'payload'
                        )
                      }
                      className="p-1 text-slate-500 hover:text-slate-800 cursor-pointer"
                      title="Copiar JSON"
                    >
                      {copiedSection === 'payload' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                  <pre className="p-4 text-[11px] font-mono text-slate-800 overflow-x-auto bg-slate-900 text-slate-100 leading-relaxed max-h-64">
                    {JSON.stringify(selectedLog.requestPayload, null, 2)}
                  </pre>
                </div>
              )}

              {/* Response Returned by Meta */}
              {selectedLog.responseBody && (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-100/70 border-b border-slate-200 flex items-center justify-between">
                    <span className="font-bold text-slate-700 text-xs">
                      2. Resposta Bruta Retornada pela Meta API
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        copyToClipboard(
                          JSON.stringify(selectedLog.responseBody, null, 2),
                          'response'
                        )
                      }
                      className="p-1 text-slate-500 hover:text-slate-800 cursor-pointer"
                      title="Copiar JSON"
                    >
                      {copiedSection === 'response' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                  <pre
                    className={`p-4 text-[11px] font-mono overflow-x-auto leading-relaxed max-h-96 ${
                      selectedLog.success
                        ? 'bg-slate-900 text-emerald-300'
                        : 'bg-slate-950 text-rose-300'
                    }`}
                  >
                    {JSON.stringify(selectedLog.responseBody, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-xs text-slate-400">
            Selecione uma transação à esquerda para inspecionar os detalhes e resposta da Meta.
          </div>
        )}
      </div>
    </div>
  );
};
