import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  RotateCcw,
  Bot,
  User,
  CheckCheck,
  FileText,
  Download,
  Variable,
  Phone,
  Sparkles,
} from 'lucide-react';
import { UserSession } from '../../types/flow';

interface WhatsAppSimulatorProps {
  onFlowModified?: () => void;
}

export const WhatsAppSimulator: React.FC<WhatsAppSimulatorProps> = () => {
  const [session, setSession] = useState<UserSession | null>(null);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchSession = async () => {
    try {
      const res = await fetch('/api/simulator/session');
      if (res.ok) {
        const data = await res.json();
        setSession(data);
      }
    } catch (err) {
      console.error('Error fetching simulator session:', err);
    }
  };

  useEffect(() => {
    fetchSession();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session?.history]);

  const handleSendMessage = async (e?: React.FormEvent, customText?: string) => {
    if (e) e.preventDefault();
    const textToSend = customText || inputMessage;
    if (!textToSend.trim() || isLoading) return;

    setInputMessage('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/simulator/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: textToSend }),
      });
      if (res.ok) {
        const updated = await res.json();
        setSession(updated);
      }
    } catch (err) {
      console.error('Error sending simulator message:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetSession = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/simulator/reset', { method: 'POST' });
      if (res.ok) {
        const updated = await res.json();
        setSession(updated);
      }
    } catch (err) {
      console.error('Error resetting simulator session:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-full bg-slate-100 overflow-hidden">
      {/* Left Chat Area (WhatsApp Layout) */}
      <div className="flex-1 flex flex-col h-full bg-[#efeae2] relative border-r border-slate-300/80">
        {/* WhatsApp Topbar */}
        <div className="h-14 bg-[#f0f2f5] border-b border-slate-200 px-4 flex items-center justify-between shrink-0 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-800 leading-tight">
                FluxoZap WhatsApp Bot
              </h3>
              <p className="text-[11px] text-emerald-600 font-medium">
                {isLoading ? 'digitando...' : 'online'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetSession}
              disabled={isLoading}
              title="Reiniciar conversa e rodar fluxo do início"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-medium cursor-pointer shadow-2xs transition-colors"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Reiniciar Teste</span>
            </button>
          </div>
        </div>

        {/* Messages Stream */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
          {(!session?.history || session.history.length === 0) && (
            <div className="my-10 text-center max-w-sm mx-auto bg-white/90 backdrop-blur-xs p-6 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto mb-3">
                <Sparkles className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-slate-800">Simulador Pronto</h4>
              <p className="text-xs text-slate-500 mt-1 mb-4">
                Envie uma mensagem abaixo para iniciar o fluxo ou clique em "Reiniciar Teste".
              </p>
              <button
                type="button"
                onClick={() => handleSendMessage(undefined, 'Oi')}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-xs cursor-pointer transition-colors"
              >
                Começar com "Oi"
              </button>
            </div>
          )}

          {session?.history?.map((msg) => {
            const isBot = msg.sender === 'bot';

            return (
              <div
                key={msg.id}
                className={`flex ${isBot ? 'justify-start' : 'justify-end'} animate-in fade-in duration-200`}
              >
                <div
                  className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 shadow-xs relative text-xs ${
                    isBot
                      ? 'bg-white text-slate-800 rounded-tl-xs border border-slate-200/60'
                      : 'bg-[#d9fdd3] text-slate-900 rounded-tr-xs'
                  }`}
                >
                  {/* Image media */}
                  {msg.type === 'image' && msg.mediaUrl && (
                    <div className="mb-2 rounded-lg overflow-hidden border border-slate-200/60 max-h-56 bg-slate-100">
                      <img
                        src={msg.mediaUrl}
                        alt="Imagem enviada"
                        className="w-full h-auto object-cover max-h-56"
                      />
                    </div>
                  )}

                  {/* Document media */}
                  {msg.type === 'document' && (
                    <div className="mb-2 p-2.5 bg-slate-50 rounded-lg border border-slate-200/80 flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-md bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <p className="text-xs font-semibold text-slate-800 truncate">
                          {msg.filename || 'documento.pdf'}
                        </p>
                        <p className="text-[10px] text-slate-400">Documento PDF</p>
                      </div>
                      {msg.mediaUrl && (
                        <a
                          href={msg.mediaUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1 rounded text-slate-500 hover:text-slate-800"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  )}

                  {/* Message body */}
                  {msg.content && (
                    <p className="whitespace-pre-wrap break-words leading-relaxed">
                      {msg.content}
                    </p>
                  )}

                  {/* Timestamp & checkmarks */}
                  <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-slate-400">
                    <span>{msg.timestamp || 'Agora'}</span>
                    {!isBot && <CheckCheck className="w-3.5 h-3.5 text-blue-500" />}
                  </div>
                </div>
              </div>
            );
          })}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-3 bg-[#f0f2f5] border-t border-slate-200 shrink-0">
          {session?.waitingForInput && (
            <div className="mb-2 px-3 py-1.5 bg-teal-50 border border-teal-200 text-teal-800 rounded-lg text-xs flex items-center justify-between">
              <span className="font-medium">
                ⏳ O bot está aguardando sua resposta para salvar em{' '}
                <strong className="font-mono text-teal-900">{`{{${session.waitingVariableName || 'resposta'}}}`}</strong>
              </span>
            </div>
          )}

          <form onSubmit={handleSendMessage} className="flex items-center gap-2">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder={
                session?.waitingForInput
                  ? `Digite sua resposta para {{${session.waitingVariableName || 'resposta'}}}...`
                  : 'Digite uma mensagem (ex: oi, sim, consultar)...'
              }
              className="flex-1 bg-white border border-slate-300 rounded-full px-4 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-2xs"
            />
            <button
              type="submit"
              disabled={isLoading || !inputMessage.trim()}
              className="w-10 h-10 rounded-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white flex items-center justify-center cursor-pointer shadow-xs transition-colors shrink-0"
            >
              <Send className="w-4 h-4 ml-0.5" />
            </button>
          </form>

          {/* Quick responses suggestions */}
          <div className="flex items-center gap-1.5 mt-2 overflow-x-auto text-[11px] text-slate-600">
            <span className="text-[10px] text-slate-400 font-medium shrink-0">Testes rápidos:</span>
            {['João Carlos', 'Sim, quero falar', 'Não no momento', 'Qual o preço?'].map((txt) => (
              <button
                key={txt}
                type="button"
                onClick={() => handleSendMessage(undefined, txt)}
                className="whitespace-nowrap px-2.5 py-1 rounded-full bg-white hover:bg-slate-200 border border-slate-300/80 text-slate-700 cursor-pointer transition-colors shadow-2xs"
              >
                {txt}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right Sidebar: Collected Variables & Session State */}
      <div className="w-80 bg-white flex flex-col h-full border-l border-slate-200 shrink-0">
        <div className="p-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Variable className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-900">Variáveis do Contato</h3>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Valores capturados em tempo real pelo bloco de aguardar resposta
          </p>
        </div>

        <div className="p-4 flex-1 overflow-y-auto space-y-4 text-xs">
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
              Dicionário de Variáveis
            </h4>
            {session?.variables && Object.keys(session.variables).length > 0 ? (
              <div className="space-y-1.5">
                {Object.entries(session.variables).map(([k, v]) => (
                  <div
                    key={k}
                    className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex flex-col justify-between"
                  >
                    <span className="font-mono text-[11px] text-teal-700 font-semibold">{`{{${k}}}`}</span>
                    <span className="text-slate-900 font-medium mt-0.5 break-all">
                      {v ? String(v) : <span className="text-slate-400 italic">vazio</span>}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-400 italic">Nenhuma variável coletada ainda.</p>
            )}
          </div>

          <div className="pt-3 border-t border-slate-100">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
              Estado da Execução
            </h4>
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5 text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-500">Aguardando Resposta:</span>
                <span className="font-semibold text-slate-800">
                  {session?.waitingForInput ? 'Sim (Pausado)' : 'Não (Pronto)'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Nó Atual:</span>
                <span className="font-mono text-slate-700 truncate max-w-[140px]">
                  {session?.currentNodeId || 'Início / Concluído'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Mensagens Trocadas:</span>
                <span className="font-semibold text-slate-800">
                  {session?.history?.length || 0}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
