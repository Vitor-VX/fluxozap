import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { WhatsApp, IWhatsAppDocument } from '../models/WhatsApp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, '../../data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const MONGO_CONFIG_FILE = path.join(DATA_DIR, 'mongo_config.json');

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

class MongoService {
  private uri: string = process.env.MONGODB_URI || '';
  private status: 'connected' | 'connecting' | 'disconnected' | 'error' = 'disconnected';
  private lastError: string | null = null;
  private lastConnectedAt: string | null = null;
  private isInitializing: boolean = false;

  constructor() {
    this.loadSavedConfig();
  }

  private loadSavedConfig() {
    if (fs.existsSync(MONGO_CONFIG_FILE)) {
      try {
        const saved = JSON.parse(fs.readFileSync(MONGO_CONFIG_FILE, 'utf-8'));
        if (saved.uri && !this.uri) {
          this.uri = saved.uri;
        }
      } catch (err) {
        console.error('Error reading mongo config file:', err);
      }
    }
  }

  private saveMongoConfigFile() {
    try {
      fs.writeFileSync(MONGO_CONFIG_FILE, JSON.stringify({ uri: this.uri }, null, 2));
    } catch (err) {
      console.error('Error saving mongo config:', err);
    }
  }

  public getMaskedUri(uriToMask?: string): string {
    const target = uriToMask || this.uri;
    if (!target) return '';
    try {
      // Mask password in mongodb+srv://username:password@cluster...
      return target.replace(/:([^@/]+)@/, ':••••••••@');
    } catch {
      return 'mongodb+srv://••••••••';
    }
  }

  public async connect(customUri?: string): Promise<{ success: boolean; message: string; status: MongoStatus }> {
    const targetUri = customUri ? customUri.trim() : this.uri.trim();

    if (!targetUri) {
      this.status = 'disconnected';
      this.lastError = 'Nenhuma URI de conexão do MongoDB Atlas informada.';
      return {
        success: false,
        message: this.lastError,
        status: await this.getStatus(),
      };
    }

    this.uri = targetUri;
    this.saveMongoConfigFile();
    this.status = 'connecting';
    this.lastError = null;

    try {
      if (mongoose.connection.readyState === 1) {
        await mongoose.disconnect();
      }

      console.log('[MongoDB Atlas] Conectando ao cluster...');
      const startTime = Date.now();

      await mongoose.connect(this.uri, {
        serverSelectionTimeoutMS: 8000,
        connectTimeoutMS: 10000,
      });

      const pingTime = Date.now() - startTime;
      this.status = 'connected';
      this.lastConnectedAt = new Date().toISOString();
      console.log(`[MongoDB Atlas] Conectado com sucesso em ${pingTime}ms! Model: WhatsApp`);

      // Initialize default WhatsApp model document if not present
      await this.ensureDefaultWhatsAppDocument();

      return {
        success: true,
        message: 'Conectado com sucesso ao MongoDB Atlas! Dados vinculados ao model "WhatsApp".',
        status: await this.getStatus(),
      };
    } catch (err: any) {
      this.status = 'error';
      this.lastError = err.message || 'Falha ao conectar no cluster MongoDB Atlas.';
      console.error('[MongoDB Atlas Connection Error]:', err);

      return {
        success: false,
        message: this.lastError || 'Erro na conexão com MongoDB.',
        status: await this.getStatus(),
      };
    }
  }

  public async disconnect(): Promise<{ success: boolean; message: string; status: MongoStatus }> {
    try {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
      this.status = 'disconnected';
      this.lastError = null;
      return {
        success: true,
        message: 'Desconectado do MongoDB Atlas.',
        status: await this.getStatus(),
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.message,
        status: await this.getStatus(),
      };
    }
  }

  public async getStatus(): Promise<MongoStatus> {
    const isConn = mongoose.connection.readyState === 1;
    let pingMs: number | undefined;
    let docCount: number | undefined;

    if (isConn && mongoose.connection.db) {
      try {
        const pingStart = Date.now();
        await mongoose.connection.db.admin().ping();
        pingMs = Date.now() - pingStart;

        docCount = await WhatsApp.countDocuments();
      } catch (err) {
        console.error('Error pinging Mongo:', err);
      }
    }

    return {
      status: isConn ? 'connected' : this.status,
      uriConfigured: Boolean(this.uri),
      maskedUri: this.getMaskedUri(),
      databaseName: mongoose.connection.db?.databaseName,
      host: mongoose.connection.host,
      pingMs,
      documentsCount: docCount,
      modelName: 'WhatsApp',
      error: this.lastError || undefined,
      lastConnectedAt: this.lastConnectedAt || undefined,
    };
  }

  public isConnected(): boolean {
    return mongoose.connection.readyState === 1;
  }

  // Ensures the primary 'WhatsApp' document exists in the collection
  public async ensureDefaultWhatsAppDocument(initialData?: {
    config?: any;
    flow?: any;
    sessions?: any[];
    logs?: any[];
  }): Promise<IWhatsAppDocument | null> {
    if (!this.isConnected()) return null;

    try {
      let doc = await WhatsApp.findOne({ identifier: 'default' });
      if (!doc) {
        console.log('[MongoDB Atlas] Criando documento inicial no model "WhatsApp"...');
        doc = new WhatsApp({
          identifier: 'default',
          name: 'Instância Principal WhatsApp',
          config: initialData?.config || {},
          flow: initialData?.flow || {},
          sessions: initialData?.sessions || [],
          logs: initialData?.logs || [],
        });
        await doc.save();
      }
      return doc;
    } catch (err) {
      console.error('[MongoDB Atlas] Erro ao garantir documento no model WhatsApp:', err);
      return null;
    }
  }

  // Fetch full data from WhatsApp model
  public async getWhatsAppDocument(): Promise<IWhatsAppDocument | null> {
    if (!this.isConnected()) return null;
    try {
      return await WhatsApp.findOne({ identifier: 'default' });
    } catch (err) {
      console.error('Error fetching WhatsApp document from MongoDB:', err);
      return null;
    }
  }

  // Save Flow to WhatsApp model
  public async saveFlow(flowData: any): Promise<boolean> {
    if (!this.isConnected()) return false;
    try {
      await WhatsApp.updateOne(
        { identifier: 'default' },
        {
          $set: {
            flow: {
              ...flowData,
              updatedAt: new Date().toISOString(),
            },
          },
        },
        { upsert: true }
      );
      return true;
    } catch (err) {
      console.error('[MongoDB Atlas] Erro ao salvar fluxo no model WhatsApp:', err);
      return false;
    }
  }

  // Save Meta WhatsApp Config to WhatsApp model
  public async saveMetaConfig(configData: any): Promise<boolean> {
    if (!this.isConnected()) return false;
    try {
      await WhatsApp.updateOne(
        { identifier: 'default' },
        { $set: { config: configData } },
        { upsert: true }
      );
      return true;
    } catch (err) {
      console.error('[MongoDB Atlas] Erro ao salvar config no model WhatsApp:', err);
      return false;
    }
  }

  // Save / Update session in WhatsApp model
  public async saveSession(sessionData: any): Promise<boolean> {
    if (!this.isConnected()) return false;
    try {
      const doc = await WhatsApp.findOne({ identifier: 'default' });
      if (!doc) {
        await this.ensureDefaultWhatsAppDocument();
      }

      // Check if session exists in array
      const existingIndex = doc?.sessions.findIndex(
        (s: any) => s.phoneNumber === sessionData.phoneNumber
      );

      if (existingIndex !== undefined && existingIndex >= 0 && doc) {
        doc.sessions[existingIndex] = sessionData;
        await doc.save();
      } else if (doc) {
        doc.sessions.push(sessionData);
        await doc.save();
      }
      return true;
    } catch (err) {
      console.error('[MongoDB Atlas] Erro ao salvar sessão no model WhatsApp:', err);
      return false;
    }
  }

  // Delete session from WhatsApp model
  public async deleteSession(phoneNumber: string): Promise<boolean> {
    if (!this.isConnected()) return false;
    try {
      await WhatsApp.updateOne(
        { identifier: 'default' },
        { $pull: { sessions: { phoneNumber } } }
      );
      return true;
    } catch (err) {
      console.error('[MongoDB Atlas] Erro ao deletar sessão no model WhatsApp:', err);
      return false;
    }
  }

  // Save R2 Config in WhatsApp model
  public async saveR2Config(r2Data: any): Promise<boolean> {
    if (!this.isConnected()) return false;
    try {
      await WhatsApp.updateOne(
        { identifier: 'default' },
        { $set: { r2Config: r2Data } },
        { upsert: true }
      );
      return true;
    } catch (err) {
      console.error('[MongoDB Atlas] Erro ao salvar R2 config no model WhatsApp:', err);
      return false;
    }
  }

  // Add Log Entry into WhatsApp model (maintaining last 200 logs)
  public async addLog(logEntry: any): Promise<boolean> {
    if (!this.isConnected()) return false;
    try {
      await WhatsApp.updateOne(
        { identifier: 'default' },
        {
          $push: {
            logs: {
              $each: [logEntry],
              $position: 0,
              $slice: 200,
            },
          },
        },
        { upsert: true }
      );
      return true;
    } catch (err) {
      console.error('[MongoDB Atlas] Erro ao salvar log no model WhatsApp:', err);
      return false;
    }
  }

  // Clear logs in WhatsApp model
  public async clearLogs(): Promise<boolean> {
    if (!this.isConnected()) return false;
    try {
      await WhatsApp.updateOne({ identifier: 'default' }, { $set: { logs: [] } });
      return true;
    } catch (err) {
      console.error('[MongoDB Atlas] Erro ao limpar logs no model WhatsApp:', err);
      return false;
    }
  }

  // Initial auto-connect if URI is present
  public async autoConnect(initialData?: {
    config?: any;
    flow?: any;
    sessions?: any[];
    logs?: any[];
  }) {
    if (this.uri && !this.isInitializing) {
      this.isInitializing = true;
      try {
        await this.connect();
        if (this.isConnected()) {
          await this.ensureDefaultWhatsAppDocument(initialData);
        }
      } catch (err) {
        console.error('[MongoDB Atlas AutoConnect]:', err);
      } finally {
        this.isInitializing = false;
      }
    }
  }
}

export const mongoService = new MongoService();
export default mongoService;
