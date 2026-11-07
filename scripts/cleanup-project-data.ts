import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { S3Client, DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { FLUXOZAP_COLLECTIONS } from '../src/models/FluxoZap';

const execute = process.argv.includes('--execute');
const root = process.cwd();
const mongoConfigPath = path.join(root, 'data', 'mongo_config.json');
const r2ConfigPath = path.join(root, 'data', 'r2_config.json');

const mongoSaved = fs.existsSync(mongoConfigPath) ? JSON.parse(fs.readFileSync(mongoConfigPath, 'utf8')) : {};
const r2Saved = fs.existsSync(r2ConfigPath) ? JSON.parse(fs.readFileSync(r2ConfigPath, 'utf8')) : {};
const mongoUri = String(process.env.MONGODB_URI || mongoSaved.uri || '').trim();
const databaseName = 'FluxoZap';
const r2Prefix = 'whatsapp-media/';

async function inspectMongo() {
  if (!mongoUri) return { configured: false, counts: {} as Record<string, number> };
  await mongoose.connect(mongoUri, { dbName: databaseName, serverSelectionTimeoutMS: 10_000 });
  const db = mongoose.connection.db;
  if (!db) throw new Error('MongoDB conectado sem referência ao banco.');
  const counts: Record<string, number> = {};
  for (const name of FLUXOZAP_COLLECTIONS) counts[name] = await db.collection(name).countDocuments();
  let remaining: Record<string, number> | undefined;
  if (execute) {
    for (const name of FLUXOZAP_COLLECTIONS) await db.collection(name).deleteMany({});
    remaining = {};
    for (const name of FLUXOZAP_COLLECTIONS) remaining[name] = await db.collection(name).countDocuments();
  }
  await mongoose.disconnect();
  return { configured: true, databaseName, counts, remaining };
}

async function inspectR2() {
  const configured = Boolean(r2Saved.accountId && r2Saved.accessKeyId && r2Saved.secretAccessKey && r2Saved.bucketName);
  if (!configured) return { configured: false, objectCount: 0, totalBytes: 0 };
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${r2Saved.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: r2Saved.accessKeyId, secretAccessKey: r2Saved.secretAccessKey },
  });
  let continuationToken: string | undefined;
  let objectCount = 0;
  let totalBytes = 0;
  do {
    const page = await client.send(new ListObjectsV2Command({
      Bucket: r2Saved.bucketName,
      Prefix: r2Prefix,
      ContinuationToken: continuationToken,
    }));
    const objects = (page.Contents || []).filter((item) => item.Key);
    objectCount += objects.length;
    totalBytes += objects.reduce((sum, item) => sum + Number(item.Size || 0), 0);
    if (execute && objects.length) {
      await client.send(new DeleteObjectsCommand({
        Bucket: r2Saved.bucketName,
        Delete: { Quiet: true, Objects: objects.map((item) => ({ Key: item.Key! })) },
      }));
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);
  return { configured: true, bucketName: r2Saved.bucketName, prefix: r2Prefix, objectCount, totalBytes };
}

const [mongo, r2] = await Promise.all([inspectMongo(), inspectR2()]);
console.log(JSON.stringify({ mode: execute ? 'execute' : 'dry-run', mongo, r2 }, null, 2));
