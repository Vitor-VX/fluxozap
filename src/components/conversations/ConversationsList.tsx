import React, { useState, useEffect } from 'react';
import { Users, Phone, MessageSquare, Clock, RefreshCw, Variable, CheckCircle2 } from 'lucide-react';
import { UserSession } from '../../types/flow';

export const ConversationsList: React.FC = () => {
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchSessions = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/sessions');
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
        if (data.length > 0 && !selectedSession) {
          setSelectedSession(data[0]);
        }
      }
    } catch (err) {
      console.error('Error fetching sessions:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  return (
    <div className="flex h-full bg-slate-50 overflow-hidden">
      {/* Contact List */}
      <div className="w-80 bg-white border-r border-slate-200 flex flex-col h-full shrink-0">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Leads & Conversas</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {sessions.length} {sessions.length === 1 ? 'contato registrado' : 'contatos registrados'}
            </p>
          </div>
          <button
            type="button"
            onClick={fetchSessions}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
            title="Atualizar lista"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {sessions.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">
              <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p>Nenhuma conversa externa registrada ainda.</p>
              <p className="text-[11px] text-slate-400 mt-1">
                Conecte o Webhook ou envie uma mensagem de teste para começar.
              </p>
            </div>
          ) : (
            sessions.map((item) => {
              const isSelected = selectedSession?.phoneNumber === item.phoneNumber;
              const contactName = item.variables?.nome || item.phoneNumber;
              const lastMsg = item.history[item.history.length - 1]?.content || 'Conversa iniciada';

              return (
                <button
                  key={item.phoneNumber}
                  type="button"
                  onClick={() => setSelectedSession(item)}
                  className={`w-full text-left p-3.5 hover:bg-slate-50 transition-colors flex items-start gap-3 cursor-pointer ${
                    isSelected ? 'bg-emerald-50/70 border-r-2 border-emerald-600' : ''
                  }`}
                >
                  <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-semibold text-xs shrink-0">
                    <Phone className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900 truncate">{contactName}</span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(item.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 font-mono mt-0.5 truncate">
                      {item.phoneNumber}
                    </p>
                    <p className="text-[11px] text-slate-600 mt-1 truncate">{lastMsg}</p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Selected Conversation Details */}
      <div className="flex-1 flex flex-col h-full bg-white overflow-hidden">
        {selectedSession ? (
          <>
            {/* Header */}
            <div className="h-16 border-b border-slate-200 px-6 flex items-center justify-between shrink-0 bg-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs">
                  <Phone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {selectedSession.variables?.nome || selectedSession.phoneNumber}
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">{selectedSession.phoneNumber}</p>
                </div>
              </div>

              {selectedSession.variables && Object.keys(selectedSession.variables).length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400">Variáveis capturadas:</span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {Object.entries(selectedSession.variables).map(([k, v]) => (
                      <span
                        key={k}
                        className="px-2 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200/80 text-[11px] font-mono"
                      >
                        {k}: {String(v)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Messages Transcript */}
            <div className="flex-1 overflow-y-auto p-6 space-y-3 bg-slate-50">
              {selectedSession.history.map((msg) => {
                const isBot = msg.sender === 'bot';
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isBot ? 'justify-start' : 'justify-end'}`}
                  >
                    <div
                      className={`max-w-[70%] rounded-xl px-4 py-2.5 shadow-2xs text-xs ${
                        isBot
                          ? 'bg-white text-slate-800 border border-slate-200/80'
                          : 'bg-emerald-600 text-white'
                      }`}
                    >
                      <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                      <p
                        className={`text-[10px] text-right mt-1 ${
                          isBot ? 'text-slate-400' : 'text-emerald-100'
                        }`}
                      >
                        {msg.timestamp}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-xs text-slate-400">
            Selecione uma conversa ao lado para visualizar as mensagens e variáveis coletadas.
          </div>
        )}
      </div>
    </div>
  );
};
