import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { WechatModule } from '../wechat/wechat.module';
import { SmsModule } from '../sms/sms.module';
import { DailyTasksLegacyController } from './daily-tasks-legacy.controller';
import { DailyTasksController } from './daily-tasks.controller';
import { DailyTasksPublicController } from './daily-tasks-public.controller';
import { DailyTasksDistributionAdminController, DailyTasksDistributionController, DistributionGroupsAdminController, GroupCollaborationsAdminController } from './daily-tasks-distribution.controller';
import { DailyTasksService } from './daily-tasks.service';
import { DistributionHomepageOcrService } from './distribution-homepage-ocr.service';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [FilesModule, WechatModule, SmsModule, AiModule],
  controllers: [DailyTasksController, DailyTasksPublicController, DailyTasksLegacyController, DailyTasksDistributionController, DailyTasksDistributionAdminController, DistributionGroupsAdminController, GroupCollaborationsAdminController],
  providers: [DailyTasksService, DistributionHomepageOcrService],
})
export class DailyTasksModule {}
