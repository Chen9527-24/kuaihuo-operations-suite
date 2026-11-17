import { Module } from '@nestjs/common';
import { CustomerServiceAgentModule } from '../customer-service-agent/customer-service-agent.module';
import { DialogueRecordsController } from './dialogue-records.controller';
import { DialogueRecordsService } from './dialogue-records.service';

@Module({
  imports: [CustomerServiceAgentModule],
  controllers: [DialogueRecordsController],
  providers: [DialogueRecordsService],
  exports: [DialogueRecordsService],
})
export class DialogueRecordsModule {}
