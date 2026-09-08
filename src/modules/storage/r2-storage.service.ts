import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

@Injectable()
export class R2StorageService {
  private cached: S3Client | null = null;

  private requireEnv(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) {
      throw new ServiceUnavailableException(
        `Cloudflare R2 is not configured (${name} is missing). Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, and R2_PUBLIC_BASE_URL.`,
      );
    }
    return value;
  }

  private client(): S3Client {
    if (this.cached) return this.cached;
    const accountId = this.requireEnv('R2_ACCOUNT_ID');
    const accessKeyId = this.requireEnv('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.requireEnv('R2_SECRET_ACCESS_KEY');
    const endpoint =
      process.env.R2_ENDPOINT?.trim() ||
      `https://${accountId}.r2.cloudflarestorage.com`;
    this.cached = new S3Client({
      region: 'auto',
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
    });
    return this.cached;
  }

  private bucket(): string {
    return this.requireEnv('R2_BUCKET');
  }

  private publicBase(): string {
    return this.requireEnv('R2_PUBLIC_BASE_URL').replace(/\/+$/, '');
  }

  async putBannerImage(file: {
    buffer: Buffer;
    mimetype: string;
  }): Promise<{ key: string; url: string }> {
    const ext = MIME_EXT[file.mimetype] ?? 'bin';
    const key = `banners/${randomUUID()}.${ext}`;
    await this.client().send(
      new PutObjectCommand({
        Bucket: this.bucket(),
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    return { key, url: `${this.publicBase()}/${key}` };
  }

  async deleteObject(key: string | null | undefined): Promise<void> {
    if (!key) return;
    try {
      await this.client().send(
        new DeleteObjectCommand({ Bucket: this.bucket(), Key: key }),
      );
    } catch {
      // Object may already be gone.
    }
  }
}
