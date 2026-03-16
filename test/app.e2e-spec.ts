import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/api/health (GET) returns status ok', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect((res: { body: { status: string; service: string } }) => {
        expect(res.body.status).toBe('ok');
        expect(res.body.service).toBeDefined();
      });
  });

  it('/api/health/ping (GET) returns pong', () => {
    return request(app.getHttpServer())
      .get('/api/health/ping')
      .expect(200)
      .expect((res: { body: { pong: boolean } }) => {
        expect(res.body.pong).toBe(true);
      });
  });
});
