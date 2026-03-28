import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app.module';
import { SWAGGER_EXTRA_MODELS } from './common/swagger/swagger-response.dto';
import { AuthResponseDto, OtpSentResponseDto } from './modules/auth/dto/auth-response.dto';

const LOCALHOST_ORIGINS = Array.from({ length: 6 }, (_, i) => `http://localhost:${3000 + i}`);

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useWebSocketAdapter(new IoAdapter(app));
  const envOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const allowedOrigins = envOrigins.length > 0 ? envOrigins : LOCALHOST_ORIGINS;

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Owner-Secret'],
    optionsSuccessStatus: 204,
  });

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('AquaFliq Water Ordering API')
    .setDescription(
      [
        'REST API for the AquaFliq water delivery platform: customer catalog and checkout, deposit wallets,',
        'owner/admin operations, and delivery partner workflows.',
        '',
        '**Authentication** — Most routes require a JWT access token from `POST /api/auth/login` or `POST /api/auth/register`.',
        'Send `Authorization: Bearer <accessToken>`. Owner panel may use `POST /api/auth/login-owner`.',
        '',
        '**Roles** — `customer`, `owner`, `admin` (scoped by permissions), `deliveryPartner`.',
        '',
        '**Real-time** — Customers and partners can subscribe to Socket.IO namespace `/orders` with the same JWT;',
        'the server emits `order.updated` when order data changes (not documented as REST here).',
      ].join('\n'),
    )
    .setVersion('1.0')
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description:
        'JWT access token from login, register (completed), or refresh. Send as: Authorization: Bearer <token>',
    })
    .addTag('Health', 'Liveness and readiness style checks for orchestration and monitoring.')
    .addTag('Authentication', 'Registration, login, token refresh, and first-time owner bootstrap.')
    .addTag('Products', 'Public product catalog for the customer website (active, in-stock items only).')
    .addTag('Addresses', 'Customer delivery addresses; requires customer JWT.')
    .addTag('Orders', 'Customer order quote, placement, history, and tracking.')
    .addTag('Deposits', 'Deposit configuration, wallets, and adjustments.')
    .addTag('Owner', 'Exclusive owner endpoints: admin staff CRUD and permission features.')
    .addTag('Admin – Products', 'Full product management including inactive SKUs and bulk price/stock updates.')
    .addTag('Admin – Orders', 'Operations desk: list/filter orders, status, assign partners, cancel, deposit refund.')
    .addTag('Admin – Customers', 'Customer directory and detail for support.')
    .addTag('Admin – Delivery partners', 'Create and manage delivery partner accounts linked to login users.')
    .addTag('Delivery partners', 'Self-service API for users with role `deliveryPartner`.')
    .build();
  const document = SwaggerModule.createDocument(app, config, {
    extraModels: [...SWAGGER_EXTRA_MODELS, AuthResponseDto, OtpSentResponseDto],
  });
  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'AquaFliq API — Swagger UI',
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'none',
      filter: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  console.log(`Application is running on: http://localhost:${port}/api`);
  console.log(`Swagger docs: http://localhost:${port}/api/docs`);
  console.log(`Allowed CORS origins: ${allowedOrigins.join(', ')}`);
}

bootstrap().catch((err) => {
  console.error('Bootstrap failed:', err);
  process.exit(1);
});
