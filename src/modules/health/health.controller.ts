import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse } from '@nestjs/swagger';
import { HealthService } from './health.service';
import { HealthCheckResponseDto, PingResponseDto } from '../../common/swagger/swagger-response.dto';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({
    summary: 'Service health',
    description:
      'Returns process uptime, ISO timestamp, and Redis connectivity when Redis is configured. Use for load balancers or k8s probes that need dependency signal.',
  })
  @ApiOkResponse({
    description: 'Service is running; inspect `redis` when caching is enabled.',
    type: HealthCheckResponseDto,
  })
  check() {
    return this.healthService.check();
  }

  @Get('ping')
  @ApiOperation({
    summary: 'Minimal ping',
    description: 'Lightweight `{ pong: true }` for synthetic checks that do not need Redis or version metadata.',
  })
  @ApiOkResponse({ description: 'Always returns pong.', type: PingResponseDto })
  ping() {
    return this.healthService.ping();
  }
}
