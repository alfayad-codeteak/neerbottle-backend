import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { HealthService } from './health.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Health check – API is running' })
  check() {
    return this.healthService.check();
  }

  @Get('ping')
  @ApiOperation({ summary: 'Simple ping for load balancers / monitoring' })
  ping() {
    return this.healthService.ping();
  }
}
