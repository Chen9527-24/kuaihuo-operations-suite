import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { PublicWebsiteController, WebsiteManagementController } from './website.controller';
import { WebsiteService } from './website.service';

@Module({
  imports: [FilesModule],
  controllers: [PublicWebsiteController, WebsiteManagementController],
  providers: [WebsiteService],
})
export class WebsiteModule {}
