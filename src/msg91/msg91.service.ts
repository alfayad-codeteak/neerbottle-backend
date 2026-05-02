import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const FLOW_URL = 'https://control.msg91.com/api/v5/flow';
const DEFAULT_TEMPLATE_ID = '69f592e0bd83b71e690c8cd2';

type Msg91FlowResponse = {
  type?: string;
  message?: string;
  hasError?: boolean;
  errors?: unknown;
  request_id?: string;
};

@Injectable()
export class Msg91Service {
  private readonly logger = new Logger(Msg91Service.name);

  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    const key = this.config.get<string>('MSG91_AUTH_KEY')?.trim();
    return !!key;
  }

  /**
   * Sends OTP via MSG91 Flow API. Template uses ##otp## and ##name## (shopping at ##name##).
   * `phone` must be 10 digits (India); stored as 91XXXXXXXXXX for MSG91.
   */
  async sendOtpSms(phone: string, otp: string, nameForTemplate: string): Promise<void> {
    const authkey = this.config.get<string>('MSG91_AUTH_KEY')?.trim();
    if (!authkey) {
      this.logger.warn(
        `MSG91_AUTH_KEY is not set; OTP SMS skipped for ${phone}. Set the secret in Cloudflare / .env for production.`,
      );
      return;
    }

    const templateId =
      this.config.get<string>('MSG91_TEMPLATE_ID')?.trim() || DEFAULT_TEMPLATE_ID;
    const mobiles = phone.startsWith('91') ? phone : `91${phone}`;

    const body = {
      template_id: templateId,
      short_url: '0',
      recipients: [
        {
          mobiles,
          otp,
          name: nameForTemplate,
        },
      ],
    };

    let res: Response;
    try {
      res = await fetch(FLOW_URL, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          authkey,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`MSG91 network error: ${msg}`);
      throw new ServiceUnavailableException('Unable to reach SMS provider. Try again shortly.');
    }

    const text = await res.text();
    let parsed: Msg91FlowResponse | null = null;
    try {
      parsed = text ? (JSON.parse(text) as Msg91FlowResponse) : null;
    } catch {
      this.logger.error(`MSG91 non-JSON response (${res.status}): ${text.slice(0, 500)}`);
    }

    if (!res.ok) {
      this.logger.error(`MSG91 HTTP ${res.status}: ${text.slice(0, 500)}`);
      throw new ServiceUnavailableException('SMS could not be sent. Try again shortly.');
    }

    if (parsed?.hasError || parsed?.type === 'error') {
      const detail = parsed?.message ?? parsed?.errors ?? text;
      this.logger.error(`MSG91 API error: ${JSON.stringify(detail)}`);
      throw new ServiceUnavailableException('SMS could not be sent. Try again shortly.');
    }
  }

  defaultShopName(): string {
    return this.config.get<string>('MSG91_OTP_SHOP_NAME')?.trim() || 'FLIQ Water';
  }
}
