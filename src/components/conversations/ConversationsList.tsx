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
  Copy,
  Reply,
  X,
} from 'lucide-react';
import { UserSession, ChatMessage, WhatsAppAccount } from '../../types/flow';

interface ConversationsListProps {
  accounts?: WhatsAppAccount[];
  activeAccountId?: string;
}

export const ConversationsList: React.FC<ConversationsListProps> = ({ accounts = [], activeAccountId }) => {
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'ads' | 'open_window' | 'paused'>('all');
  const [showCollectedVariables, setShowCollectedVariables] = useState(false);
  const activeAccountRef = useRef(activeAccountId);

  // Agent chat input state
  const [agentText, setAgentText] = useState('');
  const [agentMediaType, setAgentMediaType] = useState<'text' | 'image' | 'document'>('text');
  const [agentMediaId, setAgentMediaId] = useState('');
  const [agentMediaUrl, setAgentMediaUrl] = useState('');
  const [agentMediaMimeType, setAgentMediaMimeType] = useState('');
  const [agentCaption, setAgentCaption] = useState('');
  const [agentFilename, setAgentFilename] = useState('');
  const [isSendingAgent, setIsSendingAgent] = useState(false);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [flowRestoredNotice, setFlowRestoredNotice] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  // File input ref for choosing files from computer
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll chat
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottomRef = useRef(true);
  const selectedConversationRef = useRef('');

  const fetchSessions = async (silent: boolean = false, accountId: string | undefined = activeAccountId) => {
    if (!silent) setIsLoading(true);
    try {
      if (!accountId) {
        setSessions([]);
        setSelectedSession(null);
        return;
      }
      const res = await fetch(`/api/sessions?accountId=${encodeURIComponent(accountId)}`);
      if (res.ok) {
        const data: UserSession[] = await res.json();
        if (activeAccountRef.current !== accountId) return;
        setSessions(data);

        // Never carry a chat from one WhatsApp line into another line's context.
        setSelectedSession((prev) => {
          if (!prev || prev.accountId !== accountId) return null;
          return data.find((s) => s.phoneNumber === prev.phoneNumber && s.accountId === accountId) || null;
        });
      }
    } catch (err) {
      console.error('Error fetching sessions:', err);
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => {
    activeAccountRef.current = activeAccountId;
    setSessions([]);
    setSelectedSession(null);
    setShowCollectedVariables(false);
    setAgentText('');
    if (agentMediaUrl.startsWith('blob:')) URL.revokeObjectURL(agentMediaUrl);
    setAgentMediaId('');
    setAgentMediaUrl('');
    setAgentMediaMimeType('');
    setAgentCaption('');
    setAgentFilename('');
    setSendError(null);
    setReplyingTo(null);
    fetchSessions(false, activeAccountId);
    const interval = setInterval(() => fetchSessions(true, activeAccountId), 4000);
    return () => clearInterval(interval);
  }, [activeAccountId]);

  useEffect(() => {
    if (!selectedSession) return;
    const conversationKey = `${selectedSession.accountId || ''}:${selectedSession.phoneNumber}`;
    const changedConversation = selectedConversationRef.current !== conversationKey;
    if (changedConversation) {
      selectedConversationRef.current = conversationKey;
      shouldStickToBottomRef.current = true;
    }
    if (changedConversation || shouldStickToBottomRef.current) {
      requestAnimationFrame(() => {
        const container = chatScrollRef.current;
        if (container) container.scrollTop = container.scrollHeight;
      });
    }
  }, [selectedSession?.accountId, selectedSession?.phoneNumber, selectedSession?.history.length]);

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
    if (!activeAccountId || selectedSession.accountId !== activeAccountId) {
      setSendError('A conversa não pertence à linha selecionada. Selecione novamente o cliente nesta linha.');
      setSelectedSession(null);
      return;
    }
    if (agentMediaType === 'text' && !agentText.trim()) return;
    if (agentMediaType !== 'text' && !agentMediaId && !agentMediaUrl.trim()) return;

    setIsSendingAgent(true);
    setSendError(null);

    try {
      const res = await fetch(`/api/sessions/${selectedSession.phoneNumber}/send-agent-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: agentMediaType,
          text: agentText,
          mediaId: agentMediaId,
          mediaUrl: agentMediaId ? undefined : agentMediaUrl,
          mediaMimeType: agentMediaMimeType,
          caption: agentCaption,
          filename: agentFilename,
          pauseBot: true, // Agent takes over
          accountId: selectedSession.accountId,
          replyToMessageId: replyingTo?.id,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setSelectedSession(data.session);
        setAgentText('');
        if (agentMediaUrl.startsWith('blob:')) URL.revokeObjectURL(agentMediaUrl);
        setAgentMediaId('');
        setAgentMediaUrl('');
        setAgentMediaMimeType('');
        setAgentCaption('');
        setAgentFilename('');
        setAgentMediaType('text');
        setReplyingTo(null);
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: selectedSession.accountId }),
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

  // Upload outgoing files directly to Meta. Nothing is persisted in R2/local storage.
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) {
      setSendError('O arquivo excede o limite máximo de 100 MB.');
      e.target.value = '';
      return;
    }

    setIsUploadingFile(true);
    setSendError(null);

    try {
      const res = await fetch(`/api/meta/media?accountId=${encodeURIComponent(activeAccountId || '')}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-File-Name': encodeURIComponent(file.name),
          'X-File-Type': file.type || 'application/octet-stream',
        },
        body: file,
      });
      const raw = await res.text();
      let data: any = {};
      try { data = JSON.parse(raw); } catch { data = { error: raw }; }
      if (!res.ok || !data.mediaId) {
        setSendError(data.error || 'A Meta recusou o upload do arquivo.');
        return;
      }
      if (agentMediaUrl.startsWith('blob:')) URL.revokeObjectURL(agentMediaUrl);
      setAgentMediaId(data.mediaId);
      setAgentMediaMimeType(data.mimeType || file.type);
      setAgentMediaUrl(URL.createObjectURL(file));
      setAgentFilename(data.filename || file.name);
      setAgentMediaType(file.type.startsWith('image/') ? 'image' : 'document');
    } catch (err: any) {
      setSendError(err.message || 'Falha no upload direto para a Meta.');
    } finally {
      setIsUploadingFile(false);
      e.target.value = '';
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
        body: JSON.stringify({ triggerNow, accountId: selectedSession.accountId }),
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
      const res = await fetch(`/api/sessions/${selectedSession.phoneNumber}?accountId=${encodeURIComponent(selectedSession.accountId || '')}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setSessions((prev) => prev.filter((s) => !(s.phoneNumber === selectedSession.phoneNumber && s.accountId === selectedSession.accountId)));
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: selectedSession.accountId }),
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

  // Cleanup expired (> 17 days)
  const handleCleanupExpired = async () => {
    if (!confirm('Deseja executar a limpeza automática de conversas inativas há mais de 17 dias?')) return;
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
    if (!activeAccountId || s.accountId !== activeAccountId) {
      return false;
    }

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
  }).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

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
                title="Auto-limpar conversas com mais de 17 dias"
              >
                <Trash2 className="w-3.5 h-3.5 text-slate-400 hover:text-rose-600" />
              </button>
            </div>
          </div>

          {/* The global line selector controls this page's complete context. */}
          {activeAccountId && (
            <div className="flex items-center gap-1.5 p-1 bg-slate-50 border border-slate-200 rounded-lg">
              <span className="text-[10px] font-bold text-slate-500 pl-1 uppercase">Linha:</span>
              <span className="flex-1 bg-white border border-slate-200 rounded px-2 py-1 text-slate-800 text-[11px] font-semibold truncate">
                {accounts.find((account) => account.id === activeAccountId)?.name || 'Linha selecionada'}
                {' · '}
                {accounts.find((account) => account.id === activeAccountId)?.phoneNumber ||
                  accounts.find((account) => account.id === activeAccountId)?.phoneNumberId}
              </span>
            </div>
          )}

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
              Todos ({filteredSessions.length})
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
              const isSelected = selectedSession?.phoneNumber === item.phoneNumber && selectedSession?.accountId === item.accountId;
              const contactName = item.variables?.nome || item.name || item.phoneNumber;
              const lastMsg = item.history[item.history.length - 1];
              const windowInfo = getWindowInfo(item);

              return (
                <button
                  key={`${item.accountId || 'unassigned'}::${item.phoneNumber}`}
                  type="button"
                  onClick={() => {
                    shouldStickToBottomRef.current = true;
                    setSelectedSession(item);
                    setReplyingTo(null);
                    setShowCollectedVariables(false);
                  }}
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
                    {selectedSession.phoneNumber} · Auto-exclusão em {selectedSession.autoDeleteDays || 17} dias
                  </p>
                </div>
              </div>

              {/* Action Buttons: Toggle Bot, Restart Flow, Delete */}
              <div className="flex items-center gap-2">
                {selectedSession.variables && Object.keys(selectedSession.variables).length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowCollectedVariables((current) => !current)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
                      showCollectedVariables
                        ? 'bg-teal-50 text-teal-800 border-teal-300'
                        : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                    }`}
                    title={showCollectedVariables ? 'Ocultar variáveis coletadas' : 'Mostrar variáveis coletadas'}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>{showCollectedVariables ? 'Ocultar variáveis' : 'Mostrar variáveis coletadas'}</span>
                  </button>
                )}
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
            {showCollectedVariables && selectedSession.variables && Object.keys(selectedSession.variables).length > 0 && (
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
            <div
              ref={chatScrollRef}
              onScroll={() => {
                const element = chatScrollRef.current;
                if (!element) return;
                shouldStickToBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 96;
              }}
              className="flex-1 overflow-y-auto p-6 space-y-3.5 bg-[#efeae2]/70"
            >
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
                      className={`group flex ${isUser ? 'justify-start' : 'justify-end'}`}
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

                        {msg.replyTo && (
                          <div className="mb-2 rounded-lg border-l-2 border-emerald-500 bg-slate-100/80 px-2.5 py-1.5 text-[10px] text-slate-600">
                            <p className="font-bold">{msg.replyTo.sender === 'user' ? 'Cliente' : 'Você'}</p>
                            <p className="truncate max-w-sm">{msg.replyTo.content || `[${msg.replyTo.type}]`}</p>
                          </div>
                        )}

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

                        <div className={`absolute -top-3 ${isUser ? '-right-16' : '-left-16'} hidden group-hover:flex items-center rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden`}>
                          <button type="button" onClick={() => setReplyingTo(msg)} className="p-1.5 text-slate-500 hover:bg-slate-100 hover:text-emerald-700" title="Responder esta mensagem">
                            <Reply className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              const copyText = msg.content || msg.caption || msg.mediaUrl || msg.filename || '';
                              if (!copyText) return;
                              await navigator.clipboard.writeText(copyText);
                              setCopiedMessageId(msg.id);
                              window.setTimeout(() => setCopiedMessageId(null), 1500);
                            }}
                            className="p-1.5 text-slate-500 hover:bg-slate-100 hover:text-blue-700"
                            title={copiedMessageId === msg.id ? 'Copiado!' : 'Copiar mensagem'}
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
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
              {replyingTo && (
                <div className="flex items-center gap-3 rounded-lg border-l-4 border-emerald-500 bg-slate-50 px-3 py-2 text-[11px]">
                  <Reply className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-emerald-800">Respondendo a {replyingTo.sender === 'user' ? 'Cliente' : 'esta mensagem'}</p>
                    <p className="truncate text-slate-600">{replyingTo.content || replyingTo.caption || `[${replyingTo.type}]`}</p>
                  </div>
                  <button type="button" onClick={() => setReplyingTo(null)} className="p-1 text-slate-500 hover:text-slate-900" title="Cancelar resposta"><X className="w-4 h-4" /></button>
                </div>
              )}
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

                    {/* Media preview if uploaded directly to Meta */}
                    {agentMediaUrl && agentMediaType === 'image' && (
                      <div className="p-2 bg-white rounded-lg border border-slate-200 flex items-center gap-3">
                        <img src={agentMediaUrl} alt="Preview" className="w-12 h-12 object-cover rounded-md border" />
                        <div className="flex-1 overflow-hidden">
                          <p className="font-semibold text-slate-800 truncate">{agentFilename || 'imagem_selecionada.jpg'}</p>
                          <p className="text-[10px] text-emerald-600 font-medium">Arquivo enviado diretamente à Meta · não salvo no R2</p>
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block font-semibold text-slate-700 mb-0.5">
                        URL externa da {agentMediaType === 'image' ? 'Imagem' : 'Documento'} (Opcional)
                      </label>
                      <input
                        type="text"
                        value={agentMediaId ? '' : agentMediaUrl}
                        onChange={(e) => {
                          if (agentMediaUrl.startsWith('blob:')) URL.revokeObjectURL(agentMediaUrl);
                          setAgentMediaId('');
                          setAgentMediaMimeType('');
                          setAgentMediaUrl(e.target.value);
                        }}
                        disabled={Boolean(agentMediaId)}
                        placeholder={agentMediaId ? 'Arquivo local já preparado na Meta' : 'https://exemplo.com/arquivo.jpg'}
                        className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white"
                      />
                      <p className="text-[10px] text-slate-500 mt-1">
                        Arquivos do computador vão direto para a Meta. URLs externas são baixadas pelo servidor e reenviadas como mídia da Meta.
                      </p>
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
                          if (agentMediaUrl.startsWith('blob:')) URL.revokeObjectURL(agentMediaUrl);
                          setAgentMediaId('');
                          setAgentMediaUrl('');
                          setAgentMediaMimeType('');
                          setAgentCaption('');
                        }}
                        className="px-3 py-1 text-slate-600 hover:bg-slate-200 rounded cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={isSendingAgent || (!agentMediaId && !agentMediaUrl.trim())}
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
