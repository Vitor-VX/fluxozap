import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
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

// Interface for API Logs
interface ApiLogEntry {
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
      console.error('[MongoDB Atlas] Error persisting log to WhatsApp model:', err);
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

let currentFlow: any = defaultFlow;
if (fs.existsSync(FLOW_FILE)) {
  try {
    currentFlow = JSON.parse(fs.readFileSync(FLOW_FILE, 'utf-8'));
  } catch (err) {
    console.error('Error reading flow file:', err);
  }
}

// User sessions by phone number
interface SessionData {
  phoneNumber: string;
  name?: string;
  activeFlowId: string;
  currentNodeId: string | null;
  waitingForInput: boolean;
  waitingVariableName?: string;
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
    for (const [key, val] of Object.entries(saved)) {
      sessions.set(key, val as SessionData);
    }
  } catch (err) {
    console.error('Error loading sessions:', err);
  }
}

function persistSession(session: SessionData) {
  saveSessionsToFile();
  if (mongoService.isConnected()) {
    mongoService.saveSession(session).catch((err) => {
      console.error('[MongoDB Atlas] Error saving session to WhatsApp model:', err);
    });
  }
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

function getOrCreateSession(phoneNumber: string): SessionData {
  let session = sessions.get(phoneNumber);
  const now = new Date();
  if (!session) {
    const windowExpires = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const autoDelete = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    session = {
      phoneNumber,
      activeFlowId: currentFlow.id,
      currentNodeId: null,
      waitingForInput: false,
      variables: { phone: phoneNumber },
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
    sessions.set(phoneNumber, session);
    persistSession(session);
  } else {
    updateWindowState(session);
  }
  return session;
}

// Periodic cleanup of expired conversations (7 days rule)
function cleanupExpiredSessions() {
  const now = Date.now();
  let deletedCount = 0;
  for (const [phone, s] of sessions.entries()) {
    if (phone === 'simulator_user') continue;
    const days = s.autoDeleteDays || 7;
    const lastActive = new Date(s.updatedAt).getTime();
    if (now - lastActive > days * 24 * 60 * 60 * 1000) {
      sessions.delete(phone);
      if (mongoService.isConnected()) {
        mongoService.deleteSession(phone).catch(console.error);
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

// Send real message using Meta WhatsApp Cloud API with full logging
async function sendMetaWhatsAppMessage(
  recipientPhone: string,
  messageType: 'text' | 'image' | 'document' | 'audio' | 'video',
  payload: { text?: string; mediaUrl?: string; caption?: string; filename?: string }
): Promise<{ success: boolean; data?: any; error?: string; logEntry?: ApiLogEntry }> {
  const cleanPhone = recipientPhone.replace(/\D/g, '');
  const endpoint = `POST /v21.0/${metaConfig.phoneNumberId || '{phoneNumberId}'}/messages`;

  if (!metaConfig.phoneNumberId || !metaConfig.accessToken) {
    const log = addApiLog({
      type: 'error',
      direction: 'outbound',
      endpoint,
      recipient: cleanPhone,
      messageType,
      success: false,
      metaErrorMessage: 'Credenciais ausentes: Phone Number ID ou Access Token não configurados.',
      diagnosticTip:
        'Acesse a aba "Configuração Meta API" e preencha o Phone Number ID e o Access Token gerados no portal da Meta Developers.',
    });

    return {
      success: false,
      error: 'WhatsApp Cloud API credentials not configured (Phone Number ID or Access Token missing).',
      logEntry: log,
    };
  }

  let body: any = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: cleanPhone,
  };

  if (messageType === 'text') {
    body.type = 'text';
    body.text = {
      preview_url: false,
      body: payload.text || '',
    };
  } else if (messageType === 'image') {
    body.type = 'image';
    body.image = {
      link: payload.mediaUrl,
      caption: payload.caption || '',
    };
  } else if (messageType === 'document') {
    body.type = 'document';
    body.document = {
      link: payload.mediaUrl,
      caption: payload.caption || '',
      filename: payload.filename || 'documento.pdf',
    };
  } else if (messageType === 'audio') {
    body.type = 'audio';
    body.audio = {
      link: payload.mediaUrl,
    };
  } else if (messageType === 'video') {
    body.type = 'video';
    body.video = {
      link: payload.mediaUrl,
      caption: payload.caption || '',
    };
  }

  try {
    const url = `https://graph.facebook.com/v21.0/${metaConfig.phoneNumberId}/messages`;
    console.log(`[WhatsApp API Request] Envio para ${cleanPhone} (${messageType})...`);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${metaConfig.accessToken}`,
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
    const log = addApiLog({
      type: 'error',
      direction: 'outbound',
      endpoint,
      recipient: cleanPhone,
      messageType,
      success: false,
      requestPayload: body,
      metaErrorMessage: err.message || 'Falha de rede ao conectar à Meta API',
      diagnosticTip: 'Verifique a conexão com a internet ou se o servidor consegue acessar graph.facebook.com.',
    });

    return {
      success: false,
      error: err.message || 'Network error calling Meta API',
      logEntry: log,
    };
  }
}

// Engine step runner: executes nodes sequentially until a wait_reply or flow end
async function runFlowStep(
  session: SessionData,
  isLiveWhatsApp: boolean = false
): Promise<{ executionErrors: string[]; lastLog?: ApiLogEntry }> {
  // If bot is paused for this customer, do not execute automated bot steps
  if (session.botPaused) {
    return { executionErrors: [] };
  }

  const nodes = currentFlow.nodes;
  const edges = currentFlow.edges;
  const executionErrors: string[] = [];
  let lastLog: ApiLogEntry | undefined;

  // If session hasn't started yet, find start node
  if (!session.currentNodeId) {
    const startNode = nodes.find((n: any) => n.type === 'start') || nodes[0];
    if (!startNode) return { executionErrors };
    session.currentNodeId = startNode.id;
  }

  let safetyCounter = 0;
  while (safetyCounter < 30) {
    safetyCounter++;
    const currentNode = nodes.find((n: any) => n.id === session.currentNodeId);
    if (!currentNode) break;

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
        const sendResult = await sendMetaWhatsAppMessage(session.phoneNumber, 'text', { text: parsedText });
        if (sendResult.logEntry) lastLog = sendResult.logEntry;
        if (!sendResult.success) {
          executionErrors.push(sendResult.error || 'Erro ao enviar mensagem de texto.');
          break;
        }
      }
    } else if (currentNode.type === 'send_image') {
      const parsedCaption = replaceVariables(currentNode.data.caption || '', session.variables);
      const msgItem = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        sender: 'bot' as const,
        type: 'image' as const,
        content: parsedCaption,
        mediaUrl: currentNode.data.mediaUrl,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      session.history.push(msgItem);

      if (isLiveWhatsApp && currentNode.data.mediaUrl) {
        const sendResult = await sendMetaWhatsAppMessage(session.phoneNumber, 'image', {
          mediaUrl: currentNode.data.mediaUrl,
          caption: parsedCaption,
        });
        if (sendResult.logEntry) lastLog = sendResult.logEntry;
        if (!sendResult.success) {
          executionErrors.push(sendResult.error || 'Erro ao enviar imagem.');
          break;
        }
      }
    } else if (currentNode.type === 'send_document') {
      const parsedCaption = replaceVariables(currentNode.data.caption || '', session.variables);
      const msgItem = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        sender: 'bot' as const,
        type: 'document' as const,
        content: parsedCaption,
        mediaUrl: currentNode.data.mediaUrl,
        filename: currentNode.data.filename || 'documento.pdf',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      session.history.push(msgItem);

      if (isLiveWhatsApp && currentNode.data.mediaUrl) {
        const sendResult = await sendMetaWhatsAppMessage(session.phoneNumber, 'document', {
          mediaUrl: currentNode.data.mediaUrl,
          caption: parsedCaption,
          filename: currentNode.data.filename,
        });
        if (sendResult.logEntry) lastLog = sendResult.logEntry;
        if (!sendResult.success) {
          executionErrors.push(sendResult.error || 'Erro ao enviar documento.');
          break;
        }
      }
    } else if (currentNode.type === 'wait_reply') {
      session.waitingForInput = true;
      session.waitingVariableName = currentNode.data.variableName || 'user_reply';
      session.updatedAt = new Date().toISOString();
      persistSession(session);
      return { executionErrors, lastLog };
    } else if (currentNode.type === 'delay') {
      const seconds = (currentNode.data as any)?.delaySeconds || 2;
      if (seconds > 0) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(seconds * 1000, 5000)));
      }
    }

    // Find next connected edge
    const outgoingEdge = edges.find((e: any) => e.source === currentNode.id);
    if (outgoingEdge) {
      session.currentNodeId = outgoingEdge.target;
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

// Checks if an incoming message matches the start trigger rules
function checkStartTriggerMatch(userMessageText: string): boolean {
  const startNode = currentFlow.nodes?.find((n: any) => n.type === 'start');
  const triggerType = startNode?.data?.triggerType || currentFlow.triggerType || 'all';
  const keywords: string[] = startNode?.data?.triggerKeywords || currentFlow.triggerKeywords || [];

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

  const nodes = currentFlow.nodes;
  const edges = currentFlow.edges;

  // 1. If currently waiting for user input on a wait_reply block
  if (session.waitingForInput && session.currentNodeId) {
    const currentNode = nodes.find((n: any) => n.id === session.currentNodeId);
    if (currentNode && currentNode.type === 'wait_reply') {
      const varName = session.waitingVariableName || currentNode.data.variableName || 'user_reply';
      session.variables[varName] = userMessageText;
      session.waitingForInput = false;
      session.waitingVariableName = undefined;

      const outgoingEdge = edges.find((e: any) => e.source === currentNode.id);
      if (outgoingEdge) {
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

  // 2. If flow is starting or already completed: check start trigger rule
  const triggerMatches = checkStartTriggerMatch(userMessageText);
  if (!triggerMatches) {
    const startNode = currentFlow.nodes?.find((n: any) => n.type === 'start');
    const triggerType = startNode?.data?.triggerType || currentFlow.triggerType || 'all';
    const keywords: string[] = startNode?.data?.triggerKeywords || currentFlow.triggerKeywords || [];

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
  session.flowCompleted = false;
  return await runFlowStep(session, isLiveWhatsApp);
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));

  // Static uploads directory for media files
  app.use('/uploads', express.static(UPLOADS_DIR));

  // Auto-connect to MongoDB Atlas if URI is present
  await mongoService.autoConnect({
    config: metaConfig,
    flow: currentFlow,
    sessions: Array.from(sessions.values()),
    logs: apiLogs,
  });

  // If MongoDB has existing WhatsApp document, sync it into memory
  if (mongoService.isConnected()) {
    try {
      const doc = await mongoService.getWhatsAppDocument();
      if (doc) {
        if (doc.flow?.nodes?.length > 0) {
          currentFlow = doc.flow as any;
        }
        if (doc.config?.phoneNumberId) {
          metaConfig = { ...metaConfig, ...doc.config };
        }
        if (doc.sessions?.length > 0) {
          for (const s of doc.sessions) {
            sessions.set(s.phoneNumber, s as any);
          }
        }
        if (doc.logs?.length > 0) {
          apiLogs = doc.logs as any;
        }
        if (doc.r2Config?.accountId) {
          r2StorageService.updateConfig(doc.r2Config as any);
        }
      }
    } catch (err) {
      console.error('[MongoDB Atlas] Error syncing initial data from WhatsApp model:', err);
    }
  }

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

  // Manual File Upload endpoint (for human agent in live chat)
  app.post('/api/upload', async (req: Request, res: Response) => {
    try {
      const { filename, fileData, mimeType } = req.body;
      if (!fileData) {
        return res.status(400).json({ success: false, error: 'Arquivo não informado.' });
      }

      // Convert base64 data to Buffer
      const base64Content = fileData.includes(';base64,')
        ? fileData.split(';base64,')[1]
        : fileData;
      const buffer = Buffer.from(base64Content, 'base64');

      const uploadResult = await r2StorageService.uploadFile(
        buffer,
        filename || 'upload.png',
        mimeType || 'application/octet-stream'
      );

      res.json({
        success: true,
        ...uploadResult,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
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
      await mongoService.ensureDefaultWhatsAppDocument({
        config: metaConfig,
        flow: currentFlow,
        sessions: Array.from(sessions.values()),
        logs: apiLogs,
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
      for (const s of sessions.values()) {
        await mongoService.saveSession(s);
      }
      res.json({
        success: true,
        message: 'Dados sincronizados com sucesso no model "WhatsApp" do MongoDB Atlas!',
        status: await mongoService.getStatus(),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // API: Get & Save Meta Cloud API Config
  app.get('/api/config', (_req: Request, res: Response) => {
    res.json({
      ...metaConfig,
      hasAccessToken: Boolean(metaConfig.accessToken),
      maskedToken: metaConfig.accessToken
        ? `${metaConfig.accessToken.substring(0, 6)}...${metaConfig.accessToken.slice(-4)}`
        : '',
    });
  });

  app.post('/api/config', async (req: Request, res: Response) => {
    const { phoneNumberId, accessToken, wabaId, verifyToken, testPhoneNumber } = req.body;
    metaConfig = {
      phoneNumberId: phoneNumberId?.trim() || metaConfig.phoneNumberId,
      accessToken: accessToken?.trim() || metaConfig.accessToken,
      wabaId: wabaId?.trim() || metaConfig.wabaId,
      verifyToken: verifyToken?.trim() || metaConfig.verifyToken,
      testPhoneNumber: testPhoneNumber?.trim() || metaConfig.testPhoneNumber,
    };
    try {
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
    let filtered = apiLogs;
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
      errorsCount: apiLogs.filter((l) => !l.success).length,
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
    const { phoneNumberId, accessToken } = req.body;
    const pId = phoneNumberId || metaConfig.phoneNumberId;
    const token = accessToken || metaConfig.accessToken;

    if (!pId || !token) {
      addApiLog({
        type: 'error',
        direction: 'outbound',
        endpoint: 'GET /v21.0/{phoneNumberId}',
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

      const log = addApiLog({
        type: 'connection_test',
        direction: 'outbound',
        endpoint: `GET /v21.0/${pId}`,
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

  // API: Get & Save Flow
  app.get('/api/flow', (_req: Request, res: Response) => {
    res.json(currentFlow);
  });

  app.post('/api/flow', async (req: Request, res: Response) => {
    try {
      currentFlow = {
        ...req.body,
        updatedAt: new Date().toISOString(),
      };
      fs.writeFileSync(FLOW_FILE, JSON.stringify(currentFlow, null, 2));

      if (mongoService.isConnected()) {
        await mongoService.saveFlow(currentFlow);
      }

      res.json({ success: true, message: 'Fluxo salvo com sucesso!' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
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
      addApiLog({
        type: 'incoming_webhook',
        direction: 'inbound',
        endpoint: 'POST /api/webhook',
        success: true,
        requestPayload: body,
      });

      if (body.object === 'whatsapp_business_account') {
        for (const entry of body.entry || []) {
          for (const change of entry.changes || []) {
            const value = change.value;
            if (value && value.messages && value.messages.length > 0) {
              const msg = value.messages[0];
              const from = msg.from;
              const contactInfo = value.contacts?.[0];
              const contactName = contactInfo?.profile?.name;

              const session = getOrCreateSession(from);
              if (contactName && !session.name) {
                session.name = contactName;
              }

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
                if (mediaId && metaConfig.accessToken) {
                  const saved = await r2StorageService.downloadAndSaveMetaMedia(mediaId, metaConfig.accessToken, 'foto.jpg');
                  if (saved) mediaUrl = saved.url;
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
                if (mediaId && metaConfig.accessToken) {
                  const saved = await r2StorageService.downloadAndSaveMetaMedia(mediaId, metaConfig.accessToken, 'audio.ogg');
                  if (saved) mediaUrl = saved.url;
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
                if (mediaId && metaConfig.accessToken) {
                  const saved = await r2StorageService.downloadAndSaveMetaMedia(mediaId, metaConfig.accessToken, msg.document?.filename || 'documento.pdf');
                  if (saved) mediaUrl = saved.url;
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
                if (mediaId && metaConfig.accessToken) {
                  const saved = await r2StorageService.downloadAndSaveMetaMedia(mediaId, metaConfig.accessToken, 'video.mp4');
                  if (saved) mediaUrl = saved.url;
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
    const { phoneNumber } = req.body;
    if (!phoneNumber) {
      return res.status(400).json({ success: false, error: 'Número de telefone é obrigatório.' });
    }

    const cleanPhone = phoneNumber.replace(/\D/g, '');
    const session = getOrCreateSession(cleanPhone);
    session.currentNodeId = null;
    session.waitingForInput = false;

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
    const { text, type = 'text', mediaUrl, caption, filename, pauseBot = false } = req.body;

    const cleanPhone = phoneNumber.replace(/\D/g, '');
    const session = getOrCreateSession(cleanPhone);

    // If requested, pause automated bot so agent can take over conversation
    if (pauseBot) {
      session.botPaused = true;
    }

    try {
      let sendResult: any = { success: true };
      if (type === 'text') {
        sendResult = await sendMetaWhatsAppMessage(cleanPhone, 'text', { text });
      } else if (type === 'image') {
        sendResult = await sendMetaWhatsAppMessage(cleanPhone, 'image', { mediaUrl, caption });
      } else if (type === 'document') {
        sendResult = await sendMetaWhatsAppMessage(cleanPhone, 'document', { mediaUrl, caption, filename });
      } else if (type === 'audio') {
        sendResult = await sendMetaWhatsAppMessage(cleanPhone, 'audio', { mediaUrl });
      } else if (type === 'video') {
        sendResult = await sendMetaWhatsAppMessage(cleanPhone, 'video', { mediaUrl, caption });
      }

      // Add to session history as agent message
      const msgItem = {
        id: `agent_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        sender: 'agent' as const,
        type: type as any,
        content: text || caption || (type === 'image' ? '[Imagem enviada]' : '[Arquivo enviado]'),
        mediaUrl,
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
    const { triggerNow = false } = req.body;

    const cleanPhone = phoneNumber.replace(/\D/g, '');
    const session = getOrCreateSession(cleanPhone);

    session.currentNodeId = null;
    session.waitingForInput = false;
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
    const session = getOrCreateSession(cleanPhone);

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

    sessions.delete(cleanPhone);
    saveSessionsToFile();

    if (mongoService.isConnected()) {
      await mongoService.deleteSession(cleanPhone);
    }

    res.json({ success: true, message: `Conversa e lead de ${cleanPhone} excluídos com sucesso.` });
  });

  // API: Clear conversation history
  app.post('/api/sessions/:phoneNumber/clear-history', (req: Request, res: Response) => {
    const { phoneNumber } = req.params;
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    const session = getOrCreateSession(cleanPhone);

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

  // API: Get all active sessions / contacts (with live window state)
  app.get('/api/sessions', (_req: Request, res: Response) => {
    const list = Array.from(sessions.values())
      .filter((s) => s.phoneNumber !== 'simulator_user')
      .map(updateWindowState);
    res.json(list);
  });

  // API: Simulator Endpoints
  app.get('/api/simulator/session', (_req: Request, res: Response) => {
    const session = getOrCreateSession('simulator_user');
    res.json(session);
  });

  app.post('/api/simulator/send', async (req: Request, res: Response) => {
    const { message } = req.body;
    const session = getOrCreateSession('simulator_user');
    await handleIncomingUserMessage(session, message || 'oi', false);
    res.json(session);
  });

  app.post('/api/simulator/reset', async (_req: Request, res: Response) => {
    const now = new Date();
    const session: SessionData = {
      phoneNumber: 'simulator_user',
      name: 'Simulador WhatsApp',
      activeFlowId: currentFlow.id,
      currentNodeId: null,
      waitingForInput: false,
      variables: { phone: '+55 11 99999-0000', nome: '' },
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
    sessions.set('simulator_user', session);
    await runFlowStep(session, false);
    persistSession(session);
    res.json(session);
  });

  // API: Simulate Meta / Facebook Ads Referral lead for testing (72-hour window)
  app.post('/api/simulator/simulate-ad-lead', (req: Request, res: Response) => {
    const { phoneNumber = '+55 11 98765-4321', headline = 'Campanha Facebook Ads - 50% OFF', adId = 'ad_meta_8392104' } = req.body || {};
    const cleanPhone = (phoneNumber || '5511987654321').replace(/\D/g, '');
    const session = getOrCreateSession(cleanPhone);
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
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
