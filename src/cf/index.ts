import { Container, getContainer } from '@cloudflare/containers';

const LOCALHOST_ORIGINS = Array.from({ length: 6 }, (_, i) => `http://localhost:${3000 + i}`);

function getAllowedOrigins(env: unknown): string[] {
  const e = env as Record<string, unknown>;
  const raw = typeof e.CORS_ORIGINS === 'string' ? e.CORS_ORIGINS : '';
  const configured = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return configured.length > 0 ? configured : LOCALHOST_ORIGINS;
}

function withCors(response: Response, origin: string | null, allowedOrigins: string[]): Response {
  if (!origin || !allowedOrigins.includes(origin)) return response;
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Credentials', 'true');
  headers.append('Vary', 'Origin');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function isRetryableContainerError(message: string): boolean {
  return (
    message.includes('not running') ||
    message.includes('no container instance') ||
    message.includes('try again later') ||
    message.includes('network connection lost') ||
    message.includes('operation was aborted') ||
    message.includes('durable object reset') ||
    message.includes('its code was updated') ||
    message.includes('connection reset') ||
    message.includes('econnreset')
  );
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

type ContainerStub = {
  startAndWaitForPorts?: () => Promise<void>;
  start?: () => Promise<unknown>;
  fetch: (request: Request) => Promise<Response>;
};

/** Proxies to Nest; returns null if all retries exhausted without a response. */
async function fetchFromContainer(request: Request, env: unknown): Promise<Response | null> {
  const container = getContainer((env as { API_CONTAINER: unknown }).API_CONTAINER, 'api') as ContainerStub;

  // Extra backoff after deploys: DO “code was updated” / “network connection lost” often recover quickly.
  const retryDelaysMs = [500, 1200, 2500, 4000];
  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
    try {
      if (container.startAndWaitForPorts) {
        await container.startAndWaitForPorts();
      } else if (container.start) {
        await container.start();
      }

      return await container.fetch(request);
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
      const shouldRetry = isRetryableContainerError(message) && attempt < retryDelaysMs.length;
      if (!shouldRetry) break;
      await wait(retryDelaysMs[attempt]);
    }
  }
  return null;
}

export class ApiContainer extends Container {
  defaultPort = 3000;
  sleepAfter = '5m';
  enableInternet = true;

  constructor(ctx: unknown, env: unknown) {
    super(ctx as never, env as never);

    const e = env as Record<string, unknown>;
    const pick = (k: string) => (typeof e[k] === 'string' ? (e[k] as string) : undefined);

    this.envVars = {
      NODE_ENV: pick('NODE_ENV') ?? 'production',
      PORT: pick('PORT') ?? '3000',
      DATABASE_URL: pick('DATABASE_URL') ?? '',
      JWT_ACCESS_SECRET: pick('JWT_ACCESS_SECRET') ?? '',
      JWT_REFRESH_SECRET: pick('JWT_REFRESH_SECRET') ?? '',
      CORS_ORIGINS: pick('CORS_ORIGINS') ?? '',
      JWT_ACCESS_EXPIRES: pick('JWT_ACCESS_EXPIRES') ?? '',
      JWT_REFRESH_EXPIRES: pick('JWT_REFRESH_EXPIRES') ?? '',
      OWNER_SECRET: pick('OWNER_SECRET') ?? '',
      REDIS_URL: pick('REDIS_URL') ?? '',
      REDIS_HOST: pick('REDIS_HOST') ?? '',
      REDIS_PORT: pick('REDIS_PORT') ?? '',
      REDIS_PASSWORD: pick('REDIS_PASSWORD') ?? '',
      MSG91_AUTH_KEY: pick('MSG91_AUTH_KEY') ?? '',
      MSG91_TEMPLATE_ID: pick('MSG91_TEMPLATE_ID') ?? '',
      MSG91_OTP_SHOP_NAME: pick('MSG91_OTP_SHOP_NAME') ?? '',
    };
  }
}

export default {
  async fetch(request: Request, env: unknown) {
    const origin = request.headers.get('Origin');
    const allowedOrigins = getAllowedOrigins(env);

    // Let Nest answer preflight using the same `CORS_ORIGINS` as the API (container env).
    // The old Worker-only allowlist defaulted to localhost and blocked production sites like https://www.neerbottle.in.
    if (request.method === 'OPTIONS') {
      const fromNest = await fetchFromContainer(request, env);
      if (fromNest) return fromNest;
      if (origin && allowedOrigins.includes(origin)) {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Credentials': 'true',
            'Access-Control-Allow-Methods': 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
            'Access-Control-Allow-Headers':
              request.headers.get('Access-Control-Request-Headers') ?? 'Content-Type,Authorization,Accept,X-Owner-Secret',
            'Access-Control-Max-Age': '86400',
            Vary: 'Origin',
          },
        });
      }
      return new Response(null, { status: 204 });
    }

    const response = await fetchFromContainer(request, env);
    if (!response) {
      const unavailable = withCors(
        new Response('Container is warming up. Please retry in a few seconds.', { status: 503 }),
        origin,
        allowedOrigins,
      );
      unavailable.headers.set('Retry-After', '5');
      return unavailable;
    }

    return withCors(response, origin, allowedOrigins);
  },
};
