export type NodeType =
  | 'start'
  | 'send_text'
  | 'send_image'
  | 'send_document'
  | 'wait_reply'
  | 'condition'
  | 'delay';

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
  mediaUrl?: string;
  caption?: string;
  filename?: string;

  // Wait reply node properties
  variableName?: string;
  expectedType?: 'text' | 'number' | 'email';
  placeholder?: string;

  // Condition node properties
  conditionVariable?: string;
  conditionOperator?: 'equals' | 'contains' | 'starts_with' | 'not_empty';
  conditionValue?: string;

  // Delay node properties
  delaySeconds?: number;

  // Index signature for React Flow compatibility
  [key: string]: any;
}

export interface MetaConfig {
  phoneNumberId: string;
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
  activeFlowId: string;
  currentNodeId: string | null;
  waitingForInput: boolean;
  waitingVariableName?: string;
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
  error?: string;
  lastConnectedAt?: string;
}
