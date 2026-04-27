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
    };
  }
}

export default {
  async fetch(request: Request, env: unknown) {
    const origin = request.headers.get('Origin');
    const allowedOrigins = getAllowedOrigins(env);

    if (request.method === 'OPTIONS') {
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

    const container = getContainer((env as { API_CONTAINER: unknown }).API_CONTAINER, 'api') as {
      startAndWaitForPorts?: () => Promise<void>;
      start?: () => Promise<unknown>;
      fetch: (request: Request) => Promise<Response>;
    };

    if (container.startAndWaitForPorts) {
      await container.startAndWaitForPorts();
    } else if (container.start) {
      await container.start();
    }

    try {
      const response = await container.fetch(request);
      return withCors(response, origin, allowedOrigins);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('not running')) {
        if (container.startAndWaitForPorts) {
          await container.startAndWaitForPorts();
        } else if (container.start) {
          await container.start();
        }
        const response = await container.fetch(request);
        return withCors(response, origin, allowedOrigins);
      }
      throw error;
    }
  },
};
