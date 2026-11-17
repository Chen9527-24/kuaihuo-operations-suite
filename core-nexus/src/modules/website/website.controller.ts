import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  ParseFilePipe,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FilesService } from '../files/files.service';
import {
  PublishWebsiteDraftDto,
  RestorePublishedWebsiteDto,
  SubmitWebsiteInquiryDto,
  UpdateWebsiteDraftDto,
} from './dto/website.dto';
import { WebsiteService } from './website.service';

@ApiTags('官网公开接口')
@Public()
@Controller({ path: 'public/website', version: '1' })
export class PublicWebsiteController {
  constructor(private readonly service: WebsiteService) {}

  @Get('config')
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
  @ApiOperation({ summary: '读取官网已发布配置', description: '没有已发布配置时返回 configured=false，官网继续使用本地静态内容。' })
  config() {
    return this.service.getPublicConfiguration();
  }

  @Post('inquiries')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: '提交官网业务咨询', description: '公开受控入口；服务端固定转换为官网来源商机，不接受后台状态或负责人字段。' })
  submitInquiry(@Body() dto: SubmitWebsiteInquiryDto, @Req() request: Request) {
    return this.service.submitInquiry(dto, request);
  }
}

@ApiTags('官网管理')
@ApiBearerAuth('BearerAuth')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'website-management', version: '1' })
export class WebsiteManagementController {
  constructor(
    private readonly service: WebsiteService,
    private readonly filesService: FilesService,
  ) {}

  @Get('configuration')
  @Permissions('website:config:read')
  @ApiOperation({ summary: '读取官网草稿和已发布配置' })
  configuration() {
    return this.service.getManagementConfiguration();
  }

  @Patch('configuration/draft')
  @Permissions('website:config:update')
  @ApiOperation({ summary: '保存官网草稿', description: '不会直接影响公开官网。' })
  saveDraft(@Body() dto: UpdateWebsiteDraftDto, @CurrentUser('id') userId: string) {
    return this.service.saveDraft(dto.content, dto.expectedRevision, userId);
  }

  @Post('configuration/publish')
  @Permissions('website:config:publish')
  @ApiOperation({ summary: '发布官网草稿' })
  publish(@Body() dto: PublishWebsiteDraftDto, @CurrentUser('id') userId: string) {
    return this.service.publish(dto.expectedDraftRevision, userId);
  }

  @Post('configuration/restore-published')
  @Permissions('website:config:update')
  @ApiOperation({ summary: '将当前已发布内容恢复为新草稿', description: '仅覆盖草稿，不改变线上已发布版本。' })
  restorePublished(@Body() dto: RestorePublishedWebsiteDto, @CurrentUser('id') userId: string) {
    return this.service.restorePublishedToDraft(dto.expectedDraftRevision, userId);
  }

  @Post('assets')
  @Permissions('website:asset:upload')
  @ApiOperation({ summary: '上传官网图片素材', description: '独立受限入口，仅接受不超过 5MB 的常见位图或 ico 文件。' })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  async uploadAsset(
    @CurrentUser('id') userId: string,
    @UploadedFile(new ParseFilePipe({ fileIsRequired: true })) file: Express.Multer.File,
    @Req() request: Request,
  ) {
    assertWebsiteAssetSignature(file);
    const saved = await this.filesService.upload(userId, file, 'WEBSITE_ASSET');
    const active = await this.filesService.activateAndBind(saved.id, {
      bizType: 'WEBSITE_CONFIGURATION',
      bizId: 'official-website',
      fieldName: 'asset',
    });
    return this.filesService.toResponse(active, request);
  }
}

function assertWebsiteAssetSignature(file: Express.Multer.File) {
  const bytes = file.buffer;
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isWebp = bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  const isIco = bytes.length >= 6 && bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x01 && bytes[3] === 0x00;
  if (!isJpeg && !isPng && !isWebp && !isIco) {
    throw new BadRequestException('官网素材文件内容不是受支持的 JPEG、PNG、WebP 或 ICO 图片');
  }
}
