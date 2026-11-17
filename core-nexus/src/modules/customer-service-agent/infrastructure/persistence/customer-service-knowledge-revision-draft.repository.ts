import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';

const include = {
  createdBy: { select: { id: true, displayName: true, username: true } },
  updatedBy: { select: { id: true, displayName: true, username: true } },
  verifiedBy: { select: { id: true, displayName: true, username: true } },
  publishedBy: { select: { id: true, displayName: true, username: true } },
} satisfies Prisma.CustomerServiceKnowledgeRevisionDraftInclude;

@Injectable()
export class CustomerServiceKnowledgeRevisionDraftRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByCalibration(calibrationRecordId: string, tenantId: string) {
    return this.prisma.customerServiceKnowledgeRevisionDraft.findFirst({
      where: { calibrationRecordId, tenantId, deletedAt: null },
      include,
    });
  }

  create(data: Prisma.CustomerServiceKnowledgeRevisionDraftUncheckedCreateInput) {
    return this.prisma.customerServiceKnowledgeRevisionDraft.create({ data, include });
  }

  update(
    id: string,
    tenantId: string,
    revision: number,
    data: Prisma.CustomerServiceKnowledgeRevisionDraftUncheckedUpdateManyInput,
  ) {
    return this.prisma.customerServiceKnowledgeRevisionDraft.updateMany({
      where: { id, tenantId, revision, deletedAt: null },
      data: { ...data, revision: { increment: 1 } },
    });
  }
}
