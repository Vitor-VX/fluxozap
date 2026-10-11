import mongoose, { Schema, Document } from 'mongoose';

export interface IWhatsAppDocument extends Document {
  identifier: string;
  name: string;
  config: {
    phoneNumberId: string;
    accessToken: string;
    wabaId: string;
    verifyToken: string;
    testPhoneNumber: string;
  };
  r2Config: {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucketName: string;
    publicUrl: string;
  };
  flow: {
    id: string;
    name: string;
    description: string;
    triggerType?: 'all' | 'exact' | 'contains';
    triggerKeywords?: string[];
    nodes: any[];
    edges: any[];
    updatedAt: string;
  };
  sessions: Array<{
    phoneNumber: string;
    name?: string;
    activeFlowId: string;
    currentNodeId: string | null;
    waitingForInput: boolean;
    waitingVariableName?: string;
    variables: Record<string, any>;
    history: Array<{
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
      status?: string;
    }>;
    lastCustomerMessageAt?: string;
    windowExpiresAt?: string;
    windowType?: '24h_standard' | '72h_ads';
    isWindowOpen?: boolean;
    referral?: {
      isFromAd: boolean;
      sourceType?: string;
      sourceId?: string;
      sourceUrl?: string;
      headline?: string;
      body?: string;
      mediaType?: string;
      imageUrl?: string;
      receivedAt: string;
    };
    botPaused?: boolean;
    flowCompleted?: boolean;
    autoDeleteDays?: number;
    autoDeleteAt?: string;
    updatedAt: string;
    createdAt?: string;
  }>;
  logs: Array<{
    id: string;
    timestamp: string;
    type: string;
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
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const WhatsAppSchema = new Schema<IWhatsAppDocument>(
  {
    identifier: {
      type: String,
      default: 'default',
      unique: true,
      index: true,
      required: true,
    },
    name: {
      type: String,
      default: 'Instância Principal WhatsApp',
    },
    config: {
      phoneNumberId: { type: String, default: '' },
      accessToken: { type: String, default: '' },
      wabaId: { type: String, default: '' },
      verifyToken: { type: String, default: 'fluxozap_webhook_secret_2026' },
      testPhoneNumber: { type: String, default: '' },
    },
    r2Config: {
      accountId: { type: String, default: '' },
      accessKeyId: { type: String, default: '' },
      secretAccessKey: { type: String, default: '' },
      bucketName: { type: String, default: '' },
      publicUrl: { type: String, default: '' },
    },
    flow: {
      id: { type: String, default: 'flow_welcome' },
      name: { type: String, default: 'Fluxo de Atendimento e Apresentação' },
      description: { type: String, default: '' },
      triggerType: { type: String, enum: ['all', 'exact', 'contains'], default: 'all' },
      triggerKeywords: { type: [String], default: [] },
      nodes: { type: [Schema.Types.Mixed], default: [] },
      edges: { type: [Schema.Types.Mixed], default: [] },
      updatedAt: { type: String, default: () => new Date().toISOString() },
    },
    sessions: [
      {
        phoneNumber: { type: String, required: true },
        name: { type: String },
        activeFlowId: { type: String, default: 'flow_welcome' },
        currentNodeId: { type: String, default: null },
        waitingForInput: { type: Boolean, default: false },
        waitingVariableName: { type: String },
        variables: { type: Schema.Types.Mixed, default: {} },
        history: [
          {
            id: { type: String },
            sender: { type: String, enum: ['bot', 'user', 'agent', 'system'] },
            type: { type: String, default: 'text' },
            content: { type: String, default: '' },
            mediaUrl: { type: String },
            mediaId: { type: String },
            mediaMimeType: { type: String },
            mediaSize: { type: Number },
            filename: { type: String },
            caption: { type: String },
            timestamp: { type: String },
            status: { type: String },
          },
        ],
        lastCustomerMessageAt: { type: String },
        windowExpiresAt: { type: String },
        windowType: { type: String, enum: ['24h_standard', '72h_ads'], default: '24h_standard' },
        isWindowOpen: { type: Boolean, default: false },
        referral: { type: Schema.Types.Mixed },
        botPaused: { type: Boolean, default: false },
        flowCompleted: { type: Boolean, default: false },
        autoDeleteDays: { type: Number, default: 7 },
        autoDeleteAt: { type: String },
        updatedAt: { type: String, default: () => new Date().toISOString() },
        createdAt: { type: String, default: () => new Date().toISOString() },
      },
    ],
    logs: [
      {
        id: { type: String },
        timestamp: { type: String },
        type: { type: String },
        direction: { type: String, enum: ['outbound', 'inbound'], default: 'outbound' },
        endpoint: { type: String },
        recipient: { type: String },
        sender: { type: String },
        messageType: { type: String },
        httpStatus: { type: Number },
        success: { type: Boolean, default: false },
        requestPayload: { type: Schema.Types.Mixed },
        responseBody: { type: Schema.Types.Mixed },
        metaErrorCode: { type: Number },
        metaErrorSubcode: { type: Number },
        metaErrorMessage: { type: String },
        metaErrorType: { type: String },
        metaFbTraceId: { type: String },
        diagnosticTip: { type: String },
      },
    ],
  },
  {
    timestamps: true,
    collection: 'whatsapps',
  }
);

export const WhatsApp =
  mongoose.models.WhatsApp || mongoose.model<IWhatsAppDocument>('WhatsApp', WhatsAppSchema);

export default WhatsApp;
