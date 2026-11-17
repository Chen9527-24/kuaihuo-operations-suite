import { Body, Controller, ParseFilePipe, Post, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { CompleteFileDto } from './dto/complete-file.dto';
import { PresignFileDto } from './dto/presign-file.dto';
import { UploadFileDto } from './dto/upload-file.dto';
import { FilesService } from './files.service';

@ApiTags('H5/小程序-文件上传')
@Public()
@Controller({ path: 'app/files', version: '1' })
export class FilesPublicController {
  constructor(private readonly filesService: FilesService) {}

  @Post('upload')
  @ApiOperation({ summary: '公开上传文件', description: '用于 H5/小程序无账号场景上传领取凭证、结算截图。' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        scene: { type: 'string', example: 'TASK_CLAIM_PROOF' },
      },
      required: ['file'],
    },
  })
  @ApiOkResponse({ description: '上传成功' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  async upload(
    @Body() dto: UploadFileDto,
    @UploadedFile(new ParseFilePipe({ fileIsRequired: true })) file: Express.Multer.File,
    @Req() req: Request,
  ) {
    const saved = await this.filesService.uploadPublic(file, dto.scene);
    return await this.filesService.toResponse(saved, req);
  }

  @Post('presign')
  @ApiOperation({ summary: '申请公开直传签名', description: '生成 H5/小程序前端直传 OSS 所需签名和回显地址。' })
  @ApiOkResponse({ description: '签名生成成功' })
  async presign(@Body() dto: PresignFileDto) {
    return this.filesService.createDirectUploadPublic(dto);
  }

  @Post('complete')
  @ApiOperation({ summary: '完成公开直传登记', description: 'H5/小程序直传 OSS 成功后，把文件记录写入系统。' })
  @ApiOkResponse({ description: '登记成功' })
  async complete(@Body() dto: CompleteFileDto, @Req() req: Request) {
    const saved = await this.filesService.completeDirectUploadPublic(dto);
    return await this.filesService.toResponse(saved, req);
  }
}
