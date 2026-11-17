import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { stableJsonHash } from '../../../shared/utils/stable-json-hash.util';
import { FOUNDATION_HVE_GUIDELINES } from '../templates/customer-service-hve-guideline.template';
import type { CustomerServiceFoundationTx } from '../types/foundation-seed.type';

@Injectable()
export class CustomerServiceGuidelineFoundationSeeder {
  async seed(tx: CustomerServiceFoundationTx, tenantId: string, userId: string) {
    let created = 0;
    let updated = 0;
    let existing = 0;
    for (const template of FOUNDATION_HVE_GUIDELINES) {
      const contentHash = stableJsonHash(template.content);
      const found = await (tx as any).customerServiceGuideline.findUnique({
        where: { tenantId_code: { tenantId, code: template.code } },
      });
      if (!found) {
        const guideline = await (tx as any).customerServiceGuideline.create({
          data: {
            tenantId,
            code: template.code,
            name: template.name,
            description: template.description,
            originType: 'SYSTEM_TEMPLATE',
            status: 'DRAFT',
            createdById: userId,
          },
        });
        const version = await this.createPublishedVersion(tx, guideline.id, 1, template, contentHash, userId);
        await (tx as any).customerServiceGuideline.update({
          where: { id: guideline.id },
          data: { status: 'ENABLED', currentVersionId: version.id, revision: { increment: 1 } },
        });
        created += 1;
        continue;
      }

      // V1.9: only system-owned templates are automatically versioned. Tenant/custom
      // guidelines with the same code are never rewritten by foundation initialization.
      if (found.originType !== 'SYSTEM_TEMPLATE') {
        existing += 1;
        continue;
      }
      const current = found.currentVersionId
        ? await (tx as any).customerServiceGuidelineVersion.findFirst({
            where: { id: found.currentVersionId, guidelineId: found.id },
          })
        : null;
      if (current?.contentHash === contentHash) {
        existing += 1;
        continue;
      }

      const latest = await (tx as any).customerServiceGuidelineVersion.findFirst({
        where: { guidelineId: found.id },
        orderBy: { versionNo: 'desc' },
        select: { versionNo: true },
      });
      if (current?.status === 'PUBLISHED') {
        await (tx as any).customerServiceGuidelineVersion.update({
          where: { id: current.id },
          data: { status: 'RETIRED' },
        });
      }
      const version = await this.createPublishedVersion(
        tx,
        found.id,
        (latest?.versionNo || 0) + 1,
        template,
        contentHash,
        userId,
      );
      await (tx as any).customerServiceGuideline.update({
        where: { id: found.id },
        data: {
          name: template.name,
          description: template.description,
          status: 'ENABLED',
          currentVersionId: version.id,
          updatedById: userId,
          revision: { increment: 1 },
        },
      });
      updated += 1;
    }
    return { created, updated, existing };
  }

  private createPublishedVersion(
    tx: CustomerServiceFoundationTx,
    guidelineId: string,
    versionNo: number,
    template: (typeof FOUNDATION_HVE_GUIDELINES)[number],
    contentHash: string,
    userId: string,
  ) {
    return (tx as any).customerServiceGuidelineVersion.create({
      data: {
        guidelineId,
        versionNo,
        schemaVersion: template.content.schemaVersion,
        binding: template.content.binding as Prisma.InputJsonValue,
        condition: template.content.condition as Prisma.InputJsonValue,
        actions: template.content.actions as unknown as Prisma.InputJsonValue,
        priority: template.content.priority,
        criticality: template.content.criticality,
        tags: template.content.tags,
        relationships: template.content.relationships as Prisma.InputJsonValue,
        evidenceRefs: template.content.evidenceRefs,
        contentHash,
        status: 'PUBLISHED',
        regressionResult: { source: 'SYSTEM_TEMPLATE', verifier: 'HVE-3-R5-B-V1.9-CORRECTION' } as Prisma.InputJsonValue,
        publishedAt: new Date(),
        publishedById: userId,
        createdById: userId,
      },
    });
  }
}
