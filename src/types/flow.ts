export type NodeType =
  | 'start'
  | 'send_text'
  | 'send_image'
  | 'send_document'
  | 'send_audio'
  | 'send_video'
  | 'xpag_payment'
  | 'wait_reply'
  | 'condition'
  | 'delay';

export interface WhatsAppAccount {
  id: string; // ex: "acc_principal", "acc_vendas_2"
  name: string; // ex: "Comercial / Vendas Principal"
  phoneNumber: string; // ex: "+55 11 99999-9999"
  phoneNumberId: string; // Meta Phone Number ID
  wabaId?: string; // WhatsApp Business Account ID
  accessToken?: string; // Token específico (ou usa o global se vazio)
  verifyToken?: string;
  isDefault?: boolean;
  color?: string; // Cor temática para crachá (emerald, blue, purple, amber, indigo, etc.)
  flow?: FlowDefinition; // Fluxo exclusivo deste número de WhatsApp
  createdAt: string;
  updatedAt: string;
}

export interface ApiCostAnalytics {
  totalSpendUsd: number;
  totalSpendBrl: number;
  exchangeRateBrl: number; // ex: 5.65
  totalConversations: number;
  freeTierLimit: number; // 1000 free per month
  freeTierUsed: number;
  freeTierRemaining: number;
  adsFreeWindowsCount: number; // 72h free windows from Meta Ads
  adsFreeSavingsUsd: number; // money saved by 72h Meta Ads window
  adsFreeSavingsBrl: number;
  breakdown: {
    marketing: { count: number; costUsd: number; costBrl: number; unitPriceUsd: number };
    utility: { count: number; costUsd: number; costBrl: number; unitPriceUsd: number };
    authentication: { count: number; costUsd: number; costBrl: number; unitPriceUsd: number };
    service: { count: number; costUsd: number; costBrl: number; unitPriceUsd: number };
    freeTier: { count: number; costUsd: number; costBrl: number };
    ads72h: { count: number; costUsd: number; costBrl: number };
  };
  byAccount: Array<{
    accountId: string;
    accountName: string;
    phoneNumber: string;
    conversationsCount: number;
    messagesCount: number;
    estimatedCostUsd: number;
    estimatedCostBrl: number;
  }>;
  recentBilledConversations: Array<{
    id: string;
    phoneNumber: string;
    accountName: string;
    category: 'marketing' | 'utility' | 'authentication' | 'service' | 'free_ads' | 'free_tier';
    costUsd: number;
    costBrl: number;
    windowType: '24h_standard' | '72h_ads';
    openedAt: string;
    expiresAt: string;
    isAd: boolean;
  }>;
}

export interface FlowNodeData {
  label: string;
  type: NodeType;

  // Start node trigger configuration
  triggerType?: 'all' | 'exact' | 'contains';
  triggerKeywords?: string[]; // ex: ["Olá, quero saber mais informações"]
  triggerDescription?: string;

  // Text node properties
  text?: string;
  
  // Media node properties
  mediaId?: string;
  mediaUrl?: string;
  mediaMimeType?: string;
  mediaSize?: number;
  caption?: string;
  filename?: string;

  // Wait reply node properties
  variableName?: string;
  expectedType?: 'text' | 'number' | 'email';
  placeholder?: string;
  waitReplyTimeoutEnabled?: boolean;
  waitReplyTimeoutValue?: number;
  waitReplyTimeoutUnit?: 'seconds' | 'minutes' | 'hours' | 'days' | 'months';

  // Condition node properties
  conditionVariable?: string;
  conditionOperator?: 'equals' | 'contains' | 'starts_with' | 'not_empty';
  conditionValue?: string;

  // Delay node properties
  delaySeconds?: number;
  delayMode?: 'duration' | 'until';
  delayValue?: number;
  delayUnit?: 'seconds' | 'minutes' | 'hours' | 'days' | 'months';
  delayUntil?: string;

  // XPag Global payment block (Brazil and Mexico)
  xpagMethod?: 'PIX' | 'SPEI' | 'OXXO';
  xpagAmount?: string;
  xpagPayerName?: string;
  xpagPayerEmail?: string;
  xpagPayerDocument?: string;
  xpagDescription?: string;
  xpagWaitForPayment?: boolean;
  xpagVariablePrefix?: string;
  xpagExpirationMinutes?: number;

  // Index signature for React Flow compatibility
  [key: string]: any;
}

export interface MetaConfig {
  phoneNumberId: string;
  displayPhoneNumber?: string;
  accessToken: string;
  wabaId: string;
  verifyToken: string;
  testPhoneNumber: string;
}

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicUrl: string; // ex: https://pub-xxx.r2.dev or custom domain
}

export interface ReferralData {
  isFromAd: boolean;
  sourceType?: 'ad' | 'post';
  sourceId?: string; // ad_id / post_id
  sourceUrl?: string;
  headline?: string;
  body?: string;
  mediaType?: string;
  imageUrl?: string;
  videoUrl?: string;
  receivedAt: string;
}

export interface ChatMessage {
  id: string;
  sender: 'bot' | 'user' | 'agent' | 'system';
  type: 'text' | 'image' | 'audio' | 'video' | 'document' | 'info';
  content: string;
  mediaUrl?: string;
  mediaId?: string;
  mediaMimeType?: string;
  mediaSize?: number;
  filename?: string;
  caption?: string;
  timestamp: string;
  status?: 'sent' | 'delivered' | 'read' | 'failed';
}

export interface UserSession {
  phoneNumber: string;
  name?: string;
  accountId?: string; // ID da instância/número WhatsApp (ex: acc_vendas)
  accountPhoneNumberId?: string; // Phone Number ID da Meta
  activeFlowId: string;
  currentNodeId: string | null;
  waitingForInput: boolean;
  waitingVariableName?: string;
  waitingForPayment?: boolean;
  waitingPaymentExternalId?: string;
  waitingPaymentNodeId?: string;
  waitingUntil?: string;
  waitingNodeId?: string;
  waitingKind?: 'delay' | 'reply_timeout';
  waitingIsLiveWhatsApp?: boolean;
  executionCheckpointVersion?: number;
  variables: Record<string, string>;
  history: ChatMessage[];
  updatedAt: string;
  createdAt: string;

  // 24h vs 72h WhatsApp Customer Service Window Logic
  lastCustomerMessageAt?: string;
  windowExpiresAt?: string;
  windowType?: '24h_standard' | '72h_ads';
  isWindowOpen?: boolean;

  // Meta / Facebook Ads Referral Tracking
  referral?: ReferralData;

  // Bot management
  botPaused?: boolean; // Human agent paused the automated bot
  flowCompleted?: boolean;
  status?: 'active' | 'paused' | 'completed' | 'archived';

  // Auto deletion rule (in days, e.g. 7 days)
  autoDeleteDays?: number;
  autoDeleteAt?: string;
}

export interface FlowDefinition {
  id: string;
  name: string;
  description: string;
  triggerType?: 'all' | 'exact' | 'contains';
  triggerKeywords?: string[];
  nodes: any[];
  edges: any[];
  updatedAt: string;
}

export interface ApiLogEntry {
  id: string;
  timestamp: string;
  type: 'outgoing_message' | 'incoming_webhook' | 'connection_test' | 'error';
  direction: 'outbound' | 'inbound';
  endpoint: string;
  accountId?: string;
  accountName?: string;
  phoneNumberId?: string;
  recipient?: string;
  sender?: string;
  messageType?: string;
  httpStatus?: number;
  success: boolean;
  requestPayload?: any;
  responseBody?: any;
  metaErrorCode?: number;
  metaErrorSubcode?: number;
  metaErrorMessage?: string;
  metaErrorType?: string;
  metaFbTraceId?: string;
  diagnosticTip?: string;
}

export interface MongoStatus {
  status: 'connected' | 'connecting' | 'disconnected' | 'error';
  uriConfigured: boolean;
  maskedUri: string;
  databaseName?: string;
  host?: string;
  pingMs?: number;
  documentsCount?: number;
  modelName: string;
  collections?: string[];
  collectionCounts?: Record<string, number>;
  error?: string;
  lastConnectedAt?: string;
}
