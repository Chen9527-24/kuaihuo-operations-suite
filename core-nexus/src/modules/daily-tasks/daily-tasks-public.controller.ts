import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { ApiSuccessResponse } from '../../common/swagger/api-success-response.decorator';
import { DailyTasksService } from './daily-tasks.service';
import {
  PublicClaimCommentDto,
  PublicClaimCommentResponseDto,
  PublicConfirmCompleteDto,
  PublicConfirmCompleteResponseDto,
  PublicStartTaskDto,
  PublicStartTaskResponseDto,
  PublicTaskDetailResponseDto,
  PublicTaskLinkQueryDto,
} from './dto/public-task.dto';

@ApiTags('H5/小程序-每日任务')
@Public()
@Controller({ path: 'app/daily-tasks', version: '1' })
export class DailyTasksPublicController {
  constructor(private readonly service: DailyTasksService) {}

  @Get('public-entry')
  @ApiOperation({
    summary: 'H5/小程序公开任务详情',
    description:
      '免登录公开入口。根据链接上的 tenantsId + type + postId 查询任务，并返回任务基础信息、步骤配置、评论进度和当前访客状态。',
  })
  @ApiSuccessResponse(PublicTaskDetailResponseDto, {
    description: '查询成功',
    example: {
      id: 'cm9pwyb5f0001abc123def456',
      postId: '29',
      platform: 'DOUYIN',
      authorName: '花生牛奶',
      publishedAt: '2026-03-18T19:43:33.000Z',
      title: '国际尬唱251',
      videoUrl: 'https://api.example.com/?tenantsId=tenant-demo&type=douyin&postId=29',
      coverUrl: 'https://cdn.example.com/uploads/task-cover-1.png',
      copywriting: '【花生牛奶】最新视频，请大家在上方链接内打开视频，并领取评论发布！',
      progress: {
        targetCommentCount: 44,
        claimedCommentCount: 12,
        completedCommentCount: 12,
        completionRate: 27.27,
      },
      stepConfig: {
        steps: [
          { code: 'START_ASSIST', title: '第一步：开始助推', buttons: [{ code: 'START', text: '开始助推任务' }] },
          { code: 'CLAIM_COMMENT', title: '第二步：领取评论', buttons: [{ code: 'CLAIM', text: '领取评论' }] },
          { code: 'CONFIRM', title: '第三步：确认完成', buttons: [{ code: 'CONFIRM', text: '确认完成' }] },
        ],
      },
      visitor: {
        visitorToken: null,
        visitorName: null,
        status: 'NOT_STARTED',
        currentStep: 'STEP_1_START',
        currentCommentId: null,
        currentCommentContent: null,
        claimedAt: null,
        completedAt: null,
      },
    },
  })
  publicEntry(@Query() query: PublicTaskLinkQueryDto) {
    return this.service.getPublicTaskEntry(query);
  }

  @Post(':postId/public-start')
  @ApiOperation({
    summary: '开始助推任务',
    description: '记录访客已进入第一步。这里的 :postId 就是帖子 ID。前端应保存返回的 visitorToken，并在后续领取评论、确认完成时继续使用。',
  })
  @ApiSuccessResponse(PublicStartTaskResponseDto, {
    description: '开始成功',
    example: {
      postId: '29',
      visitorToken: 'b83104b3025344a7b2f0b3f5405b0d93',
      status: 'STARTED',
      nextStep: 'STEP_2_CLAIM',
    },
  })
  publicStart(@Param('postId') postId: string, @Body() dto: PublicStartTaskDto, @Req() request: Request) {
    return this.service.startPublicTask(postId, dto, this.buildRequestMeta(request));
  }

  @Post(':postId/claim-comment')
  @ApiOperation({
    summary: '领取评论',
    description:
      '按评论池顺序锁定一条 AVAILABLE 评论给当前访客。这里的 :postId 就是帖子 ID。领取时只需提交姓名和手机号；任务证明图改为在确认完成前上传。若访客之前已领取过评论，则返回 409，提示不要重复领取。',
  })
  @ApiSuccessResponse(PublicClaimCommentResponseDto, {
    description: '领取成功',
    example: {
      postId: '29',
      commentId: 'cm9q6n5e10001abc123def456',
      commentContent: '这个视频讲得很自然，收藏了。',
      visitorName: 'Qiu',
      phone: '13812345678',
      uploadedImageUrl: null,
      visitorToken: 'b83104b3025344a7b2f0b3f5405b0d93',
      nextStep: 'STEP_3_CONFIRM',
      progress: {
        targetCommentCount: 44,
        claimedCommentCount: 13,
        completedCommentCount: 12,
        completionRate: 27.27,
      },
    },
  })
  claimComment(@Param('postId') postId: string, @Body() dto: PublicClaimCommentDto, @Req() request: Request) {
    return this.service.claimPublicComment(postId, dto, this.buildRequestMeta(request));
  }

  @Post(':postId/confirm-completion')
  @ApiOperation({
    summary: '确认完成任务',
    description:
      '提交当前访客已上传的任务证明图 fileId 列表，把已领取评论标记为 COMPLETED，并刷新任务进度。这里的 :postId 就是帖子 ID。达到目标评论数后，任务会自动流转为 COMPLETED。',
  })
  @ApiSuccessResponse(PublicConfirmCompleteResponseDto, {
    description: '确认成功',
    example: {
      postId: '29',
      commentId: 'cm9q6n5e10001abc123def456',
      status: 'COMPLETED',
      nextStep: 'DONE',
      proofImageUrls: ['https://cdn.example.com/uploads/task-proof-1.png'],
      progress: {
        targetCommentCount: 44,
        claimedCommentCount: 13,
        completedCommentCount: 13,
        completionRate: 29.55,
      },
    },
  })
  confirmCompletion(@Param('postId') postId: string, @Body() dto: PublicConfirmCompleteDto, @Req() request: Request) {
    return this.service.confirmPublicTaskCompletion(postId, dto, this.buildRequestMeta(request));
  }

  private buildRequestMeta(request: Request) {
    const refererHeader = request.headers.referer ?? request.headers.referrer ?? null;
    const referer = Array.isArray(refererHeader) ? refererHeader[0] : refererHeader;
    const tenantHeader = request.headers.tenantsid ?? request.headers['tenantsId'];
    const tenantRef = Array.isArray(tenantHeader) ? tenantHeader[0] : tenantHeader;

    return {
      ip: request.ip,
      userAgent: request.headers['user-agent'] ?? null,
      referer: referer ?? null,
      tenantRef: String(tenantRef ?? '').trim() || null,
    };
  }
}
