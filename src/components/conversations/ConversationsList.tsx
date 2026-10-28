import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
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
  Check,
  CheckCheck,
} from 'lucide-react';
import { UserSession, ChatMessage, WhatsAppAccount } from '../../types/flow';

interface ConversationsListProps {
  accounts?: WhatsAppAccount[];
  activeAccountId?: string;
  openConversationTarget?: { accountId: string; phoneNumber: string } | null;
  onConversationTargetHandled?: () => void;
}

interface PendingMediaUpload {
  key: string;
  type: 'image' | 'audio' | 'document';
  storage: 'meta' | 'r2';
  mediaId?: string;
  mediaUrl?: string;
  mediaMimeType: string;
  filename: string;
  previewUrl?: string;
}

const CONVERSATIONS_PAGE_SIZE = 30;

interface SessionsPagination {
  total: number;
  hasMore: boolean;
  nextOffset: number;
  nextCursor?: string | null;
}

const EMPTY_SESSIONS_PAGINATION: SessionsPagination = {
  total: 0,
  hasMore: false,
  nextOffset: 0,
  nextCursor: null,
};

const BRASILIA_TIME_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function formatConversationTime(value: string): string {
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime()) && /[T-]/.test(value)) return BRASILIA_TIME_FORMATTER.format(parsed);

  // Historic records stored a locale-formatted 12-hour clock without timezone.
  // Normalize those labels to the Brazilian 24-hour clock while new records are
  // generated directly in America/Sao_Paulo on the server.
  const twelveHour = value.trim().match(/^(\d{1,2}):(\d{2})(?:\s*:\d{2})?\s*([AP]M)$/i);
  if (twelveHour) {
    let hour = Number(twelveHour[1]) % 12;
    if (twelveHour[3].toUpperCase() === 'PM') hour += 12;
    return `${String(hour).padStart(2, '0')}:${twelveHour[2]}`;
  }
  return value;
}

function MessageDeliveryStatus({ status }: { status?: ChatMessage['status'] }) {
  if (!status) return null;
  if (status === 'failed') return <span className="font-bold text-rose-600" title="Falha no envio">!</span>;
  if (status === 'sent') return <Check className="h-3 w-3 text-slate-500" aria-label="Enviada" />;
  return (
    <CheckCheck
      className={`h-3.5 w-3.5 ${status === 'read' ? 'text-blue-500' : 'text-slate-500'}`}
      aria-label={status === 'read' ? 'Visualizada' : 'Entregue'}
    />
  );
}

export const ConversationsList: React.FC<ConversationsListProps> = ({
  accounts = [],
  activeAccountId,
  openConversationTarget,
  onConversationTargetHandled,
}) => {
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [sessionsPagination, setSessionsPagination] = useState<SessionsPagination>(EMPTY_SESSIONS_PAGINATION);
  const [selectedSession, setSelectedSession] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMoreSessions, setIsLoadingMoreSessions] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'ads' | 'open_window' | 'paused'>('all');
  const [showCollectedVariables, setShowCollectedVariables] = useState(false);
  const activeAccountRef = useRef(activeAccountId);
  const loadedSessionsLimitRef = useRef(CONVERSATIONS_PAGE_SIZE);
  const sessionsRef = useRef<UserSession[]>([]);
  const sessionsPaginationRef = useRef<SessionsPagination>(EMPTY_SESSIONS_PAGINATION);
  const sessionsRequestIdRef = useRef(0);
  const isLoadingMoreSessionsRef = useRef(false);
  const contactListScrollRef = useRef<HTMLDivElement>(null);
  const pendingContactScrollTopRef = useRef<number | null>(null);

  // Agent chat input state
  const [agentText, setAgentText] = useState('');
  const [agentMediaType, setAgentMediaType] = useState<'text' | 'image' | 'audio' | 'document'>('text');
  const [agentAudioStorage, setAgentAudioStorage] = useState<'meta' | 'r2'>('meta');
  const [agentMediaUrl, setAgentMediaUrl] = useState('');
  const [agentCaption, setAgentCaption] = useState('');
  const [pendingMediaUploads, setPendingMediaUploads] = useState<PendingMediaUpload[]>([]);
  const [isSendingAgent, setIsSendingAgent] = useState(false);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [flowRestoredNotice, setFlowRestoredNotice] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [isUpdatingBlock, setIsUpdatingBlock] = useState(false);

  // File input ref for choosing files from computer
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll chat
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottomRef = useRef(true);
  const selectedConversationRef = useRef('');

  const fetchSessions = async (
    silent: boolean = false,
    accountId: string | undefined = activeAccountId,
    options: { append?: boolean; reset?: boolean } = {}
  ) => {
    const append = options.append === true;
    if (append && isLoadingMoreSessionsRef.current) return;
    // A background refresh must never race a page request and replace the
    // expanded list with the smaller snapshot it requested earlier.
    if (!append && silent && isLoadingMoreSessionsRef.current) return;

    const requestId = ++sessionsRequestIdRef.current;
    if (!silent) setIsLoading(true);
    if (append) {
      isLoadingMoreSessionsRef.current = true;
      setIsLoadingMoreSessions(true);
    }
    try {
      if (!accountId) {
        sessionsRef.current = [];
        sessionsPaginationRef.current = EMPTY_SESSIONS_PAGINATION;
        setSessions([]);
        setSessionsPagination(EMPTY_SESSIONS_PAGINATION);
        setSelectedSession(null);
        return;
      }
      const currentPagination = sessionsPaginationRef.current;
      const offset = append ? currentPagination.nextOffset : 0;
      const limit = append
        ? CONVERSATIONS_PAGE_SIZE
        : options.reset
          ? CONVERSATIONS_PAGE_SIZE
          : Math.max(CONVERSATIONS_PAGE_SIZE, loadedSessionsLimitRef.current);
      if (options.reset) {
        pendingContactScrollTopRef.current = 0;
      } else if (append) {
        pendingContactScrollTopRef.current = contactListScrollRef.current?.scrollTop ?? 0;
      }
      const params = new URLSearchParams({ accountId, offset: String(offset), limit: String(limit) });
      if (append && currentPagination.nextCursor) params.set('cursor', currentPagination.nextCursor);
      const res = await fetch(`/api/sessions?${params.toString()}`);
      if (res.ok) {
        const payload: { sessions: UserSession[]; pagination: SessionsPagination } = await res.json();
        // Ignore any response superseded by a newer refresh/page request.
        if (activeAccountRef.current !== accountId || requestId !== sessionsRequestIdRef.current) return;
        const data = payload.sessions || [];
        const nextSessions = append
          ? Array.from(new Map([...sessionsRef.current, ...data].map((session) => [`${session.accountId}:${session.phoneNumber}`, session])).values())
          : data;
        const nextPagination = payload.pagination || {
          total: nextSessions.length,
          hasMore: false,
          nextOffset: nextSessions.length,
          nextCursor: null,
        };
        loadedSessionsLimitRef.current = options.reset
          ? CONVERSATIONS_PAGE_SIZE
          : Math.max(loadedSessionsLimitRef.current, nextSessions.length);
        sessionsRef.current = nextSessions;
        sessionsPaginationRef.current = nextPagination;
        setSessions(nextSessions);
        setSessionsPagination(nextPagination);

        // Never carry a chat from one WhatsApp line into another line's context.
        setSelectedSession((prev) => {
          if (!prev || prev.accountId !== accountId) return null;
          return nextSessions.find((s) => s.phoneNumber === prev.phoneNumber && s.accountId === accountId) || prev;
        });
      }
    } catch (err) {
      console.error('Error fetching sessions:', err);
    } finally {
      if (!silent) setIsLoading(false);
      if (append) {
        isLoadingMoreSessionsRef.current = false;
        setIsLoadingMoreSessions(false);
      }
    }
  };

  useLayoutEffect(() => {
    if (pendingContactScrollTopRef.current === null) return;
    const scrollTop = pendingContactScrollTopRef.current;
    pendingContactScrollTopRef.current = null;
    if (contactListScrollRef.current) contactListScrollRef.current.scrollTop = scrollTop;
  }, [sessions]);

  useEffect(() => {
    // Invalidate requests from the previously selected WhatsApp line.
    sessionsRequestIdRef.current += 1;
    activeAccountRef.current = activeAccountId;
    loadedSessionsLimitRef.current = CONVERSATIONS_PAGE_SIZE;
    sessionsRef.current = [];
    sessionsPaginationRef.current = EMPTY_SESSIONS_PAGINATION;
    isLoadingMoreSessionsRef.current = false;
    pendingContactScrollTopRef.current = 0;
    setSessions([]);
    setSessionsPagination(EMPTY_SESSIONS_PAGINATION);
    setSelectedSession(null);
    setShowCollectedVariables(false);
    setAgentText('');
    setPendingMediaUploads((current) => {
      current.forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl));
      return [];
    });
    setAgentMediaUrl('');
    setAgentCaption('');
    setSendError(null);
    setReplyingTo(null);
    fetchSessions(false, activeAccountId, { reset: true });
    const interval = setInterval(() => fetchSessions(true, activeAccountId), 4000);
    return () => clearInterval(interval);
  }, [activeAccountId]);

  useEffect(() => {
    if (!openConversationTarget || openConversationTarget.accountId !== activeAccountId || sessions.length === 0) return;
    const cleanTarget = openConversationTarget.phoneNumber.replace(/\D/g, '');
    const targetSession = sessions.find((session) => session.phoneNumber.replace(/\D/g, '') === cleanTarget);
    if (!targetSession) return;
    shouldStickToBottomRef.current = true;
    setSelectedSession(targetSession);
    setReplyingTo(null);
    onConversationTargetHandled?.();
  }, [activeAccountId, openConversationTarget, onConversationTargetHandled, sessions]);

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
    const externalUrls = agentMediaUrl.split(/\r?\n/).map((url) => url.trim()).filter(Boolean);
    if (agentMediaType !== 'text' && pendingMediaUploads.length === 0 && externalUrls.length === 0) return;

    setIsSendingAgent(true);
    setSendError(null);

    try {
      const messages = agentMediaType === 'text'
        ? [{ type: 'text' as const, text: agentText }]
        : [
            ...pendingMediaUploads.map((item) => ({
              type: item.type,
              mediaId: item.mediaId,
              mediaUrl: item.mediaUrl,
              mediaMimeType: item.mediaMimeType,
              filename: item.filename,
              sendByLink: item.storage === 'r2',
            })),
            ...externalUrls.map((mediaUrl) => ({ type: agentMediaType, mediaUrl })),
          ];

      let latestSession = selectedSession;
      for (let index = 0; index < messages.length; index += 1) {
        const message = messages[index];
        const res = await fetch(`/api/sessions/${selectedSession.phoneNumber}/send-agent-message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...message,
            caption: agentMediaType === 'text' || agentMediaType === 'audio' ? undefined : agentCaption,
            sendAsVoice: message.type === 'audio' && 'mediaId' in message && Boolean(message.mediaId),
            pauseBot: true,
            accountId: selectedSession.accountId,
            replyToMessageId: index === 0 ? replyingTo?.id : undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || data.diagnosticTip || `Erro ao enviar o item ${index + 1}.`);
        latestSession = data.session;
      }

      if (latestSession) {
        setSelectedSession(latestSession);
        setAgentText('');
        pendingMediaUploads.forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl));
        setPendingMediaUploads([]);
        setAgentMediaUrl('');
        setAgentCaption('');
        setAgentMediaType('text');
        setReplyingTo(null);
        fetchSessions(true);
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
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const oversized = files.find((file) => file.size > 100 * 1024 * 1024);
    if (oversized) {
      setSendError(`O arquivo ${oversized.name} excede o limite máximo de 100 MB.`);
      e.target.value = '';
      return;
    }

    setIsUploadingFile(true);
    setSendError(null);

    try {
      const uploaded: PendingMediaUpload[] = [];
      for (const file of files) {
        const useR2 = agentMediaType === 'audio' && agentAudioStorage === 'r2';
        const uploadParams = new URLSearchParams({ accountId: activeAccountId || '' });
        if (agentMediaType === 'audio') uploadParams.set('voice', 'true');
        const uploadUrl = useR2 ? '/api/r2/media' : `/api/meta/media?${uploadParams.toString()}`;
        const res = await fetch(uploadUrl, {
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
        const uploadedReference = useR2 ? data.mediaUrl : data.mediaId;
        if (!res.ok || !uploadedReference) throw new Error(data.error || `${useR2 ? 'O Cloudflare R2' : 'A Meta'} recusou o upload de ${file.name}.`);
        uploaded.push({
          key: `${uploadedReference}_${file.name}`,
          type: agentMediaType === 'audio' ? 'audio' : file.type.startsWith('image/') ? 'image' : 'document',
          storage: useR2 ? 'r2' : 'meta',
          mediaId: useR2 ? undefined : data.mediaId,
          mediaUrl: useR2 ? data.mediaUrl : undefined,
          mediaMimeType: data.mimeType || file.type,
          filename: data.filename || file.name,
          previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
        });
      }
      setPendingMediaUploads((current) => [...current, ...uploaded]);
    } catch (err: any) {
      setSendError(err.message || `Falha no upload para ${agentMediaType === 'audio' && agentAudioStorage === 'r2' ? 'o Cloudflare R2' : 'a Meta'}.`);
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
    if (!confirm(`Deseja apagar do FluxoZap todo o histórico de mensagens de ${selectedSession.phoneNumber}?\n\nAs mensagens já entregues no WhatsApp do cliente não podem ser removidas pela API oficial da Meta.`)) return;

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

  const handleToggleBlock = async () => {
    if (!selectedSession) return;
    const nextBlocked = !selectedSession.isBlocked;
    const action = nextBlocked ? 'BLOQUEAR' : 'DESBLOQUEAR';
    const detail = nextBlocked
      ? 'A Meta deixará de entregar novas mensagens deste contato para esta linha e o FluxoZap não poderá responder.'
      : 'O contato poderá voltar a enviar mensagens para esta linha.';
    if (!confirm(`Deseja ${action} ${selectedSession.phoneNumber}?\n\n${detail}`)) return;

    setIsUpdatingBlock(true);
    setSendError(null);
    try {
      const res = await fetch(`/api/sessions/${selectedSession.phoneNumber}/block-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: selectedSession.accountId, blocked: nextBlocked }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error([data.error, data.diagnosticTip].filter(Boolean).join(' ') || `Não foi possível ${nextBlocked ? 'bloquear' : 'desbloquear'} o contato.`);
      setSelectedSession(data.session);
      await fetchSessions(true);
    } catch (err: any) {
      setSendError(err.message || 'Erro ao atualizar o bloqueio do contato.');
    } finally {
      setIsUpdatingBlock(false);
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
                {sessions.length} de {sessionsPagination.total} {sessionsPagination.total === 1 ? 'conversa registrada' : 'conversas registradas'}
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
        <div
          ref={contactListScrollRef}
          className="flex-1 overflow-y-auto divide-y divide-slate-100 [overflow-anchor:none]"
        >
          {filteredSessions.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="font-semibold text-slate-700">Nenhum lead encontrado</p>
              <p className="text-[11px] text-slate-400 mt-1">
                Quando alguém mandar mensagem para o WhatsApp ou você disparar um teste, os leads aparecerão aqui com histórico de áudios, imagens e textos.
              </p>
            </div>
          ) : (
            <>
            {filteredSessions.map((item) => {
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
                        {formatConversationTime(item.updatedAt)}
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
            })}
            </>
          )}
          {sessionsPagination.hasMore && (
            <div className="p-3">
              <button
                type="button"
                onClick={() => fetchSessions(true, activeAccountId, { append: true })}
                disabled={isLoadingMoreSessions}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {isLoadingMoreSessions ? 'Carregando...' : 'Carregar mais conversas'}
              </button>
            </div>
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
                    {selectedSession.isBlocked && (
                      <span className="text-[10px] font-semibold bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full border border-rose-200">
                        Contato bloqueado
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                    {selectedSession.phoneNumber} · Auto-exclusão em {selectedSession.autoDeleteDays || 17} dias
                  </p>
                </div>
              </div>

              {/* Action Buttons: Toggle Bot, Restart Flow, Delete */}
              <div className="flex flex-wrap items-center justify-end gap-2">
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
                  disabled={selectedSession.isBlocked}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 text-xs font-semibold cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  title="Restaurar fluxo: na próxima mensagem, o cliente recebe o funil do início"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Restaurar Fluxo</span>
                </button>

                <button
                  type="button"
                  onClick={handleToggleBlock}
                  disabled={isUpdatingBlock}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition-colors disabled:opacity-50 ${
                    selectedSession.isBlocked
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                      : 'bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100'
                  }`}
                  title={selectedSession.isBlocked ? 'Desbloquear este contato na Meta' : 'Bloquear este contato na Meta'}
                >
                  {isUpdatingBlock ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                  <span>{selectedSession.isBlocked ? 'Desbloquear' : 'Bloquear'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleClearHistory}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
                  title="Apaga apenas o histórico armazenado no FluxoZap; não remove mensagens do WhatsApp do cliente"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Apagar mensagens</span>
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
                          <span className="flex items-center gap-1">
                            {formatConversationTime(msg.timestamp)}
                            {!isUser && <MessageDeliveryStatus status={msg.status} />}
                          </span>
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
              multiple
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden"
              accept={agentMediaType === 'image' ? 'image/*' : agentMediaType === 'audio' ? 'audio/*' : agentMediaType === 'document' ? '.pdf,.doc,.docx,.xls,.xlsx,.txt' : '*/*'}
            />

            {/* Agent Live Reply Input Box */}
            <div className="p-4 bg-white border-t border-slate-200 shrink-0 space-y-2">
              {selectedSession.isBlocked && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-900 text-[11px] flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-rose-600 shrink-0" />
                  <span><strong>Contato bloqueado:</strong> desbloqueie-o para voltar a receber ou enviar mensagens nesta linha.</span>
                </div>
              )}
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
              <div className={`flex items-center gap-2 text-[11px] ${selectedSession.isBlocked ? 'pointer-events-none opacity-50' : ''}`}>
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
                <button
                  type="button"
                  onClick={() => setAgentMediaType('audio')}
                  className={`px-2 py-0.5 rounded cursor-pointer transition-colors flex items-center gap-1 ${
                    agentMediaType === 'audio'
                      ? 'bg-orange-600 text-white font-semibold'
                      : 'bg-orange-50 text-orange-700 hover:bg-orange-100'
                  }`}
                >
                  <Volume2 className="w-3 h-3" />
                  <span>Enviar Áudio</span>
                </button>
              </div>

              {/* Form depending on media type */}
              <form onSubmit={handleSendAgentMessage} className={`space-y-2 ${selectedSession.isBlocked ? 'pointer-events-none opacity-50' : ''}`}>
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
                    {agentMediaType === 'audio' && (
                      <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                        <p className="mb-2 text-[11px] font-semibold text-slate-700">Destino do áudio do computador</p>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setAgentAudioStorage('meta')}
                            className={`rounded-lg border px-3 py-2 text-[11px] font-semibold transition-colors ${agentAudioStorage === 'meta' ? 'border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-200' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
                          >
                            Direto para Meta
                          </button>
                          <button
                            type="button"
                            onClick={() => setAgentAudioStorage('r2')}
                            className={`rounded-lg border px-3 py-2 text-[11px] font-semibold transition-colors ${agentAudioStorage === 'r2' ? 'border-orange-500 bg-orange-50 text-orange-700 ring-1 ring-orange-200' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
                          >
                            Cloudflare R2
                          </button>
                        </div>
                        <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
                          {agentAudioStorage === 'r2'
                            ? 'O áudio ficará salvo no R2 e será enviado ao WhatsApp pela URL pública.'
                            : 'O áudio será convertido em mensagem de voz e preparado diretamente na biblioteca da Meta.'}
                        </p>
                      </div>
                    )}
                    {/* Direct computer upload button */}
                    <div className="flex items-center justify-between gap-2 p-2 bg-white rounded-lg border border-slate-200">
                      <span className="text-[11px] text-slate-600 font-medium">
                        Selecione um ou vários arquivos do seu computador:
                      </span>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploadingFile}
                        className="px-3 py-1 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white font-semibold rounded-md text-[11px] flex items-center gap-1.5 cursor-pointer shrink-0 transition-colors"
                      >
                        <Upload className="w-3 h-3" />
                        <span>{isUploadingFile ? 'Preparando arquivos...' : 'Escolher arquivos do PC'}</span>
                      </button>
                    </div>

                    {pendingMediaUploads.length > 0 && (
                      <div className="space-y-1.5">
                        {pendingMediaUploads.map((item) => (
                          <div key={item.key} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2">
                            {item.previewUrl ? <img src={item.previewUrl} alt="Preview" className="h-10 w-10 rounded-md border object-cover" /> : item.type === 'audio' ? <Volume2 className="h-5 w-5 shrink-0 text-orange-600" /> : <FileText className="h-5 w-5 shrink-0 text-amber-600" />}
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-semibold text-slate-800">{item.filename}</p>
                              <p className={`text-[10px] font-medium ${item.storage === 'r2' ? 'text-orange-600' : 'text-emerald-600'}`}>
                                {item.storage === 'r2' ? 'Salvo no Cloudflare R2' : 'Preparado na Meta'}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setPendingMediaUploads((current) => current.filter((candidate) => {
                                if (candidate.key === item.key && candidate.previewUrl) URL.revokeObjectURL(candidate.previewUrl);
                                return candidate.key !== item.key;
                              }))}
                              className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                              title="Remover arquivo"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div>
                      <label className="block font-semibold text-slate-700 mb-0.5">
                        URLs externas — uma por linha (opcional)
                      </label>
                      <textarea
                        rows={3}
                        value={agentMediaUrl}
                        onChange={(e) => setAgentMediaUrl(e.target.value)}
                        placeholder={agentMediaType === 'audio' ? 'https://exemplo.com/audio-1.mp3\nhttps://exemplo.com/audio-2.ogg' : 'https://exemplo.com/arquivo-1.pdf\nhttps://exemplo.com/arquivo-2.pdf'}
                        className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white"
                      />
                      <p className="text-[10px] text-slate-500 mt-1">
                        {agentMediaType === 'audio'
                          ? 'Áudios do computador são preparados como mensagem de voz e enviados direto pela Meta. URLs externas são enviadas como áudio comum.'
                          : 'Arquivos do computador vão direto para a Meta. URLs externas são baixadas pelo servidor e reenviadas como mídia da Meta.'}
                      </p>
                    </div>
                    {agentMediaType !== 'audio' && <div>
                      <label className="block font-semibold text-slate-700 mb-0.5">Legenda / Texto Acompanhante</label>
                      <input
                        type="text"
                        value={agentCaption}
                        onChange={(e) => setAgentCaption(e.target.value)}
                        placeholder="Mensagem acompanhando a foto ou documento..."
                        className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white"
                      />
                    </div>}
                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setAgentMediaType('text');
                          pendingMediaUploads.forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl));
                          setPendingMediaUploads([]);
                          setAgentMediaUrl('');
                          setAgentCaption('');
                        }}
                        className="px-3 py-1 text-slate-600 hover:bg-slate-200 rounded cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={isSendingAgent || isUploadingFile || (pendingMediaUploads.length === 0 && !agentMediaUrl.trim())}
                        className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        {isSendingAgent ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        <span>Enviar {pendingMediaUploads.length + agentMediaUrl.split(/\r?\n/).filter((url) => url.trim()).length || ''} mídia(s)</span>
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
