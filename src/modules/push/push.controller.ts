import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PushService } from './push.service';
import { RegisterPushTokenDto } from './dto/register-push-token.dto';
import { UnregisterPushTokenDto } from './dto/unregister-push-token.dto';

interface RequestWithUser extends Request {
  user: { id: string };
}

@ApiTags('Push')
@Controller('push')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PushController {
  constructor(private readonly pushService: PushService) {}

  @Post('register')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Register device push token (FCM)',
    description:
      'Call after login and on token refresh. Stores token for this user and allows order update pushes.',
  })
  @ApiOkResponse({ description: 'Token stored.' })
  register(@Req() req: RequestWithUser, @Body() dto: RegisterPushTokenDto) {
    return this.pushService.registerToken(req.user.id, dto);
  }

  @Post('unregister')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Unregister device push token',
    description: 'Call on logout if you want to stop pushes for this device token.',
  })
  @ApiOkResponse({ description: 'Token removed (if present).' })
  unregister(@Req() req: RequestWithUser, @Body() dto: UnregisterPushTokenDto) {
    return this.pushService.unregisterToken(req.user.id, dto.token);
  }
}

