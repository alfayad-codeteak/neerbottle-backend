import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Msg91Module } from '../../msg91/msg91.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { secretFromConfig } from '../../config/secret-from-env';
import { parseExpiresToSeconds, jwtAccessExpiresSpec } from '../../config/parse-jwt-expires';

@Module({
  imports: [
    Msg91Module,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: secretFromConfig(config, 'JWT_ACCESS_SECRET', 'access-secret-change-me'),
        signOptions: {
          expiresIn: parseExpiresToSeconds(jwtAccessExpiresSpec(config.get<string>('JWT_ACCESS_EXPIRES'))),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
