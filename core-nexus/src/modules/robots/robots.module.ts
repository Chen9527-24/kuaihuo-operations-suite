import { Module } from '@nestjs/common';
import { RobotsController } from './robots.controller';
import { RobotsService } from './robots.service';
import { AiModule } from '../ai/ai.module';
import { CustomerServiceAgentModule } from '../customer-service-agent/customer-service-agent.module';

@Module({
  imports: [AiModule, CustomerServiceAgentModule],
  controllers: [RobotsController],
  providers: [RobotsService],
  exports: [RobotsService],
})
export class RobotsModule {}
