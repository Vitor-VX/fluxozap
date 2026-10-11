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
  flow: {
    id: string;
    name: string;
    description: string;
    nodes: any[];
    edges: any[];
    updatedAt: string;
  };
  sessions: Array<{
    phoneNumber: string;
    activeFlowId: string;
    currentNodeId: string | null;
    waitingForInput: boolean;
    waitingVariableName?: string;
    variables: Record<string, any>;
    history: Array<{
      id: string;
      sender: 'bot' | 'user' | 'system';
      type: 'text' | 'image' | 'document' | 'info';
      content: string;
      mediaUrl?: string;
      filename?: string;
      timestamp: string;
      status?: string;
    }>;
    updatedAt: string;
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
    flow: {
      id: { type: String, default: 'flow_welcome' },
      name: { type: String, default: 'Fluxo de Atendimento e Apresentação' },
      description: { type: String, default: '' },
      nodes: { type: [Schema.Types.Mixed], default: [] },
      edges: { type: [Schema.Types.Mixed], default: [] },
      updatedAt: { type: String, default: () => new Date().toISOString() },
    },
    sessions: [
      {
        phoneNumber: { type: String, required: true },
        activeFlowId: { type: String, default: 'flow_welcome' },
        currentNodeId: { type: String, default: null },
        waitingForInput: { type: Boolean, default: false },
        waitingVariableName: { type: String },
        variables: { type: Schema.Types.Mixed, default: {} },
        history: [
          {
            id: { type: String },
            sender: { type: String, enum: ['bot', 'user', 'system'] },
            type: { type: String, default: 'text' },
            content: { type: String, default: '' },
            mediaUrl: { type: String },
            filename: { type: String },
            timestamp: { type: String },
            status: { type: String },
          },
        ],
        updatedAt: { type: String, default: () => new Date().toISOString() },
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

// Specifically create the model named 'WhatsApp' as requested by the user
export const WhatsApp =
  mongoose.models.WhatsApp || mongoose.model<IWhatsAppDocument>('WhatsApp', WhatsAppSchema);

export default WhatsApp;
