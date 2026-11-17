import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';

@Injectable()
export class CustomerServiceRuntimeReplyRequestRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByKey(tenantId: string, idempotencyKey: string) {
    return this.runtimeReplyRequests.findUnique({
      where: {
        tenantId_idempotencyKey: { tenantId, idempotencyKey },
      },
    });
  }

  createProcessing(input: {
    tenantId: string;
    idempotencyKey: string;
    requestHash: string;
    processingToken: string;
    expiresAt: Date;
  }) {
    return this.runtimeReplyRequests.create({
      data: {
        ...input,
        status: 'PROCESSING',
      },
    });
  }

  restartFailed(
    id: string,
    tenantId: string,
    requestHash: string,
    processingToken: string,
  ) {
    return this.runtimeReplyRequests.updateMany({
      where: { id, tenantId, requestHash, status: 'FAILED' },
      data: {
        status: 'PROCESSING',
        processingToken,
        response: null,
        errorCode: null,
        errorMessage: null,
        completedAt: null,
        attemptCount: { increment: 1 },
      },
    });
  }

  restartStaleProcessing(
    id: string,
    tenantId: string,
    requestHash: string,
    staleBefore: Date,
    processingToken: string,
  ) {
    return this.runtimeReplyRequests.updateMany({
      where: {
        id,
        tenantId,
        requestHash,
        status: 'PROCESSING',
        updatedAt: { lt: staleBefore },
      },
      data: {
        processingToken,
        response: null,
        errorCode: null,
        errorMessage: null,
        completedAt: null,
        attemptCount: { increment: 1 },
      },
    });
  }

  complete(
    id: string,
    tenantId: string,
    processingToken: string,
    response: Prisma.InputJsonValue,
  ) {
    return this.runtimeReplyRequests.updateMany({
      where: { id, tenantId, processingToken, status: 'PROCESSING' },
      data: {
        status: 'SUCCEEDED',
        response,
        completedAt: new Date(),
        errorCode: null,
        errorMessage: null,
      },
    });
  }

  fail(
    id: string,
    tenantId: string,
    processingToken: string,
    errorCode: string,
    errorMessage: string,
  ) {
    return this.runtimeReplyRequests.updateMany({
      where: { id, tenantId, processingToken, status: 'PROCESSING' },
      data: {
        status: 'FAILED',
        errorCode,
        errorMessage: errorMessage.slice(0, 4000),
        completedAt: new Date(),
      },
    });
  }

  /**
   * 本地后端可能仍占用旧 Prisma Windows 引擎，导致本轮无法覆盖生成客户端。
   * 部署构建会先执行 prisma generate；这里仅让源码在客户端重新生成前保持可编译。
   */
  private get runtimeReplyRequests() {
    return (this.prisma as PrismaService & {
      customerServiceRuntimeReplyRequest: {
        findUnique(args: unknown): Promise<any>;
        create(args: unknown): Promise<any>;
        updateMany(args: unknown): Promise<{ count: number }>;
      };
    }).customerServiceRuntimeReplyRequest;
  }
}
