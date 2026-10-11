import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import {
  ApiLogModel,
  FlowModel,
  FLUXOZAP_COLLECTIONS,
  ProjectConfig,
  SessionModel,
  WhatsAppAccountModel,
  XPagPaymentModel,
} from '../models/FluxoZap';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');
const MONGO_CONFIG_FILE = path.join(DATA_DIR, 'mongo_config.json');

export const FLUXOZAP_DATABASE_NAME = 'FluxoZap';

export interface ProjectSnapshot {
  config?: any;
  r2Config?: any;
  xpagConfig?: any;
  flow?: any;
  sessions?: any[];
  accounts?: any[];
  logs?: any[];
  xpagPayments?: any[];
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

class MongoService {
  private uri = process.env.MONGODB_URI || '';
  private status: MongoStatus['status'] = 'disconnected';
  private lastError: string | null = null;
  private lastConnectedAt: string | null = null;
  private isInitializing = false;

  constructor() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    this.loadSavedConfig();
  }

  private loadSavedConfig() {
    if (!fs.existsSync(MONGO_CONFIG_FILE)) return;
    try {
      const saved = JSON.parse(fs.readFileSync(MONGO_CONFIG_FILE, 'utf-8'));
      if (saved.uri && !this.uri) this.uri = saved.uri;
    } catch (err) {
      console.error('Error reading mongo config file:', err);
    }
  }

  private saveMongoConfigFile() {
    try {
      fs.writeFileSync(
        MONGO_CONFIG_FILE,
        JSON.stringify({ uri: this.uri, databaseName: FLUXOZAP_DATABASE_NAME }, null, 2)
      );
    } catch (err) {
      console.error('Error saving mongo config:', err);
    }
  }

  public getMaskedUri(uriToMask?: string): string {
    const target = uriToMask || this.uri;
    if (!target) return '';
    return target.replace(/:([^@/]+)@/, ':••••••••@');
  }

  public async connect(customUri?: string): Promise<{ success: boolean; message: string; status: MongoStatus }> {
    const targetUri = customUri ? customUri.trim() : this.uri.trim();
    if (!targetUri) {
      this.status = 'disconnected';
      this.lastError = 'Nenhuma URI de conexão do MongoDB Atlas informada.';
      return { success: false, message: this.lastError, status: await this.getStatus() };
    }

    this.uri = targetUri;
    this.saveMongoConfigFile();
    this.status = 'connecting';
    this.lastError = null;

    try {
      if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
      console.log(`[MongoDB Atlas] Conectando ao banco dedicado ${FLUXOZAP_DATABASE_NAME}...`);
      const startTime = Date.now();
      await mongoose.connect(this.uri, {
        dbName: FLUXOZAP_DATABASE_NAME,
        serverSelectionTimeoutMS: 8000,
        connectTimeoutMS: 10000,
      });
      this.status = 'connected';
      this.lastConnectedAt = new Date().toISOString();
      console.log(`[MongoDB Atlas] ${FLUXOZAP_DATABASE_NAME} conectado em ${Date.now() - startTime}ms.`);
      return {
        success: true,
        message: `Conectado ao banco "${FLUXOZAP_DATABASE_NAME}". As coleções do projeto estão prontas.`,
        status: await this.getStatus(),
      };
    } catch (err: any) {
      this.status = 'error';
      this.lastError = err.message || 'Falha ao conectar no cluster MongoDB Atlas.';
      console.error('[MongoDB Atlas Connection Error]:', err);
      return { success: false, message: this.lastError || 'Erro na conexão com MongoDB.', status: await this.getStatus() };
    }
  }

  public async disconnect() {
    try {
      if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
      this.status = 'disconnected';
      this.lastError = null;
      return { success: true, message: 'Desconectado do MongoDB Atlas.', status: await this.getStatus() };
    } catch (err: any) {
      return { success: false, message: err.message, status: await this.getStatus() };
    }
  }

  public async getStatus(): Promise<MongoStatus> {
    const connected = this.isConnected();
    let pingMs: number | undefined;
    let collectionCounts: Record<string, number> | undefined;
    if (connected && mongoose.connection.db) {
      try {
        const start = Date.now();
        await mongoose.connection.db.admin().ping();
        pingMs = Date.now() - start;
        const counts = await Promise.all([
          ProjectConfig.countDocuments(), FlowModel.countDocuments(), SessionModel.countDocuments(),
          WhatsAppAccountModel.countDocuments(), ApiLogModel.countDocuments(), XPagPaymentModel.countDocuments(),
        ]);
        collectionCounts = Object.fromEntries(FLUXOZAP_COLLECTIONS.map((name, index) => [name, counts[index]]));
      } catch (err) {
        console.error('Error reading MongoDB status:', err);
      }
    }
    const documentsCount = collectionCounts
      ? Object.values(collectionCounts).reduce((total, value) => total + value, 0)
      : undefined;
    return {
      status: connected ? 'connected' : this.status,
      uriConfigured: Boolean(this.uri),
      maskedUri: this.getMaskedUri(),
      databaseName: mongoose.connection.db?.databaseName || (connected ? FLUXOZAP_DATABASE_NAME : undefined),
      host: mongoose.connection.host,
      pingMs,
      documentsCount,
      modelName: 'FluxoZap',
      collections: FLUXOZAP_COLLECTIONS,
      collectionCounts,
      error: this.lastError || undefined,
      lastConnectedAt: this.lastConnectedAt || undefined,
    };
  }

  public isConnected(): boolean {
    return mongoose.connection.readyState === 1;
  }

  public async ensureProjectData(initialData: ProjectSnapshot = {}): Promise<void> {
    if (!this.isConnected()) return;
    await Promise.all([
      ProjectConfig.createCollection(),
      FlowModel.createCollection(),
      SessionModel.createCollection(),
      WhatsAppAccountModel.createCollection(),
      ApiLogModel.createCollection(),
      XPagPaymentModel.createCollection(),
    ]);
    // Older FluxoZap versions keyed a session only by the customer's phone.
    // Replace that index so the same customer can exist independently on each line.
    const sessionIndexes = await SessionModel.collection.indexes();
    const legacyPhoneIndex = sessionIndexes.find((index: any) =>
      index.unique && Object.keys(index.key || {}).length === 1 && index.key?.phoneNumber === 1
    );
    if (legacyPhoneIndex?.name) await SessionModel.collection.dropIndex(legacyPhoneIndex.name);
    await SessionModel.syncIndexes();
    if (!(await ProjectConfig.exists({ identifier: 'default' }))) {
      await ProjectConfig.create({
        identifier: 'default',
        meta: initialData.config || {},
        r2: initialData.r2Config || {},
        xpag: initialData.xpagConfig || {},
      });
    }
    if (initialData.flow && !(await FlowModel.exists({ flowId: initialData.flow.id || 'default' }))) {
      await this.saveFlow(initialData.flow);
    }
    if ((await SessionModel.countDocuments()) === 0 && initialData.sessions?.length) {
      await Promise.all(initialData.sessions.map((session) => this.saveSession(session)));
    }
    if ((await WhatsAppAccountModel.countDocuments()) === 0 && initialData.accounts?.length) {
      await this.saveAccounts(initialData.accounts);
    }
    if ((await ApiLogModel.countDocuments()) === 0 && initialData.logs?.length) {
      await Promise.all(initialData.logs.slice(0, 200).map((log) => this.addLog(log)));
    }
    if ((await XPagPaymentModel.countDocuments()) === 0 && initialData.xpagPayments?.length) {
      await Promise.all(initialData.xpagPayments.map((payment) => this.saveXPagPayment(payment)));
    }
  }

  public async getProjectSnapshot(): Promise<ProjectSnapshot | null> {
    if (!this.isConnected()) return null;
    const [project, flow, sessions, accounts, logs, payments] = await Promise.all([
      ProjectConfig.findOne({ identifier: 'default' }).lean(),
      FlowModel.findOne().sort({ updatedAt: -1 }).lean(),
      SessionModel.find().lean(),
      WhatsAppAccountModel.find().lean(),
      ApiLogModel.find().sort({ timestamp: -1 }).limit(200).lean(),
      XPagPaymentModel.find().sort({ updatedAt: -1 }).limit(1000).lean(),
    ]);
    return {
      config: (project as any)?.meta || {},
      r2Config: (project as any)?.r2 || {},
      xpagConfig: (project as any)?.xpag || {},
      flow: (flow as any)?.data,
      sessions: sessions.map((item: any) => item.data),
      accounts: accounts.map((item: any) => item.data),
      logs: logs.map((item: any) => item.data),
      xpagPayments: payments.map((item: any) => item.data),
    };
  }

  public async saveFlow(flowData: any): Promise<boolean> {
    if (!this.isConnected()) return false;
    const data = { ...flowData, updatedAt: new Date().toISOString() };
    await FlowModel.updateOne({ flowId: data.id || 'default' }, { $set: { data } }, { upsert: true });
    return true;
  }

  public async saveMetaConfig(data: any): Promise<boolean> {
    if (!this.isConnected()) return false;
    await ProjectConfig.updateOne({ identifier: 'default' }, { $set: { meta: data } }, { upsert: true });
    return true;
  }

  public async saveR2Config(data: any): Promise<boolean> {
    if (!this.isConnected()) return false;
    await ProjectConfig.updateOne({ identifier: 'default' }, { $set: { r2: data } }, { upsert: true });
    return true;
  }

  public async saveXPagConfig(data: any): Promise<boolean> {
    if (!this.isConnected()) return false;
    await ProjectConfig.updateOne({ identifier: 'default' }, { $set: { xpag: data } }, { upsert: true });
    return true;
  }

  public async saveSession(data: any): Promise<boolean> {
    if (!this.isConnected() || !data?.phoneNumber || !data?.accountId) return false;
    await SessionModel.updateOne(
      { accountId: data.accountId, phoneNumber: data.phoneNumber },
      { $set: { accountId: data.accountId, data } },
      { upsert: true }
    );
    return true;
  }

  public async deleteSession(accountId: string, phoneNumber: string): Promise<boolean> {
    if (!this.isConnected()) return false;
    await SessionModel.deleteOne({ accountId, phoneNumber });
    return true;
  }

  public async saveAccounts(accounts: any[]): Promise<boolean> {
    if (!this.isConnected()) return false;
    const validAccounts = (accounts || []).filter((item) => item?.id);
    await Promise.all(validAccounts.map((data) =>
      WhatsAppAccountModel.updateOne(
        { accountId: data.id },
        { $set: { phoneNumberId: data.phoneNumberId, data } },
        { upsert: true }
      )
    ));
    await Promise.all(validAccounts.filter((item) => item.flow).map((item) => this.saveFlow(item.flow)));
    if (validAccounts.length) {
      await WhatsAppAccountModel.deleteMany({ accountId: { $nin: validAccounts.map((item) => item.id) } });
    } else {
      await WhatsAppAccountModel.deleteMany({});
    }
    return true;
  }

  public async addLog(data: any): Promise<boolean> {
    if (!this.isConnected() || !data?.id) return false;
    await ApiLogModel.updateOne(
      { logId: data.id },
      { $set: { timestamp: data.timestamp, data } },
      { upsert: true }
    );
    const staleLogs = await ApiLogModel.find().sort({ timestamp: -1 }).skip(200).select('_id').lean();
    if (staleLogs.length) await ApiLogModel.deleteMany({ _id: { $in: staleLogs.map((item) => item._id) } });
    return true;
  }

  public async clearLogs(): Promise<boolean> {
    if (!this.isConnected()) return false;
    await ApiLogModel.deleteMany({});
    return true;
  }

  public async saveXPagPayment(data: any): Promise<boolean> {
    if (!this.isConnected() || !data?.externalId) return false;
    await XPagPaymentModel.updateOne(
      { externalId: data.externalId },
      { $set: { webhookKeyHash: data.webhookKeyHash, sessionPhoneNumber: data.sessionPhoneNumber, status: data.status, data } },
      { upsert: true }
    );
    return true;
  }

  public async getXPagPaymentByWebhookKeyHash(webhookKeyHash: string): Promise<any | null> {
    if (!this.isConnected()) return null;
    const payment = await XPagPaymentModel.findOne({ webhookKeyHash }).lean();
    return (payment as any)?.data || null;
  }

  public async autoConnect(initialData?: ProjectSnapshot) {
    if (!this.uri || this.isInitializing) return;
    this.isInitializing = true;
    try {
      const result = await this.connect();
      if (result.success) await this.ensureProjectData(initialData);
    } catch (err) {
      console.error('[MongoDB Atlas AutoConnect]:', err);
    } finally {
      this.isInitializing = false;
    }
  }
}

export const mongoService = new MongoService();
export default mongoService;
