import { Module } from '@nestjs/common';
import { AutoRepliesController } from './auto-replies.controller';
import { AutoRepliesService } from './auto-replies.service';
import { DialogueRecordsModule } from '../dialogue-records/dialogue-records.module';
import { CustomerServiceAgentModule } from '../customer-service-agent/customer-service-agent.module';

@Module({
  imports: [DialogueRecordsModule, CustomerServiceAgentModule],
  controllers: [AutoRepliesController],
  providers: [AutoRepliesService],
  exports: [AutoRepliesService],
})
export class AutoRepliesModule {}
