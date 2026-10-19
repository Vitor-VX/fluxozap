import mongoose, { Schema } from 'mongoose';

const options = { strict: false, minimize: false, timestamps: true } as const;

const ProjectConfigSchema = new Schema(
  {
    identifier: { type: String, required: true, unique: true, default: 'default', index: true },
    meta: { type: Schema.Types.Mixed, default: {} },
    r2: { type: Schema.Types.Mixed, default: {} },
    xpag: { type: Schema.Types.Mixed, default: {} },
    metaCapi: { type: Schema.Types.Mixed, default: {} },
    migrations: { type: Schema.Types.Mixed, default: {} },
  },
  { ...options, collection: 'project_configs' }
);

const FlowSchema = new Schema(
  {
    flowId: { type: String, required: true, unique: true, index: true },
    data: { type: Schema.Types.Mixed, required: true },
  },
  { ...options, collection: 'flows' }
);

const SessionSchema = new Schema(
  {
    phoneNumber: { type: String, required: true },
    accountId: { type: String, required: true },
    data: { type: Schema.Types.Mixed, required: true },
    schedulerStatus: { type: String },
    waitingUntil: { type: Date },
    waitingKind: { type: String },
    waitingNodeId: { type: String },
    waitingNextNodeId: { type: String },
    leaseOwner: { type: String },
    leaseUntil: { type: Date },
    resumeAttempts: { type: Number },
  },
  { ...options, collection: 'sessions' }
);
SessionSchema.index({ accountId: 1, phoneNumber: 1 }, { unique: true });
SessionSchema.index(
  { schedulerStatus: 1, waitingUntil: 1, leaseUntil: 1 },
  { partialFilterExpression: { schedulerStatus: 'waiting' } }
);

const WhatsAppAccountSchema = new Schema(
  {
    accountId: { type: String, required: true, unique: true, index: true },
    phoneNumberId: { type: String, index: true },
    data: { type: Schema.Types.Mixed, required: true },
  },
  { ...options, collection: 'whatsapp_accounts' }
);

const ApiLogSchema = new Schema(
  {
    logId: { type: String, required: true, unique: true, index: true },
    timestamp: { type: String, index: true },
    data: { type: Schema.Types.Mixed, required: true },
  },
  { ...options, collection: 'api_logs' }
);

const XPagPaymentSchema = new Schema(
  {
    externalId: { type: String, required: true, unique: true, index: true },
    webhookKeyHash: { type: String, sparse: true, unique: true },
    sessionPhoneNumber: { type: String, index: true },
    status: { type: String, index: true },
    data: { type: Schema.Types.Mixed, required: true },
  },
  { ...options, collection: 'xpag_payments' }
);

export const ProjectConfig = mongoose.models.FluxoZapProjectConfig || mongoose.model('FluxoZapProjectConfig', ProjectConfigSchema);
export const FlowModel = mongoose.models.FluxoZapFlow || mongoose.model('FluxoZapFlow', FlowSchema);
export const SessionModel = mongoose.models.FluxoZapSession || mongoose.model('FluxoZapSession', SessionSchema);
export const WhatsAppAccountModel = mongoose.models.FluxoZapWhatsAppAccount || mongoose.model('FluxoZapWhatsAppAccount', WhatsAppAccountSchema);
export const ApiLogModel = mongoose.models.FluxoZapApiLog || mongoose.model('FluxoZapApiLog', ApiLogSchema);
export const XPagPaymentModel = mongoose.models.FluxoZapXPagPayment || mongoose.model('FluxoZapXPagPayment', XPagPaymentSchema);

export const FLUXOZAP_COLLECTIONS = [
  'project_configs',
  'flows',
  'sessions',
  'whatsapp_accounts',
  'api_logs',
  'xpag_payments',
];
