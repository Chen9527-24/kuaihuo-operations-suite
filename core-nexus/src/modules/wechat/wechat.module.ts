import { Module } from '@nestjs/common';
import { MiniProgramModeController, WechatOpenController, WxMiniController } from './wechat.controller';
import { WechatService } from './wechat.service';

@Module({
  controllers: [MiniProgramModeController, WxMiniController, WechatOpenController],
  providers: [WechatService],
  exports: [WechatService],
})
export class WechatModule {}
