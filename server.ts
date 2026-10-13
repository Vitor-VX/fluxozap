import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import os from 'os';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { mongoService } from './src/services/mongodb';
import { r2StorageService } from './src/services/r2Storage';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Data directory for persistence
const DATA_DIR = path.resolve(__dirname, 'data');
const UPLOADS_DIR = path.resolve(__dirname, 'uploads');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const CONFIG_FILE = path.join(DATA_DIR, 'meta_config.json');
const FLOW_FILE = path.join(DATA_DIR, 'flow.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const LOGS_FILE = path.join(DATA_DIR, 'api_logs.json');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'whatsapp_accounts.json');
const XPAG_CONFIG_FILE = path.join(DATA_DIR, 'xpag_config.json');
const XPAG_PAYMENTS_FILE = path.join(DATA_DIR, 'xpag_payments.json');

// Interface for API Logs
interface ApiLogEntry {
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

// In-memory logs store (keeps last 200 entries)
let apiLogs: ApiLogEntry[] = [];
if (fs.existsSync(LOGS_FILE)) {
  try {
    apiLogs = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf-8'));
  } catch (err) {
    console.error('Error reading logs file:', err);
  }
}

function saveLogsToFile() {
  try {
    fs.writeFileSync(LOGS_FILE, JSON.stringify(apiLogs.slice(0, 200), null, 2));
  } catch (err) {
    console.error('Error saving logs:', err);
  }
}

function addApiLog(entry: Omit<ApiLogEntry, 'id' | 'timestamp'>): ApiLogEntry {
  const fullEntry: ApiLogEntry = {
    id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    ...entry,
  };
  apiLogs.unshift(fullEntry);
  if (apiLogs.length > 200) {
    apiLogs = apiLogs.slice(0, 200);
  }
  saveLogsToFile();

  if (mongoService.isConnected()) {
    mongoService.addLog(fullEntry).catch((err) => {
      console.error('[MongoDB Atlas] Error persisting log to FluxoZap:', err);
    });
  }

  return fullEntry;
}

// Diagnostic helper: analyzes Meta WhatsApp Cloud API errors and gives human-readable fix tips in Portuguese
function analyzeMetaError(status: number, data: any, recipient?: string): {
  code?: number;
  subcode?: number;
  message: string;
  type?: string;
  fbtrace_id?: string;
  tip: string;
} {
  const metaErr = data?.error || {};
  const code = metaErr.code;
  const subcode = metaErr.error_subcode;
  const message = metaErr.message || (typeof data === 'string' ? data : `HTTP ${status}`);
  const type = metaErr.type;
  const fbtrace_id = metaErr.fbtrace_id;

  let tip = 'Ocorreu um erro na API da Meta. Verifique o payload e a resposta completa abaixo.';

  if (code === 190) {
    tip =
      '🔑 Token de Acesso Inválido ou Expirado: Se você estiver usando um token de teste temporário da Meta Developers, ele expira a cada 24 horas. Para uso contínuo, gere um "Token de Usuário do Sistema" permanente no Meta Business Manager com a permissão "whatsapp_business_messaging".';
  } else if (code === 131037) {
    tip =
      '🏷️ Nome de Exibição Pendente de Aprovação (#131037): O número de telefone selecionado na Meta precisa ter o seu "Nome de Exibição" (Display Name) aprovado pela equipe da Meta antes de poder enviar mensagens ativas.\n\nComo resolver:\n1. Acesse o portal da Meta for Developers > WhatsApp > Configuração da API.\n2. Verifique se o seu número próprio está com o nome aprovado em "Gerenciador do WhatsApp" > "Contas do WhatsApp".\n3. Alternativamente, selecione o "Número de Teste" temporário fornecido gratuitamente pela Meta na caixa suspensa "De" (From) para testar imediatamente!';
  } else if (code === 131030) {
    tip =
      `📱 Número Não Autorizado no Modo Teste: Se o seu app na Meta Developers ainda está em "Modo de Desenvolvimento", a Meta BLOQUEIA envio para números que não foram cadastrados previamente. Como resolver: Acesse Meta for Developers > Seu Aplicativo > WhatsApp > Configuração da API > Localize o campo "Para" (To) e adicione o número ${recipient || 'de destino'} para receber o código de verificação por SMS/WhatsApp.`;
  } else if (code === 131047) {
    tip =
      '⏳ Janela de Atendimento Fechada (Customer Care Window): O período permitido pela Meta para mensagens livres (24h padrão ou 72h para anúncios do Facebook) expirou. A Meta exige envio de Template pré-aprovado ou que o cliente envie uma nova mensagem para reabrir a janela.';
  } else if (code === 100) {
    tip =
      '⚠️ Parâmetro Inválido: Verifique se o Phone Number ID está correto e se o número de telefone está com DDI e DDD (ex: 5511999999999 sem o sinal de + e sem traços). Se estiver enviando imagem ou PDF, certifique-se de que a URL é HTTPS pública e acessível sem autenticação.';
  } else if (code === 133010) {
    tip =
      '📞 Número Não Registrado no WhatsApp: O número de destino não possui uma conta de WhatsApp ativa.';
  } else if (code === 132000) {
    tip =
      '📄 Erro no Modelo de Mensagem ou Mídia: Os parâmetros de mídia enviados não foram aceitos pela Meta.';
  } else if (code === 131053) {
    tip =
      '🖼️ Falha no Download da Mídia (#131053): A Meta não conseguiu baixar o link informado. O FluxoZap agora evita esse problema enviando o arquivo diretamente para a biblioteca de mídia da Meta e usando o media_id retornado.';
  } else if (code === 130429) {
    tip =
      '⚡ Limite de Taxa (Rate Limit) Atingido: Foram feitos muitos disparos em pouco tempo para este número ou a conta excedeu o limite do tier da Meta.';
  } else if (status === 401 || status === 403) {
    tip =
      '🔒 Permissão Negada: Verifique se o seu Access Token possui a permissão "whatsapp_business_messaging" e acesso à conta WhatsApp Business correta.';
  } else if (status === 404) {
    tip =
      '🔍 Phone Number ID Inexistente: A Meta não encontrou o Phone Number ID informado. Verifique o ID no painel da Meta Developers > WhatsApp > Configuração da API.';
  }

  return { code, subcode, message, type, fbtrace_id, tip };
}

// Initial default configuration
let metaConfig = {
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
  displayPhoneNumber: process.env.WHATSAPP_DISPLAY_PHONE_NUMBER || '',
  accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
  wabaId: process.env.WHATSAPP_WABA_ID || '',
  verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || 'fluxozap_webhook_secret_2026',
  testPhoneNumber: '',
};

if (fs.existsSync(CONFIG_FILE)) {
  try {
    metaConfig = { ...metaConfig, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')) };
  } catch (err) {
    console.error('Error reading config file:', err);
  }
}

// Initial default flow
const defaultFlow = {
  id: 'flow_welcome',
  name: 'Fluxo de Atendimento e Apresentação',
  description: 'Boas-vindas automáticas, envio de imagem de apresentação, catálogo em PDF e coleta de dados.',
  triggerType: 'all', // 'all' | 'exact' | 'contains'
  triggerKeywords: ['Olá, quero saber mais informações', 'oi', 'menu'],
  updatedAt: new Date().toISOString(),
  nodes: [
    {
      id: 'node_start',
      type: 'start',
      position: { x: 100, y: 150 },
      data: {
        label: 'Gatilho de Início',
        type: 'start',
        triggerType: 'all',
        triggerKeywords: ['Olá, quero saber mais informações', 'oi', 'menu'],
        text: 'Qualquer mensagem recebida (ou mensagem específica configurada)',
      },
    },
    {
      id: 'node_welcome_msg',
      type: 'send_text',
      position: { x: 380, y: 150 },
      data: {
        label: 'Mensagem de Boas-Vindas',
        type: 'send_text',
        text: 'Olá! 👋 Seja muito bem-vindo ao nosso atendimento oficial no WhatsApp.\n\nComo posso chamar você?',
      },
    },
    {
      id: 'node_wait_name',
      type: 'wait_reply',
      position: { x: 680, y: 150 },
      data: {
        label: 'Aguardar Nome',
        type: 'wait_reply',
        variableName: 'nome',
        expectedType: 'text',
        placeholder: 'Aguardando o cliente digitar o nome...',
      },
    },
    {
      id: 'node_nice_meet',
      type: 'send_text',
      position: { x: 980, y: 150 },
      data: {
        label: 'Saudação Personalizada',
        type: 'send_text',
        text: 'Prazer em falar com você, *{{nome}}*! 😊\n\nVeja abaixo uma prévia das nossas soluções e o documento oficial que preparamos:',
      },
    },
    {
      id: 'node_send_img',
      type: 'send_image',
      position: { x: 1280, y: 150 },
      data: {
        label: 'Enviar Imagem',
        type: 'send_image',
        mediaUrl: 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=800&auto=format&fit=crop',
        caption: '🚀 Plataforma de Automação Inteligente para WhatsApp',
      },
    },
    {
      id: 'node_send_doc',
      type: 'send_document',
      position: { x: 1580, y: 150 },
      data: {
        label: 'Enviar Documento PDF',
        type: 'send_document',
        mediaUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
        filename: 'apresentacao_institucional.pdf',
        caption: '📄 Aqui está a apresentação completa em PDF.',
      },
    },
    {
      id: 'node_wait_interest',
      type: 'wait_reply',
      position: { x: 1880, y: 150 },
      data: {
        label: 'Aguardar Interesse',
        type: 'wait_reply',
        variableName: 'interesse',
        expectedType: 'text',
        placeholder: 'Você gostaria de falar com um especialista agora? (sim/não)',
      },
    },
    {
      id: 'node_final_msg',
      type: 'send_text',
      position: { x: 2180, y: 150 },
      data: {
        label: 'Mensagem de Encerramento',
        type: 'send_text',
        text: 'Perfeito, *{{nome}}*! Registramos seu interesse ({{interesse}}). Um de nossos consultores entrará em contato em instantes!',
      },
    },
  ],
  edges: [
    { id: 'e1', source: 'node_start', target: 'node_welcome_msg' },
    { id: 'e2', source: 'node_welcome_msg', target: 'node_wait_name' },
    { id: 'e3', source: 'node_wait_name', target: 'node_nice_meet' },
    { id: 'e4', source: 'node_nice_meet', target: 'node_send_img' },
    { id: 'e5', source: 'node_send_img', target: 'node_send_doc' },
    { id: 'e6', source: 'node_send_doc', target: 'node_wait_interest' },
    { id: 'e7', source: 'node_wait_interest', target: 'node_final_msg' },
  ],
};

function createEmptyAccountFlow(accountId: string, accountName: string) {
  const startNodeId = `node_start_${accountId}`;
  return {
    id: `flow_${accountId}`,
    name: `Fluxo 1 — ${accountName}`,
    description: `Funil exclusivo da linha ${accountName}`,
    triggerType: 'all',
    triggerKeywords: [],
    updatedAt: new Date().toISOString(),
    nodes: [
      {
        id: startNodeId,
        type: 'start',
        position: { x: 100, y: 150 },
        data: {
          label: 'Início do Fluxo 1',
          type: 'start',
          triggerType: 'all',
          triggerKeywords: [],
        },
      },
    ],
    edges: [],
  };
}

// Kept in memory only as a runtime cache. Flow definitions are loaded from and
// saved to MongoDB; flow.json is deliberately ignored.
let currentFlow: any = createEmptyAccountFlow('main', 'Principal');

interface WhatsAppAccount {
  id: string;
  name: string;
  phoneNumber: string;
  phoneNumberId: string;
  wabaId?: string;
  accessToken?: string;
  verifyToken?: string;
  isDefault?: boolean;
  color?: string;
  flow?: any;
  createdAt: string;
  updatedAt: string;
}

let whatsappAccounts: WhatsAppAccount[] = [];

if (fs.existsSync(ACCOUNTS_FILE)) {
  try {
    const savedAccounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf-8')) as WhatsAppAccount[];
    whatsappAccounts = savedAccounts.map(({ flow: _legacyLocalFlow, ...account }) => account);
  } catch (err) {
    console.error('Error reading accounts file:', err);
  }
}

// Remove the legacy demo line. A WhatsApp line only exists after Meta returns the
// real display_phone_number for the configured Phone Number ID.
const legacyDemoAccountIds = new Set(['acc_default']);
const originalAccountsLength = whatsappAccounts.length;
whatsappAccounts = whatsappAccounts.filter((account) => {
  const hasDemoPhone = account.phoneNumber === '+55 11 98765-4321';
  const hasDemoPhoneId = account.phoneNumberId === '10394857281920';
  return !(legacyDemoAccountIds.has(account.id) && (hasDemoPhone || hasDemoPhoneId));
});

function ensureExclusiveAccountFlows(accounts: WhatsAppAccount[]): boolean {
  let migrated = false;
  for (const account of accounts) {
    const expectedFlowId = `flow_${account.id}`;
    if (!account.flow) {
      account.flow = createEmptyAccountFlow(account.id, account.name);
      migrated = true;
    } else if (account.flow.id !== expectedFlowId) {
      account.flow = { ...account.flow, id: expectedFlowId, updatedAt: new Date().toISOString() };
      migrated = true;
    }
  }
  return migrated;
}

let accountFlowsMigrated = ensureExclusiveAccountFlows(whatsappAccounts);

function syncPrimaryAccountFromMeta(displayPhoneNumber?: string): WhatsAppAccount | null {
  const realPhoneNumber = (displayPhoneNumber || metaConfig.displayPhoneNumber || '').trim();
  const phoneNumberId = (metaConfig.phoneNumberId || '').trim();
  if (!realPhoneNumber || !phoneNumberId) return null;

  const now = new Date().toISOString();
  let account = whatsappAccounts.find((item) => item.id === 'acc_meta_primary');
  if (!account) {
    whatsappAccounts.forEach((item) => (item.isDefault = false));
    account = {
      id: 'acc_meta_primary',
      name: 'Linha Principal Meta',
      phoneNumber: realPhoneNumber,
      phoneNumberId,
      wabaId: metaConfig.wabaId || '',
      accessToken: metaConfig.accessToken || '',
      verifyToken: metaConfig.verifyToken,
      isDefault: true,
      color: 'emerald',
      flow: createEmptyAccountFlow('acc_meta_primary', 'Linha Principal Meta'),
      createdAt: now,
      updatedAt: now,
    };
    whatsappAccounts.unshift(account);
  } else {
    whatsappAccounts.forEach((item) => {
      if (item.id !== account!.id) item.isDefault = false;
    });
    account.phoneNumber = realPhoneNumber;
    account.phoneNumberId = phoneNumberId;
    account.wabaId = metaConfig.wabaId || '';
    account.accessToken = metaConfig.accessToken || '';
    account.verifyToken = metaConfig.verifyToken;
    account.isDefault = true;
    account.updatedAt = now;
  }
  return account;
}

if (metaConfig.displayPhoneNumber && metaConfig.phoneNumberId) {
  syncPrimaryAccountFromMeta();
}

function saveAccountsToFile() {
  try {
    // Never persist funnels inside the local account JSON. Their only durable
    // source is MongoDB's `flows` collection.
    const accountsWithoutFlows = whatsappAccounts.map(({ flow: _flow, ...account }) => account);
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accountsWithoutFlows, null, 2));
  } catch (err) {
    console.error('Error saving accounts file:', err);
  }
  if (mongoService.isConnected()) {
    mongoService.saveAccounts(whatsappAccounts).catch((err) => {
      console.error('[MongoDB Atlas] Error saving WhatsApp accounts:', err);
    });
  }
}

if (originalAccountsLength !== whatsappAccounts.length || metaConfig.displayPhoneNumber || accountFlowsMigrated) {
  saveAccountsToFile();
}

interface XPagConfig {
  clientId: string;
  clientSecret: string;
  enabled: boolean;
  environment: 'sandbox' | 'production';
  baseUrl: string;
}

type XPagPaymentMethod = 'PIX' | 'SPEI' | 'OXXO';
type XPagCurrency = 'BRL' | 'MXN';

interface XPagPaymentRecord {
  externalId: string;
  transactionId?: string;
  requestNumber?: string;
  e2e?: string;
  expiresAt?: string;
  paidAt?: string;
  method: XPagPaymentMethod;
  amount: number;
  currency: XPagCurrency;
  chargeMode?: 'dynamic' | 'open';
  receivedE2es?: string[];
  status: string;
  sessionPhoneNumber: string;
  nodeId: string;
  accountId?: string;
  isLiveWhatsApp: boolean;
  webhookKeyHash: string;
  payer: {
    name: string;
    phoneNumber: string;
    email?: string;
    document?: string;
  };
  response: any;
  createdAt: string;
  updatedAt: string;
}

let xpagConfig: XPagConfig = {
  clientId: process.env.XPAG_CLIENT_ID || '',
  clientSecret: process.env.XPAG_CLIENT_SECRET || '',
  enabled: process.env.XPAG_ENABLED === 'true',
  environment: process.env.XPAG_ENVIRONMENT === 'sandbox' ? 'sandbox' : 'production',
  baseUrl: process.env.XPAG_BASE_URL || 'https://api.xpag.global',
};

if (fs.existsSync(XPAG_CONFIG_FILE)) {
  try {
    xpagConfig = { ...xpagConfig, ...JSON.parse(fs.readFileSync(XPAG_CONFIG_FILE, 'utf-8')) };
  } catch (err) {
    console.error('Error reading XPag config file:', err);
  }
}
delete (xpagConfig as any).webhookSecret;

const xpagPayments = new Map<string, XPagPaymentRecord>();
if (fs.existsSync(XPAG_PAYMENTS_FILE)) {
  try {
    const savedPayments = JSON.parse(fs.readFileSync(XPAG_PAYMENTS_FILE, 'utf-8'));
    for (const payment of Array.isArray(savedPayments) ? savedPayments : []) {
      if (payment?.externalId) xpagPayments.set(payment.externalId, payment);
    }
  } catch (err) {
    console.error('Error reading XPag payments file:', err);
  }
}

function saveXPagConfig() {
  fs.writeFileSync(XPAG_CONFIG_FILE, JSON.stringify(xpagConfig, null, 2));
  if (mongoService.isConnected()) {
    mongoService.saveXPagConfig(xpagConfig).catch((err) => {
      console.error('[MongoDB Atlas] Error saving XPag config:', err);
    });
  }
}

function saveXPagPayments() {
  const payments = Array.from(xpagPayments.values());
  fs.writeFileSync(XPAG_PAYMENTS_FILE, JSON.stringify(payments, null, 2));
  if (mongoService.isConnected()) {
    Promise.all(payments.map((payment) => mongoService.saveXPagPayment(payment))).catch((err) => {
      console.error('[MongoDB Atlas] Error saving XPag payments:', err);
    });
  }
}

if (!fs.existsSync(XPAG_CONFIG_FILE)) {
  saveXPagConfig();
}

// User sessions by phone number
interface SessionData {
  phoneNumber: string;
  name?: string;
  accountId?: string;
  accountPhoneNumberId?: string;
  activeFlowId: string;
  currentNodeId: string | null;
  waitingForInput: boolean;
  waitingVariableName?: string;
  waitingForPayment?: boolean;
  waitingPaymentExternalId?: string;
  waitingPaymentNodeId?: string;
  waitingUntil?: string;
  waitingNodeId?: string;
  waitingNextNodeId?: string;
  waitingKind?: 'delay' | 'reply_timeout' | 'node_delay';
  waitingIsLiveWhatsApp?: boolean;
  executionCheckpointVersion?: number;
  variables: Record<string, string>;
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
  createdAt: string;
}

const sessions: Map<string, SessionData> = new Map();

function sessionStorageKey(accountId: string | undefined, phoneNumber: string): string {
  return `${accountId || 'unassigned'}::${phoneNumber}`;
}

function saveSessionsToFile() {
  try {
    const obj = Object.fromEntries(sessions);
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(obj, null, 2));
  } catch (err) {
    console.error('Error saving sessions:', err);
  }
}

if (fs.existsSync(SESSIONS_FILE)) {
  try {
    const saved = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8'));
    for (const val of Object.values(saved)) {
      const session = val as SessionData;
      sessions.set(sessionStorageKey(session.accountId, session.phoneNumber), session);
    }
  } catch (err) {
    console.error('Error loading sessions:', err);
  }
}

function persistSession(session: SessionData) {
  saveSessionsToFile();
  if (mongoService.isConnected()) {
    mongoService.saveSession(session).catch((err) => {
      console.error('[MongoDB Atlas] Error saving session to FluxoZap:', err);
    });
  }
}

function getDefaultSessionVariables(session: Pick<SessionData, 'phoneNumber' | 'name'>): Record<string, string> {
  const now = new Date();
  const timeZone = process.env.APP_TIME_ZONE || 'America/Cuiaba';
  const resolvedName = session.name?.trim() || 'Cliente WhatsApp';
  const contactPhone = session.phoneNumber === 'simulator_user'
    ? '+55 11 99999-0000'
    : session.phoneNumber;
  const date = new Intl.DateTimeFormat('pt-BR', { timeZone }).format(now);
  const time = new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(now);
  const weekday = new Intl.DateTimeFormat('pt-BR', { timeZone, weekday: 'long' }).format(now);
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || '';
  return {
    nome: resolvedName,
    whatsapp_nome: resolvedName,
    telefone: contactPhone,
    phone: contactPhone,
    numero_whatsapp: contactPhone,
    data: date,
    data_atual: date,
    hora: time,
    hora_atual: time,
    data_hora: `${date} ${time}`,
    dia: part('day'),
    mes: part('month'),
    ano: part('year'),
    dia_semana: weekday,
    timestamp: now.toISOString(),
  };
}

function refreshDefaultSessionVariables(session: SessionData): SessionData {
  const existing = session.variables || {};
  session.variables = { ...existing, ...getDefaultSessionVariables(session) };
  const resolvedName = session.name?.trim() || existing.nome?.trim() || 'Cliente WhatsApp';
  session.variables.nome = resolvedName;
  session.variables.whatsapp_nome = resolvedName;
  return session;
}

// Update 24h/72h window status based on current time
function updateWindowState(session: SessionData): SessionData {
  if (session.windowExpiresAt) {
    const expires = new Date(session.windowExpiresAt).getTime();
    session.isWindowOpen = Date.now() < expires;
  } else {
    session.isWindowOpen = false;
  }
  return session;
}

function getOrCreateSession(phoneNumber: string, accountId?: string): SessionData {
  const now = new Date();
  const acc = accountId
    ? whatsappAccounts.find((a) => a.id === accountId)
    : whatsappAccounts.find((a) => a.isDefault) || whatsappAccounts[0];
  const resolvedAccountId = acc?.id || accountId || 'unassigned';
  const storageKey = sessionStorageKey(resolvedAccountId, phoneNumber);
  let session = sessions.get(storageKey);
  if (!session) {
    const windowExpires = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const autoDelete = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    session = {
      phoneNumber,
      accountId: resolvedAccountId,
      accountPhoneNumberId: acc?.phoneNumberId || metaConfig.phoneNumberId,
      activeFlowId: acc?.flow?.id || currentFlow.id,
      currentNodeId: null,
      waitingForInput: false,
      variables: getDefaultSessionVariables({ phoneNumber }),
      history: [],
      lastCustomerMessageAt: now.toISOString(),
      windowExpiresAt: windowExpires.toISOString(),
      windowType: '24h_standard',
      isWindowOpen: true,
      botPaused: false,
      flowCompleted: false,
      autoDeleteDays: 7,
      autoDeleteAt: autoDelete.toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    sessions.set(storageKey, session);
    persistSession(session);
  } else {
    if (acc?.flow?.id) session.activeFlowId = acc.flow.id;
    updateWindowState(session);
  }
  refreshDefaultSessionVariables(session);
  return session;
}

// Periodic cleanup of expired conversations (7 days rule)
function cleanupExpiredSessions() {
  const now = Date.now();
  let deletedCount = 0;
  for (const [storageKey, s] of sessions.entries()) {
    if (s.phoneNumber === 'simulator_user') continue;
    const days = s.autoDeleteDays || 7;
    const lastActive = new Date(s.updatedAt).getTime();
    if (now - lastActive > days * 24 * 60 * 60 * 1000) {
      sessions.delete(storageKey);
      if (mongoService.isConnected()) {
        mongoService.deleteSession(s.accountId || 'unassigned', s.phoneNumber).catch(console.error);
      }
      deletedCount++;
    }
  }
  if (deletedCount > 0) {
    saveSessionsToFile();
    console.log(`[Auto-Delete Cleanup] ${deletedCount} conversas expiradas foram removidas.`);
  }
}

// Run cleanup check every hour
setInterval(cleanupExpiredSessions, 60 * 60 * 1000);

// Replace template variables like {{name}} with collected values
function replaceVariables(text: string, variables: Record<string, string>): string {
  if (!text) return '';
  return text.replace(/\{\{\s*([\w_]+)\s*\}\}/g, (_, key) => {
    return variables[key] !== undefined ? variables[key] : `{{${key}}}`;
  });
}

type DurableWaitUnit = 'seconds' | 'minutes' | 'hours' | 'days' | 'months';

function addDurableWait(from: Date, rawValue: any, rawUnit: any): Date {
  const value = Math.max(1, Number(rawValue) || 1);
  const unit: DurableWaitUnit = ['seconds', 'minutes', 'hours', 'days', 'months'].includes(rawUnit)
    ? rawUnit
    : 'seconds';
  const result = new Date(from);
  if (unit === 'months') {
    result.setUTCMonth(result.getUTCMonth() + value);
    return result;
  }
  const multiplier = unit === 'days' ? 86_400_000
    : unit === 'hours' ? 3_600_000
      : unit === 'minutes' ? 60_000
        : 1_000;
  return new Date(result.getTime() + value * multiplier);
}

function clearDurableWait(session: SessionData) {
  session.waitingUntil = undefined;
  session.waitingNodeId = undefined;
  session.waitingNextNodeId = undefined;
  session.waitingKind = undefined;
  session.waitingIsLiveWhatsApp = undefined;
}

function scheduleNextNodeDelay(
  session: SessionData,
  node: any,
  nextNodeId: string,
  isLiveWhatsApp: boolean
): boolean {
  if (!node?.data?.nextDelayEnabled || !nextNodeId) return false;
  const dueAt = addDurableWait(
    new Date(),
    node.data.nextDelayValue || 1,
    node.data.nextDelayUnit || 'seconds'
  );
  session.waitingUntil = dueAt.toISOString();
  session.waitingNodeId = node.id;
  session.waitingNextNodeId = nextNodeId;
  session.waitingKind = 'node_delay';
  session.waitingIsLiveWhatsApp = isLiveWhatsApp;
  session.currentNodeId = nextNodeId;
  session.flowCompleted = false;
  session.executionCheckpointVersion = 1;
  session.updatedAt = new Date().toISOString();
  session.history.push({
    id: `node_delay_${Date.now()}`,
    sender: 'system',
    type: 'info',
    content: `Próximo bloco agendado para ${dueAt.toLocaleString('pt-BR')}.`,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  });
  persistSession(session);
  return true;
}

function scheduleDurableWait(
  session: SessionData,
  node: any,
  kind: 'delay' | 'reply_timeout',
  isLiveWhatsApp: boolean
) {
  let dueAt: Date;
  if (kind === 'delay' && node.data.delayMode === 'until') {
    dueAt = new Date(node.data.delayUntil || '');
    if (Number.isNaN(dueAt.getTime())) {
      throw new Error('Defina uma data e hora válidas no bloco Aguardar Tempo.');
    }
  } else if (kind === 'delay') {
    dueAt = addDurableWait(
      new Date(),
      node.data.delayValue ?? node.data.delaySeconds ?? 2,
      node.data.delayUnit || 'seconds'
    );
  } else {
    dueAt = addDurableWait(
      new Date(),
      node.data.waitReplyTimeoutValue || 15,
      node.data.waitReplyTimeoutUnit || 'minutes'
    );
  }
  session.waitingUntil = dueAt.toISOString();
  session.waitingNodeId = node.id;
  session.waitingKind = kind;
  session.waitingIsLiveWhatsApp = isLiveWhatsApp;
  session.executionCheckpointVersion = 1;
  session.updatedAt = new Date().toISOString();
}

let lastKnownPublicOrigin = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');

function xpagWebhookUrl(webhookKey = '{chave-unica-da-cobranca}'): string {
  if (!lastKnownPublicOrigin) return '';
  return `${lastKnownPublicOrigin}/api/webhooks/xpag/${webhookKey}`;
}

async function xpagRequest(pathname: string, init: RequestInit = {}): Promise<any> {
  if (!xpagConfig.clientId || !xpagConfig.clientSecret) {
    const error: any = new Error('Credenciais da XPag não configuradas. Informe Client ID e Client Secret.');
    error.status = 400;
    error.errorCode = 'missing_credentials';
    throw error;
  }

  const response = await fetch(`${xpagConfig.baseUrl.replace(/\/$/, '')}${pathname}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Client-Id': xpagConfig.clientId,
      'X-Client-Secret': xpagConfig.clientSecret,
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(20000),
  });
  const rawText = await response.text();
  let data: any;
  try {
    data = JSON.parse(rawText);
  } catch {
    data = { ok: false, error: rawText || `HTTP ${response.status}` };
  }

  if (!response.ok || data?.ok === false) {
    const error: any = new Error(data?.error || `XPag respondeu HTTP ${response.status}.`);
    error.status = response.status;
    error.errorCode = data?.error_code;
    error.responseBody = data;
    throw error;
  }
  return data;
}

function parsePaymentAmount(value: string): number {
  const normalized = String(value || '').trim().replace(/\s/g, '').replace(',', '.');
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`Valor da cobrança inválido: "${value || ''}".`);
  }
  return Math.round(amount * 100) / 100;
}

function firstXPagValue(...values: any[]): string {
  const value = values.find((item) => item !== undefined && item !== null && String(item).trim() !== '');
  return value === undefined ? '' : String(value);
}

function normalizeXPagDate(value: any): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function getXPagVariablePrefix(node: any): string {
  return String(node?.data?.xpagVariablePrefix || 'xpag')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .replace(/^\d+/, '') || 'xpag';
}

function buildXPagVariables(record: XPagPaymentRecord, response: any = record.response, error?: any): Record<string, string> {
  const data = response?.data || response?.payment || response || {};
  const payee = data?.payee_data || data?.payeeData || {};
  const pixCopyPaste = firstXPagValue(
    data.copyPaste, data.copy_paste, data.pix_copy_paste, data.pix_code, data.brcode, data.br_code, data.qr
  );
  const qrCodeUrl = firstXPagValue(data.qr_url, data.qr_img, data.qrCodeUrl, data.qr_code_url, data.qrcode_url, payee.qr_url);
  const reference = firstXPagValue(payee.reference, data.reference, data.payment_reference, data.voucher_reference);
  const expiresAt = normalizeXPagDate(firstXPagValue(
    record.expiresAt, data.expires_at, data.expiresAt, data.expiration_date, data.expirationDate,
    payee.expires_at, payee.expiration_date
  ));
  const errorBody = error?.responseBody || error || {};

  return {
    status: firstXPagValue(record.status, data.status),
    payment_status: firstXPagValue(record.status, data.status),
    amount: record.amount > 0 ? String(record.amount) : firstXPagValue(data.amount),
    currency: record.currency,
    method: record.method,
    charge_mode: record.chargeMode || 'dynamic',
    open_value: record.chargeMode === 'open' ? 'true' : 'false',
    provider: firstXPagValue(data.provider),
    fee: firstXPagValue(data.fee),
    external_id: record.externalId,
    transaction_id: firstXPagValue(record.transactionId, data.transaction_id, data.transactionId),
    request_number: firstXPagValue(record.requestNumber, data.request_number, data.requestNumber),
    pix_copy_paste: pixCopyPaste,
    qr_code_url: qrCodeUrl,
    clabe: firstXPagValue(data.clabe, payee.clabe, data.account_number),
    bank: firstXPagValue(data.bank_name, data.bank, payee.bank_name, payee.bank),
    beneficiary: firstXPagValue(data.beneficiary, data.beneficiary_name, payee.beneficiary, payee.name),
    reference,
    oxxo_reference: record.method === 'OXXO' ? reference : '',
    oxxo_barcode: firstXPagValue(payee.barcode, payee.barcode_url, data.barcode, data.barcode_url),
    checkout_url: firstXPagValue(data.checkout_url, data.checkoutUrl),
    deposit_address: firstXPagValue(data.deposit_address, data.depositAddress),
    transfer_type: firstXPagValue(data.transfer_type, data.transferType),
    expire_minutes: firstXPagValue(data.expire_minutes, data.expireMinutes),
    expires_at: expiresAt,
    paid_at: firstXPagValue(record.paidAt, data.paid_at, data.confirmed_at),
    e2e: firstXPagValue(record.e2e, data.e2e),
    account_id: record.accountId || '',
    error: firstXPagValue(error?.message, errorBody.error, errorBody.message),
    error_code: firstXPagValue(error?.errorCode, errorBody.error_code, errorBody.code),
    raw_response: JSON.stringify(response || {}),
  };
}

function saveXPagVariables(session: SessionData, node: any, record: XPagPaymentRecord, response?: any, error?: any) {
  const values = buildXPagVariables(record, response, error);
  const prefix = getXPagVariablePrefix(node);
  for (const [suffix, value] of Object.entries(values)) {
    session.variables[`xpag_${suffix}`] = value;
    if (prefix !== 'xpag') session.variables[`${prefix}_${suffix}`] = value;
  }
}

async function createXPagCharge(
  session: SessionData,
  node: any,
  isLiveWhatsApp: boolean
): Promise<{ record: XPagPaymentRecord }> {
  if (!xpagConfig.enabled) {
    throw new Error('A integração XPag está desativada. Ative-a em Pagamentos XPag.');
  }
  refreshDefaultSessionVariables(session);
  const webhookKey = crypto.randomBytes(32).toString('hex');
  const webhookKeyHash = crypto.createHash('sha256').update(webhookKey).digest('hex');
  const webhookUrl = xpagWebhookUrl(webhookKey);
  if (!webhookUrl || /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(webhookUrl)) {
    throw new Error('A XPag precisa de uma URL pública para o webhook. Acesse o FluxoZap pela URL HTTPS pública antes de iniciar o funil.');
  }

  const method: XPagPaymentMethod = ['PIX', 'SPEI', 'OXXO'].includes(node.data.xpagMethod)
    ? node.data.xpagMethod
    : 'PIX';
  const currency: XPagCurrency = method === 'PIX' ? 'BRL' : 'MXN';
  const chargeMode: 'dynamic' | 'open' = method === 'SPEI' && node.data.xpagSpeiMode === 'open'
    ? 'open'
    : 'dynamic';
  const amountText = replaceVariables(node.data.xpagAmount || '', session.variables);
  const amount = chargeMode === 'open' ? 0 : parsePaymentAmount(amountText);
  if (method === 'OXXO' && (amount < 10 || amount > 10000)) {
    throw new Error('OXXO aceita cobranças entre 10 e 10.000 MXN.');
  }

  const contactReference = crypto.createHash('sha256').update(session.phoneNumber).digest('hex').slice(0, 10);
  const accountReference = crypto.createHash('sha256').update(session.accountId || 'unassigned').digest('hex').slice(0, 8);
  const externalId = `FZ-${Date.now()}-${accountReference}-${contactReference}-${crypto.randomBytes(4).toString('hex')}`;
  const payerName = replaceVariables(node.data.xpagPayerName || '', session.variables)
    .replace(/\{\{[^}]+\}\}/g, '')
    .trim();
  const payerEmail = replaceVariables(node.data.xpagPayerEmail || '', session.variables)
    .replace(/\{\{[^}]+\}\}/g, '')
    .trim();
  const payerDocument = replaceVariables(node.data.xpagPayerDocument || '', session.variables)
    .replace(/\{\{[^}]+\}\}/g, '')
    .trim();
  const normalizedDocument = method === 'PIX' ? payerDocument.replace(/\D/g, '') : payerDocument;
  const description = replaceVariables(node.data.xpagDescription || '', session.variables)
    .replace(/\{\{[^}]+\}\}/g, '')
    .trim();

  const payload: any = {
    external_id: externalId,
    webhook_url: webhookUrl,
  };
  if (chargeMode === 'dynamic') payload.amount = amount;
  if (method === 'PIX') {
    if (payerName) payload.name = payerName;
    if (payerEmail) payload.email = payerEmail;
    if (normalizedDocument) payload.document = normalizedDocument;
    if (description) payload.description = description;
  } else if (method === 'OXXO') {
    payload.currency = 'MXN';
    payload.method = 'OXXO';
    payload.generateCheckout = false;
    if (payerName || payerEmail) {
      payload.payerData = {};
      if (payerName) payload.payerData.name = payerName;
      if (payerEmail) payload.payerData.email = payerEmail;
    }
  } else {
    payload.currency = 'MXN';
    if (description) payload.description = description;
    if (payerName) payload.name = payerName;
    if (normalizedDocument) payload.document = normalizedDocument;
  }

  const now = new Date().toISOString();
  const record: XPagPaymentRecord = {
    externalId,
    method,
    amount,
    currency,
    chargeMode,
    receivedE2es: [],
    status: 'creating',
    sessionPhoneNumber: session.phoneNumber,
    nodeId: node.id,
    accountId: session.accountId,
    isLiveWhatsApp,
    webhookKeyHash,
    payer: {
      name: payerName || session.phoneNumber,
      phoneNumber: session.phoneNumber,
      email: payerEmail || undefined,
      document: normalizedDocument || undefined,
    },
    response: {},
    createdAt: now,
    updatedAt: now,
  };
  xpagPayments.set(externalId, record);
  saveXPagPayments();

  let data: any;
  try {
    data = await xpagRequest('/cashin', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const chargeData = data?.data || data?.payment || data;
    record.transactionId = firstXPagValue(chargeData?.transaction_id, chargeData?.transactionId) || undefined;
    record.requestNumber = firstXPagValue(chargeData?.request_number, chargeData?.requestNumber) || undefined;
    record.status = firstXPagValue(chargeData?.status, data?.status) || 'pending';
    record.response = data;
    const apiExpiresAt = normalizeXPagDate(firstXPagValue(
      chargeData?.expires_at, chargeData?.expiresAt, chargeData?.expiration_date, chargeData?.expirationDate,
      chargeData?.payee_data?.expires_at, chargeData?.payee_data?.expiration_date
    ));
    const apiExpirationMinutes = Number(chargeData?.expire_minutes || chargeData?.expireMinutes || 0);
    const localExpirationMinutes = chargeMode === 'open'
      ? 0
      : Number(node.data.xpagExpirationMinutes || (method === 'SPEI' ? 24 * 60 : 0));
    const expirationMinutes = apiExpirationMinutes > 0 ? apiExpirationMinutes : localExpirationMinutes;
    record.expiresAt = apiExpiresAt || (expirationMinutes > 0
      ? new Date(Date.now() + expirationMinutes * 60 * 1000).toISOString()
      : undefined);
    record.updatedAt = new Date().toISOString();
    saveXPagPayments();
  } catch (err: any) {
    record.status = 'failed';
    record.response = err.responseBody || { error: err.message, errorCode: err.errorCode };
    record.updatedAt = new Date().toISOString();
    saveXPagPayments();
    err.paymentRecord = record;
    throw err;
  }

  return { record };
}

const MAX_MEDIA_BYTES = 100 * 1024 * 1024;

interface MetaAccountCredentials {
  id?: string;
  name?: string;
  phoneNumberId?: string;
  accessToken?: string;
}

interface OutgoingMediaPayload {
  text?: string;
  mediaId?: string;
  mediaUrl?: string;
  mimeType?: string;
  caption?: string;
  filename?: string;
  voice?: boolean;
}

const MAX_META_AUDIO_BYTES = 16 * 1024 * 1024;
const convertedVoiceMediaIds = new Map<string, string>();

async function convertAudioToWhatsAppVoice(
  buffer: Buffer,
  filename: string
): Promise<{ buffer: Buffer; filename: string; mimeType: string }> {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'fluxozap-voice-'));
  const extension = path.extname(filename).replace(/[^a-zA-Z0-9.]/g, '') || '.audio';
  const inputPath = path.join(tempDirectory, `input${extension}`);
  const outputPath = path.join(tempDirectory, 'voice.ogg');
  fs.writeFileSync(inputPath, buffer);

  try {
    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-y',
        '-i', inputPath,
        '-vn', '-ac', '1',
        '-c:a', 'libopus', '-b:a', '32k', '-application', 'voip',
        outputPath,
      ], { windowsHide: true });
      let diagnostic = '';
      ffmpeg.stderr.on('data', (chunk) => {
        if (diagnostic.length < 4000) diagnostic += String(chunk);
      });
      ffmpeg.once('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') {
          reject(new Error('FFmpeg não foi encontrado. Instale o FFmpeg para converter áudios em mensagem de voz.'));
        } else {
          reject(error);
        }
      });
      ffmpeg.once('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Não foi possível converter o áudio para OGG/Opus${diagnostic ? `: ${diagnostic.trim()}` : '.'}`));
      });
    });

    const converted = fs.readFileSync(outputPath);
    if (!converted.length) throw new Error('A conversão do áudio gerou um arquivo vazio.');
    if (converted.length > MAX_META_AUDIO_BYTES) {
      throw new Error('A mensagem de voz convertida excede o limite de 16 MB da Meta.');
    }
    return {
      buffer: converted,
      filename: `${path.basename(filename, path.extname(filename)) || 'audio'}.ogg`,
      mimeType: 'audio/ogg; codecs=opus',
    };
  } finally {
    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    if (fs.existsSync(tempDirectory)) fs.rmdirSync(tempDirectory);
  }
}

async function downloadMetaMedia(
  mediaId: string,
  credentials: MetaAccountCredentials
): Promise<{ buffer: Buffer; filename: string; mimeType: string }> {
  if (!credentials.accessToken) throw new Error('Access Token ausente para recuperar o áudio antigo da Meta.');
  const metadataResponse = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(mediaId)}`, {
    headers: { Authorization: `Bearer ${credentials.accessToken}` },
  });
  const metadataText = await metadataResponse.text();
  let metadata: any = {};
  try { metadata = JSON.parse(metadataText); } catch { metadata = {}; }
  if (!metadataResponse.ok || !metadata.url) {
    throw new Error(metadata?.error?.message || 'Não foi possível recuperar o áudio antigo na Meta. Reenvie o arquivo no bloco.');
  }

  const mediaResponse = await fetch(metadata.url, {
    headers: { Authorization: `Bearer ${credentials.accessToken}` },
  });
  if (!mediaResponse.ok) {
    throw new Error(`Não foi possível baixar o áudio antigo da Meta (HTTP ${mediaResponse.status}). Reenvie o arquivo no bloco.`);
  }
  return {
    buffer: await responseBufferWithLimit(mediaResponse),
    filename: `audio_${mediaId}.audio`,
    mimeType: String(metadata.mime_type || mediaResponse.headers.get('content-type') || 'application/octet-stream'),
  };
}

function inferMimeType(filename: string, fallback = 'application/octet-stream'): string {
  const extension = path.extname(filename).toLowerCase();
  const types: Record<string, string> = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
    '.gif': 'image/gif', '.pdf': 'application/pdf', '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.csv': 'text/csv', '.txt': 'text/plain', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
    '.opus': 'audio/ogg', '.m4a': 'audio/mp4', '.mp4': 'video/mp4', '.mov': 'video/quicktime',
  };
  return types[extension] || fallback;
}

async function responseBufferWithLimit(response: globalThis.Response, limitBytes = MAX_MEDIA_BYTES): Promise<Buffer> {
  const declaredSize = Number(response.headers.get('content-length') || 0);
  if (declaredSize > limitBytes) throw new Error('O arquivo excede o limite máximo de 100 MB.');
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limitBytes) {
      await reader.cancel();
      throw new Error('O arquivo excede o limite máximo de 100 MB.');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
}

async function uploadBufferToMeta(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  credentials: MetaAccountCredentials
): Promise<{ id: string; response: any }> {
  if (!credentials.phoneNumberId || !credentials.accessToken) {
    throw new Error('A linha selecionada não possui Phone Number ID e Access Token completos.');
  }
  if (!buffer.length) throw new Error('O arquivo selecionado está vazio.');
  if (buffer.length > MAX_MEDIA_BYTES) throw new Error('O arquivo excede o limite máximo de 100 MB.');

  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('file', new Blob([new Uint8Array(buffer)], { type: mimeType }), filename);
  const endpoint = `https://graph.facebook.com/v21.0/${credentials.phoneNumberId}/media`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${credentials.accessToken}` },
    body: form,
  });
  const raw = await response.text();
  let data: any;
  try { data = JSON.parse(raw); } catch { data = { rawResponse: raw }; }
  if (!response.ok || !data?.id) {
    const error: any = new Error(data?.error?.message || `A Meta recusou o upload da mídia (HTTP ${response.status}).`);
    error.status = response.status;
    error.responseBody = data;
    throw error;
  }
  return { id: String(data.id), response: data };
}

async function resolveOutgoingMediaId(
  payload: OutgoingMediaPayload,
  credentials: MetaAccountCredentials
): Promise<string> {
  if (payload.mediaId) {
    const isOpusVoice = /audio\/ogg/i.test(payload.mimeType || '') && /opus/i.test(payload.mimeType || '');
    if (!payload.voice || isOpusVoice) return payload.mediaId;

    const cacheKey = `${credentials.phoneNumberId || ''}:${payload.mediaId}`;
    const cachedMediaId = convertedVoiceMediaIds.get(cacheKey);
    if (cachedMediaId) return cachedMediaId;

    const original = await downloadMetaMedia(payload.mediaId, credentials);
    const voice = await convertAudioToWhatsAppVoice(original.buffer, original.filename);
    const uploaded = await uploadBufferToMeta(voice.buffer, voice.filename, voice.mimeType, credentials);
    convertedVoiceMediaIds.set(cacheKey, uploaded.id);
    return uploaded.id;
  }
  if (!payload.mediaUrl) throw new Error('Nenhum arquivo ou URL de mídia foi informado.');

  let buffer: Buffer;
  let filename = payload.filename || 'arquivo';
  let mimeType = payload.mimeType || '';
  if (payload.mediaUrl.startsWith('/uploads/')) {
    const safeFilename = path.basename(payload.mediaUrl);
    const localPath = path.resolve(UPLOADS_DIR, safeFilename);
    if (!localPath.startsWith(`${UPLOADS_DIR}${path.sep}`) || !fs.existsSync(localPath)) {
      throw new Error('O arquivo local informado não foi encontrado.');
    }
    const stat = fs.statSync(localPath);
    if (stat.size > MAX_MEDIA_BYTES) throw new Error('O arquivo excede o limite máximo de 100 MB.');
    buffer = fs.readFileSync(localPath);
    filename = payload.filename || safeFilename;
  } else if (/^https?:\/\//i.test(payload.mediaUrl)) {
    const legacyR2File = await r2StorageService.readExistingFile(payload.mediaUrl);
    if (legacyR2File) {
      buffer = legacyR2File.buffer;
      mimeType = mimeType || legacyR2File.mimeType;
      filename = payload.filename || legacyR2File.filename;
    } else {
      const response = await fetch(payload.mediaUrl);
      if (!response.ok) throw new Error(`Não foi possível baixar a mídia informada (HTTP ${response.status}).`);
      buffer = await responseBufferWithLimit(response);
      mimeType = mimeType || response.headers.get('content-type')?.split(';')[0] || '';
      if (!payload.filename) {
        try { filename = path.basename(new URL(payload.mediaUrl).pathname) || filename; } catch { /* keep fallback */ }
      }
    }
  } else {
    throw new Error('A URL de mídia precisa ser HTTPS ou um arquivo enviado pelo sistema.');
  }

  mimeType = mimeType || inferMimeType(filename);
  if (payload.voice) {
    const voice = await convertAudioToWhatsAppVoice(buffer, filename);
    buffer = voice.buffer;
    filename = voice.filename;
    mimeType = voice.mimeType;
  }
  const uploaded = await uploadBufferToMeta(buffer, filename, mimeType, credentials);
  return uploaded.id;
}

// Send real message using Meta WhatsApp Cloud API with full logging
async function sendMetaWhatsAppMessage(
  recipientPhone: string,
  messageType: 'text' | 'image' | 'document' | 'audio' | 'video',
  payload: OutgoingMediaPayload,
  accountOverride?: MetaAccountCredentials
): Promise<{ success: boolean; data?: any; error?: string; logEntry?: ApiLogEntry }> {
  const cleanPhone = recipientPhone.replace(/\D/g, '');
  const activePhoneNumberId = accountOverride ? accountOverride.phoneNumberId : metaConfig.phoneNumberId;
  const activeAccessToken = accountOverride ? accountOverride.accessToken : metaConfig.accessToken;
  const endpoint = `POST /v21.0/${activePhoneNumberId || '{phoneNumberId}'}/messages`;

  if (!activePhoneNumberId || !activeAccessToken) {
    const log = addApiLog({
      type: 'error',
      direction: 'outbound',
      endpoint,
      accountId: accountOverride?.id,
      accountName: accountOverride?.name,
      phoneNumberId: activePhoneNumberId,
      recipient: cleanPhone,
      messageType,
      success: false,
      metaErrorMessage: 'Credenciais ausentes: Phone Number ID ou Access Token não configurados.',
      diagnosticTip:
        'Acesse a aba "Configuração Meta API" ou "Gerenciar Números" e preencha o Phone Number ID e o Access Token.',
    });

    return {
      success: false,
      error: 'WhatsApp Cloud API credentials not configured (Phone Number ID or Access Token missing).',
      logEntry: log,
    };
  }

  let body: any;
  try {
    body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanPhone,
    };

    if (messageType === 'text') {
      body.type = 'text';
      body.text = { preview_url: false, body: payload.text || '' };
    } else {
      const mediaId = await resolveOutgoingMediaId(payload, {
        ...accountOverride,
        phoneNumberId: activePhoneNumberId,
        accessToken: activeAccessToken,
      });
      body.type = messageType;
      body[messageType] = { id: mediaId };
      if (messageType === 'audio' && payload.voice) body.audio.voice = true;
      if (messageType !== 'audio' && payload.caption) body[messageType].caption = payload.caption;
      if (messageType === 'document') body.document.filename = payload.filename || 'documento.pdf';
    }

    const url = `https://graph.facebook.com/v21.0/${activePhoneNumberId}/messages`;
    console.log(`[WhatsApp API Request] Envio para ${cleanPhone} (${messageType})...`);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${activeAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    let data: any;
    const rawText = await res.text();
    try {
      data = JSON.parse(rawText);
    } catch {
      data = { rawResponse: rawText };
    }

    if (!res.ok) {
      const diag = analyzeMetaError(res.status, data, cleanPhone);
      console.error(`[WhatsApp API Error] HTTP ${res.status}:`, JSON.stringify(data));

      const log = addApiLog({
        type: 'error',
        direction: 'outbound',
        endpoint,
        accountId: accountOverride?.id,
        accountName: accountOverride?.name,
        phoneNumberId: activePhoneNumberId,
        recipient: cleanPhone,
        messageType,
        httpStatus: res.status,
        success: false,
        requestPayload: body,
        responseBody: data,
        metaErrorCode: diag.code,
        metaErrorSubcode: diag.subcode,
        metaErrorMessage: diag.message,
        metaErrorType: diag.type,
        metaFbTraceId: diag.fbtrace_id,
        diagnosticTip: diag.tip,
      });

      return {
        success: false,
        error: `Meta API Erro (${res.status} - Código ${diag.code || 'N/A'}): ${diag.message}`,
        data,
        logEntry: log,
      };
    }

    console.log(`[WhatsApp API Success] Enviado para ${cleanPhone}:`, data);
    const log = addApiLog({
      type: 'outgoing_message',
      direction: 'outbound',
      endpoint,
      accountId: accountOverride?.id,
      accountName: accountOverride?.name,
      phoneNumberId: activePhoneNumberId,
      recipient: cleanPhone,
      messageType,
      httpStatus: res.status,
      success: true,
      requestPayload: body,
      responseBody: data,
    });

    return { success: true, data, logEntry: log };
  } catch (err: any) {
    console.error('[WhatsApp API Exception]:', err);
    const status = Number(err.status || 0) || undefined;
    const diag = err.responseBody
      ? analyzeMetaError(status || 500, err.responseBody, cleanPhone)
      : undefined;
    const log = addApiLog({
      type: 'error',
      direction: 'outbound',
      endpoint,
      accountId: accountOverride?.id,
      accountName: accountOverride?.name,
      phoneNumberId: activePhoneNumberId,
      recipient: cleanPhone,
      messageType,
      httpStatus: status,
      success: false,
      requestPayload: body,
      responseBody: err.responseBody,
      metaErrorCode: diag?.code,
      metaErrorSubcode: diag?.subcode,
      metaErrorMessage: diag?.message || err.message || 'Falha ao preparar ou enviar a mídia para a Meta API',
      diagnosticTip: diag?.tip || err.message || 'Verifique o arquivo e tente novamente.',
    });

    return {
      success: false,
      error: err.message || 'Falha ao preparar ou enviar a mídia para a Meta API',
      logEntry: log,
    };
  }
}

// Engine step runner: executes nodes sequentially until a wait_reply or flow end
async function runFlowStep(
  session: SessionData,
  isLiveWhatsApp: boolean = false,
  allowPaymentPending: boolean = false
): Promise<{ executionErrors: string[]; lastLog?: ApiLogEntry }> {
  // If bot is paused for this customer, do not execute automated bot steps
  if (session.botPaused) {
    return { executionErrors: [] };
  }

  // Durable waits are resumed by the scheduler. Never keep an HTTP request or
  // an in-memory Promise open while a customer is waiting.
  if (session.waitingUntil && session.waitingKind) {
    return { executionErrors: [] };
  }

  if (session.waitingForPayment && !allowPaymentPending) {
    session.history.push({
      id: `payment_pending_${Date.now()}`,
      sender: 'system',
      type: 'info',
      content: '⏳ A cobrança ainda está pendente. O funil continuará automaticamente assim que a XPag confirmar o pagamento.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    });
    session.updatedAt = new Date().toISOString();
    persistSession(session);
    return { executionErrors: [] };
  }

  if (session.waitingKind === 'delay' && session.waitingUntil) {
    session.history.push({
      id: `delay_pending_${Date.now()}`,
      sender: 'system',
      type: 'info',
      content: `Funil aguardando o prazo agendado (${new Date(session.waitingUntil).toLocaleString('pt-BR')}).`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    });
    session.updatedAt = new Date().toISOString();
    persistSession(session);
    return { executionErrors: [] };
  }

  const sessionAccount =
    whatsappAccounts.find((a) => a.id === session.accountId) ||
    (!session.accountId || session.accountId === 'unassigned'
      ? whatsappAccounts.find((a) => a.isDefault) || whatsappAccounts[0]
      : undefined);
  const activeFlow = sessionAccount?.flow ||
    ((!session.accountId || session.accountId === 'unassigned') ? currentFlow : { nodes: [], edges: [] });
  const nodes = activeFlow.nodes || [];
  const edges = activeFlow.edges || [];
  const accountCreds = sessionAccount
    ? { id: sessionAccount.id, name: sessionAccount.name, phoneNumberId: sessionAccount.phoneNumberId, accessToken: sessionAccount.accessToken }
    : undefined;

  const executionErrors: string[] = [];
  let lastLog: ApiLogEntry | undefined;

  // If session hasn't started yet, find start node
  if (!session.currentNodeId) {
    const startNode = nodes.find((n: any) => n.type === 'start') || nodes[0];
    if (!startNode) {
      session.flowCompleted = true;
      session.updatedAt = new Date().toISOString();
      persistSession(session);
      return { executionErrors };
    }
    session.currentNodeId = startNode.id;
  }

  let safetyCounter = 0;
  while (safetyCounter < 30) {
    safetyCounter++;
    const currentNode = nodes.find((n: any) => n.id === session.currentNodeId);
    if (!currentNode) {
      session.currentNodeId = null;
      session.waitingForInput = false;
      session.flowCompleted = true;
      break;
    }

    // Handle node action
    if (currentNode.type === 'send_text') {
      const parsedText = replaceVariables(currentNode.data.text || '', session.variables);
      const msgItem = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        sender: 'bot' as const,
        type: 'text' as const,
        content: parsedText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      session.history.push(msgItem);

      if (isLiveWhatsApp) {
        const sendResult = await sendMetaWhatsAppMessage(
          session.phoneNumber,
          'text',
          { text: parsedText },
          accountCreds
        );
        if (sendResult.logEntry) lastLog = sendResult.logEntry;
        if (!sendResult.success) {
          executionErrors.push(sendResult.error || 'Erro ao enviar mensagem de texto.');
          break;
        }
      }
    } else if (currentNode.type === 'send_image') {
      const parsedCaption = replaceVariables(currentNode.data.caption || '', session.variables);
      const parsedMediaUrl = replaceVariables(currentNode.data.mediaUrl || '', session.variables);
      const msgItem = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        sender: 'bot' as const,
        type: 'image' as const,
        content: parsedCaption,
        mediaUrl: parsedMediaUrl,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      session.history.push(msgItem);

      if (isLiveWhatsApp && (currentNode.data.mediaId || parsedMediaUrl)) {
        const sendResult = await sendMetaWhatsAppMessage(
          session.phoneNumber,
          'image',
          {
            mediaUrl: parsedMediaUrl,
            mediaId: currentNode.data.mediaId,
            mimeType: currentNode.data.mediaMimeType,
            filename: currentNode.data.filename,
            caption: parsedCaption,
          },
          accountCreds
        );
        if (sendResult.logEntry) lastLog = sendResult.logEntry;
        if (!sendResult.success) {
          executionErrors.push(sendResult.error || 'Erro ao enviar imagem.');
          break;
        }
      }
    } else if (currentNode.type === 'send_audio') {
      const parsedMediaUrl = replaceVariables(currentNode.data.mediaUrl || '', session.variables);
      const msgItem = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        sender: 'bot' as const,
        type: 'audio' as const,
        content: '[Mensagem de Voz / Áudio]',
        mediaUrl: parsedMediaUrl,
        filename: currentNode.data.filename || 'audio.mp3',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      session.history.push(msgItem);

      if (isLiveWhatsApp && (currentNode.data.mediaId || parsedMediaUrl)) {
        const sendResult = await sendMetaWhatsAppMessage(
          session.phoneNumber,
          'audio',
          {
            mediaUrl: parsedMediaUrl,
            mediaId: currentNode.data.mediaId,
            mimeType: currentNode.data.mediaMimeType,
            filename: currentNode.data.filename,
            voice: currentNode.data.sendAsVoice !== false,
          },
          accountCreds
        );
        if (sendResult.logEntry) lastLog = sendResult.logEntry;
        if (!sendResult.success) {
          executionErrors.push(sendResult.error || 'Erro ao enviar áudio.');
          break;
        }
      }
    } else if (currentNode.type === 'send_video') {
      const parsedCaption = replaceVariables(currentNode.data.caption || '', session.variables);
      const parsedMediaUrl = replaceVariables(currentNode.data.mediaUrl || '', session.variables);
      const msgItem = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        sender: 'bot' as const,
        type: 'video' as const,
        content: parsedCaption || '[Vídeo Enviado]',
        mediaUrl: parsedMediaUrl,
        caption: parsedCaption,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      session.history.push(msgItem);

      if (isLiveWhatsApp && (currentNode.data.mediaId || parsedMediaUrl)) {
        const sendResult = await sendMetaWhatsAppMessage(
          session.phoneNumber,
          'video',
          {
            mediaUrl: parsedMediaUrl,
            mediaId: currentNode.data.mediaId,
            mimeType: currentNode.data.mediaMimeType,
            filename: currentNode.data.filename,
            caption: parsedCaption,
          },
          accountCreds
        );
        if (sendResult.logEntry) lastLog = sendResult.logEntry;
        if (!sendResult.success) {
          executionErrors.push(sendResult.error || 'Erro ao enviar vídeo.');
          break;
        }
      }
    } else if (currentNode.type === 'send_document') {
      const parsedCaption = replaceVariables(currentNode.data.caption || '', session.variables);
      const parsedMediaUrl = replaceVariables(currentNode.data.mediaUrl || '', session.variables);
      const msgItem = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        sender: 'bot' as const,
        type: 'document' as const,
        content: parsedCaption,
        mediaUrl: parsedMediaUrl,
        filename: currentNode.data.filename || 'documento.pdf',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      session.history.push(msgItem);

      if (isLiveWhatsApp && (currentNode.data.mediaId || parsedMediaUrl)) {
        const sendResult = await sendMetaWhatsAppMessage(
          session.phoneNumber,
          'document',
          {
            mediaUrl: parsedMediaUrl,
            mediaId: currentNode.data.mediaId,
            mimeType: currentNode.data.mediaMimeType,
            caption: parsedCaption,
            filename: currentNode.data.filename,
          },
          accountCreds
        );
        if (sendResult.logEntry) lastLog = sendResult.logEntry;
        if (!sendResult.success) {
          executionErrors.push(sendResult.error || 'Erro ao enviar documento.');
          break;
        }
      }
    } else if (currentNode.type === 'xpag_payment') {
      const method: XPagPaymentMethod = ['PIX', 'SPEI', 'OXXO'].includes(currentNode.data.xpagMethod)
        ? currentNode.data.xpagMethod
        : 'PIX';
      const currency: XPagCurrency = method === 'PIX' ? 'BRL' : 'MXN';
      const generatedEdge = edges.find(
        (edge: any) => edge.source === currentNode.id && edge.sourceHandle === 'generated'
      );

      if (!isLiveWhatsApp) {
        const isOpenSpei = method === 'SPEI' && currentNode.data.xpagSpeiMode === 'open';
        const simulatedAmount = isOpenSpei
          ? '0'
          : replaceVariables(currentNode.data.xpagAmount || (method === 'PIX' ? '50' : '500'), session.variables);
        const simulatedRecord: XPagPaymentRecord = {
          externalId: 'XPAG-SIMULACAO', method, amount: Number(simulatedAmount) || 0, currency,
          chargeMode: isOpenSpei ? 'open' : 'dynamic', receivedE2es: [],
          status: 'simulated', sessionPhoneNumber: session.phoneNumber, nodeId: currentNode.id,
          accountId: session.accountId, isLiveWhatsApp: false, webhookKeyHash: '',
          payer: { name: session.name || session.phoneNumber, phoneNumber: session.phoneNumber },
          response: method === 'PIX'
            ? { copy_paste: 'PIX-SIMULADO', qr_url: 'https://exemplo.invalid/qr-code.png' }
            : method === 'SPEI'
              ? {
                  clabe: 'CLABE-SIMULADA', bank_name: 'Banco de exemplo', beneficiary: 'Cliente de exemplo',
                  ...(isOpenSpei ? { static: true, open_value: true } : { amount: Number(simulatedAmount) || 0 }),
                }
              : { payee_data: { reference: 'OXXO-SIMULADO', barcode: 'https://exemplo.invalid/codigo-barras.png' } },
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        };
        saveXPagVariables(session, currentNode, simulatedRecord, simulatedRecord.response);
        session.history.push({
          id: `xpag_sim_${Date.now()}`,
          sender: 'system',
          type: 'info',
          content: isOpenSpei
            ? '🧪 Variáveis simuladas para uma CLABE SPEI de valor aberto. Nenhuma transação real foi criada.'
            : `🧪 Variáveis simuladas para uma cobrança ${method} de ${simulatedAmount} ${currency}. Nenhuma transação real foi criada.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        });
        const simulationEdge = generatedEdge || edges.find(
          (edge: any) => edge.source === currentNode.id && !edge.sourceHandle
        );
        if (simulationEdge) {
          if (scheduleNextNodeDelay(session, currentNode, simulationEdge.target, isLiveWhatsApp)) {
            return { executionErrors, lastLog };
          }
          session.currentNodeId = simulationEdge.target;
          session.executionCheckpointVersion = 1;
          persistSession(session);
          continue;
        }
        session.currentNodeId = null;
        session.flowCompleted = true;
        break;
      } else {
        try {
          const charge = await createXPagCharge(session, currentNode, true);
          saveXPagVariables(session, currentNode, charge.record, charge.record.response);
          const shouldWaitForPayment = currentNode.data.xpagWaitForPayment !== false;
          if (shouldWaitForPayment) {
            session.waitingForPayment = true;
            session.waitingPaymentExternalId = charge.record.externalId;
            session.waitingPaymentNodeId = currentNode.id;
            session.executionCheckpointVersion = 1;
            session.updatedAt = new Date().toISOString();
            persistSession(session);
          }

          const nextEdge = generatedEdge || (!shouldWaitForPayment
            ? edges.find((edge: any) => edge.source === currentNode.id && !edge.sourceHandle)
            : undefined);
          if (nextEdge) {
            if (scheduleNextNodeDelay(session, currentNode, nextEdge.target, isLiveWhatsApp)) {
              return { executionErrors, lastLog };
            }
            session.currentNodeId = nextEdge.target;
            session.executionCheckpointVersion = 1;
            persistSession(session);
            continue;
          }
          session.currentNodeId = null;
          session.flowCompleted = !shouldWaitForPayment;
          session.updatedAt = new Date().toISOString();
          persistSession(session);
          return { executionErrors, lastLog };
        } catch (err: any) {
          const failedRecord: XPagPaymentRecord = err.paymentRecord || {
            externalId: '', method, amount: 0, currency, status: 'failed',
            chargeMode: method === 'SPEI' && currentNode.data.xpagSpeiMode === 'open' ? 'open' : 'dynamic',
            sessionPhoneNumber: session.phoneNumber, nodeId: currentNode.id,
            accountId: session.accountId, isLiveWhatsApp: true, webhookKeyHash: '',
            payer: { name: session.name || session.phoneNumber, phoneNumber: session.phoneNumber },
            response: err.responseBody || {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          };
          failedRecord.status = 'failed';
          saveXPagVariables(session, currentNode, failedRecord, failedRecord.response, err);
          session.waitingForPayment = false;
          session.waitingPaymentExternalId = undefined;
          session.waitingPaymentNodeId = undefined;
          const errorEdge = edges.find(
            (edge: any) => edge.source === currentNode.id && edge.sourceHandle === 'error'
          );
          if (errorEdge) {
            if (scheduleNextNodeDelay(session, currentNode, errorEdge.target, isLiveWhatsApp)) {
              return { executionErrors, lastLog };
            }
            session.currentNodeId = errorEdge.target;
            session.executionCheckpointVersion = 1;
            persistSession(session);
            continue;
          }
          executionErrors.push(`${err.message || 'Falha ao gerar cobrança na XPag'}${err.errorCode ? ` (${err.errorCode})` : ''}`);
          break;
        }
      }
    } else if (currentNode.type === 'wait_reply') {
      session.waitingForInput = true;
      session.waitingVariableName = currentNode.data.variableName?.trim() || undefined;
      session.executionCheckpointVersion = 1;
      clearDurableWait(session);
      if (currentNode.data.waitReplyTimeoutEnabled) {
        scheduleDurableWait(session, currentNode, 'reply_timeout', isLiveWhatsApp);
      }
      session.updatedAt = new Date().toISOString();
      persistSession(session);
      return { executionErrors, lastLog };
    } else if (currentNode.type === 'delay') {
      try {
        scheduleDurableWait(session, currentNode, 'delay', isLiveWhatsApp);
        session.history.push({
          id: `delay_scheduled_${Date.now()}`,
          sender: 'system',
          type: 'info',
          content: `Execução agendada para ${new Date(session.waitingUntil!).toLocaleString('pt-BR')}.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        });
        persistSession(session);
        return { executionErrors, lastLog };
      } catch (err: any) {
        executionErrors.push(err.message || 'Não foi possível agendar a espera.');
        break;
      }
    } else if (currentNode.type === 'end') {
      session.currentNodeId = null;
      session.waitingForInput = false;
      session.waitingVariableName = undefined;
      session.waitingForPayment = false;
      session.waitingPaymentExternalId = undefined;
      session.waitingPaymentNodeId = undefined;
      clearDurableWait(session);
      session.flowCompleted = true;
      session.executionCheckpointVersion = 1;
      session.history.push({
        id: `flow_completed_${Date.now()}`,
        sender: 'system',
        type: 'info',
        content: 'Funil finalizado. Novas mensagens não reiniciarão esta execução automaticamente.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      });
      break;
    }

    // Find next connected edge
    const outgoingEdge = edges.find((e: any) => e.source === currentNode.id);
    if (outgoingEdge) {
      if (scheduleNextNodeDelay(session, currentNode, outgoingEdge.target, isLiveWhatsApp)) {
        return { executionErrors, lastLog };
      }
      session.currentNodeId = outgoingEdge.target;
      session.executionCheckpointVersion = 1;
      session.updatedAt = new Date().toISOString();
      persistSession(session);
    } else {
      session.currentNodeId = null;
      session.waitingForInput = false;
      session.flowCompleted = true;
      break;
    }
  }

  session.updatedAt = new Date().toISOString();
  persistSession(session);
  return { executionErrors, lastLog };
}

let durableSchedulerReady = false;
const durableResumeLocks = new Set<string>();

async function resumeDurableWait(session: SessionData): Promise<void> {
  if (!session.waitingUntil || !session.waitingKind || !session.waitingNodeId) return;
  if (session.botPaused) return;
  if (new Date(session.waitingUntil).getTime() > Date.now()) return;

  const storageKey = sessionStorageKey(session.accountId, session.phoneNumber);
  if (durableResumeLocks.has(storageKey)) return;
  durableResumeLocks.add(storageKey);
  try {
    const account = whatsappAccounts.find((item) => item.id === session.accountId);
    const activeFlow = account?.flow ||
      ((!session.accountId || session.accountId === 'unassigned') ? currentFlow : { nodes: [], edges: [] });
    const waitNodeId = session.waitingNodeId;
    const waitKind = session.waitingKind;
    const waitingNextNodeId = session.waitingNextNodeId;
    const isLiveWhatsApp = session.waitingIsLiveWhatsApp ?? session.phoneNumber !== 'simulator_user';
    const sourceHandle = waitKind === 'reply_timeout' ? 'timeout' : 'completed';
    const outgoingEdge = waitKind === 'node_delay'
      ? undefined
      : activeFlow.edges?.find(
          (edge: any) => edge.source === waitNodeId && edge.sourceHandle === sourceHandle
        ) || (waitKind === 'delay'
          ? activeFlow.edges?.find((edge: any) => edge.source === waitNodeId && !edge.sourceHandle)
          : undefined);
    const nextNodeId = waitKind === 'node_delay' ? waitingNextNodeId : outgoingEdge?.target;

    if (waitKind === 'reply_timeout') {
      session.waitingForInput = false;
      session.waitingVariableName = undefined;
    }
    clearDurableWait(session);
    session.history.push({
      id: `durable_wait_${Date.now()}`,
      sender: 'system',
      type: 'info',
      content: waitKind === 'reply_timeout'
        ? 'O prazo para resposta terminou; continuando pela saída Tempo esgotado.'
        : waitKind === 'node_delay'
          ? 'O intervalo entre os blocos terminou; retomando o funil.'
          : 'O prazo agendado terminou; retomando o funil.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    });
    const waitNode = activeFlow.nodes?.find((node: any) => node.id === waitNodeId);
    if (waitKind === 'reply_timeout' && nextNodeId && waitNode) {
      if (scheduleNextNodeDelay(session, waitNode, nextNodeId, isLiveWhatsApp)) return;
    }
    session.currentNodeId = nextNodeId || null;
    session.flowCompleted = !nextNodeId;
    session.updatedAt = new Date().toISOString();
    persistSession(session);
    if (nextNodeId) await runFlowStep(session, isLiveWhatsApp, waitKind === 'node_delay');
  } finally {
    durableResumeLocks.delete(storageKey);
  }
}

async function processDurableWaits(): Promise<void> {
  if (!durableSchedulerReady) return;
  const dueSessions = Array.from(sessions.values()).filter((session) =>
    !session.botPaused &&
    Boolean(session.waitingUntil && session.waitingKind) &&
    new Date(session.waitingUntil!).getTime() <= Date.now()
  );
  for (const session of dueSessions) await resumeDurableWait(session);
}

async function restorePersistedExecutions(): Promise<void> {
  durableSchedulerReady = true;
  await processDurableWaits();
  for (const session of sessions.values()) {
    if (
      session.phoneNumber === 'simulator_user' ||
      session.botPaused ||
      session.flowCompleted ||
      session.waitingForInput ||
      session.waitingForPayment ||
      session.waitingUntil ||
      session.executionCheckpointVersion !== 1 ||
      !session.currentNodeId
    ) continue;
    const storageKey = sessionStorageKey(session.accountId, session.phoneNumber);
    if (durableResumeLocks.has(storageKey)) continue;
    durableResumeLocks.add(storageKey);
    try {
      await runFlowStep(session, true);
    } catch (err) {
      console.error(`[Fluxo Restaurável] Falha ao retomar ${storageKey}:`, err);
    } finally {
      durableResumeLocks.delete(storageKey);
    }
  }
}

setInterval(() => {
  processDurableWaits().catch((err) => console.error('[Agendador Persistente] Falha ao retomar funis:', err));
}, 1000);

type XPagFlowBranch = 'paid' | 'error' | 'expired';

async function resumeXPagFlowBranch(
  record: XPagPaymentRecord,
  branch: XPagFlowBranch,
  response: any = record.response,
  error?: any
): Promise<boolean> {
  const session = sessions.get(sessionStorageKey(record.accountId, record.sessionPhoneNumber)) ||
    Array.from(sessions.values()).find(
      (item) => item.phoneNumber === record.sessionPhoneNumber && (!record.accountId || item.accountId === record.accountId)
    );
  if (!session || session.waitingPaymentExternalId !== record.externalId) return false;

  const account = whatsappAccounts.find((item) => item.id === session.accountId);
  const activeFlow = account?.flow ||
    ((!session.accountId || session.accountId === 'unassigned') ? currentFlow : { nodes: [], edges: [] });
  const paymentNode = activeFlow.nodes?.find((node: any) => node.id === record.nodeId);
  if (paymentNode) saveXPagVariables(session, paymentNode, record, response, error);

  session.waitingForPayment = false;
  session.waitingPaymentExternalId = undefined;
  session.waitingPaymentNodeId = undefined;
  session.flowCompleted = false;
  session.history.push({
    id: `xpag_${branch}_${Date.now()}`,
    sender: 'system',
    type: 'info',
    content: branch === 'paid'
      ? 'Pagamento XPag confirmado; continuando pela saída Paga.'
      : branch === 'expired'
        ? 'Cobrança XPag expirada; continuando pela saída Expirada.'
        : 'Cobrança XPag encerrada com erro; continuando pela saída Erro.',
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  });

  const outgoingEdge = activeFlow.edges?.find(
    (edge: any) => edge.source === record.nodeId && edge.sourceHandle === branch
  ) || (branch === 'paid'
    ? activeFlow.edges?.find((edge: any) => edge.source === record.nodeId && !edge.sourceHandle)
    : undefined);

  if (outgoingEdge && paymentNode) {
    if (scheduleNextNodeDelay(session, paymentNode, outgoingEdge.target, record.isLiveWhatsApp)) {
      return true;
    }
  }
  session.currentNodeId = outgoingEdge?.target || null;
  if (!outgoingEdge) session.flowCompleted = true;
  session.updatedAt = new Date().toISOString();
  persistSession(session);
  if (outgoingEdge) await runFlowStep(session, record.isLiveWhatsApp);
  return true;
}

async function processExpiredXPagPayments() {
  const now = Date.now();
  const terminalStatuses = new Set(['confirmed', 'paid', 'completed', 'success', 'succeeded', 'failed', 'expired', 'cancelled', 'canceled']);
  for (const record of xpagPayments.values()) {
    if (!record.expiresAt || terminalStatuses.has(String(record.status).toLowerCase())) continue;
    const expiresAt = new Date(record.expiresAt).getTime();
    if (!Number.isFinite(expiresAt) || expiresAt > now) continue;
    record.status = 'expired';
    record.updatedAt = new Date().toISOString();
    saveXPagPayments();
    await resumeXPagFlowBranch(record, 'expired', record.response);
  }
}

setInterval(() => {
  processExpiredXPagPayments().catch((err) => console.error('[XPag Expiration] Erro ao processar vencimentos:', err));
}, 60 * 1000);

// Checks if an incoming message matches the start trigger rules
function checkStartTriggerMatch(userMessageText: string, flow: any): boolean {
  const startNode = flow.nodes?.find((n: any) => n.type === 'start');
  const triggerType = startNode?.data?.triggerType || flow.triggerType || 'all';
  const keywords: string[] = startNode?.data?.triggerKeywords || flow.triggerKeywords || [];

  if (triggerType === 'all') return true;
  if (!keywords || keywords.length === 0) return true;

  const normalized = userMessageText.trim().toLowerCase();

  if (triggerType === 'exact') {
    return keywords.some((k) => k.trim().toLowerCase() === normalized);
  } else if (triggerType === 'contains') {
    return keywords.some((k) => normalized.includes(k.trim().toLowerCase()));
  }

  return true;
}

// User sent a message to the bot
async function handleIncomingUserMessage(
  session: SessionData,
  userMessageText: string,
  isLiveWhatsApp: boolean = false
): Promise<{ executionErrors: string[]; lastLog?: ApiLogEntry }> {
  // Update customer window: last message received now
  const now = new Date();
  session.lastCustomerMessageAt = now.toISOString();

  // If session is already in a 72h Ads window, maintain it unless it has expired
  if (session.referral?.isFromAd) {
    session.windowType = '72h_ads';
    const expires = session.windowExpiresAt ? new Date(session.windowExpiresAt).getTime() : 0;
    if (expires < now.getTime()) {
      // Re-opened as 24h standard after 72h expired
      session.windowExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
      session.windowType = '24h_standard';
    }
  } else {
    // Reset standard 24-hour window from this customer message
    session.windowType = '24h_standard';
    session.windowExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  }
  session.isWindowOpen = true;

  // Add user message to session history
  session.history.push({
    id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    sender: 'user',
    type: 'text',
    content: userMessageText,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  });

  // If human agent paused the bot, only record message without executing flow
  if (session.botPaused) {
    session.updatedAt = new Date().toISOString();
    persistSession(session);
    return { executionErrors: [] };
  }

  // A completed funnel is terminal. Keep recording future customer messages,
  // but only the explicit restart action may open a new execution.
  if (session.flowCompleted) {
    session.updatedAt = new Date().toISOString();
    persistSession(session);
    return { executionErrors: [] };
  }

  // Do not generate duplicate charges while the customer sends messages before
  // XPag confirms the current PIX/SPEI/OXXO payment.
  if (session.waitingForPayment) {
    session.history.push({
      id: `payment_pending_${Date.now()}`,
      sender: 'system',
      type: 'info',
      content: '⏳ Pagamento ainda pendente. O funil continuará automaticamente após a confirmação da XPag.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    });
    session.updatedAt = new Date().toISOString();
    persistSession(session);
    return { executionErrors: [] };
  }

  const sessionAccount = whatsappAccounts.find((account) => account.id === session.accountId);
  const activeFlow = sessionAccount?.flow ||
    ((!session.accountId || session.accountId === 'unassigned') ? currentFlow : { nodes: [], edges: [] });
  const nodes = activeFlow.nodes || [];
  const edges = activeFlow.edges || [];

  // 1. If currently waiting for user input on a wait_reply block
  if (session.waitingForInput && session.currentNodeId) {
    const currentNode = nodes.find((n: any) => n.id === session.currentNodeId);
    if (currentNode && currentNode.type === 'wait_reply') {
      const varName = session.waitingVariableName || currentNode.data.variableName?.trim();
      if (varName) session.variables[varName] = userMessageText;
      session.waitingForInput = false;
      session.waitingVariableName = undefined;
      clearDurableWait(session);

      const outgoingEdge = edges.find(
        (e: any) => e.source === currentNode.id && e.sourceHandle === 'answered'
      ) || edges.find((e: any) => e.source === currentNode.id && !e.sourceHandle);
      if (outgoingEdge) {
        if (scheduleNextNodeDelay(session, currentNode, outgoingEdge.target, isLiveWhatsApp)) {
          return { executionErrors: [] };
        }
        session.currentNodeId = outgoingEdge.target;
        return await runFlowStep(session, isLiveWhatsApp);
      } else {
        session.currentNodeId = null;
        session.flowCompleted = true;
        persistSession(session);
        return { executionErrors: [] };
      }
    }
  }

  // 2. If the flow has not started yet, check its start trigger rule.
  const triggerMatches = checkStartTriggerMatch(userMessageText, activeFlow);
  if (!triggerMatches) {
    const startNode = activeFlow.nodes?.find((n: any) => n.type === 'start');
    const triggerType = startNode?.data?.triggerType || activeFlow.triggerType || 'all';
    const keywords: string[] = startNode?.data?.triggerKeywords || activeFlow.triggerKeywords || [];

    console.log(`[Gatilho de Início] Mensagem "${userMessageText}" não ativou o gatilho "${triggerType}". Bot não disparado.`);
    session.history.push({
      id: `sys_${Date.now()}`,
      sender: 'system',
      type: 'info',
      content: `ℹ️ O funil não foi disparado porque o gatilho está configurado para: ${
        triggerType === 'exact' ? 'mensagem exata' : 'palavras-chave'
      } (${keywords.map((k) => `"${k}"`).join(', ')}). Envie a mensagem correspondente para ativar o robô.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    });
    session.updatedAt = new Date().toISOString();
    persistSession(session);
    return { executionErrors: [] };
  }

  // Trigger matched! Reset and execute flow from start
  session.currentNodeId = null;
  session.waitingForInput = false;
  clearDurableWait(session);
  session.executionCheckpointVersion = 1;
  session.flowCompleted = false;
  return await runFlowStep(session, isLiveWhatsApp);
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.set('trust proxy', 1);
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));
  app.use((req, _res, next) => {
    const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
    const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
    const protocol = forwardedProto || req.protocol;
    const host = forwardedHost || req.get('host');
    if (host) {
      const candidateOrigin = `${protocol}://${host}`.replace(/\/$/, '');
      const candidateIsLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(candidateOrigin);
      const currentIsPublic = Boolean(lastKnownPublicOrigin) && !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(lastKnownPublicOrigin);
      if (!candidateIsLocal || !currentIsPublic) lastKnownPublicOrigin = candidateOrigin;
    }
    next();
  });

  // Static uploads directory for media files
  app.use('/uploads', express.static(UPLOADS_DIR));

  // Auto-connect to MongoDB Atlas if URI is present
  await mongoService.autoConnect({
    config: metaConfig,
    r2Config: r2StorageService.getConfig(),
    xpagConfig,
    sessions: Array.from(sessions.values()),
    accounts: whatsappAccounts,
    logs: apiLogs,
    xpagPayments: Array.from(xpagPayments.values()),
  });

  // Load the dedicated FluxoZap collections into memory. Flow definitions are
  // hydrated only from MongoDB and are never restored from local JSON.
  if (mongoService.isConnected()) {
    try {
      const doc = await mongoService.getProjectSnapshot();
      if (doc) {
        const databaseFlows = doc.flows || [];
        currentFlow = databaseFlows.find((flow: any) => flow?.id === 'flow_main') ||
          createEmptyAccountFlow('main', 'Principal');
        if (doc.config?.phoneNumberId) {
          metaConfig = { ...metaConfig, ...doc.config };
        }
        if (doc.sessions && doc.sessions.length > 0) {
          for (const s of doc.sessions) {
            const key = sessionStorageKey(s.accountId, s.phoneNumber);
            const localSession = sessions.get(key);
            const localUpdatedAt = localSession?.updatedAt ? new Date(localSession.updatedAt).getTime() : 0;
            const mongoUpdatedAt = s?.updatedAt ? new Date(s.updatedAt).getTime() : 0;
            // A hard shutdown can happen after the synchronous JSON checkpoint
            // and before Mongo finishes its async write. Keep whichever copy is newer.
            if (!localSession || mongoUpdatedAt >= localUpdatedAt) sessions.set(key, s as any);
          }
        }
        if (doc.logs && doc.logs.length > 0) {
          apiLogs = doc.logs as any;
        }
        if (doc.r2Config?.accountId) {
          r2StorageService.updateConfig(doc.r2Config as any);
        }
        if (doc.xpagConfig?.clientId) {
          xpagConfig = { ...xpagConfig, ...doc.xpagConfig };
          saveXPagConfig();
        }
        if (doc.accounts?.length) {
          whatsappAccounts = doc.accounts as WhatsAppAccount[];
          for (const account of whatsappAccounts) {
            account.flow = databaseFlows.find((flow: any) => flow?.id === `flow_${account.id}`) ||
              createEmptyAccountFlow(account.id, account.name);
          }
          saveAccountsToFile();
        }
        if (doc.xpagPayments?.length) {
          xpagPayments.clear();
          for (const payment of doc.xpagPayments as XPagPaymentRecord[]) {
            if (payment?.externalId) xpagPayments.set(payment.externalId, payment);
          }
          saveXPagPayments();
        }
        for (const session of sessions.values()) refreshDefaultSessionVariables(session);
        saveSessionsToFile();
        await Promise.all(Array.from(sessions.values()).map((session) => mongoService.saveSession(session)));
      }
    } catch (err) {
      console.error('[MongoDB Atlas] Error syncing initial data from FluxoZap collections:', err);
    }
  }

  // Mongo/JSON hydration is complete. Resume due waits and any execution that
  // had already checkpointed its next node before the previous shutdown.
  await restorePersistedExecutions();

  // API: Cloudflare R2 Endpoints
  app.get('/api/r2/config', (_req: Request, res: Response) => {
    res.json(r2StorageService.getConfig());
  });

  app.post('/api/r2/config', async (req: Request, res: Response) => {
    try {
      r2StorageService.updateConfig(req.body);
      if (mongoService.isConnected()) {
        await mongoService.saveR2Config(req.body);
      }
      res.json({
        success: true,
        message: 'Configurações do Cloudflare R2 salvas com sucesso!',
        config: r2StorageService.getConfig(),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/r2/test', async (_req: Request, res: Response) => {
    const result = await r2StorageService.testConnection();
    res.json(result);
  });

  // Persist outbound flow media in R2. Unlike received media, this endpoint
  // never falls back to local disk because the user explicitly selected R2.
  app.post('/api/r2/media', express.raw({ type: 'application/octet-stream', limit: '100mb' }), async (req: Request, res: Response) => {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ success: false, error: 'Arquivo não informado.' });
    }
    if (req.body.length > MAX_MEDIA_BYTES) {
      return res.status(413).json({ success: false, error: 'O arquivo excede o limite máximo de 100 MB.' });
    }

    let filename = String(req.headers['x-file-name'] || 'arquivo');
    try { filename = decodeURIComponent(filename); } catch { /* keep original */ }
    filename = path.basename(filename).replace(/[\r\n]/g, '_') || 'arquivo';
    const mimeType = String(req.headers['x-file-type'] || inferMimeType(filename)).split(';')[0];

    try {
      const uploaded = await r2StorageService.uploadFile(req.body, filename, mimeType, {
        allowLocalFallback: false,
      });
      return res.json({
        success: true,
        mediaUrl: uploaded.url,
        filename: uploaded.filename,
        mimeType,
        size: req.body.length,
        storage: 'r2',
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: err.message || 'Falha ao armazenar a mídia no Cloudflare R2.',
      });
    }
  });

  // Upload outgoing media directly to the selected WhatsApp line on Meta.
  // The binary is not persisted in R2 or on the local server.
  app.post('/api/meta/media', express.raw({ type: 'application/octet-stream', limit: '100mb' }), async (req: Request, res: Response) => {
    const accountId = String(req.query.accountId || '');
    const account = whatsappAccounts.find((item) => item.id === accountId);
    if (!account) return res.status(404).json({ success: false, error: 'Linha do WhatsApp não encontrada.' });
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ success: false, error: 'Arquivo não informado.' });
    }
    if (req.body.length > MAX_MEDIA_BYTES) {
      return res.status(413).json({ success: false, error: 'O arquivo excede o limite máximo de 100 MB.' });
    }

    let uploadBuffer = req.body;
    let filename = String(req.headers['x-file-name'] || 'arquivo');
    try { filename = decodeURIComponent(filename); } catch { /* keep original */ }
    filename = path.basename(filename).replace(/[\r\n]/g, '_') || 'arquivo';
    let mimeType = String(req.headers['x-file-type'] || inferMimeType(filename)).split(';')[0];
    const sendAsVoice = req.query.voice === 'true';
    if (sendAsVoice) {
      try {
        const voice = await convertAudioToWhatsAppVoice(uploadBuffer, filename);
        uploadBuffer = voice.buffer;
        filename = voice.filename;
        mimeType = voice.mimeType;
      } catch (err: any) {
        return res.status(400).json({ success: false, error: err.message || 'Falha ao preparar a mensagem de voz.' });
      }
    }
    const logBase = {
      accountId: account.id,
      accountName: account.name,
      phoneNumberId: account.phoneNumberId,
      endpoint: `POST /v21.0/${account.phoneNumberId || '{phoneNumberId}'}/media`,
      requestPayload: { filename, mimeType, size: uploadBuffer.length, voice: sendAsVoice },
    };

    try {
      const uploaded = await uploadBufferToMeta(uploadBuffer, filename, mimeType, {
        id: account.id,
        name: account.name,
        phoneNumberId: account.phoneNumberId,
        accessToken: account.accessToken,
      });
      addApiLog({
        ...logBase,
        type: 'outgoing_message',
        direction: 'outbound',
        messageType: 'media_upload',
        httpStatus: 200,
        success: true,
        responseBody: uploaded.response,
      });
      return res.json({
        success: true,
        mediaId: uploaded.id,
        filename,
        mimeType,
        size: uploadBuffer.length,
        storage: 'meta',
      });
    } catch (err: any) {
      const responseBody = err.responseBody;
      const status = Number(err.status || 500);
      const diag = analyzeMetaError(status, responseBody || { error: { message: err.message } });
      addApiLog({
        ...logBase,
        type: 'error',
        direction: 'outbound',
        messageType: 'media_upload',
        httpStatus: status,
        success: false,
        responseBody,
        metaErrorCode: diag.code,
        metaErrorSubcode: diag.subcode,
        metaErrorMessage: diag.message,
        diagnosticTip: diag.tip,
      });
      return res.status(status >= 400 && status < 600 ? status : 500).json({
        success: false,
        error: err.message || 'Falha ao enviar mídia diretamente para a Meta.',
        diagnosticTip: diag.tip,
      });
    }
  });

  // API: MongoDB Atlas Management
  app.get('/api/mongodb/status', async (_req: Request, res: Response) => {
    const status = await mongoService.getStatus();
    res.json(status);
  });

  app.post('/api/mongodb/connect', async (req: Request, res: Response) => {
    const { uri } = req.body;
    const result = await mongoService.connect(uri);
    if (result.success) {
      await mongoService.ensureProjectData({
        config: metaConfig,
        r2Config: r2StorageService.getConfig(),
        xpagConfig,
        flow: currentFlow,
        sessions: Array.from(sessions.values()),
        accounts: whatsappAccounts,
        logs: apiLogs,
        xpagPayments: Array.from(xpagPayments.values()),
      });
    }
    res.json(result);
  });

  app.post('/api/mongodb/disconnect', async (_req: Request, res: Response) => {
    const result = await mongoService.disconnect();
    res.json(result);
  });

  app.post('/api/mongodb/sync', async (_req: Request, res: Response) => {
    if (!mongoService.isConnected()) {
      return res.status(400).json({
        success: false,
        message: 'MongoDB Atlas não está conectado. Conecte primeiro para sincronizar.',
      });
    }
    try {
      await mongoService.saveFlow(currentFlow);
      await mongoService.saveMetaConfig(metaConfig);
      await mongoService.saveR2Config(r2StorageService.getConfig());
      await mongoService.saveXPagConfig(xpagConfig);
      await mongoService.saveAccounts(whatsappAccounts);
      for (const s of sessions.values()) {
        await mongoService.saveSession(s);
      }
      for (const payment of xpagPayments.values()) {
        await mongoService.saveXPagPayment(payment);
      }
      res.json({
        success: true,
        message: 'Dados sincronizados nas coleções do banco "FluxoZap" no MongoDB Atlas!',
        status: await mongoService.getStatus(),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // API: Get & Save Meta Cloud API Config
  app.get('/api/config', (req: Request, res: Response) => {
    const accountId = String(req.query.accountId || '');
    if (accountId) {
      const account = whatsappAccounts.find((item) => item.id === accountId);
      if (!account) return res.status(404).json({ success: false, error: 'Linha do WhatsApp não encontrada.' });
      return res.json({
        accountId: account.id,
        accountName: account.name,
        phoneNumberId: account.phoneNumberId,
        displayPhoneNumber: account.phoneNumber,
        wabaId: account.wabaId || '',
        verifyToken: account.verifyToken || metaConfig.verifyToken,
        testPhoneNumber: metaConfig.testPhoneNumber,
        hasAccessToken: Boolean(account.accessToken),
        maskedToken: account.accessToken
          ? `${account.accessToken.substring(0, 6)}...${account.accessToken.slice(-4)}`
          : '',
      });
    }
    res.json({
      ...metaConfig,
      hasAccessToken: Boolean(metaConfig.accessToken),
      maskedToken: metaConfig.accessToken
        ? `${metaConfig.accessToken.substring(0, 6)}...${metaConfig.accessToken.slice(-4)}`
        : '',
    });
  });

  app.post('/api/config', async (req: Request, res: Response) => {
    const { accountId, phoneNumberId, accessToken, wabaId, verifyToken, testPhoneNumber } = req.body;
    if (accountId) {
      const account = whatsappAccounts.find((item) => item.id === accountId);
      if (!account) return res.status(404).json({ success: false, error: 'Linha do WhatsApp não encontrada.' });

      const nextPhoneNumberId = phoneNumberId !== undefined
        ? String(phoneNumberId).trim()
        : account.phoneNumberId;
      if (!nextPhoneNumberId) {
        return res.status(400).json({ success: false, error: 'Phone Number ID é obrigatório para esta linha.' });
      }
      if (whatsappAccounts.some((item) => item.id !== account.id && item.phoneNumberId === nextPhoneNumberId)) {
        return res.status(409).json({ success: false, error: 'Este Phone Number ID já pertence a outra linha cadastrada.' });
      }

      account.phoneNumberId = nextPhoneNumberId;
      if (wabaId !== undefined) account.wabaId = String(wabaId).trim();
      if (typeof accessToken === 'string' && accessToken.trim()) account.accessToken = accessToken.trim();
      if (verifyToken !== undefined) {
        const normalizedVerifyToken = String(verifyToken).trim() || 'fluxozap_webhook_secret_2026';
        account.verifyToken = normalizedVerifyToken;
        metaConfig.verifyToken = normalizedVerifyToken;
      }
      if (testPhoneNumber !== undefined) metaConfig.testPhoneNumber = String(testPhoneNumber).trim();
      account.updatedAt = new Date().toISOString();

      try {
        saveAccountsToFile();
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(metaConfig, null, 2));
        if (mongoService.isConnected()) await mongoService.saveMetaConfig(metaConfig);
        return res.json({ success: true, message: `Configurações da linha ${account.name} salvas com sucesso!` });
      } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
      }
    }

    const previousPhoneNumberId = metaConfig.phoneNumberId;
    const nextPhoneNumberId = phoneNumberId !== undefined ? String(phoneNumberId).trim() : metaConfig.phoneNumberId;
    const phoneIdChanged = nextPhoneNumberId !== previousPhoneNumberId;
    metaConfig = {
      phoneNumberId: nextPhoneNumberId,
      displayPhoneNumber: phoneIdChanged ? '' : metaConfig.displayPhoneNumber,
      accessToken: accessToken?.trim() || metaConfig.accessToken,
      wabaId: wabaId !== undefined ? String(wabaId).trim() : metaConfig.wabaId,
      verifyToken: verifyToken !== undefined ? String(verifyToken).trim() || 'fluxozap_webhook_secret_2026' : metaConfig.verifyToken,
      testPhoneNumber: testPhoneNumber !== undefined ? String(testPhoneNumber).trim() : metaConfig.testPhoneNumber,
    };
    try {
      if (phoneIdChanged) {
        whatsappAccounts = whatsappAccounts.filter((account) => account.id !== 'acc_meta_primary');
        if (whatsappAccounts.length > 0 && !whatsappAccounts.some((account) => account.isDefault)) {
          whatsappAccounts[0].isDefault = true;
        }
        saveAccountsToFile();
      }
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(metaConfig, null, 2));

      if (mongoService.isConnected()) {
        await mongoService.saveMetaConfig(metaConfig);
      }

      res.json({ success: true, message: 'Configurações salvas com sucesso!' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // API: Logs Endpoints
  app.get('/api/logs', (req: Request, res: Response) => {
    const filter = req.query.filter as string;
    const accountId = String(req.query.accountId || '');
    let filtered = accountId ? apiLogs.filter((log) => log.accountId === accountId) : apiLogs;
    if (filter === 'errors') {
      filtered = apiLogs.filter((l) => !l.success);
    } else if (filter === 'outbound') {
      filtered = apiLogs.filter((l) => l.direction === 'outbound');
    } else if (filter === 'inbound') {
      filtered = apiLogs.filter((l) => l.direction === 'inbound');
    }
    res.json({
      logs: filtered,
      total: apiLogs.length,
      errorsCount: filtered.filter((l) => !l.success).length,
    });
  });

  app.delete('/api/logs', async (_req: Request, res: Response) => {
    apiLogs = [];
    saveLogsToFile();
    if (mongoService.isConnected()) {
      await mongoService.clearLogs();
    }
    res.json({ success: true, message: 'Logs limpos com sucesso.' });
  });

  // API: Test Meta WhatsApp API Connection
  app.post('/api/config/test', async (req: Request, res: Response) => {
    const { accountId, phoneNumberId, accessToken } = req.body;
    const account = accountId
      ? whatsappAccounts.find((item) => item.id === accountId)
      : undefined;
    if (accountId && !account) {
      return res.status(404).json({ success: false, error: 'Linha do WhatsApp não encontrada.' });
    }
    const pId = String(phoneNumberId || account?.phoneNumberId || metaConfig.phoneNumberId || '').trim();
    const token = String(accessToken || (account ? account.accessToken : metaConfig.accessToken) || '').trim();

    if (!pId || !token) {
      addApiLog({
        type: 'error',
        direction: 'outbound',
        endpoint: 'GET /v21.0/{phoneNumberId}',
        accountId: account?.id,
        accountName: account?.name,
        phoneNumberId: pId,
        success: false,
        metaErrorMessage: 'Parâmetros ausentes para teste de conexão.',
        diagnosticTip: 'Informe o Phone Number ID e o Access Token antes de testar.',
      });

      return res.status(400).json({
        success: false,
        error: 'É necessário informar Phone Number ID e Access Token.',
      });
    }

    try {
      const url = `https://graph.facebook.com/v21.0/${pId}`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const rawText = await response.text();
      let data: any;
      try {
        data = JSON.parse(rawText);
      } catch {
        data = { raw: rawText };
      }

      if (!response.ok) {
        const diag = analyzeMetaError(response.status, data);
        const log = addApiLog({
          type: 'connection_test',
          direction: 'outbound',
          endpoint: `GET /v21.0/${pId}`,
          accountId: account?.id,
          accountName: account?.name,
          phoneNumberId: pId,
          httpStatus: response.status,
          success: false,
          responseBody: data,
          metaErrorCode: diag.code,
          metaErrorSubcode: diag.subcode,
          metaErrorMessage: diag.message,
          metaErrorType: diag.type,
          metaFbTraceId: diag.fbtrace_id,
          diagnosticTip: diag.tip,
        });

        return res.status(response.status).json({
          success: false,
          error: `Meta API Erro (${response.status} - Código ${diag.code || 'N/A'}): ${diag.message}`,
          diagnosticTip: diag.tip,
          rawError: data,
          logEntry: log,
        });
      }

      if (account) {
        account.phoneNumberId = String(data.id || pId);
        account.phoneNumber = String(data.display_phone_number || account.phoneNumber || '').trim();
        if (accessToken) account.accessToken = String(accessToken).trim();
        account.updatedAt = new Date().toISOString();
        saveAccountsToFile();
      } else {
        metaConfig.phoneNumberId = String(data.id || pId);
        metaConfig.displayPhoneNumber = String(data.display_phone_number || '').trim();
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(metaConfig, null, 2));
        const syncedAccount = syncPrimaryAccountFromMeta(metaConfig.displayPhoneNumber);
        if (syncedAccount) saveAccountsToFile();
      }

      if (mongoService.isConnected()) {
        await mongoService.saveMetaConfig(metaConfig);
      }

      const log = addApiLog({
        type: 'connection_test',
        direction: 'outbound',
        endpoint: `GET /v21.0/${pId}`,
        accountId: account?.id,
        accountName: account?.name,
        phoneNumberId: pId,
        httpStatus: response.status,
        success: true,
        responseBody: data,
      });

      return res.json({
        success: true,
        message: 'Conexão com a Meta WhatsApp API validada com sucesso!',
        data: {
          verifiedName: data.verified_name || data.display_phone_number,
          displayPhoneNumber: data.display_phone_number,
          qualityRating: data.quality_rating,
          id: data.id,
        },
        logEntry: log,
      });
    } catch (err: any) {
      const log = addApiLog({
        type: 'error',
        direction: 'outbound',
        endpoint: `GET /v21.0/${pId}`,
        accountId: account?.id,
        accountName: account?.name,
        phoneNumberId: pId,
        success: false,
        metaErrorMessage: err.message,
        diagnosticTip: 'Falha de rede ao conectar com graph.facebook.com.',
      });

      return res.status(500).json({
        success: false,
        error: err.message,
        logEntry: log,
      });
    }
  });

  // API: XPag Global (MXN via SPEI and OXXO)
  app.get('/api/xpag/config', (req: Request, res: Response) => {
    res.json({
      clientId: xpagConfig.clientId,
      hasClientSecret: Boolean(xpagConfig.clientSecret),
      maskedClientSecret: xpagConfig.clientSecret
        ? `${xpagConfig.clientSecret.slice(0, 4)}...${xpagConfig.clientSecret.slice(-4)}`
        : '',
      enabled: xpagConfig.enabled,
      environment: xpagConfig.environment,
      baseUrl: xpagConfig.baseUrl,
      webhookUrl: xpagWebhookUrl(),
      publicOrigin: lastKnownPublicOrigin,
      isPublicWebhook: Boolean(lastKnownPublicOrigin) && !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(lastKnownPublicOrigin),
    });
  });

  app.post('/api/xpag/config', (req: Request, res: Response) => {
    try {
      const { clientId, clientSecret, enabled, environment } = req.body || {};
      const nextClientId = clientId !== undefined ? String(clientId).trim() : xpagConfig.clientId;
      const nextClientSecret = clientSecret?.trim() || xpagConfig.clientSecret;
      if (enabled && (!nextClientId || !nextClientSecret)) {
        return res.status(400).json({
          success: false,
          error: 'Informe Client ID e Client Secret antes de ativar a integração XPag.',
        });
      }
      xpagConfig = {
        ...xpagConfig,
        clientId: nextClientId,
        clientSecret: nextClientSecret,
        enabled: Boolean(enabled),
        environment: environment === 'sandbox' ? 'sandbox' : 'production',
        baseUrl: 'https://api.xpag.global',
      };
      saveXPagConfig();
      res.json({ success: true, message: 'Configuração XPag salva com segurança no servidor.' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/xpag/test', async (_req: Request, res: Response) => {
    try {
      const data = await xpagRequest('/balance', { method: 'GET' });
      res.json({ success: true, message: 'Credenciais XPag validadas com sucesso.', data });
    } catch (err: any) {
      res.status(err.status || 500).json({
        success: false,
        error: err.message,
        errorCode: err.errorCode,
      });
    }
  });

  app.get('/api/xpag/payments', (_req: Request, res: Response) => {
    res.json(Array.from(xpagPayments.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100));
  });

  app.post('/api/webhooks/xpag/:webhookKey', async (req: Request, res: Response) => {
    const receivedKey = String(req.params.webhookKey || '');
    const receivedKeyHash = crypto.createHash('sha256').update(receivedKey).digest('hex');
    let record = Array.from(xpagPayments.values()).find(
      (payment) => payment.webhookKeyHash === receivedKeyHash
    );
    if (!record && mongoService.isConnected()) {
      const storedPayment = await mongoService.getXPagPaymentByWebhookKeyHash(receivedKeyHash);
      if (storedPayment) {
        record = storedPayment as XPagPaymentRecord;
        xpagPayments.set(record.externalId, record);
      }
    }
    if (!record) return res.status(403).json({ success: false, error: 'Webhook XPag inválido ou expirado.' });

    const event = req.body || {};
    const eventData = event?.data || event?.payment || event;
    if (eventData.external_id && String(eventData.external_id) !== record.externalId) {
      return res.status(409).json({ success: false, error: 'A cobrança não corresponde à chave deste webhook.' });
    }

    // The unguessable URL resolves the exact payer/payment before any event data
    // is trusted. Return quickly and perform the authenticated reconciliation below.
    res.sendStatus(200);

    try {
      const eventStatus = String(eventData.status || '').toLowerCase();
      const expiredStatuses = new Set(['expired', 'expired_payment']);
      const errorStatuses = new Set(['failed', 'rejected', 'cancelled', 'canceled', 'voided']);

      if (expiredStatuses.has(eventStatus) || errorStatuses.has(eventStatus)) {
        const branch: XPagFlowBranch = expiredStatuses.has(eventStatus) ? 'expired' : 'error';
        record.status = branch === 'expired' ? 'expired' : eventStatus;
        record.response = { ...record.response, webhook: event };
        record.updatedAt = new Date().toISOString();
        saveXPagPayments();
        await resumeXPagFlowBranch(record, branch, record.response, branch === 'error' ? event : undefined);
        return;
      }

      if (eventStatus !== 'confirmed') {
        record.status = eventStatus || record.status;
        record.e2e = eventData.e2e || record.e2e;
        record.response = { ...record.response, webhook: event };
        record.updatedAt = new Date().toISOString();
        saveXPagPayments();
        return;
      }

      // XPag does not sign callback bodies. Confirm the real transaction through
      // the authenticated API before releasing the funnel. Open-value CLABEs
      // return a list because the same key can receive multiple payments.
      let verification: any;
      let verificationData: any;
      if (record.chargeMode === 'open') {
        verification = await xpagRequest(
          `/consult-transaction?external_id=${encodeURIComponent(record.externalId)}&limit=100`,
          { method: 'GET' }
        );
        const verificationRoot = verification?.data || verification?.payment || verification;
        const payments = Array.isArray(verificationRoot?.payments) ? verificationRoot.payments : [];
        const eventE2e = firstXPagValue(eventData.e2e);
        const eventTransactionId = firstXPagValue(eventData.transaction_id, eventData.transactionId);
        verificationData = payments.find((payment: any) =>
          (eventE2e && firstXPagValue(payment.e2e) === eventE2e) ||
          (eventTransactionId && firstXPagValue(payment.transaction_id, payment.transactionId, payment.id) === eventTransactionId)
        );
        if (!verificationData) {
          console.warn('[XPag Webhook] Pagamento de CLABE aberta não localizado na consulta autenticada.', {
            externalId: record.externalId,
            eventE2e,
            eventTransactionId,
          });
          return;
        }
      } else {
        const referenceName = record.transactionId ? 'transaction_id' : 'request_number';
        const referenceValue = record.transactionId || record.requestNumber;
        if (!referenceValue) throw new Error('Pagamento XPag sem identificador consultável.');
        verification = await xpagRequest(
          `/consult-transaction?${referenceName}=${encodeURIComponent(referenceValue)}`,
          { method: 'GET' }
        );
        verificationData = verification?.data || verification?.payment || verification;
      }
      const verifiedStatus = String(verificationData.status || '').toLowerCase();
      const verifiedAmount = Number(verificationData.amount);
      const verifiedCurrency = String(verificationData.currency || record.currency).toUpperCase();
      if (
        verifiedStatus !== 'confirmed' ||
        verifiedCurrency !== record.currency ||
        !Number.isFinite(verifiedAmount) ||
        verifiedAmount <= 0 ||
        (record.chargeMode !== 'open' && Math.abs(verifiedAmount - record.amount) > 0.009)
      ) {
        console.warn('[XPag Webhook] Evento não liberado após consulta autenticada.', {
          externalId: record.externalId,
          verifiedStatus,
          verifiedAmount,
          verifiedCurrency,
        });
        return;
      }

      const verifiedE2e = firstXPagValue(verificationData.e2e, eventData.e2e);
      record.receivedE2es ||= [];
      if (verifiedE2e && record.receivedE2es.includes(verifiedE2e)) return;
      if (record.chargeMode !== 'open' && record.status === 'confirmed') return;
      record.status = 'confirmed';
      record.amount = verifiedAmount;
      record.e2e = verifiedE2e || record.e2e;
      if (verifiedE2e) record.receivedE2es.push(verifiedE2e);
      record.paidAt = normalizeXPagDate(firstXPagValue(verificationData.paid_at, verificationData.confirmed_at)) || new Date().toISOString();
      record.response = { ...record.response, verification, webhook: event };
      record.updatedAt = new Date().toISOString();
      saveXPagPayments();
      await resumeXPagFlowBranch(record, 'paid', record.response);
    } catch (err: any) {
      console.error('[XPag Webhook] Erro ao reconciliar pagamento:', err.message);
    }
  });

  // API: Multiple WhatsApp Accounts / Phone Numbers Management
  app.get('/api/accounts', (_req: Request, res: Response) => {
    res.json(whatsappAccounts.map(({ flow: _flow, ...account }) => account));
  });

  app.post('/api/accounts', async (req: Request, res: Response) => {
    try {
      if (!mongoService.isConnected()) {
        return res.status(503).json({
          success: false,
          error: 'MongoDB indisponível. Não é possível criar uma linha sem persistir seu Fluxo 1 no banco.',
        });
      }
      const { name, phoneNumber, phoneNumberId, wabaId, accessToken, color, isDefault } = req.body;
      if (!name || !phoneNumberId) {
        return res.status(400).json({ success: false, error: 'Nome e Phone Number ID são obrigatórios.' });
      }
      if (whatsappAccounts.some((account) => account.phoneNumberId === phoneNumberId.trim())) {
        return res.status(409).json({ success: false, error: 'Este Phone Number ID já pertence a outra linha cadastrada.' });
      }

      const newId = `acc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      
      // If setting as default, unmark other defaults
      if (isDefault) {
        whatsappAccounts.forEach((a) => (a.isDefault = false));
      }

      const newAccount: WhatsAppAccount = {
        id: newId,
        name: name.trim(),
        phoneNumber: (phoneNumber || '').trim(),
        phoneNumberId: phoneNumberId.trim(),
        wabaId: (wabaId || '').trim(),
        accessToken: (accessToken || '').trim(),
        verifyToken: metaConfig.verifyToken,
        isDefault: Boolean(isDefault) || whatsappAccounts.length === 0,
        color: color || 'blue',
        flow: createEmptyAccountFlow(newId, name.trim()),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      whatsappAccounts.push(newAccount);
      saveAccountsToFile();
      await mongoService.saveFlow(newAccount.flow);

      res.json({
        success: true,
        message: `Novo número ${newAccount.name} adicionado com sucesso!`,
        account: newAccount,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.put('/api/accounts/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const account = whatsappAccounts.find((a) => a.id === id);
    if (!account) {
      return res.status(404).json({ success: false, error: 'Número não encontrado.' });
    }

    const { name, phoneNumber, phoneNumberId, wabaId, accessToken, color, isDefault } = req.body;

    if (isDefault) {
      whatsappAccounts.forEach((a) => (a.isDefault = false));
      account.isDefault = true;
    }

    if (name !== undefined) account.name = name.trim();
    if (phoneNumber !== undefined) account.phoneNumber = phoneNumber.trim();
    if (phoneNumberId !== undefined) {
      const normalizedPhoneNumberId = phoneNumberId.trim();
      if (whatsappAccounts.some((item) => item.id !== id && item.phoneNumberId === normalizedPhoneNumberId)) {
        return res.status(409).json({ success: false, error: 'Este Phone Number ID já pertence a outra linha cadastrada.' });
      }
      account.phoneNumberId = normalizedPhoneNumberId;
    }
    if (wabaId !== undefined) account.wabaId = wabaId.trim();
    if (accessToken !== undefined) account.accessToken = accessToken.trim();
    if (color !== undefined) account.color = color;
    account.updatedAt = new Date().toISOString();

    saveAccountsToFile();
    res.json({ success: true, message: 'Dados do número atualizados com sucesso.', account });
  });

  app.delete('/api/accounts/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    if (whatsappAccounts.length <= 1) {
      return res.status(400).json({ success: false, error: 'Não é possível remover a única conta cadastrada.' });
    }

    const idx = whatsappAccounts.findIndex((a) => a.id === id);
    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'Número não encontrado.' });
    }

    const wasDefault = whatsappAccounts[idx].isDefault;
    whatsappAccounts.splice(idx, 1);
    if (wasDefault && whatsappAccounts.length > 0) {
      whatsappAccounts[0].isDefault = true;
    }

    saveAccountsToFile();
    if (mongoService.isConnected()) {
      mongoService.deleteFlow(`flow_${id}`).catch((err) => {
        console.error('[MongoDB Atlas] Error deleting account flow:', err);
      });
    }
    res.json({ success: true, message: 'Número de WhatsApp removido com sucesso.' });
  });

  // API: Get & Save Flow (Supports account-specific flows via ?accountId=)
  app.get('/api/flow', async (req: Request, res: Response) => {
    const accountId = req.query.accountId as string;
    if (!mongoService.isConnected()) {
      return res.status(503).json({
        success: false,
        error: 'MongoDB indisponível. O funil não será carregado de arquivos JSON locais.',
      });
    }
    if (accountId) {
      const account = whatsappAccounts.find((a) => a.id === accountId);
      if (!account) return res.status(404).json({ success: false, error: 'Linha do WhatsApp não encontrada.' });
      const databaseFlow = await mongoService.getFlow(`flow_${account.id}`);
      account.flow = databaseFlow || createEmptyAccountFlow(account.id, account.name);
      return res.json(account.flow);
    }
    currentFlow = await mongoService.getFlow('flow_main') || createEmptyAccountFlow('main', 'Principal');
    res.json(currentFlow);
  });

  app.post('/api/flow', async (req: Request, res: Response) => {
    try {
      if (!mongoService.isConnected()) {
        return res.status(503).json({
          success: false,
          error: 'MongoDB indisponível. O funil não pode ser salvo somente em JSON local.',
        });
      }
      const accountId = (req.query.accountId as string) || req.body.accountId;
      const updatedFlowData = {
        ...req.body,
        updatedAt: new Date().toISOString(),
      };

      if (accountId) {
        const account = whatsappAccounts.find((a) => a.id === accountId);
        if (!account) return res.status(404).json({ success: false, error: 'Linha do WhatsApp não encontrada.' });
        account.flow = {
          ...updatedFlowData,
          id: `flow_${account.id}`,
        };
        account.updatedAt = new Date().toISOString();
        await mongoService.saveFlow(account.flow);
        return res.json({ success: true, message: `Fluxo exclusivo de "${account.name}" salvo com sucesso!` });
      }

      currentFlow = updatedFlowData;
      await mongoService.saveFlow(currentFlow);

      res.json({ success: true, message: 'Fluxo salvo com sucesso!' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // API: Meta WhatsApp API Costs & Spend Analytics
  app.get('/api/costs', (req: Request, res: Response) => {
    const exchangeRate = parseFloat(req.query.exchangeRate as string) || 5.65;

    // Official Meta WhatsApp Cloud API rates (USD) for Brazil:
    // Marketing: $0.0625 | Utility: $0.0350 | Auth: $0.0315 | Service: $0.0300
    const RATES = {
      marketing: 0.0625,
      utility: 0.035,
      authentication: 0.0315,
      service: 0.03,
    };

    const sessionsList = Array.from(sessions.values()).filter((s) => s.phoneNumber !== 'simulator_user');
    const totalConversations = sessionsList.length;

    let marketingCount = 0;
    let utilityCount = 0;
    let authCount = 0;
    let serviceCount = 0;
    let ads72hCount = 0;
    let freeTierUsed = 0;

    const accountStatsMap = new Map<string, { conversations: number; messages: number; costUsd: number }>();
    whatsappAccounts.forEach((acc) => {
      accountStatsMap.set(acc.id, { conversations: 0, messages: 0, costUsd: 0 });
    });

    const recentBilledConversations: any[] = [];

    sessionsList.forEach((s) => {
      const accId = s.accountId || 'acc_default';
      const accStat = accountStatsMap.get(accId) || { conversations: 0, messages: 0, costUsd: 0 };
      accStat.conversations += 1;
      accStat.messages += s.history?.length || 0;

      const accObj = whatsappAccounts.find((a) => a.id === accId);
      const accName = accObj?.name || 'Linha Principal';

      const isAd = Boolean(s.referral?.isFromAd) || s.windowType === '72h_ads';

      if (isAd) {
        ads72hCount += 1;
        recentBilledConversations.push({
          id: `conv_${accId}_${s.phoneNumber}`,
          phoneNumber: s.phoneNumber,
          accountName: accName,
          category: 'free_ads',
          costUsd: 0,
          costBrl: 0,
          windowType: '72h_ads',
          openedAt: s.lastCustomerMessageAt || s.createdAt,
          expiresAt: s.windowExpiresAt || '',
          isAd: true,
        });
      } else {
        if (freeTierUsed < 1000) {
          freeTierUsed += 1;
          recentBilledConversations.push({
            id: `conv_${accId}_${s.phoneNumber}`,
            phoneNumber: s.phoneNumber,
            accountName: accName,
            category: 'free_tier',
            costUsd: 0,
            costBrl: 0,
            windowType: '24h_standard',
            openedAt: s.lastCustomerMessageAt || s.createdAt,
            expiresAt: s.windowExpiresAt || '',
            isAd: false,
          });
        } else {
          serviceCount += 1;
          accStat.costUsd += RATES.service;
          recentBilledConversations.push({
            id: `conv_${accId}_${s.phoneNumber}`,
            phoneNumber: s.phoneNumber,
            accountName: accName,
            category: 'service',
            costUsd: RATES.service,
            costBrl: RATES.service * exchangeRate,
            windowType: '24h_standard',
            openedAt: s.lastCustomerMessageAt || s.createdAt,
            expiresAt: s.windowExpiresAt || '',
            isAd: false,
          });
        }
      }

      accountStatsMap.set(accId, accStat);
    });

    const totalSpendUsd =
      serviceCount * RATES.service + marketingCount * RATES.marketing + utilityCount * RATES.utility;
    const totalSpendBrl = totalSpendUsd * exchangeRate;

    const adsFreeSavingsUsd = ads72hCount * RATES.service;
    const adsFreeSavingsBrl = adsFreeSavingsUsd * exchangeRate;

    const byAccount = whatsappAccounts.map((acc) => {
      const st = accountStatsMap.get(acc.id) || { conversations: 0, messages: 0, costUsd: 0 };
      return {
        accountId: acc.id,
        accountName: acc.name,
        phoneNumber: acc.phoneNumber,
        conversationsCount: st.conversations,
        messagesCount: st.messages,
        estimatedCostUsd: st.costUsd,
        estimatedCostBrl: st.costUsd * exchangeRate,
      };
    });

    res.json({
      totalSpendUsd,
      totalSpendBrl,
      exchangeRateBrl: exchangeRate,
      totalConversations,
      freeTierLimit: 1000,
      freeTierUsed,
      freeTierRemaining: Math.max(0, 1000 - freeTierUsed),
      adsFreeWindowsCount: ads72hCount,
      adsFreeSavingsUsd,
      adsFreeSavingsBrl,
      breakdown: {
        marketing: { count: marketingCount, costUsd: 0, costBrl: 0, unitPriceUsd: RATES.marketing },
        utility: { count: utilityCount, costUsd: 0, costBrl: 0, unitPriceUsd: RATES.utility },
        authentication: { count: authCount, costUsd: 0, costBrl: 0, unitPriceUsd: RATES.authentication },
        service: {
          count: serviceCount,
          costUsd: serviceCount * RATES.service,
          costBrl: serviceCount * RATES.service * exchangeRate,
          unitPriceUsd: RATES.service,
        },
        freeTier: { count: freeTierUsed, costUsd: 0, costBrl: 0 },
        ads72h: { count: ads72hCount, costUsd: 0, costBrl: 0 },
      },
      byAccount,
      recentBilledConversations: recentBilledConversations.slice(0, 50),
    });
  });

  // API: Webhook Verification for Meta (GET)
  app.get('/api/webhook', (req: Request, res: Response) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === metaConfig.verifyToken) {
      console.log('Meta Webhook verified successfully!');
      addApiLog({
        type: 'incoming_webhook',
        direction: 'inbound',
        endpoint: 'GET /api/webhook (Challenge Handshake)',
        success: true,
        requestPayload: req.query,
      });
      return res.status(200).send(challenge);
    }

    addApiLog({
      type: 'error',
      direction: 'inbound',
      endpoint: 'GET /api/webhook',
      success: false,
      requestPayload: req.query,
      metaErrorMessage: 'Token de verificação do Webhook incompatível.',
      diagnosticTip: `O token enviado pela Meta (${token}) não corresponde ao verifyToken configurado (${metaConfig.verifyToken}).`,
    });
    return res.status(403).send('Forbidden verify token mismatch');
  });

  // API: Webhook Event Receiver from Meta (POST) - Supports Audio, Images, Docs, Referral Ads, Window tracking
  app.post('/api/webhook', async (req: Request, res: Response) => {
    res.sendStatus(200); // Acknowledge Meta immediately

    try {
      const body = req.body;
      const incomingPhoneNumberId = body?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
      const incomingAccount = incomingPhoneNumberId
        ? whatsappAccounts.find((account) => account.phoneNumberId === incomingPhoneNumberId)
        : undefined;
      addApiLog({
        type: 'incoming_webhook',
        direction: 'inbound',
        endpoint: 'POST /api/webhook',
        accountId: incomingAccount?.id,
        accountName: incomingAccount?.name,
        phoneNumberId: incomingPhoneNumberId,
        success: true,
        requestPayload: body,
      });

      if (body.object === 'whatsapp_business_account') {
        for (const entry of body.entry || []) {
          for (const change of entry.changes || []) {
            const value = change.value;
            if (value?.statuses?.length) {
              const statusAccount = value.metadata?.phone_number_id
                ? whatsappAccounts.find((account) => account.phoneNumberId === value.metadata.phone_number_id)
                : undefined;
              for (const statusEvent of value.statuses) {
                const statusError = statusEvent.errors?.[0];
                const normalizedError = statusError
                  ? {
                      error: {
                        code: statusError.code,
                        message: statusError.message || statusError.title,
                        error_data: statusError.error_data,
                      },
                    }
                  : undefined;
                const diagnostic = statusError
                  ? analyzeMetaError(400, normalizedError, statusEvent.recipient_id)
                  : undefined;
                addApiLog({
                  type: statusError ? 'error' : 'incoming_webhook',
                  direction: 'inbound',
                  endpoint: 'POST /api/webhook (status da mensagem)',
                  accountId: statusAccount?.id,
                  accountName: statusAccount?.name,
                  phoneNumberId: statusAccount?.phoneNumberId,
                  recipient: statusEvent.recipient_id,
                  success: !statusError,
                  requestPayload: statusEvent,
                  metaErrorCode: diagnostic?.code,
                  metaErrorMessage: diagnostic?.message,
                  diagnosticTip: diagnostic?.tip,
                });

                if (statusAccount && statusEvent.recipient_id) {
                  const session = sessions.get(sessionStorageKey(statusAccount.id, statusEvent.recipient_id));
                  const historyItem = session?.history.find((item) => item.id === statusEvent.id);
                  if (session && historyItem) {
                    historyItem.status = statusEvent.status === 'failed'
                      ? 'failed'
                      : statusEvent.status === 'read'
                        ? 'read'
                        : statusEvent.status === 'delivered'
                          ? 'delivered'
                          : 'sent';
                    session.updatedAt = new Date().toISOString();
                    persistSession(session);
                  }
                }
              }
            }
            if (value && value.messages && value.messages.length > 0) {
              const msg = value.messages[0];
              const from = msg.from;
              const contactInfo = value.contacts?.[0];
              const contactName = contactInfo?.profile?.name;

              // Identify destination WhatsApp line/account
              const destPhoneNumberId = value.metadata?.phone_number_id;
              const matchedAccount = destPhoneNumberId
                ? whatsappAccounts.find((a) => a.phoneNumberId === destPhoneNumberId)
                : undefined;

              if (!matchedAccount) {
                console.error(`[Meta Webhook] Nenhuma linha cadastrada para Phone Number ID ${destPhoneNumberId || 'ausente'}. Evento ignorado para evitar cruzamento de clientes.`);
                continue;
              }

              const session = getOrCreateSession(from, matchedAccount.id);
              session.accountId = matchedAccount.id;
              session.accountPhoneNumberId = matchedAccount.phoneNumberId;
              if (contactName && !session.name) {
                session.name = contactName;
              }
      refreshDefaultSessionVariables(session);

              // Check if message came from Click-to-WhatsApp Facebook/Meta Ads (72-hour window!)
              const referral = msg.referral;
              if (referral) {
                const isAd = referral.source_type === 'ad';
                session.referral = {
                  isFromAd: isAd,
                  sourceType: referral.source_type,
                  sourceId: referral.source_id,
                  sourceUrl: referral.source_url,
                  headline: referral.headline,
                  body: referral.body,
                  mediaType: referral.media_type,
                  imageUrl: referral.image_url,
                  receivedAt: new Date().toISOString(),
                };

                if (isAd) {
                  // Meta grants a 72-hour customer care window for Ads!
                  session.windowType = '72h_ads';
                  session.windowExpiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
                  console.log(`[Meta Ads Referral] Origem detectada de anúncio Facebook Ads (${referral.source_id}). Janela de 72h ativada para ${from}!`);
                }
              }

              // Handle different message types (Text, Image, Audio/Voice, Document, Video)
              let textContent = '';

              if (msg.type === 'text') {
                textContent = msg.text.body;
                await handleIncomingUserMessage(session, textContent, true);
              } else if (msg.type === 'image') {
                textContent = msg.image?.caption || '[Foto Recebida]';
                // Download and save image in Cloudflare R2 / local
                const mediaId = msg.image?.id;
                let mediaUrl = '';
                if (mediaId && matchedAccount.accessToken) {
                  const saved = await r2StorageService.downloadAndSaveMetaMedia(mediaId, matchedAccount.accessToken, 'foto.jpg');
                  if (saved?.url) mediaUrl = saved.url;
                  if (saved?.rejectedReason) textContent = `${textContent} — ${saved.rejectedReason}`;
                }

                session.history.push({
                  id: msg.id || `msg_${Date.now()}`,
                  sender: 'user',
                  type: 'image',
                  content: textContent,
                  mediaUrl: mediaUrl || undefined,
                  caption: msg.image?.caption,
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                });

                if (!session.botPaused) {
                  await handleIncomingUserMessage(session, textContent, true);
                } else {
                  persistSession(session);
                }
              } else if (msg.type === 'audio' || msg.type === 'voice') {
                textContent = '[Áudio de Voz Recebido]';
                const mediaId = msg.audio?.id || msg.voice?.id;
                let mediaUrl = '';
                if (mediaId && matchedAccount.accessToken) {
                  const saved = await r2StorageService.downloadAndSaveMetaMedia(mediaId, matchedAccount.accessToken, 'audio.ogg');
                  if (saved?.url) mediaUrl = saved.url;
                  if (saved?.rejectedReason) textContent = `${textContent} — ${saved.rejectedReason}`;
                }

                session.history.push({
                  id: msg.id || `msg_${Date.now()}`,
                  sender: 'user',
                  type: 'audio',
                  content: textContent,
                  mediaUrl: mediaUrl || undefined,
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                });

                if (!session.botPaused) {
                  await handleIncomingUserMessage(session, textContent, true);
                } else {
                  persistSession(session);
                }
              } else if (msg.type === 'document') {
                textContent = msg.document?.caption || msg.document?.filename || '[Documento Recebido]';
                const mediaId = msg.document?.id;
                let mediaUrl = '';
                if (mediaId && matchedAccount.accessToken) {
                  const saved = await r2StorageService.downloadAndSaveMetaMedia(mediaId, matchedAccount.accessToken, msg.document?.filename || 'documento.pdf');
                  if (saved?.url) mediaUrl = saved.url;
                  if (saved?.rejectedReason) textContent = `${textContent} — ${saved.rejectedReason}`;
                }

                session.history.push({
                  id: msg.id || `msg_${Date.now()}`,
                  sender: 'user',
                  type: 'document',
                  content: textContent,
                  mediaUrl: mediaUrl || undefined,
                  filename: msg.document?.filename,
                  caption: msg.document?.caption,
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                });

                if (!session.botPaused) {
                  await handleIncomingUserMessage(session, textContent, true);
                } else {
                  persistSession(session);
                }
              } else if (msg.type === 'video') {
                textContent = msg.video?.caption || '[Vídeo Recebido]';
                const mediaId = msg.video?.id;
                let mediaUrl = '';
                if (mediaId && matchedAccount.accessToken) {
                  const saved = await r2StorageService.downloadAndSaveMetaMedia(mediaId, matchedAccount.accessToken, 'video.mp4');
                  if (saved?.url) mediaUrl = saved.url;
                  if (saved?.rejectedReason) textContent = `${textContent} — ${saved.rejectedReason}`;
                }

                session.history.push({
                  id: msg.id || `msg_${Date.now()}`,
                  sender: 'user',
                  type: 'video',
                  content: textContent,
                  mediaUrl: mediaUrl || undefined,
                  caption: msg.video?.caption,
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                });

                if (!session.botPaused) {
                  await handleIncomingUserMessage(session, textContent, true);
                } else {
                  persistSession(session);
                }
              } else if (msg.type === 'interactive') {
                textContent = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || '';
                await handleIncomingUserMessage(session, textContent, true);
              } else {
                textContent = `[Mensagem tipo ${msg.type}]`;
                await handleIncomingUserMessage(session, textContent, true);
              }
            }
          }
        }
      }
    } catch (err: any) {
      console.error('Error handling webhook message:', err);
      addApiLog({
        type: 'error',
        direction: 'inbound',
        endpoint: 'POST /api/webhook',
        success: false,
        metaErrorMessage: err.message,
      });
    }
  });

  // API: Trigger Flow Manually for a Live WhatsApp Number
  app.post('/api/send-live', async (req: Request, res: Response) => {
    const { phoneNumber, accountId } = req.body;
    if (!phoneNumber) {
      return res.status(400).json({ success: false, error: 'Número de telefone é obrigatório.' });
    }

    const cleanPhone = phoneNumber.replace(/\D/g, '');
    if (!accountId) return res.status(400).json({ success: false, error: 'Selecione a linha do WhatsApp para o envio.' });
    const targetAccount = whatsappAccounts.find((account) => account.id === accountId);
    if (!targetAccount) return res.status(404).json({ success: false, error: 'Linha do WhatsApp não encontrada.' });
    const session = getOrCreateSession(cleanPhone, targetAccount.id);
    session.currentNodeId = null;
    session.waitingForInput = false;
    session.waitingForPayment = false;
    session.waitingPaymentExternalId = undefined;
    session.waitingPaymentNodeId = undefined;
    clearDurableWait(session);
    session.executionCheckpointVersion = 1;

    try {
      const { executionErrors, lastLog } = await runFlowStep(session, true);

      if (executionErrors.length > 0) {
        return res.status(400).json({
          success: false,
          error: executionErrors[0],
          allErrors: executionErrors,
          diagnosticTip: lastLog?.diagnosticTip,
          metaResponse: lastLog?.responseBody,
          logEntry: lastLog,
        });
      }

      res.json({
        success: true,
        message: `Fluxo iniciado para ${cleanPhone} via WhatsApp Oficial!`,
        logEntry: lastLog,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // API: Live Chat - Human Agent sends direct message to customer
  app.post('/api/sessions/:phoneNumber/send-agent-message', async (req: Request, res: Response) => {
    const { phoneNumber } = req.params;
    const {
      text,
      type = 'text',
      mediaId,
      mediaUrl,
      mediaMimeType,
      caption,
      filename,
      pauseBot = false,
      accountId,
    } = req.body;

    const cleanPhone = phoneNumber.replace(/\D/g, '');
    if (!accountId) return res.status(400).json({ success: false, error: 'Informe a linha do WhatsApp desta conversa.' });
    const account = whatsappAccounts.find((item) => item.id === accountId);
    if (!account) return res.status(404).json({ success: false, error: 'Linha do WhatsApp não encontrada.' });
    const session = getOrCreateSession(cleanPhone, account.id);
    const accountCredentials = {
      id: account.id,
      name: account.name,
      phoneNumberId: account.phoneNumberId,
      accessToken: account.accessToken,
    };

    // If requested, pause automated bot so agent can take over conversation
    if (pauseBot) {
      session.botPaused = true;
    }

    try {
      let sendResult: any = { success: true };
      if (type === 'text') {
        sendResult = await sendMetaWhatsAppMessage(cleanPhone, 'text', { text }, accountCredentials);
      } else if (type === 'image') {
        sendResult = await sendMetaWhatsAppMessage(cleanPhone, 'image', { mediaId, mediaUrl, mimeType: mediaMimeType, caption, filename }, accountCredentials);
      } else if (type === 'document') {
        sendResult = await sendMetaWhatsAppMessage(cleanPhone, 'document', { mediaId, mediaUrl, mimeType: mediaMimeType, caption, filename }, accountCredentials);
      } else if (type === 'audio') {
        sendResult = await sendMetaWhatsAppMessage(cleanPhone, 'audio', { mediaId, mediaUrl, mimeType: mediaMimeType, filename }, accountCredentials);
      } else if (type === 'video') {
        sendResult = await sendMetaWhatsAppMessage(cleanPhone, 'video', { mediaId, mediaUrl, mimeType: mediaMimeType, caption, filename }, accountCredentials);
      }

      // Add to session history as agent message
      const msgItem = {
        id: sendResult.data?.messages?.[0]?.id || `agent_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        sender: 'agent' as const,
        type: type as any,
        content: text || caption || (type === 'image' ? '[Imagem enviada]' : '[Arquivo enviado]'),
        mediaUrl: mediaId ? undefined : mediaUrl,
        filename,
        caption,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: sendResult.success ? 'delivered' : 'failed',
      };

      session.history.push(msgItem);
      session.updatedAt = new Date().toISOString();
      persistSession(session);

      if (!sendResult.success) {
        return res.status(400).json({
          success: false,
          error: sendResult.error,
          diagnosticTip: sendResult.logEntry?.diagnosticTip,
          session,
        });
      }

      res.json({ success: true, session });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // API: Restart Flow for Contact (Reset funnel state)
  app.post('/api/sessions/:phoneNumber/restart-flow', async (req: Request, res: Response) => {
    const { phoneNumber } = req.params;
    const { triggerNow = false, accountId } = req.body;

    const cleanPhone = phoneNumber.replace(/\D/g, '');
    const account = whatsappAccounts.find((item) => item.id === accountId);
    if (!account) return res.status(404).json({ success: false, error: 'Linha do WhatsApp não encontrada.' });
    const session = getOrCreateSession(cleanPhone, account.id);

    session.currentNodeId = null;
    session.waitingForInput = false;
    session.waitingForPayment = false;
    session.waitingPaymentExternalId = undefined;
    session.waitingPaymentNodeId = undefined;
    clearDurableWait(session);
    session.executionCheckpointVersion = 1;
    session.flowCompleted = false;
    session.botPaused = false;
    session.updatedAt = new Date().toISOString();

    if (triggerNow) {
      await runFlowStep(session, true);
    }

    persistSession(session);
    res.json({
      success: true,
      message: `Funil restaurado para ${cleanPhone}! ${triggerNow ? 'Fluxo reiniciado agora.' : 'O contato receberá o funil ao enviar a próxima mensagem.'}`,
      session,
    });
  });

  // API: Toggle Bot Pause/Resume for Human Agent
  app.post('/api/sessions/:phoneNumber/toggle-bot', (req: Request, res: Response) => {
    const { phoneNumber } = req.params;
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    const account = whatsappAccounts.find((item) => item.id === req.body?.accountId);
    if (!account) return res.status(404).json({ success: false, error: 'Linha do WhatsApp não encontrada.' });
    const session = getOrCreateSession(cleanPhone, account.id);

    session.botPaused = !session.botPaused;
    session.updatedAt = new Date().toISOString();
    persistSession(session);

    res.json({
      success: true,
      botPaused: session.botPaused,
      message: session.botPaused
        ? 'Robô pausado. Atendente humano no comando.'
        : 'Robô reativado. Automação responderá normalmente.',
      session,
    });
  });

  // API: Delete lead & conversation
  app.delete('/api/sessions/:phoneNumber', async (req: Request, res: Response) => {
    const { phoneNumber } = req.params;
    const cleanPhone = phoneNumber.replace(/\D/g, '');

    const accountId = String(req.query.accountId || '');
    const targetAccount = whatsappAccounts.find((account) => account.id === accountId);
    if (!targetAccount) return res.status(404).json({ success: false, error: 'Linha do WhatsApp não encontrada.' });
    const targetAccountId = targetAccount.id;
    sessions.delete(sessionStorageKey(targetAccountId, cleanPhone));
    saveSessionsToFile();

    if (mongoService.isConnected()) {
      await mongoService.deleteSession(targetAccountId, cleanPhone);
    }

    res.json({ success: true, message: `Conversa e lead de ${cleanPhone} excluídos com sucesso.` });
  });

  // API: Clear conversation history
  app.post('/api/sessions/:phoneNumber/clear-history', (req: Request, res: Response) => {
    const { phoneNumber } = req.params;
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    const account = whatsappAccounts.find((item) => item.id === req.body?.accountId);
    if (!account) return res.status(404).json({ success: false, error: 'Linha do WhatsApp não encontrada.' });
    const session = getOrCreateSession(cleanPhone, account.id);

    session.history = [];
    session.updatedAt = new Date().toISOString();
    persistSession(session);

    res.json({ success: true, message: 'Histórico da conversa limpo.', session });
  });

  // API: Cleanup expired sessions (> 7 days)
  app.post('/api/sessions/cleanup-expired', (_req: Request, res: Response) => {
    cleanupExpiredSessions();
    res.json({ success: true, message: 'Limpeza de conversas expiradas concluída.' });
  });

  // API: Get all active sessions / contacts (with live window state and optional accountId filter)
  app.get('/api/sessions', (req: Request, res: Response) => {
    const accountId = req.query.accountId as string;
    let list = Array.from(sessions.values())
      .filter((s) => s.phoneNumber !== 'simulator_user')
      .map(updateWindowState);

    if (accountId && accountId !== 'all') {
      list = list.filter((s) => s.accountId === accountId);
    }
    res.json(list);
  });

  // API: Simulator Endpoints
  app.get('/api/simulator/session', (req: Request, res: Response) => {
    const account = whatsappAccounts.find((item) => item.id === String(req.query.accountId || ''));
    if (!account) return res.status(404).json({ success: false, error: 'Linha do WhatsApp não encontrada.' });
    const session = getOrCreateSession('simulator_user', account.id);
    res.json(session);
  });

  app.post('/api/simulator/send', async (req: Request, res: Response) => {
    const { message, accountId } = req.body;
    const account = whatsappAccounts.find((item) => item.id === accountId);
    if (!account) return res.status(404).json({ success: false, error: 'Linha do WhatsApp não encontrada.' });
    const session = getOrCreateSession('simulator_user', account.id);
    await handleIncomingUserMessage(session, message || 'oi', false);
    res.json(session);
  });

  app.post('/api/simulator/reset', async (req: Request, res: Response) => {
    const now = new Date();
    const accountId = req.body?.accountId as string | undefined;
    const account = whatsappAccounts.find((item) => item.id === accountId);
    if (!account) return res.status(404).json({ success: false, error: 'Linha do WhatsApp não encontrada.' });
    const resolvedAccountId = account.id;
    const activeFlow = account.flow || createEmptyAccountFlow(account.id, account.name);
    const session: SessionData = {
      phoneNumber: 'simulator_user',
      name: 'Simulador WhatsApp',
      accountId: resolvedAccountId,
      accountPhoneNumberId: account?.phoneNumberId,
      activeFlowId: activeFlow.id,
      currentNodeId: null,
      waitingForInput: false,
      variables: getDefaultSessionVariables({
        phoneNumber: '+55 11 99999-0000',
        name: 'Simulador WhatsApp',
      }),
      history: [],
      isWindowOpen: true,
      windowType: '24h_standard',
      windowExpiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      botPaused: false,
      flowCompleted: false,
      autoDeleteDays: 7,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    sessions.set(sessionStorageKey(resolvedAccountId, 'simulator_user'), session);
    await runFlowStep(session, false);
    persistSession(session);
    res.json(session);
  });

  // API: Simulate Meta / Facebook Ads Referral lead for testing (72-hour window)
  app.post('/api/simulator/simulate-ad-lead', (req: Request, res: Response) => {
    const { phoneNumber = '+55 11 99999-9999', headline = 'Campanha Facebook Ads - 50% OFF', adId = 'ad_meta_8392104', accountId } = req.body || {};
    const cleanPhone = (phoneNumber || '5511999999999').replace(/\D/g, '');
    const account = whatsappAccounts.find((item) => item.id === accountId);
    if (!account) return res.status(404).json({ success: false, error: 'Linha do WhatsApp não encontrada.' });
    const session = getOrCreateSession(cleanPhone, account.id);
    const now = new Date();

    session.referral = {
      isFromAd: true,
      sourceType: 'ad',
      sourceId: adId,
      sourceUrl: 'https://fb.me/ad_fluxozap',
      headline: headline,
      body: 'Lead originado pelo clique no anúncio patrocinado do Facebook Ads / Instagram',
      mediaType: 'image',
      imageUrl: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600&auto=format&fit=crop',
      receivedAt: now.toISOString(),
    };
    session.windowType = '72h_ads';
    session.windowExpiresAt = new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString();
    session.isWindowOpen = true;
    session.name = 'Lead Facebook Ads';
    session.variables = { ...session.variables, phone: cleanPhone, origem: 'Meta Ads' };
    refreshDefaultSessionVariables(session);
    session.history.push({
      id: `ad_${Date.now()}`,
      sender: 'user',
      type: 'text',
      content: 'Olá! Vi o anúncio no Facebook e gostaria de saber mais.',
      timestamp: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    });
    session.updatedAt = now.toISOString();
    persistSession(session);

    res.json({
      success: true,
      message: `Lead de anúncio Meta Ads simulado com sucesso para ${cleanPhone} com janela de 72h!`,
      session,
    });
  });

  // Vite middleware in dev or static files in production
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        watch: {
          ignored: [
            '**/data/**',
            '**/uploads/**',
            '**/*.json',
            '**/data/**/*',
            '**/uploads/**/*',
          ],
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
