import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DeepSeekService } from './deepseek.service';
import { DeepSeekChatTestDto } from './dto/deepseek-chat-test.dto';

@ApiTags('AI 测试')
@ApiBearerAuth('BearerAuth')
@Controller({ path: 'ai', version: '1' })
export class AiController {
  constructor(private readonly deepSeekService: DeepSeekService) {}

  @Post('deepseek-chat/test')
  @ApiOperation({ summary: 'DeepSeek 对话测试', description: 'PC 管理后台用于验证 DeepSeek API 是否可用；API Key 只从后端环境变量读取。' })
  testDeepSeekChat(@Body() dto: DeepSeekChatTestDto) {
    return this.deepSeekService.testChat(dto);
  }
}
