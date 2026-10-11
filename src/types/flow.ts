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

export interface ChatMessage {
  id: string;
  sender: 'bot' | 'user' | 'system';
  type: 'text' | 'image' | 'document' | 'info';
  content: string;
  mediaUrl?: string;
  filename?: string;
  timestamp: string;
  status?: 'sent' | 'delivered' | 'read' | 'failed';
}

export interface UserSession {
  phoneNumber: string;
  activeFlowId: string;
  currentNodeId: string | null;
  waitingForInput: boolean;
  waitingVariableName?: string;
  variables: Record<string, string>;
  history: ChatMessage[];
  updatedAt: string;
}

export interface FlowDefinition {
  id: string;
  name: string;
  description: string;
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
