import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getApps, initializeApp, cert, type App } from 'firebase-admin/app';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';

type PushPlatform = 'android' | 'ios' | 'web';

type ParsedServiceAccount = {
  projectId?: string;
  clientEmail?: string;
  privateKey?: string;
  // keep originals in case someone provides camelCase already
  project_id?: string;
  client_email?: string;
  private_key?: string;
};

@Injectable()
export class FcmService {
  private readonly logger = new Logger(FcmService.name);
  private app: App | null = null;
  private messaging: Messaging | null = null;

  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    return !!(this.config.get<string>('FCM_SERVICE_ACCOUNT_JSON') || this.config.get<string>('FCM_SERVICE_ACCOUNT_JSON_B64'));
  }

  private ensureInitialized(): void {
    if (this.messaging) return;

    if (getApps().length > 0) {
      // If another module initialized it, reuse the default app.
      this.app = getApps()[0]!;
      this.messaging = getMessaging(this.app);
      return;
    }

    const jsonRaw = this.config.get<string>('FCM_SERVICE_ACCOUNT_JSON')?.trim();
    const b64 = this.config.get<string>('FCM_SERVICE_ACCOUNT_JSON_B64')?.trim();
    const parsed = this.parseServiceAccount(jsonRaw, b64);
    if (!parsed) {
      return;
    }

    try {
      const projectId = parsed.projectId ?? parsed.project_id;
      const clientEmail = parsed.clientEmail ?? parsed.client_email;
      const privateKey = parsed.privateKey ?? parsed.private_key;
      if (!clientEmail || !privateKey) {
        this.logger.warn('FCM credentials missing clientEmail/privateKey after normalization (FCM disabled).');
        return;
      }

      this.app = initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
      this.messaging = getMessaging(this.app);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`Failed to initialize Firebase Admin for FCM (FCM disabled): ${msg}`);
      this.app = null;
      this.messaging = null;
    }
  }

  private parseServiceAccount(jsonRaw?: string, b64?: string): ParsedServiceAccount | null {
    const source = jsonRaw
      ? jsonRaw
      : b64
        ? Buffer.from(b64, 'base64').toString('utf8')
        : '';
    if (!source) return null;
    try {
      const obj = JSON.parse(source) as ParsedServiceAccount;
      const clientEmail = obj.clientEmail ?? obj.client_email;
      const privateKeyRaw = obj.privateKey ?? obj.private_key;
      if (!clientEmail || !privateKeyRaw) {
        this.logger.warn('FCM credentials missing client email/private key (FCM disabled).');
        return null;
      }
      // firebase-admin expects real newlines in the private key
      const privateKey = privateKeyRaw.includes('\\n') ? privateKeyRaw.replace(/\\n/g, '\n') : privateKeyRaw;
      return {
        ...obj,
        clientEmail,
        privateKey,
      };
    } catch (e) {
      this.logger.warn('Failed to parse FCM service account JSON (FCM disabled).');
      return null;
    }
  }

  async sendToTokens(args: {
    tokens: string[];
    title: string;
    body: string;
    data?: Record<string, string>;
    platform?: PushPlatform;
  }): Promise<{ successCount: number; failureCount: number; invalidTokens: string[] }> {
    if (args.tokens.length === 0) {
      return { successCount: 0, failureCount: 0, invalidTokens: [] };
    }

    if (!this.isEnabled()) {
      this.logger.debug(`FCM disabled; would send to ${args.tokens.length} tokens: ${args.title}`);
      return { successCount: 0, failureCount: 0, invalidTokens: [] };
    }

    this.ensureInitialized();
    if (!this.messaging) {
      return { successCount: 0, failureCount: 0, invalidTokens: [] };
    }

    const channelId = this.config.get<string>('FCM_ANDROID_CHANNEL_ID')?.trim() || 'orders';
    const platform = args.platform ?? 'web';

    const res = await this.messaging.sendEachForMulticast({
      tokens: args.tokens,
      notification: { title: args.title, body: args.body },
      data: args.data,
      android:
        platform === 'android'
          ? {
              priority: 'high',
              notification: {
                channelId,
                sound: 'default',
              },
            }
          : undefined,
      apns:
        platform === 'ios'
          ? {
              headers: {
                'apns-priority': '10',
              },
              payload: {
                aps: {
                  sound: 'default',
                },
              },
            }
          : undefined,
    });

    const invalidTokens: string[] = [];
    const errorCounts: Record<string, number> = {};
    res.responses.forEach((r, i) => {
      if (r.success) return;
      const code = (r.error as { code?: string } | undefined)?.code ?? '';
      const key = code || 'unknown';
      errorCounts[key] = (errorCounts[key] ?? 0) + 1;
      if (
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token'
      ) {
        invalidTokens.push(args.tokens[i]!);
      }
    });

    if (res.failureCount > 0) {
      const platform = args.platform ?? 'web';
      const summary = Object.entries(errorCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k}:${v}`)
        .join(', ');
      this.logger.warn(
        `FCM send had failures (platform=${platform}) success=${res.successCount} failure=${res.failureCount} codes=[${summary}]`,
      );
    } else {
      this.logger.debug(
        `FCM send ok (platform=${args.platform ?? 'web'}) success=${res.successCount} failure=${res.failureCount}`,
      );
    }

    return { successCount: res.successCount, failureCount: res.failureCount, invalidTokens };
  }
}

