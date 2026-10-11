import React, { useState, useEffect, useRef } from 'react';
import {
  Users,
  Phone,
  MessageSquare,
  Clock,
  RefreshCw,
  Variable,
  CheckCircle2,
  Trash2,
  RotateCcw,
  Send,
  PauseCircle,
  PlayCircle,
  Image as ImageIcon,
  FileText,
  Download,
  AlertTriangle,
  Megaphone,
  Sparkles,
  Search,
  Upload,
  Eye,
  ShieldCheck,
  ChevronRight,
  User,
  Bot,
  Volume2,
  Video,
} from 'lucide-react';
import { UserSession, ChatMessage } from '../../types/flow';

export const ConversationsList: React.FC = () => {
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'ads' | 'open_window' | 'paused'>('all');

  // Agent chat input state
  const [agentText, setAgentText] = useState('');
  const [agentMediaType, setAgentMediaType] = useState<'text' | 'image' | 'document'>('text');
  const [agentMediaUrl, setAgentMediaUrl] = useState('');
  const [agentCaption, setAgentCaption] = useState('');
  const [agentFilename, setAgentFilename] = useState('');
  const [isSendingAgent, setIsSendingAgent] = useState(false);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [flowRestoredNotice, setFlowRestoredNotice] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  // File input ref for choosing files from computer
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll chat
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const fetchSessions = async (silent: boolean = false) => {
    if (!silent) setIsLoading(true);
    try {
      const res = await fetch('/api/sessions');
      if (res.ok) {
        const data: UserSession[] = await res.json();
        setSessions(data);

        // Keep current selected session updated
        if (data.length > 0) {
          setSelectedSession((prev) => {
            if (!prev) return data[0];
            const found = data.find((s) => s.phoneNumber === prev.phoneNumber);
            return found || data[0];
          });
        }
      }
    } catch (err) {
      console.error('Error fetching sessions:', err);
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(() => fetchSessions(true), 4000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedSession?.history]);

  // Window remaining calculation
  const getWindowInfo = (session: UserSession) => {
    if (!session.windowExpiresAt) {
      return { isOpen: false, label: 'Janela fechada', remainingStr: '0m', isAd: false };
    }

    const now = Date.now();
    const expires = new Date(session.windowExpiresAt).getTime();
    const diffMs = expires - now;
    const isAd = session.windowType === '72h_ads' || Boolean(session.referral?.isFromAd);

    if (diffMs <= 0) {
      return { isOpen: false, label: 'Janela expirada', remainingStr: 'Expirada', isAd };
    }

    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    return {
      isOpen: true,
      label: isAd ? `Janela de 72h (Meta Ads)` : `Janela de 24h ativa`,
      remainingStr: `${hours}h ${mins}m restantes`,
      isAd,
    };
  };

  // Agent send message
  const handleSendAgentMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSession) return;
    if (agentMediaType === 'text' && !agentText.trim()) return;
    if (agentMediaType !== 'text' && !agentMediaUrl.trim()) return;

    setIsSendingAgent(true);
    setSendError(null);

    try {
      const res = await fetch(`/api/sessions/${selectedSession.phoneNumber}/send-agent-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: agentMediaType,
          text: agentText,
          mediaUrl: agentMediaUrl,
          caption: agentCaption,
          filename: agentFilename,
          pauseBot: true, // Agent takes over
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setSelectedSession(data.session);
        setAgentText('');
        setAgentMediaUrl('');
        setAgentCaption('');
        setAgentFilename('');
        setAgentMediaType('text');
        fetchSessions(true);
      } else {
        setSendError(data.error || data.diagnosticTip || 'Erro ao enviar mensagem.');
      }
    } catch (err: any) {
      setSendError(err.message || 'Erro de conexão.');
    } finally {
      setIsSendingAgent(false);
    }
  };

  // Toggle Bot Pause/Resume
  const handleToggleBot = async () => {
    if (!selectedSession) return;
    try {
      const res = await fetch(`/api/sessions/${selectedSession.phoneNumber}/toggle-bot`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedSession(data.session);
        fetchSessions(true);
      }
    } catch (err) {
      console.error('Error toggling bot:', err);
    }
  };

  // File Upload to Cloudflare R2 / Local Server
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingFile(true);
    setSendError(null);

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = reader.result as string;
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: file.name,
            fileData: base64,
            mimeType: file.type,
          }),
        });

        const data = await res.json();
        if (res.ok && data.url) {
          setAgentMediaUrl(data.url);
          setAgentFilename(data.filename || file.name);
          if (file.type.startsWith('image/')) {
            setAgentMediaType('image');
          } else {
            setAgentMediaType('document');
          }
        } else {
          setSendError(data.error || 'Erro ao enviar arquivo para o storage.');
        }
      } catch (err: any) {
        setSendError(err.message || 'Falha no upload do arquivo.');
      } finally {
        setIsUploadingFile(false);
      }
    };

    reader.onerror = () => {
      setIsUploadingFile(false);
      setSendError('Erro ao ler arquivo local.');
    };

    reader.readAsDataURL(file);
  };

  // Simulate Meta Ads Lead with 72h window
  const handleSimulateAdLead = async () => {
    try {
      const res = await fetch('/api/simulator/simulate-ad-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: '+55 11 98765-4321',
          headline: 'Campanha Meta Ads - Janela 72 Horas',
          adId: `ad_${Date.now().toString().slice(-6)}`,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        fetchSessions(false);
        if (data.session) {
          setSelectedSession(data.session);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Restart Flow
  const handleRestartFlow = async (triggerNow: boolean) => {
    if (!selectedSession) return;
    if (!confirm(`Deseja restaurar o funil para ${selectedSession.phoneNumber}? ${triggerNow ? 'O robô enviará a primeira mensagem imediatamente.' : 'O robô responderá com o início do funil na próxima mensagem do cliente.'}`)) return;

    try {
      const res = await fetch(`/api/sessions/${selectedSession.phoneNumber}/restart-flow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ triggerNow }),
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedSession(data.session);
        setFlowRestoredNotice(
          triggerNow
            ? 'Funil reiniciado e primeira mensagem disparada com sucesso!'
            : 'Funil restaurado! O cliente receberá o funil do início ao enviar a próxima mensagem.'
        );
        setTimeout(() => setFlowRestoredNotice(null), 6000);
        fetchSessions(true);
      }
    } catch (err) {
      console.error('Error restarting flow:', err);
    }
  };

  // Delete Session / Lead
  const handleDeleteSession = async () => {
    if (!selectedSession) return;
    if (!confirm(`Tem certeza que deseja EXCLUIR o lead ${selectedSession.phoneNumber} e todo o histórico?`)) return;

    try {
      const res = await fetch(`/api/sessions/${selectedSession.phoneNumber}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setSessions((prev) => prev.filter((s) => s.phoneNumber !== selectedSession.phoneNumber));
        setSelectedSession(null);
        fetchSessions(true);
      }
    } catch (err) {
      console.error('Error deleting session:', err);
    }
  };

  // Clear Chat History
  const handleClearHistory = async () => {
    if (!selectedSession) return;
    if (!confirm(`Deseja limpar todo o histórico de mensagens de ${selectedSession.phoneNumber}?`)) return;

    try {
      const res = await fetch(`/api/sessions/${selectedSession.phoneNumber}/clear-history`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedSession(data.session);
        fetchSessions(true);
      }
    } catch (err) {
      console.error('Error clearing history:', err);
    }
  };

  // Cleanup expired (> 7 days)
  const handleCleanupExpired = async () => {
    if (!confirm('Deseja executar a limpeza automática de conversas inativas há mais de 7 dias?')) return;
    try {
      const res = await fetch('/api/sessions/cleanup-expired', { method: 'POST' });
      if (res.ok) {
        fetchSessions(true);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Filter sessions
  const filteredSessions = sessions.filter((s) => {
    const matchesSearch =
      s.phoneNumber.includes(searchQuery) ||
      (s.name && s.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (s.variables?.nome && s.variables.nome.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;

    if (filterType === 'ads') {
      return Boolean(s.referral?.isFromAd);
    }
    if (filterType === 'open_window') {
      return getWindowInfo(s).isOpen;
    }
    if (filterType === 'paused') {
      return s.botPaused;
    }
    return true;
  });

  return (
    <div className="flex h-full bg-slate-100 overflow-hidden text-xs">
      {/* Left Contact & Leads List */}
      <div className="w-88 bg-white border-r border-slate-200 flex flex-col h-full shrink-0">
        {/* Header */}
        <div className="p-4 border-b border-slate-100 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Conversas &amp; Leads</h3>
              <p className="text-[11px] text-slate-500">
                {sessions.length} {sessions.length === 1 ? 'conversa registrada' : 'conversas registradas'}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleSimulateAdLead}
                className="p-1.5 rounded-lg text-blue-600 hover:text-blue-800 hover:bg-blue-50 cursor-pointer"
                title="Simular Lead de Anúncio Meta Ads (Ativa Janela de 72h)"
              >
                <Megaphone className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => fetchSessions(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                title="Atualizar conversas"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
              <button
                type="button"
                onClick={handleCleanupExpired}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                title="Auto-limpar conversas com mais de 7 dias"
              >
                <Trash2 className="w-3.5 h-3.5 text-slate-400 hover:text-rose-600" />
              </button>
            </div>
          </div>

          {/* Flow restored banner notification */}
          {flowRestoredNotice && (
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg text-[11px] flex items-center justify-between">
              <span>{flowRestoredNotice}</span>
              <button
                type="button"
                onClick={() => setFlowRestoredNotice(null)}
                className="text-emerald-700 font-bold ml-1.5 cursor-pointer"
              >
                ×
              </button>
            </div>
          )}

          {/* Search Bar */}
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por número ou nome..."
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-[11px] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1 overflow-x-auto text-[10px]">
            <button
              type="button"
              onClick={() => setFilterType('all')}
              className={`px-2 py-1 rounded-md font-medium cursor-pointer transition-colors ${
                filterType === 'all'
                  ? 'bg-slate-900 text-white font-semibold'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Todos ({sessions.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('ads')}
              className={`px-2 py-1 rounded-md font-medium cursor-pointer transition-colors flex items-center gap-1 ${
                filterType === 'ads'
                  ? 'bg-blue-600 text-white font-semibold'
                  : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
              }`}
            >
              <Megaphone className="w-2.5 h-2.5" />
              <span>Meta Ads</span>
            </button>
            <button
              type="button"
              onClick={() => setFilterType('open_window')}
              className={`px-2 py-1 rounded-md font-medium cursor-pointer transition-colors ${
                filterType === 'open_window'
                  ? 'bg-emerald-600 text-white font-semibold'
                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
              }`}
            >
              Janela Aberta
            </button>
            <button
              type="button"
              onClick={() => setFilterType('paused')}
              className={`px-2 py-1 rounded-md font-medium cursor-pointer transition-colors ${
                filterType === 'paused'
                  ? 'bg-amber-600 text-white font-semibold'
                  : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
              }`}
            >
              Humano
            </button>
          </div>
        </div>

        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {filteredSessions.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="font-semibold text-slate-700">Nenhum lead encontrado</p>
              <p className="text-[11px] text-slate-400 mt-1">
                Quando alguém mandar mensagem para o WhatsApp ou você disparar um teste, os leads aparecerão aqui com histórico de áudios, imagens e textos.
              </p>
            </div>
          ) : (
            filteredSessions.map((item) => {
              const isSelected = selectedSession?.phoneNumber === item.phoneNumber;
              const contactName = item.variables?.nome || item.name || item.phoneNumber;
              const lastMsg = item.history[item.history.length - 1];
              const windowInfo = getWindowInfo(item);

              return (
                <button
                  key={item.phoneNumber}
                  type="button"
                  onClick={() => setSelectedSession(item)}
                  className={`w-full text-left p-3 hover:bg-slate-50 transition-colors flex items-start gap-3 cursor-pointer ${
                    isSelected ? 'bg-emerald-50/70 border-r-2 border-emerald-600' : ''
                  }`}
                >
                  <div className="relative shrink-0 mt-0.5">
                    <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs border border-slate-200">
                      <Phone className="w-4 h-4 text-emerald-600" />
                    </div>
                    {windowInfo.isOpen && (
                      <span
                        className={`w-2.5 h-2.5 rounded-full absolute -top-0.5 -right-0.5 border-2 border-white ${
                          windowInfo.isAd ? 'bg-blue-500' : 'bg-emerald-500'
                        }`}
                        title={windowInfo.label}
                      />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 truncate text-xs">{contactName}</span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(item.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-400 font-mono mt-0.5 truncate">
                      {item.phoneNumber}
                    </p>

                    {/* Last message preview */}
                    <p className="text-[11px] text-slate-600 mt-0.5 truncate">
                      {lastMsg ? (
                        lastMsg.type === 'image' ? '📷 [Foto]' :
                        lastMsg.type === 'audio' ? '🎵 [Áudio de voz]' :
                        lastMsg.type === 'document' ? '📄 [Documento]' :
                        lastMsg.content
                      ) : (
                        'Conversa iniciada'
                      )}
                    </p>

                    {/* Badges strip */}
                    <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                      {item.referral?.isFromAd && (
                        <span className="text-[9px] font-semibold bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded font-sans flex items-center gap-0.5">
                          <Megaphone className="w-2.5 h-2.5" />
                          <span>Meta Ads 72h</span>
                        </span>
                      )}

                      {item.botPaused && (
                        <span className="text-[9px] font-semibold bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded font-sans">
                          Humano ativo
                        </span>
                      )}

                      {windowInfo.isOpen ? (
                        <span className="text-[9px] text-emerald-700 font-medium">
                          {windowInfo.remainingStr}
                        </span>
                      ) : (
                        <span className="text-[9px] text-slate-400">
                          Janela fechada
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right Conversation & Lead Details */}
      <div className="flex-1 flex flex-col h-full bg-white overflow-hidden">
        {selectedSession ? (
          <>
            {/* Header: Lead Info, Window Timer, Actions */}
            <div className="border-b border-slate-200 px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 bg-white shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs">
                  <Phone className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900">
                      {selectedSession.variables?.nome || selectedSession.name || selectedSession.phoneNumber}
                    </h3>

                    {/* Window Status Badge */}
                    {(() => {
                      const win = getWindowInfo(selectedSession);
                      return (
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                            win.isOpen
                              ? win.isAd
                                ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}
                        >
                          <Clock className="w-3 h-3" />
                          <span>{win.label} ({win.remainingStr})</span>
                        </span>
                      );
                    })()}

                    {selectedSession.botPaused && (
                      <span className="text-[10px] font-semibold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                        Robô Pausado
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                    {selectedSession.phoneNumber} · Auto-exclusão em {selectedSession.autoDeleteDays || 7} dias
                  </p>
                </div>
              </div>

              {/* Action Buttons: Toggle Bot, Restart Flow, Delete */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleToggleBot}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
                    selectedSession.botPaused
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                      : 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'
                  }`}
                  title={selectedSession.botPaused ? 'Reativar robô automático' : 'Pausar robô para atendimento humano'}
                >
                  {selectedSession.botPaused ? (
                    <>
                      <PlayCircle className="w-3.5 h-3.5" />
                      <span>Reativar Robô</span>
                    </>
                  ) : (
                    <>
                      <PauseCircle className="w-3.5 h-3.5" />
                      <span>Pausar Robô (Humano)</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleRestartFlow(false)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 text-xs font-semibold cursor-pointer transition-colors"
                  title="Restaurar fluxo: na próxima mensagem, o cliente recebe o funil do início"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Restaurar Fluxo</span>
                </button>

                <button
                  type="button"
                  onClick={handleClearHistory}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                  title="Limpar histórico de mensagens"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={handleDeleteSession}
                  className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 cursor-pointer"
                  title="Excluir este Lead completamente"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Meta Ads Banner (if client came from Facebook/Instagram Ads) */}
            {selectedSession.referral?.isFromAd && (
              <div className="bg-blue-50 border-b border-blue-100 px-6 py-2.5 flex items-center justify-between text-xs text-blue-900">
                <div className="flex items-center gap-2">
                  <Megaphone className="w-4 h-4 text-blue-600 shrink-0" />
                  <div>
                    <span className="font-bold">Lead originado de anúncio do Facebook / Meta Ads!</span>
                    <span className="opacity-90 ml-2">
                      Anúncio ID: <code className="font-mono bg-blue-100 px-1 rounded">{selectedSession.referral.sourceId}</code>
                    </span>
                    {selectedSession.referral.headline && (
                      <span className="ml-2 font-medium">"{selectedSession.referral.headline}"</span>
                    )}
                  </div>
                </div>
                <span className="font-semibold text-blue-800 text-[11px] bg-white px-2 py-0.5 rounded border border-blue-200">
                  Janela Meta de 72h Ativa
                </span>
              </div>
            )}

            {/* Collected Variables Bar */}
            {selectedSession.variables && Object.keys(selectedSession.variables).length > 0 && (
              <div className="bg-slate-50 border-b border-slate-200/80 px-6 py-2 flex items-center gap-2 overflow-x-auto text-[11px]">
                <span className="text-slate-400 font-medium shrink-0">Variáveis Coletadas:</span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {Object.entries(selectedSession.variables).map(([k, v]) => (
                    <span
                      key={k}
                      className="px-2 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200 font-mono text-[11px]"
                    >
                      {k}: <strong className="text-teal-950">{String(v)}</strong>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Messages Transcript (with photos, audios, documents, texts) */}
            <div className="flex-1 overflow-y-auto p-6 space-y-3.5 bg-[#efeae2]/70">
              {selectedSession.history.length === 0 ? (
                <div className="p-8 text-center text-slate-400 max-w-sm mx-auto bg-white/80 rounded-2xl border border-slate-200/80">
                  <MessageSquare className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="font-bold text-slate-700">Sem mensagens nesta conversa</p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Envie uma mensagem abaixo para falar com este lead no WhatsApp.
                  </p>
                </div>
              ) : (
                selectedSession.history.map((msg) => {
                  const isUser = msg.sender === 'user';
                  const isAgent = msg.sender === 'agent';
                  const isBot = msg.sender === 'bot';
                  const isSystem = msg.sender === 'system' || msg.type === 'info';

                  if (isSystem) {
                    return (
                      <div key={msg.id} className="flex justify-center my-1.5">
                        <div className="bg-amber-50 text-amber-900 border border-amber-200/80 rounded-xl px-3.5 py-1.5 text-[11px] max-w-[85%] text-center shadow-2xs">
                          {msg.content}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={msg.id}
                      className={`flex ${isUser ? 'justify-start' : 'justify-end'}`}
                    >
                      <div
                        className={`max-w-[75%] rounded-2xl px-4 py-2.5 shadow-xs relative text-xs ${
                          isUser
                            ? 'bg-white text-slate-900 rounded-tl-xs border border-slate-200/80'
                            : isAgent
                            ? 'bg-[#d9fdd3] text-slate-900 rounded-tr-xs border border-emerald-200'
                            : 'bg-emerald-50/90 text-slate-900 rounded-tr-xs border border-emerald-200/80'
                        }`}
                      >
                        {/* Sender header badge */}
                        <div className="flex items-center justify-between gap-2 mb-1 text-[10px] font-semibold opacity-70">
                          <span>
                            {isUser ? 'Cliente' : isAgent ? 'Atendente Humano' : 'Robô FluxoZap'}
                          </span>
                          <span>{msg.timestamp}</span>
                        </div>

                        {/* Image message */}
                        {msg.type === 'image' && msg.mediaUrl && (
                          <div className="mb-2 rounded-lg overflow-hidden border border-slate-200 bg-slate-100 max-h-64">
                            <img
                              src={msg.mediaUrl}
                              alt="Foto enviada"
                              className="w-full h-auto object-cover max-h-64 cursor-pointer hover:opacity-95"
                              onClick={() => window.open(msg.mediaUrl, '_blank')}
                            />
                          </div>
                        )}

                        {/* Video message with HTML5 video player */}
                        {msg.type === 'video' && msg.mediaUrl && (
                          <div className="mb-2 rounded-lg overflow-hidden border border-slate-200 bg-black max-h-72">
                            <video controls src={msg.mediaUrl} className="w-full max-h-72 rounded" />
                          </div>
                        )}

                        {/* Audio voice message with HTML5 audio player */}
                        {msg.type === 'audio' && msg.mediaUrl && (
                          <div className="mb-2 p-2 bg-slate-100/90 rounded-xl border border-slate-200 space-y-1">
                            <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-700">
                              <Volume2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Áudio de voz recebido</span>
                            </div>
                            <audio controls src={msg.mediaUrl} className="w-full h-9 rounded" />
                          </div>
                        )}

                        {/* Document message with download */}
                        {msg.type === 'document' && (
                          <div className="mb-2 p-2.5 bg-slate-50 rounded-lg border border-slate-200 flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-md bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                              <FileText className="w-4 h-4" />
                            </div>
                            <div className="flex-1 overflow-hidden">
                              <p className="text-xs font-semibold text-slate-800 truncate">
                                {msg.filename || 'documento.pdf'}
                              </p>
                              <p className="text-[10px] text-slate-400">Documento anexado</p>
                            </div>
                            {msg.mediaUrl && (
                              <a
                                href={msg.mediaUrl}
                                target="_blank"
                                rel="noreferrer"
                                download
                                className="p-1 rounded text-slate-600 hover:text-slate-900 bg-white border border-slate-200"
                                title="Baixar documento"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>
                        )}

                        {/* Text Content */}
                        {msg.content && msg.type !== 'audio' && (
                          <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                        )}
                      </div>
                    </div>
                  );
                })
              )}

              <div ref={chatBottomRef} />
            </div>

            {/* Hidden file input for uploading from computer */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden"
              accept={agentMediaType === 'image' ? 'image/*' : agentMediaType === 'document' ? '.pdf,.doc,.docx,.xls,.xlsx,.txt' : '*/*'}
            />

            {/* Agent Live Reply Input Box */}
            <div className="p-4 bg-white border-t border-slate-200 shrink-0 space-y-2">
              {/* Window Warning if Closed */}
              {!getWindowInfo(selectedSession).isOpen && (
                <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-[11px] flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    <strong>Janela de Atendimento Fechada:</strong> Passaram-se mais de 24h desde a última mensagem do cliente. A Meta pode rejeitar mensagens livres (erro 131047). Para reabrir a janela, o cliente precisa enviar uma nova mensagem ou você deve enviar um Template aprovado.
                  </span>
                </div>
              )}

              {sendError && (
                <div className="p-2 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-[11px] flex items-center justify-between">
                  <span>{sendError}</span>
                  <button onClick={() => setSendError(null)} className="text-rose-600 font-bold ml-2 cursor-pointer">×</button>
                </div>
              )}

              {/* Media type selector toggle */}
              <div className="flex items-center gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={() => setAgentMediaType('text')}
                  className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
                    agentMediaType === 'text'
                      ? 'bg-slate-900 text-white font-semibold'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Texto
                </button>
                <button
                  type="button"
                  onClick={() => setAgentMediaType('image')}
                  className={`px-2 py-0.5 rounded cursor-pointer transition-colors flex items-center gap-1 ${
                    agentMediaType === 'image'
                      ? 'bg-purple-600 text-white font-semibold'
                      : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
                  }`}
                >
                  <ImageIcon className="w-3 h-3" />
                  <span>Enviar Foto</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAgentMediaType('document')}
                  className={`px-2 py-0.5 rounded cursor-pointer transition-colors flex items-center gap-1 ${
                    agentMediaType === 'document'
                      ? 'bg-amber-600 text-white font-semibold'
                      : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                  }`}
                >
                  <FileText className="w-3 h-3" />
                  <span>Enviar Documento</span>
                </button>
              </div>

              {/* Form depending on media type */}
              <form onSubmit={handleSendAgentMessage} className="space-y-2">
                {agentMediaType === 'text' ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={agentText}
                      onChange={(e) => setAgentText(e.target.value)}
                      placeholder="Digite sua resposta para o cliente..."
                      className="flex-1 px-4 py-2 bg-slate-50 border border-slate-300 rounded-full text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                    <button
                      type="submit"
                      disabled={isSendingAgent || !agentText.trim()}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold rounded-full text-xs cursor-pointer shadow-xs transition-colors flex items-center gap-1.5 shrink-0"
                    >
                      {isSendingAgent ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                      <span>Responder</span>
                    </button>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                    {/* Direct computer upload button */}
                    <div className="flex items-center justify-between gap-2 p-2 bg-white rounded-lg border border-slate-200">
                      <span className="text-[11px] text-slate-600 font-medium">
                        Selecione um arquivo local do seu computador:
                      </span>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploadingFile}
                        className="px-3 py-1 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white font-semibold rounded-md text-[11px] flex items-center gap-1.5 cursor-pointer shrink-0 transition-colors"
                      >
                        <Upload className="w-3 h-3" />
                        <span>{isUploadingFile ? 'Enviando...' : 'Escolher Arquivo do PC'}</span>
                      </button>
                    </div>

                    {/* Media preview if selected/uploaded */}
                    {agentMediaUrl && agentMediaType === 'image' && (
                      <div className="p-2 bg-white rounded-lg border border-slate-200 flex items-center gap-3">
                        <img src={agentMediaUrl} alt="Preview" className="w-12 h-12 object-cover rounded-md border" />
                        <div className="flex-1 overflow-hidden">
                          <p className="font-semibold text-slate-800 truncate">{agentFilename || 'imagem_selecionada.jpg'}</p>
                          <p className="text-[10px] text-emerald-600 font-medium">Arquivo pronto para disparo no WhatsApp</p>
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block font-semibold text-slate-700 mb-0.5">
                        URL da {agentMediaType === 'image' ? 'Imagem' : 'Documento'} (Cloudflare R2 ou HTTPS)
                      </label>
                      <input
                        type="text"
                        value={agentMediaUrl}
                        onChange={(e) => setAgentMediaUrl(e.target.value)}
                        placeholder="https://pub-xxx.r2.dev/foto.jpg ou URL pública"
                        className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-0.5">Legenda / Texto Acompanhante</label>
                      <input
                        type="text"
                        value={agentCaption}
                        onChange={(e) => setAgentCaption(e.target.value)}
                        placeholder="Mensagem acompanhando a foto ou documento..."
                        className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white"
                      />
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setAgentMediaType('text');
                          setAgentMediaUrl('');
                          setAgentCaption('');
                        }}
                        className="px-3 py-1 text-slate-600 hover:bg-slate-200 rounded cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={isSendingAgent || !agentMediaUrl.trim()}
                        className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        {isSendingAgent ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        <span>Enviar Mídia no WhatsApp</span>
                      </button>
                    </div>
                  </div>
                )}
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-xs text-slate-400">
            Selecione uma conversa ao lado para visualizar os áudios, imagens, textos e responder em tempo real.
          </div>
        )}
      </div>
    </div>
  );
};
