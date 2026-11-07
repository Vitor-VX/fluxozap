import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');
const CONFIG_FILE = path.join(DATA_DIR, 'uazapi_config.json');

export interface UazapiConfig {
  serverUrl: string;
  adminToken: string;
}

export interface UazapiInstance {
  id?: string;
  token?: string;
  name?: string;
  status?: 'disconnected' | 'connecting' | 'connected' | 'hibernated' | string;
  qrcode?: string;
  paircode?: string;
  owner?: string;
  profileName?: string;
  profilePicUrl?: string;
  isBusiness?: boolean;
  lastDisconnect?: string;
  lastDisconnectReason?: string;
}

export class UazapiHttpError extends Error {
  status: number;
  responseBody: any;

  constructor(message: string, status: number, responseBody: any) {
    super(message);
    this.name = 'UazapiHttpError';
    this.status = status;
    this.responseBody = responseBody;
  }
}

function normalizeServerUrl(value: unknown): string {
  return String(value || '').trim().replace(/\/+$/, '');
}

class UazapiService {
  private config: UazapiConfig = {
    serverUrl: normalizeServerUrl(process.env.UAZAPI_SERVER_URL),
    adminToken: String(process.env.UAZAPI_ADMIN_TOKEN || '').trim(),
  };

  constructor() {
    this.loadConfig();
  }

  private loadConfig() {
    if (!fs.existsSync(CONFIG_FILE)) return;
    try {
      const saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      this.config = {
        serverUrl: this.config.serverUrl || normalizeServerUrl(saved.serverUrl),
        adminToken: this.config.adminToken || String(saved.adminToken || '').trim(),
      };
    } catch (error) {
      console.error('[UazAPI] Não foi possível ler a configuração local:', error);
    }
  }

  private saveConfig() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2));
  }

  public updateConfig(input: Partial<UazapiConfig>) {
    this.config = {
      serverUrl: input.serverUrl !== undefined ? normalizeServerUrl(input.serverUrl) : this.config.serverUrl,
      adminToken: input.adminToken !== undefined && String(input.adminToken).trim()
        ? String(input.adminToken).trim()
        : this.config.adminToken,
    };
    this.saveConfig();
  }

  public getConfig() {
    const token = this.config.adminToken;
    return {
      serverUrl: this.config.serverUrl,
      adminToken: '',
      hasAdminToken: Boolean(token),
      maskedAdminToken: token ? `${token.slice(0, 4)}••••••••${token.slice(-4)}` : '',
      isConfigured: Boolean(this.config.serverUrl && token),
    };
  }

  public getPersistableConfig(): UazapiConfig {
    return { ...this.config };
  }

  private async request<T = any>(
    route: string,
    options: RequestInit & { instanceToken?: string; admin?: boolean } = {}
  ): Promise<T> {
    if (!this.config.serverUrl) throw new Error('Configure a Server URL da UazAPI.');
    const { instanceToken, admin, ...fetchOptions } = options;
    const token = admin ? this.config.adminToken : String(instanceToken || '').trim();
    if (!token) throw new Error(admin ? 'Configure o Admin Token da UazAPI.' : 'Token da instância UazAPI ausente.');

    const headers = new Headers(fetchOptions.headers || {});
    headers.set(admin ? 'admintoken' : 'token', token);
    if (fetchOptions.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

    const response = await fetch(`${this.config.serverUrl}${route}`, { ...fetchOptions, headers });
    const raw = await response.text();
    let body: any = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { body = { rawResponse: raw }; }
    if (!response.ok) {
      const message = body?.message_ptbr || body?.provider_message_ptbr || body?.error || body?.message || `UazAPI respondeu HTTP ${response.status}.`;
      throw new UazapiHttpError(String(message), response.status, body);
    }
    return body as T;
  }

  public async testAdminConnection() {
    return this.request<any>('/instance/all', { method: 'GET', admin: true });
  }

  public async createInstance(name: string) {
    return this.request<{ response?: string; instance?: UazapiInstance }>('/instance/create', {
      method: 'POST',
      admin: true,
      body: JSON.stringify({ name }),
    });
  }

  public async connectInstance(instanceToken: string) {
    return this.request<any>('/instance/connect', {
      method: 'POST',
      instanceToken,
      body: JSON.stringify({ browser: 'auto', history_days: 90 }),
    });
  }

  public async getInstanceStatus(instanceToken: string) {
    return this.request<{ instance?: UazapiInstance; status?: { connected?: boolean; loggedIn?: boolean; jid?: any } }>(
      '/instance/status',
      { method: 'GET', instanceToken }
    );
  }

  public async disconnectInstance(instanceToken: string) {
    return this.request<any>('/instance/disconnect', { method: 'POST', instanceToken });
  }

  public async configureWebhook(instanceToken: string, webhookUrl: string) {
    return this.request<any>('/webhook', {
      method: 'POST',
      instanceToken,
      body: JSON.stringify({
        enabled: true,
        url: webhookUrl,
        events: ['messages', 'messages_update', 'connection'],
        excludeMessages: ['wasSentByApi', 'fromMeYes', 'isGroupYes'],
        addUrlEvents: false,
        addUrlTypesMessages: false,
      }),
    });
  }

  public async sendText(instanceToken: string, number: string, text: string, replyid?: string) {
    return this.request<any>('/send/text', {
      method: 'POST',
      instanceToken,
      body: JSON.stringify({ number, text, ...(replyid ? { replyid } : {}), track_source: 'fluxozap' }),
    });
  }

  public async sendMedia(instanceToken: string, payload: {
    number: string;
    type: 'image' | 'video' | 'document' | 'audio' | 'ptt';
    file: string;
    text?: string;
    docName?: string;
    replyid?: string;
  }) {
    return this.request<any>('/send/media', {
      method: 'POST',
      instanceToken,
      body: JSON.stringify({ ...payload, track_source: 'fluxozap' }),
    });
  }

  public async setChatBlocked(instanceToken: string, number: string, blocked: boolean) {
    return this.request<any>('/chat/block', {
      method: 'POST',
      instanceToken,
      body: JSON.stringify({ number, block: blocked }),
    });
  }
}

export const uazapiService = new UazapiService();
