import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { DeepSeekService } from './deepseek.service';

@Module({
  controllers: [AiController],
  providers: [DeepSeekService],
  exports: [DeepSeekService],
})
export class AiModule {}
