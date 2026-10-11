import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { S3Client, PutObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { R2Config } from '../types/flow';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, '../../data');
const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');
const R2_CONFIG_FILE = path.join(DATA_DIR, 'r2_config.json');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

class R2StorageService {
  private config: R2Config = {
    accountId: process.env.R2_ACCOUNT_ID || '',
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    bucketName: process.env.R2_BUCKET_NAME || '',
    publicUrl: process.env.R2_PUBLIC_URL || '',
  };

  private s3Client: S3Client | null = null;

  constructor() {
    this.loadConfig();
    this.initS3Client();
  }

  private loadConfig() {
    if (fs.existsSync(R2_CONFIG_FILE)) {
      try {
        const saved = JSON.parse(fs.readFileSync(R2_CONFIG_FILE, 'utf-8'));
        this.config = { ...this.config, ...saved };
      } catch (err) {
        console.error('Error reading R2 config file:', err);
      }
    }
  }

  private saveConfig() {
    try {
      fs.writeFileSync(R2_CONFIG_FILE, JSON.stringify(this.config, null, 2));
    } catch (err) {
      console.error('Error saving R2 config file:', err);
    }
  }

  public initS3Client() {
    if (
      this.config.accountId &&
      this.config.accessKeyId &&
      this.config.secretAccessKey &&
      this.config.bucketName
    ) {
      try {
        this.s3Client = new S3Client({
          region: 'auto',
          endpoint: `https://${this.config.accountId}.r2.cloudflarestorage.com`,
          credentials: {
            accessKeyId: this.config.accessKeyId,
            secretAccessKey: this.config.secretAccessKey,
          },
        });
        console.log('[Cloudflare R2] Cliente S3 configurado para o bucket:', this.config.bucketName);
      } catch (err) {
        console.error('[Cloudflare R2] Erro ao instanciar S3Client:', err);
        this.s3Client = null;
      }
    } else {
      this.s3Client = null;
    }
  }

  public getConfig(): R2Config & { isConfigured: boolean; maskedSecret: string } {
    return {
      ...this.config,
      isConfigured: Boolean(this.s3Client),
      maskedSecret: this.config.secretAccessKey
        ? `${this.config.secretAccessKey.substring(0, 4)}••••••••${this.config.secretAccessKey.slice(-4)}`
        : '',
    };
  }

  public updateConfig(newConfig: Partial<R2Config>) {
    this.config = {
      accountId: newConfig.accountId?.trim() ?? this.config.accountId,
      accessKeyId: newConfig.accessKeyId?.trim() ?? this.config.accessKeyId,
      secretAccessKey: newConfig.secretAccessKey?.trim() ?? this.config.secretAccessKey,
      bucketName: newConfig.bucketName?.trim() ?? this.config.bucketName,
      publicUrl: newConfig.publicUrl?.trim() ?? this.config.publicUrl,
    };
    this.saveConfig();
    this.initS3Client();
  }

  public async testConnection(): Promise<{ success: boolean; message: string }> {
    if (!this.s3Client || !this.config.bucketName) {
      return {
        success: false,
        message: 'Preencha Account ID, Access Key ID, Secret Access Key e Bucket Name do Cloudflare R2.',
      };
    }

    try {
      const command = new HeadBucketCommand({ Bucket: this.config.bucketName });
      await this.s3Client.send(command);
      return {
        success: true,
        message: `Conexão com Cloudflare R2 estabelecida com sucesso! Bucket "${this.config.bucketName}" acessível.`,
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Falha ao conectar no bucket R2: ${err.message || 'Erro de autenticação ou bucket inexistente'}`,
      };
    }
  }

  /**
   * Upload buffer to Cloudflare R2 (or fallback to local /uploads if R2 not configured)
   */
  public async uploadFile(
    fileBuffer: Buffer,
    filename: string,
    mimeType: string
  ): Promise<{ url: string; storageType: 'r2' | 'local'; filename: string }> {
    const cleanFilename = `${Date.now()}_${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

    // If R2 is configured and active, upload to Cloudflare R2
    if (this.s3Client && this.config.bucketName) {
      try {
        const key = `whatsapp-media/${cleanFilename}`;
        const command = new PutObjectCommand({
          Bucket: this.config.bucketName,
          Key: key,
          Body: fileBuffer,
          ContentType: mimeType,
        });

        await this.s3Client.send(command);

        // Generate public URL
        let publicUrl = '';
        if (this.config.publicUrl) {
          const base = this.config.publicUrl.replace(/\/+$/, '');
          publicUrl = `${base}/${key}`;
        } else {
          publicUrl = `https://${this.config.bucketName}.${this.config.accountId}.r2.cloudflarestorage.com/${key}`;
        }

        console.log(`[Cloudflare R2] Arquivo enviado com sucesso: ${cleanFilename} -> ${publicUrl}`);
        return { url: publicUrl, storageType: 'r2', filename: cleanFilename };
      } catch (err) {
        console.error('[Cloudflare R2] Erro no upload para R2, usando fallback local:', err);
      }
    }

    // Fallback: save to local /uploads directory
    const localPath = path.join(UPLOADS_DIR, cleanFilename);
    fs.writeFileSync(localPath, fileBuffer);
    const localUrl = `/uploads/${cleanFilename}`;
    console.log(`[Local Storage] Arquivo salvo localmente: ${cleanFilename} -> ${localUrl}`);
    return { url: localUrl, storageType: 'local', filename: cleanFilename };
  }

  /**
   * Downloads incoming WhatsApp media (audio, voice, image, document, video) from Meta API
   * and saves it permanently to Cloudflare R2 or local storage
   */
  public async downloadAndSaveMetaMedia(
    mediaId: string,
    accessToken: string,
    suggestedFilename?: string
  ): Promise<{ url: string; mimeType: string; filename: string; size: number } | null> {
    if (!mediaId || !accessToken) return null;

    try {
      // 1. Get media URL from Meta Graph API
      const metaInfoRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!metaInfoRes.ok) {
        console.error('[Meta Media Info Error]:', await metaInfoRes.text());
        return null;
      }

      const mediaInfo = await metaInfoRes.json();
      const downloadUrl = mediaInfo.url;
      const mimeType = mediaInfo.mime_type || 'application/octet-stream';

      if (!downloadUrl) return null;

      // 2. Download the binary stream with auth header
      const binaryRes = await fetch(downloadUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!binaryRes.ok) {
        console.error('[Meta Media Download Error]:', binaryRes.status);
        return null;
      }

      const arrayBuffer = await binaryRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Deduce file extension
      let ext = 'bin';
      if (mimeType.includes('image/jpeg')) ext = 'jpg';
      else if (mimeType.includes('image/png')) ext = 'png';
      else if (mimeType.includes('image/webp')) ext = 'webp';
      else if (mimeType.includes('audio/ogg') || mimeType.includes('audio/opus')) ext = 'ogg';
      else if (mimeType.includes('audio/mp3') || mimeType.includes('audio/mpeg')) ext = 'mp3';
      else if (mimeType.includes('audio/mp4')) ext = 'm4a';
      else if (mimeType.includes('video/mp4')) ext = 'mp4';
      else if (mimeType.includes('pdf')) ext = 'pdf';

      const filename = suggestedFilename || `media_${mediaId}.${ext}`;
      const uploadResult = await this.uploadFile(buffer, filename, mimeType);

      return {
        url: uploadResult.url,
        mimeType,
        filename: uploadResult.filename,
        size: buffer.length,
      };
    } catch (err) {
      console.error('[Meta Media Download Exception]:', err);
      return null;
    }
  }
}

export const r2StorageService = new R2StorageService();
export default r2StorageService;
