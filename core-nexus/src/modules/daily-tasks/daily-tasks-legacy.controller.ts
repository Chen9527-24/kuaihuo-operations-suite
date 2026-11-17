import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import {
  LegacyClaimCommentDto,
  LegacyCompleteCommentQueryDto,
  LegacyTaskDetailParamDto,
  LegacyTaskListQueryDto,
} from './dto/legacy-h5.dto';
import { DailyTasksService } from './daily-tasks.service';

@ApiTags('H5兼容接口-旧前端模式')
@Public()
@Controller({ path: '', version: '1' })
export class DailyTasksLegacyController {
  constructor(private readonly service: DailyTasksService) {}

  @Get('posts/tenant')
  @ApiOperation({
    summary: '旧版 H5 任务列表',
    description: '兼容旧版 H5 的任务列表接口。前端原有的 getHotList 可直接切到这个新后端，无需改变页面交互。',
  })
  async list(@Query() query: LegacyTaskListQueryDto, @Req() request: Request) {
    return this.wrap(async () => {
      const tenantRef = query.tenantsId || this.readTenantRef(request);
      const data = await this.service.legacyListPublicTasks(tenantRef);
      return data;
    });
  }

  @Get('claim-comment/complete')
  @ApiOperation({
    summary: '旧版 H5 确认完成',
    description: '兼容旧版前端 complete 接口，仍然沿用 GET + query 参数的调用方式。',
  })
  async complete(@Query() query: LegacyCompleteCommentQueryDto, @Req() request: Request) {
    return this.wrap(async () => {
      const data = await this.service.legacyConfirmComment(
        {
          tenantRef: query.tenantsId || this.readTenantRef(request),
          postId: query.postId,
          claimName: query.claimName,
          commentId: query.commentId,
        },
        this.buildRequestMeta(request),
      );
      return data;
    }, '操作成功');
  }

  @Get('claim-comment/:postId')
  @ApiParam({ name: 'postId', example: '29', description: '帖子 ID。旧版前端会把当前任务的 postId 作为路径参数。' })
  @ApiOperation({
    summary: '旧版 H5 任务详情/进度',
    description: '兼容旧版前端 getPostDetail 接口，返回领取进度及已领取评论列表。',
  })
  async detail(@Param() params: LegacyTaskDetailParamDto, @Query() query: LegacyTaskListQueryDto, @Req() request: Request) {
    return this.wrap(async () => {
      const tenantRef = query.tenantsId || this.readTenantRef(request);
      const data = await this.service.legacyGetTaskDetail(params.postId, tenantRef, this.buildRequestMeta(request));
      return data;
    });
  }

  @Get('posts/:postId/detail')
  @ApiParam({ name: 'postId', example: '29', description: '帖子 ID。返回帖子详情及评论领取记录。' })
  @ApiOperation({
    summary: 'H5 帖子详情（增强）',
    description: '返回帖子基础信息，以及评论领取用户名、领取时间、领取内容等展示字段。',
  })
  async postDetail(@Param() params: LegacyTaskDetailParamDto, @Query() query: LegacyTaskListQueryDto, @Req() request: Request) {
    return this.wrap(async () => {
      const tenantRef = query.tenantsId || this.readTenantRef(request);
      const data = await this.service.legacyGetPostDetail(params.postId, tenantRef, this.buildRequestMeta(request));
      return data;
    });
  }

  @Post('claim-comment')
  @ApiOperation({
    summary: '旧版 H5 领取评论',
    description: '兼容旧版前端 claimComment 接口。仍然使用 tenantsId + postId + username 的入参模式。',
  })
  async claim(@Body() dto: LegacyClaimCommentDto, @Req() request: Request) {
    try {
      const result = await this.service.legacyClaimComment(
        {
          tenantRef: dto.tenantsId || this.readTenantRef(request),
          postId: dto.postId,
          username: dto.username,
        },
        this.buildRequestMeta(request),
      );
      return {
        code: 0,
        message: result.message,
        msg: result.message,
        data: result.data,
      };
    } catch (error: any) {
      const message = this.normalizeErrorMessage(error);
      const code = Number(error?.status || error?.response?.statusCode || 500);
      return {
        code,
        message,
        msg: message,
        data: error?.response?.data ?? null,
      };
    }
  }

  private buildRequestMeta(request: Request) {
    const refererHeader = request.headers.referer ?? request.headers.referrer ?? null
    const referer = Array.isArray(refererHeader) ? refererHeader[0] : refererHeader

    return {
      ip: request.ip,
      userAgent: request.headers['user-agent'] ?? null,
      referer: referer ?? null,
    }
  }

  private readTenantRef(request: Request) {
    const header = request.headers.tenantsid ?? request.headers['tenantsId'];
    const value = Array.isArray(header) ? header[0] : header;
    return String(value ?? '').trim() || undefined;
  }

  private async wrap<T>(runner: () => Promise<T>, successMsg = 'ok') {
    try {
      const data = await runner();
      return {
        code: 0,
        message: successMsg,
        msg: successMsg,
        data,
      };
    } catch (error: any) {
      const message = this.normalizeErrorMessage(error);
      const code = Number(error?.status || error?.response?.statusCode || 500);
      return {
        code,
        message,
        msg: message,
        data: error?.response?.data ?? null,
      };
    }
  }

  private normalizeErrorMessage(error: any) {
    const response = error?.response;
    if (typeof response === 'string' && response.trim()) return response;
    if (typeof response?.message === 'string' && response.message.trim()) return response.message;
    if (typeof error?.message === 'string' && error.message.trim()) return error.message;
    return 'Request failed';
  }
}
