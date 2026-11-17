<template>
  <section class="hve-diagnostics-panel">
    <div class="hve-diagnostics-panel__header">
      <div class="min-w-0">
        <div class="text-sm font-semibold text-slate-700 dark:text-slate-100">HVE-3 解析数据</div>
        <div class="mt-1 text-[11px] leading-5 text-slate-400">
          默认展示可用于判断本轮 PASS/FAIL 的最小审计证据；完整诊断仍保留并可复制。当前共 {{ snapshots.length }} 条解析记录。
        </div>
      </div>
      <div class="flex flex-wrap items-center justify-end gap-2">
        <el-button-group>
          <el-button size="small" :type="displayMode === 'AUDIT' ? 'primary' : ''" @click="displayMode = 'AUDIT'">精简审计</el-button>
          <el-button size="small" :type="displayMode === 'FULL' ? 'primary' : ''" @click="displayMode = 'FULL'">完整诊断</el-button>
        </el-button-group>
        <el-button size="small" :disabled="!snapshots.length" @click="copyAll">复制全部</el-button>
        <el-button size="small" :disabled="!snapshots.length" @click="copyAllFull">复制全部完整</el-button>
      </div>
    </div>

    <div v-if="testSessionId" class="hve-diagnostics-panel__session">
      <div>Server Test Session：{{ testSessionId }}</div>
      <div v-if="testStateRevision !== null">Latest State Revision：{{ testStateRevision }}</div>
      <div class="mt-1 text-[11px] text-slate-400">仅用于 PC Robot Test，与真实客户 canonical conversation 隔离。</div>
    </div>

    <div class="app-scrollbar hve-diagnostics-panel__body">
      <div v-if="!snapshots.length" class="rounded-lg border border-dashed border-slate-200 p-6 text-center text-xs leading-6 text-slate-400 dark:border-slate-700">
        发送 HVE-3 Candidate 测试消息后，每一轮的 Plan、Role Behavior、Resolved Role、Candidate 等解析数据会按轮次保留在这里。
      </div>

      <el-collapse v-else v-model="activeSnapshotIds" class="hve-diagnostics-collapse">
        <el-collapse-item v-for="snapshot in snapshots" :key="snapshot.id" :name="snapshot.id">
          <template #title>
            <div class="min-w-0 flex-1 pr-2">
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-xs font-medium text-slate-700 dark:text-slate-100">第 {{ snapshot.turnNumber }} 轮</span>
                <el-tag v-if="snapshot.attemptNumber > 1" size="small" type="info">候选 {{ snapshot.attemptNumber }}</el-tag>
                <el-tag size="small" :type="statusTagType(snapshot.requestStatus)">{{ statusLabel(snapshot.requestStatus) }}</el-tag>
                <span v-if="snapshot.stateRevision !== null && snapshot.stateRevision !== undefined" class="text-[11px] text-slate-400">State R{{ snapshot.stateRevision }}</span>
              </div>
              <div class="mt-1 truncate text-[11px] text-slate-400">{{ snapshot.inputContent || '（无输入）' }}</div>
            </div>
          </template>

          <div class="space-y-3 pb-2">
            <div class="flex items-center justify-between gap-3">
              <div class="text-[11px] text-slate-400">{{ snapshot.capturedAt }} · {{ snapshot.requestKind === 'REGENERATE' ? '重新生成' : '首次生成' }}</div>
              <div class="flex items-center gap-2">
                <el-button size="small" @click.stop="copySnapshot(snapshot)">复制本轮</el-button>
                <el-button size="small" @click.stop="copySnapshotFull(snapshot)">复制完整</el-button>
              </div>
            </div>

            <div class="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 dark:bg-slate-800/70">
              <div class="font-medium text-slate-500 dark:text-slate-300">客户输入</div>
              <div class="mt-1 whitespace-pre-wrap break-words text-slate-700 dark:text-slate-100">{{ snapshot.inputContent || '（空）' }}</div>
              <div class="mt-2 font-medium text-slate-500 dark:text-slate-300">机器人回复</div>
              <div class="mt-1 whitespace-pre-wrap break-words text-slate-700 dark:text-slate-100">{{ snapshot.assistantContent || '（未生成回复）' }}</div>
            </div>

            <pre class="hve-diagnostics-panel__raw">{{ displayMode === 'AUDIT' ? formatSnapshot(snapshot) : formatFullSnapshot(snapshot) }}</pre>
          </div>
        </el-collapse-item>
      </el-collapse>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import type { HveCandidateSelectionDiagnostic, HveResolvedRoleDiagnostic } from '@/api/modules/autoReplies';
import type { HveTurnDiagnosticSnapshot } from './hve-diagnostics.types';

const props = defineProps<{
  snapshots: HveTurnDiagnosticSnapshot[];
  testSessionId?: string;
  testStateRevision?: number | null;
}>();

const activeSnapshotIds = ref<string[]>([]);
const displayMode = ref<'AUDIT' | 'FULL'>('AUDIT');

watch(
  () => props.snapshots.map((item) => item.id),
  (ids, previousIds) => {
    if (!ids.length) {
      activeSnapshotIds.value = [];
      return;
    }
    const latestId = ids[ids.length - 1];
    if (!previousIds?.includes(latestId)) activeSnapshotIds.value = [latestId];
  },
  { immediate: true }
);

function statusTagType(status: HveTurnDiagnosticSnapshot['requestStatus']) {
  if (status === 'SUCCESS') return 'success';
  if (status === 'BLOCKED') return 'warning';
  return 'danger';
}

function statusLabel(status: HveTurnDiagnosticSnapshot['requestStatus']) {
  if (status === 'SUCCESS') return '已生成';
  if (status === 'BLOCKED') return '已阻断';
  return '失败';
}

function formatCandidate(item: HveCandidateSelectionDiagnostic['candidates'][number]) {
  const hardIssues = Array.isArray(item?.hardIssueKeys) ? item.hardIssueKeys : [];
  const planIssues = Array.isArray(item?.planIssueKeys) ? item.planIssueKeys : [];
  const planWarnings = Array.isArray(item?.planWarningKeys) ? item.planWarningKeys : [];
  const surfaceIssues = Array.isArray(item?.humanTurnSurfaceIssueKeys) ? item.humanTurnSurfaceIssueKeys : [];
  const personaLabel = item?.roleEvidenceStatus === 'SUFFICIENT'
    ? `Persona:${item?.personaPreferenceScore ?? '-'}`
    : `Persona:UNVERIFIED(${item?.personaPreferenceScore ?? '-'})`;
  const personaScores = [
    `RoleEvidence:${item?.roleEvidenceStatus || 'INSUFFICIENT_EVIDENCE'}(${item?.roleEvidenceScore ?? '-'})`,
    personaLabel,
    `Delta:${item?.crossTurnInformationGainScore ?? '-'}`,
    `Maneuver:${item?.roleTurnManeuverScore ?? '-'}`,
    `Behavior:${item?.roleBehaviorAlignmentScore ?? '-'}`,
    `Voice:${item?.roleVoiceFidelityScore ?? '-'}`,
    `Continuity:${item?.speakerContinuityScore ?? '-'}`,
    `Texture:${item?.conversationalTextureScore ?? '-'}`,
    `Cadence:${item?.aiAnswerCadenceScore ?? '-'}`
  ].join('/');
  const selectionReasons = Array.isArray(item?.selectionIneligibilityReasons) ? item.selectionIneligibilityReasons : [];
  return `#${item?.index ?? '?'} ${item?.selected ? 'SELECTED' : ''} Base:${item?.baseQualified ? 'QUALIFIED' : 'NOT_QUALIFIED'} HoldValue:${item?.holdValueReady ? 'READY' : 'NOT_READY'} Selectable:${item?.selectionEligible ? 'YES' : 'NO'} Hard:${item?.hardStatus || '-'} Plan:${item?.planStatus || '-'} Surface:${item?.humanTurnSurfaceStatus || '-'} ${personaScores}${selectionReasons.length ? ` SelectionBlock:${selectionReasons.join(',')}` : ''}${hardIssues.length ? ` HardIssues:${hardIssues.join(',')}` : ''}${planIssues.length ? ` PlanIssues:${planIssues.join(',')}` : ''}${planWarnings.length ? ` PlanWarn:${planWarnings.join(',')}` : ''}${surfaceIssues.length ? ` SurfaceIssues:${surfaceIssues.join(',')}` : ''}`;
}

function formatFieldSources(role: HveResolvedRoleDiagnostic) {
  if (!role.fieldSources.length) return ['- none'];
  return role.fieldSources.map((item) => `- ${item.field}: source=${item.source} / key=${item.sourceKey}${item.defaulted ? ' / defaulted=true' : ''}${item.compatibilityAlias ? ' / compatibilityAlias=true' : ''}`);
}

function formatReadonlyRecord(value: Record<string, unknown> | null | undefined) {
  if (!value || !Object.keys(value).length) return '-';
  return Object.entries(value).map(([key, item]) => {
    if (Array.isArray(item)) return `${key}=[${item.map((entry) => String(entry)).join(',')}]`;
    if (item && typeof item === 'object') return `${key}=${JSON.stringify(item)}`;
    return `${key}=${String(item ?? '-')}`;
  }).join(' / ');
}

function readonlyRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readDiagnosticValue(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (value === null || value === undefined || value === '') return '-';
  if (Array.isArray(value)) return readDiagnosticList(value);
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function readDiagnosticList(value: unknown) {
  return Array.isArray(value) && value.length ? value.map((item) => String(item)).join(',') : 'none';
}

function compactText(value: unknown, maxLength = 360) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '-';
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

function compactDiagnosticEntry(value: unknown) {
  const record = readonlyRecord(value);
  const code = readDiagnosticValue(record, 'code');
  const atomId = readDiagnosticValue(record, 'atomId');
  const exactText = compactText(record.exactText, 160);
  const reason = compactText(record.reason, 300);
  return [code !== '-' ? `code=${code}` : '', atomId !== '-' ? `atom=${atomId}` : '', exactText !== '-' ? `text=${exactText}` : '', reason !== '-' ? `reason=${reason}` : '']
    .filter(Boolean)
    .join(' / ') || compactText(JSON.stringify(record), 360);
}

function readonlyRecordList(value: unknown) {
  return Array.isArray(value) ? value.map(readonlyRecord).filter((item) => Object.keys(item).length) : [];
}

function formatConstraintAuditLine(value: unknown) {
  const constraint = readonlyRecord(value);
  return [
    `id=${readDiagnosticValue(constraint, 'id')}`,
    `key=${readDiagnosticValue(constraint, 'key')}`,
    `scope=${readDiagnosticValue(constraint, 'scope')}`,
    `evidence=${compactText(constraint.originalEvidence, 180)}`,
    `confidence=${readDiagnosticValue(constraint, 'confidence')}`,
    `supersedes=${readDiagnosticValue(constraint, 'supersedesId')}`,
  ].join(' / ');
}

function formatTurnUnderstandingCompact(value: unknown) {
  const understanding = readonlyRecord(value);
  if (!Object.keys(understanding).length) return ['Turn Understanding: NOT_EXPOSED_BY_CURRENT_DM_TEST_REPLY'];
  const needUnits = readonlyRecordList(understanding.needUnits);
  const constraints = readonlyRecordList(understanding.customerConstraints);
  const referents = readonlyRecordList(understanding.contextualReferents);
  const unknownFields = Array.isArray(understanding.unknownFields) ? understanding.unknownFields : [];
  const provenNeedIds = Array.isArray(understanding.provenNeedIds) ? understanding.provenNeedIds : [];
  const lines = [
    `Turn Understanding: status=${readDiagnosticValue(understanding, 'status')} / provenNeeds=${provenNeedIds.join(',') || 'none'} / needUnits=${needUnits.length} / constraints=${constraints.length} / referents=${referents.length} / unknown=${unknownFields.join(',') || 'none'}`,
  ];
  if (needUnits.length) {
    lines.push(`Current NeedUnits: ${needUnits.slice(0, 6).map((unit) => {
      const target = readonlyRecord(unit.target);
      return `${readDiagnosticValue(unit, 'id')}:${readDiagnosticValue(unit, 'function')}@${readDiagnosticValue(target, 'scope')}/${readDiagnosticValue(target, 'mode')}`;
    }).join(' | ')}`);
  }
  if (constraints.length) {
    lines.push('Current Constraints:');
    constraints.slice(0, 8).forEach((item) => lines.push(`- ${formatConstraintAuditLine(item)}`));
  }
  return lines;
}

function formatSemanticStateAuditCompact(value: unknown) {
  const audit = readonlyRecord(value);
  if (!Object.keys(audit).length) return ['Semantic State: NOT_EXPOSED_BY_CURRENT_DM_TEST_REPLY'];
  const snapshots = readonlyRecordList(audit.semanticSnapshots);
  const supersede = readonlyRecordList(audit.supersedeProvenance);
  const lines = [
    `Semantic State: contract=${readDiagnosticValue(audit, 'contract')} / authority=${readDiagnosticValue(audit, 'authority')} / revision=${readDiagnosticValue(audit, 'stateRevision')} / snapshots=${readDiagnosticValue(audit, 'projectedSemanticSnapshotCount')}/${readDiagnosticValue(audit, 'semanticSnapshotCount')} / limit=${readDiagnosticValue(audit, 'projectionLimit')}`,
    `Semantic Snapshots (${snapshots.length} projected):`,
  ];
  if (!snapshots.length) lines.push('- none');
  else snapshots.slice(-4).forEach((item) => {
    const needs = readonlyRecordList(item.needUnits);
    const constraints = readonlyRecordList(item.customerConstraints);
    const unknownFields = Array.isArray(item.unknownFields) ? item.unknownFields : [];
    const evidenceMessageIds = Array.isArray(item.evidenceMessageIds) ? item.evidenceMessageIds : [];
    lines.push(`- turn=${readDiagnosticValue(item, 'turn')} / status=${readDiagnosticValue(item, 'status')} / provenNeeds=${readDiagnosticList(item.provenNeedIds)} / needUnits=${needs.length} / constraints=${constraints.length} / unknown=${unknownFields.join(',') || 'none'} / evidenceMessages=${evidenceMessageIds.join(',') || 'none'}`);
    if (needs.length) lines.push(`  needs: ${needs.slice(0, 6).map((unit) => {
      const target = readonlyRecord(unit.target);
      return `${readDiagnosticValue(unit, 'id')}:${readDiagnosticValue(unit, 'function')}@${readDiagnosticValue(target, 'scope')}/${readDiagnosticValue(target, 'mode')}`;
    }).join(' | ')}`);
    constraints.slice(0, 8).forEach((constraint) => lines.push(`  constraint: ${formatConstraintAuditLine(constraint)}`));
  });
  lines.push(`Supersede Provenance (${supersede.length}):`);
  if (!supersede.length) lines.push('- none');
  else supersede.slice(-12).forEach((item) => lines.push(`- turn=${readDiagnosticValue(item, 'turn')} / new=${readDiagnosticValue(item, 'constraintId')} / supersedes=${readDiagnosticValue(item, 'supersedesId')} / key=${readDiagnosticValue(item, 'key')} / evidence=${compactText(item.originalEvidence, 180)} / messages=${readDiagnosticList(item.evidenceMessageIds)}`));
  return lines;
}

function formatTargetResolutionAudit(value: unknown) {
  const audit = readonlyRecord(value);
  const target = readonlyRecord(audit.targetResolution);
  if (!Object.keys(target).length) return ['Target Resolution: NOT_RECORDED_BY_SOURCE_VERSION'];
  const catalog = readonlyRecord(target.catalog);
  const binding = readonlyRecord(target.binding);
  const entries = readonlyRecordList(catalog.entries);
  const lines = [
    `Resolution: status=${readDiagnosticValue(target, 'status')} / reason=${readDiagnosticValue(target, 'reason')}`,
    `Catalog: status=${readDiagnosticValue(catalog, 'status')} / source=${readDiagnosticValue(catalog, 'source')} / count=${readDiagnosticValue(catalog, 'catalogCount')} / hash=${readDiagnosticValue(catalog, 'catalogHash')} / truncated=${readDiagnosticValue(catalog, 'truncated')}`,
    `Binding: source=${readDiagnosticValue(binding, 'source')} / key=${readDiagnosticValue(binding, 'constraintKey')} / taxonomyKeys=${readDiagnosticList(binding.taxonomyKeys)} / evidence=${compactText(binding.evidence, 240)}`,
  ];
  if (entries.length) {
    lines.push('Catalog Entries:');
    entries.slice(0, 12).forEach((entry) => lines.push(`- ${readDiagnosticValue(entry, 'key')} | labels=${readDiagnosticList(entry.labels)} | refs=${readDiagnosticList(entry.knowledgeEntryIds)}`));
    if (entries.length > 12) lines.push(`- … ${entries.length - 12} more bounded entries`);
  }
  return lines;
}

function formatRetrievalAudit(value: unknown) {
  const audit = readonlyRecord(value);
  const retrieval = readonlyRecord(audit.retrieval);
  if (!Object.keys(retrieval).length) return ['Retrieval Audit: NOT_RECORDED_BY_SOURCE_VERSION'];
  const counts = readonlyRecord(retrieval.counts);
  const selected = readonlyRecordList(retrieval.selected);
  const membershipRejected = readonlyRecordList(retrieval.candidateMembershipRejected);
  const scopeRejected = readonlyRecordList(retrieval.scopeRejected);
  const budgetEvicted = readonlyRecordList(retrieval.budgetEvicted);
  const lines = [
    `Counts: selected=${readDiagnosticValue(counts, 'selected')} / membershipRejected=${readDiagnosticValue(counts, 'candidateMembershipRejected')} / scopeRejected=${readDiagnosticValue(counts, 'scopeRejected')} / budgetEvicted=${readDiagnosticValue(counts, 'budgetEvicted')}`,
    'Selected Candidates / Evidence:'
  ];
  if (!selected.length) lines.push('- none');
  else selected.slice(0, 12).forEach((entry) => lines.push(
    `- ${readDiagnosticValue(entry, 'id')} | ${compactText(entry.title, 180)} | kind=${readDiagnosticValue(entry, 'knowledgeKind')} | entity=${readDiagnosticValue(entry, 'entityType')}:${readDiagnosticValue(entry, 'entityKey')} | taxonomy=${readDiagnosticList(entry.taxonomyKeys)} | membership=${readDiagnosticValue(entry, 'candidateMembership')}@${readDiagnosticValue(entry, 'candidateMembershipSource')} | matched=${readDiagnosticList(entry.matchedTaxonomyKeys)} | reason=${readDiagnosticValue(entry, 'selectionReason')} | score=${readDiagnosticValue(entry, 'relevanceScore')}`
  ));
  lines.push(`Candidate Membership Rejected (${membershipRejected.length}):`);
  if (!membershipRejected.length) lines.push('- none');
  else membershipRejected.slice(0, 16).forEach((entry) => lines.push(
    `- ${readDiagnosticValue(entry, 'id')} | ${compactText(entry.title, 180)} | kind=${readDiagnosticValue(entry, 'knowledgeKind')} | entity=${readDiagnosticValue(entry, 'entityType')}:${readDiagnosticValue(entry, 'entityKey')} | membership=${readDiagnosticValue(entry, 'membership')}@${readDiagnosticValue(entry, 'source')} | target=${readDiagnosticList(entry.targetTaxonomyKeys)} | candidate=${readDiagnosticList(entry.candidateTaxonomyKeys)}`
  ));
  lines.push(`Scope Rejected (${scopeRejected.length}): ${scopeRejected.length ? scopeRejected.slice(0, 8).map((entry) => `${readDiagnosticValue(entry, 'id')}@${readDiagnosticValue(entry, 'reason')}`).join(' / ') : 'none'}`);
  lines.push(`Budget Evicted (${budgetEvicted.length}): ${budgetEvicted.length ? budgetEvicted.slice(0, 8).map((entry) => `${readDiagnosticValue(entry, 'id')}@${readDiagnosticValue(entry, 'reason')}`).join(' / ') : 'none'}`);
  return lines;
}

function formatGenerationRecoveryAudit(value: unknown) {
  const audit = readonlyRecord(value);
  const generation = readonlyRecord(audit.generation);
  if (!Object.keys(generation).length) return ['Generation Audit: NOT_RECORDED_BY_SOURCE_VERSION'];
  const degradation = readonlyRecord(generation.controlledDegradation);
  const protocol = readonlyRecord(generation.protocolPreservation);
  return [
    `Generation: status=${readDiagnosticValue(generation, 'status')} / model=${readDiagnosticValue(generation, 'actualModel')} (requested=${readDiagnosticValue(generation, 'requestedModel')}) / modelCalls=${readDiagnosticValue(generation, 'modelCallCount')} / rewrites=${readDiagnosticValue(generation, 'rewriteAttemptCount')} / compactRetry=${readDiagnosticValue(generation, 'compactRetryAttempted')}:${readDiagnosticValue(generation, 'compactRetryStatus')}`,
    `Outcome: replySource=${readDiagnosticValue(generation, 'finalReplySource')} / fallback=${readDiagnosticValue(generation, 'fallbackUsed')} / quality=${readDiagnosticValue(generation, 'qualityStatus')} / safety=${readDiagnosticValue(generation, 'safetyStatus')} / failure=${compactText(generation.finalFailureReason, 320)}`,
    `Controlled Degradation: applied=${readDiagnosticValue(degradation, 'applied')} / reason=${compactText(degradation.reason, 320)} / customerVisibleFallback=${readDiagnosticValue(degradation, 'customerVisibleFallback')}`,
    `Protocol Preservation: applied=${readDiagnosticValue(protocol, 'applied')} / source=${readDiagnosticValue(protocol, 'source')} / invariant=${readDiagnosticValue(protocol, 'invariant')}`,
  ];
}

function formatFactFirewallAudit(value: unknown) {
  const audit = readonlyRecord(value);
  const firewall = readonlyRecord(audit.factFirewall);
  if (!Object.keys(firewall).length) return ['Fact Firewall: NOT_RECORDED_BY_SOURCE_VERSION'];
  const removals = readonlyRecordList(firewall.removals);
  const violations = readonlyRecordList(firewall.violations);
  const unitChecks = readonlyRecordList(firewall.unitChecks);
  const semanticSpans = readonlyRecordList(firewall.semanticSpans);
  const lines = [
    `Conformance: authority=${readDiagnosticValue(firewall, 'authority')} / decision=${readDiagnosticValue(firewall, 'decision')} / observed=${readDiagnosticValue(firewall, 'observedDecision')} / sendEffect=${readDiagnosticValue(firewall, 'sendEligibilityEffect')} / error=${compactText(firewall.errorMessage, 400)}`,
    `Checks: units=${unitChecks.length} / semanticSpans=${semanticSpans.length} / removals=${removals.length} / violations=${violations.length}`,
  ];
  if (removals.length) {
    lines.push('Removed propositions:');
    removals.slice(0, 12).forEach((item) => lines.push(`- ${compactDiagnosticEntry(item)}`));
  }
  if (violations.length) {
    lines.push('Violations:');
    violations.slice(0, 12).forEach((item) => lines.push(`- ${compactDiagnosticEntry(item)}`));
  }
  const abnormalSpans = semanticSpans.filter((item) => item.authorized === false || item.violationCode || item.errorMessage);
  if (abnormalSpans.length) {
    lines.push(`Abnormal proposition spans (${abnormalSpans.length}):`);
    abnormalSpans.slice(0, 12).forEach((span) => lines.push(
      `- text=${compactText(span.exactText || span.text, 180)} / contribution=${readDiagnosticValue(span, 'contributionKind')} / target=${readDiagnosticValue(span, 'semanticTarget')} / task=${readDiagnosticValue(span, 'taskDependency')} / evidence=${readDiagnosticValue(span, 'evidenceRequirement')} / authorized=${readDiagnosticValue(span, 'authorized')} / violation=${readDiagnosticValue(span, 'violationCode')} / refs=${readDiagnosticList(span.realizedGroundingRefs)}`
    ));
  }
  return lines;
}

function formatFailureIsolationAudit(value: unknown) {
  const audit = readonlyRecord(value);
  const isolation = readonlyRecord(audit.failureIsolation);
  if (!Object.keys(isolation).length) return ['Failure Isolation: NOT_RECORDED_BY_SOURCE_VERSION'];
  const diagnosticIsolation = readonlyRecord(isolation.diagnosticIsolation);
  return [
    `Diagnostic Isolation: authority=${readDiagnosticValue(diagnosticIsolation, 'authority')} / selectionEffect=${readDiagnosticValue(diagnosticIsolation, 'affectsSelectionEligibility')} / finalCandidateEffect=${readDiagnosticValue(diagnosticIsolation, 'affectsFinalCandidate')} / deliveryEffect=${readDiagnosticValue(diagnosticIsolation, 'affectsDelivery')} / error=${compactText(diagnosticIsolation.error, 400)}`,
    `Fact Firewall Isolation: observed=${readDiagnosticValue(isolation, 'semanticConformanceObservedDecision')} / sendEffect=${readDiagnosticValue(isolation, 'semanticConformanceSendEligibilityEffect')} / error=${compactText(isolation.semanticConformanceError, 400)}`,
  ];
}

function formatSnapshot(snapshot: HveTurnDiagnosticSnapshot) {
  const lines: string[] = [
    'HVE-3 审计精简版',
    `Turn: ${snapshot.turnNumber} / Attempt: ${snapshot.attemptNumber} / Status: ${snapshot.requestStatus} / Lane: ${snapshot.lane}`,
    `Session: ${snapshot.testSessionId || '-'} / State Revision: ${snapshot.stateRevision ?? '-'} / Reply Trace: ${snapshot.replyTraceId || '-'}`,
    `Captured At: ${snapshot.capturedAt}`,
    '',
    '[Customer Surface]',
    `Input: ${compactText(snapshot.inputContent, 800)}`,
    `Reply: ${compactText(snapshot.assistantContent, 1600)}`
  ];
  if (snapshot.errorMessage) lines.push(`Request Error: ${compactText(snapshot.errorMessage, 600)}`);

  const deep = readonlyRecord(snapshot.deepRecognition);
  const recognitionModel = readonlyRecord(deep.recognitionModel);
  const turnUnderstanding = readonlyRecord(deep.turnUnderstanding);
  const composition = snapshot.turnComposition;
  const responseTarget = composition?.semanticDelta.responseTarget;
  lines.push('', '[Understanding / Need]');
  if (!Object.keys(deep).length) lines.push('Deep Recognition: NOT_EXPOSED_OR_EMPTY');
  else lines.push(
    `Recognition: source=${readDiagnosticValue(deep, 'source')} / scenario=${readDiagnosticValue(deep, 'primaryScenario')} / intent=${readDiagnosticValue(deep, 'primaryIntent')} / confidence=${readDiagnosticValue(deep, 'confidence')}`,
    `Recognition Model: status=${readDiagnosticValue(recognitionModel, 'status')} / attempted=${readDiagnosticValue(recognitionModel, 'attempted')} / repairAttempted=${readDiagnosticValue(recognitionModel, 'repairAttempted')} / repairSucceeded=${readDiagnosticValue(recognitionModel, 'repairSucceeded')} / recovery=${readDiagnosticValue(recognitionModel, 'recoveryMode')} / error=${compactText(recognitionModel.errorMessage || recognitionModel.parseError || recognitionModel.repairParseError, 300)}`
  );
  lines.push(...formatTurnUnderstandingCompact(turnUnderstanding));
  if (!responseTarget) lines.push('Response Target: none');
  else lines.push(
    `Response Target: focus=${responseTarget.focus || '-'} / specificity=${responseTarget.requestedSpecificity || '-'} / knowledge=${responseTarget.knowledgeRequirement || '-'} / source=${responseTarget.source || '-'} / confidence=${responseTarget.confidence ?? '-'}`,
    `Unresolved Need: ${compactText(responseTarget.unresolvedNeed, 500)}`,
    `Target Evidence: ${responseTarget.evidence?.join(' / ') || 'none'}`
  );

  const robotSession = readonlyRecord(snapshot.robotTestSessionDiagnostic);
  const active = snapshot.activeContextWindow;
  const decisionIntegrity = snapshot.decisionIntegrity;
  lines.push('', '[State / Continuity]');
  lines.push(
    `State Revision At Generation: ${snapshot.stateRevision ?? '-'}`,
    `Session Commit: ${readDiagnosticValue(robotSession, 'sessionCommitStatus')} / alreadyCommitted=${readDiagnosticValue(robotSession, 'currentMessageAlreadyCommitted')} / semanticAudit=${readDiagnosticValue(robotSession, 'semanticStateAuditStatus')} / warning=${compactText(robotSession.sessionCommitWarning || robotSession.semanticStateAuditWarning, 300)}`,
    `History: messages=${snapshot.contextMessageCount ?? '-'} / selection=${active?.selectionMode || '-'} / allHistoryIncluded=${active?.allHistoryIncluded ? 'YES' : 'NO'} / stateProjection=${active?.stateProjection || '-'}`
  );
  lines.push(...formatSemanticStateAuditCompact(snapshot.semanticStateAudit));
  if (decisionIntegrity) lines.push(
    `Decision Integrity: authority=${decisionIntegrity.authority} / sendEffect=${decisionIntegrity.authorityEffects.send}`,
    `Recognized Constraints: ${decisionIntegrity.recognition.constraints.map((item) => `${item.key || '-'}@${item.evidenceFingerprints.join(',') || '-'}`).join(' / ') || 'none'}`,
    `State Constraints: ${decisionIntegrity.state.relevantConstraints.map((item) => `${item.key || '-'}@${item.valueFingerprint || '-'}`).join(' / ') || 'none'}`,
    `Planning Decision Acts: ${decisionIntegrity.planning.decisionActs.map((item) => `${item.type || '-'}(${item.necessity || '-'})`).join(' / ') || 'none'}`
  );

  lines.push('', '[Target Resolution]');
  lines.push(...formatTargetResolutionAudit(snapshot.runtimeAudit));

  lines.push('', '[Retrieval / Candidate Membership]');
  lines.push(...formatRetrievalAudit(snapshot.runtimeAudit));

  const plan = snapshot.plan;
  const modelFacing = readonlyRecord(snapshot.finalModelFacingHumanTurn);
  const canonicalPermit = readonlyRecord(modelFacing.canonicalPermit);
  const permitConstraints = readonlyRecord(modelFacing.constraints);
  lines.push('', '[Canonical Authority]');
  if (!plan) lines.push('Canonical Plan: none');
  else lines.push(
    `Interaction Type: ${plan.interactionType}`,
    `Required: ${plan.requiredActs.join(' / ') || 'none'}`,
    `Preferred: ${plan.preferredActs.join(' / ') || 'none'}`,
    `Optional: ${plan.optionalActs.join(' / ') || 'none'}`,
    `Completion: ${plan.completion}`
  );
  lines.push(
    `Model Permit: acts=${readDiagnosticValue(canonicalPermit, 'acts')} / scope=${readDiagnosticValue(canonicalPermit, 'scope')}`,
    `Permit Guard: cannotCreateActs=${readDiagnosticValue(permitConstraints, 'cannotCreateActs')} / cannotChangeFactsOrPermission=${readDiagnosticValue(permitConstraints, 'cannotChangeFactsOrPermission')} / noUnauthorizedSemanticContribution=${readDiagnosticValue(permitConstraints, 'noUnauthorizedSemanticContribution')}`
  );

  lines.push('', '[Generation / Recovery]');
  lines.push(...formatGenerationRecoveryAudit(snapshot.runtimeAudit));

  const grounding = snapshot.groundingAudit;
  lines.push('', '[Evidence / Grounding]');
  if (!grounding) lines.push('Grounding Audit: none');
  else {
    lines.push(
      `Target: knowledge=${grounding.responseTarget?.knowledgeRequirement || '-'} / evidence=${grounding.responseTarget?.evidenceState || '-'} / unknown=${grounding.responseTarget?.unknownStrategy || '-'}`,
      `Allowed Refs: ${grounding.allowedGroundingRefs.join(',') || 'none'}`,
      `Realized Refs: ${grounding.realizedGroundingRefs.join(',') || 'none'}`,
      'Selected Knowledge:'
    );
    if (!grounding.selectedKnowledge.length) lines.push('- none');
    else grounding.selectedKnowledge.forEach((entry) => lines.push(`- ${entry.id || '-'} | ${entry.title || '-'} | entity=${entry.entityType || '-'}:${entry.entityKey || '-'} | score=${entry.relevanceScore ?? '-'}`));
    lines.push('Grounded Acts:');
    if (!grounding.groundedActs.length) lines.push('- none');
    else grounding.groundedActs.forEach((act) => lines.push(`- ${act.type || '-'}(${act.necessity || '-'}) refs=${act.grounding.flatMap((item) => item.evidenceRefs).join(',') || '-'} reason=${act.reasonCode || '-'}`));
  }

  lines.push('', '[Fact Firewall / Proposition Evidence]');
  lines.push(...formatFactFirewallAudit(snapshot.runtimeAudit));

  lines.push('', '[Failure Isolation]');
  lines.push(...formatFailureIsolationAudit(snapshot.runtimeAudit));

  lines.push('', '[Conformance / Enforcement]');
  if (!grounding) lines.push('Conformance: none');
  else {
    const extension = grounding.rawExtension || {};
    const removals = Array.isArray(extension.conformanceRemovals) ? extension.conformanceRemovals : [];
    const violations = Array.isArray(extension.conformanceViolations) ? extension.conformanceViolations : [];
    lines.push(
      `Semantic Conformance: ${grounding.conformanceDecision || '-'}`,
      `Grounding Closure: ${String(extension.groundingClosureStatus ?? '-')}`,
      `Observed Decision: ${String(extension.conformanceObservedDecision ?? '-')}`,
      `Conformance Error: ${compactText(extension.conformanceErrorMessage, 500)}`,
      `Unit Checks: ${grounding.unitChecks.length ? grounding.unitChecks.map((unit) => `s${unit.segmentIndex ?? '-'}u${unit.unitIndex ?? '-'} authorized=${unit.authorized} acts=${unit.realizedActIds.join(',') || '-'} refs=${unit.realizedGroundingRefs.join(',') || '-'}`).join(' | ') : 'none'}`,
      `Removals (${removals.length}):`
    );
    if (!removals.length) lines.push('- none');
    else removals.forEach((item) => lines.push(`- ${compactDiagnosticEntry(item)}`));
    lines.push(`Violations (${violations.length}):`);
    if (!violations.length) lines.push('- none');
    else violations.forEach((item) => lines.push(`- ${compactDiagnosticEntry(item)}`));
  }

  const runtime = readonlyRecord(snapshot.runtimeOutcomeDiagnostic);
  const delivery = snapshot.deliveryPlan;
  const selection = snapshot.candidateSelection;
  const selectedCandidate = selection?.candidates.find((item) => item.selected) || null;
  lines.push('', '[Delivery / Final]');
  lines.push(
    `Runtime: action=${readDiagnosticValue(runtime, 'action')} / safety=${readDiagnosticValue(runtime, 'safetyStatus')} / quality=${readDiagnosticValue(runtime, 'qualityStatus')} / replySource=${readDiagnosticValue(runtime, 'replySource')} / fallback=${readDiagnosticValue(runtime, 'fallbackUsed')}`,
    `Delivery: mode=${delivery?.mode || '-'} / segments=${delivery?.segmentCount ?? '-'} / cancelOnCustomerMessage=${delivery?.cancelRemainingOnCustomerMessage ? 'YES' : 'NO'}`,
    `Candidate: selected=${selection?.selectedCandidateIndex ?? 'none'} / reason=${selection?.selectedReason || '-'} / invariant=${selection?.finalCandidateInvariant || '-'}`,
    `Candidate Gate: base=${selectedCandidate ? (selectedCandidate.baseQualified ? 'QUALIFIED' : 'NOT_QUALIFIED') : '-'} / selectable=${selectedCandidate ? (selectedCandidate.selectionEligible ? 'YES' : 'NO') : '-'} / hard=${selectedCandidate?.hardStatus || '-'} / plan=${selectedCandidate?.planStatus || '-'} / surface=${selectedCandidate?.humanTurnSurfaceStatus || '-'}`
  );

  return lines.join('\n');
}

function formatFullSnapshot(snapshot: HveTurnDiagnosticSnapshot) {
  const lines: string[] = [
    'HVE-3 解析数据',
    `Turn: ${snapshot.turnNumber}`,
    `Attempt: ${snapshot.attemptNumber}`,
    `Request Kind: ${snapshot.requestKind}`,
    `Request Status: ${snapshot.requestStatus}`,
    `Lane: ${snapshot.lane}`,
    `Server Test Session: ${snapshot.testSessionId || '-'}`,
    `State Revision: ${snapshot.stateRevision ?? '-'}`,
    `Reply Trace: ${snapshot.replyTraceId || '-'}`,
    `Captured At: ${snapshot.capturedAt}`
  ];

  if (snapshot.errorMessage) lines.push(`Error: ${snapshot.errorMessage}`);

  const kernel = readonlyRecord(snapshot.generationKernel);
  lines.push('', '[Generation Kernel]');
  if (!Object.keys(kernel).length) lines.push('No generation kernel diagnostic');
  else lines.push(
    `ID: ${readDiagnosticValue(kernel, 'id')}`,
    `Version: ${readDiagnosticValue(kernel, 'version')}`,
    `Schema: ${readDiagnosticValue(kernel, 'compatibleSchema')}`,
    `Content Hash: ${readDiagnosticValue(kernel, 'contentHash')}`
  );

  const active = snapshot.activeContextWindow;
  lines.push('', '[Active Context Integrity]');
  if (!active) lines.push('No active context window diagnostic');
  else lines.push(
    `Generation History Count: ${snapshot.contextMessageCount ?? '-'}`,
    `Selection: mode=${active.selectionMode || '-'} / budgetApplied=${active.budgetApplied ? 'YES' : 'NO'} / allHistoryIncluded=${active.allHistoryIncluded ? 'YES' : 'NO'}`,
    `Token Budget: total=${active.tokenBudget ?? '-'} / current=${active.estimatedCurrentMessageTokens ?? '-'} / generationState=${active.estimatedStateTokens ?? '-'} / internalState=${active.estimatedInternalStateTokens ?? '-'} / historyBudget=${active.historyTokenBudget ?? '-'} / selectedHistory=${active.estimatedHistoryTokens ?? '-'} / estimatedTotal=${active.estimatedTokens ?? '-'}`,
    `State Projection: ${active.stateProjection || '-'}`,
    `Messages: logicalCandidate=${active.candidateMessageCount ?? '-'} / physicalCandidate=${active.physicalMessageCount ?? '-'} / selected=${active.selectedMessageCount ?? '-'} / evidenceRecall=${active.evidenceRecallCount ?? '-'} / sourceConversations=${active.sourceConversationCount ?? '-'}`
  );

  lines.push('', '[Deep Recognition Raw]');
  lines.push(snapshot.deepRecognition ? JSON.stringify(snapshot.deepRecognition) : 'No deep recognition diagnostic');

  lines.push('', '[Robot Test Session / Runtime Outcome]');
  lines.push(`Session: ${formatReadonlyRecord(snapshot.robotTestSessionDiagnostic)}`);
  lines.push(`Runtime: ${formatReadonlyRecord(snapshot.runtimeOutcomeDiagnostic)}`);
  lines.push('', '[Runtime Audit Diagnostic V1]');
  lines.push(snapshot.runtimeAudit ? JSON.stringify(snapshot.runtimeAudit) : 'NOT_RECORDED_BY_SOURCE_VERSION');
  lines.push('', '[Phase A Semantic State Audit]');
  lines.push(snapshot.semanticStateAudit ? JSON.stringify(snapshot.semanticStateAudit) : 'NOT_EXPOSED_BY_CURRENT_DM_TEST_REPLY');

  const delivery = snapshot.deliveryPlan;
  lines.push('', '[Presentation / Delivery]');
  if (!delivery) lines.push('No delivery plan diagnostic');
  else lines.push(
    `Authority: ${delivery.authority || '-'}`,
    `Typed Segmentation: ${snapshot.turnComposition?.segmentation || '-'}`,
    `Delivery: mode=${delivery.mode || '-'} / segmentCount=${delivery.segmentCount ?? '-'} / cancelOnCustomerMessage=${delivery.cancelRemainingOnCustomerMessage ? 'YES' : 'NO'}`,
    `Presentation Contract: boundarySource=${delivery.boundarySource || '-'} / explicitSegments=${delivery.explicitSegmentCount ?? 0} / explicitBreaks=${delivery.explicitBreakCount ?? 0}`,
    `Delays: ${delivery.segments.length ? delivery.segments.map((segment) => `#${segment.index + 1}:${segment.delayBeforeMs}ms`).join(' / ') : 'none'}`,
    `Segment Preview: ${delivery.segments.length ? delivery.segments.map((segment) => `#${segment.index + 1}[${segment.contentLength ?? 0}]=${segment.preview || '-'}`).join(' || ') : 'none'}`,
    `Reason: ${delivery.reason || '-'}`
  );

  const activation = snapshot.activation;
  lines.push('', '[Activation / Role Posture]');
  if (!activation) {
    lines.push('No activation diagnostic');
  } else {
    lines.push(
      `V1.9 Activation: ${activation.status}`,
      `Role Posture Source: ${activation.rolePostureSource}`,
      `Effective Posture: initiative=${activation.effectivePosture.initiativeLevel} / opening=${activation.effectivePosture.openingParticipation} / followUp=${activation.effectivePosture.followUpOffering} / clarification=${activation.effectivePosture.clarificationInitiative} / guidance=${activation.effectivePosture.guidanceInitiative} / resolution=${activation.effectivePosture.resolutionFollowThrough} / salesPressure=${activation.effectivePosture.salesPressure}`,
      `Public Relation: ${activation.publicRelation.status} / ${activation.publicRelation.value || '-'}`
    );
    if (activation.blockerCodes.length) lines.push(`Blockers: ${activation.blockerCodes.join(' / ')}`);
    if (activation.issues.length) lines.push(`Issues: ${activation.issues.join(' / ')}`);
  }

  const plan = snapshot.plan;
  lines.push('', '[Canonical Plan]');
  if (!plan) lines.push('No canonical plan diagnostic');
  else lines.push(
    `Interaction Type: ${plan.interactionType}`,
    `Required: ${plan.requiredActs.join(' / ') || 'none'}`,
    `Preferred: ${plan.preferredActs.join(' / ') || 'none'}`,
    `Optional: ${plan.optionalActs.join(' / ') || 'none'}`,
    `Completion: ${plan.completion}`,
    `Role Plan Policy: ${plan.rolePolicy?.authority || '-'} / maneuver=${plan.rolePolicy?.maneuver || '-'} / added=${plan.rolePolicy?.addedActTypes.join(',') || 'none'} / removed=${plan.rolePolicy?.removedActTypes.join(',') || 'none'}`
  );

  const participation = snapshot.participation;
  lines.push('', '[Human Participation]');
  if (!participation) lines.push('No human participation diagnostic');
  else {
    lines.push(
      `Participation: ${participation.participationMode} / ownership=${participation.ownershipLevel} / continuity=${participation.continuityMode} / initiative=${participation.initiativeRealization} / role=${participation.rolePresence}`,
      `Turn Maneuver: ${participation.turnManeuver}`,
      `Question Disposition: ${participation.questionDisposition}`,
      `Guidance Disposition: ${participation.guidanceDisposition}`
    );
    const behavior = participation.roleBehavior;
    lines.push('', '[Role Behavior]');
    if (!behavior) lines.push('No role behavior diagnostic');
    else lines.push(
      `Response Priority: ${behavior.responsePriority}`,
      `Judgment: ${behavior.judgmentStyle}`,
      `Relation: ${behavior.relationshipStance}`,
      `Question: ${behavior.questionThreshold}`,
      `Advice: ${behavior.adviceMode}`,
      `Cadence: ${behavior.cadence}`,
      `Expression Dynamics: warmth=${behavior.expressionDynamics?.warmth || '-'} / engagement=${behavior.expressionDynamics?.engagement || '-'} / reassurance=${behavior.expressionDynamics?.reassurance || '-'} / servicePresence=${behavior.expressionDynamics?.servicePresence || '-'}`,
      `Behavior Signature: ${behavior.behaviorSignature}`,
      `Evidence Targets: ${behavior.evidenceTargets.join(' / ') || 'none'}`,
      `Source Signals: ${behavior.sourceSignals.join(' / ') || 'none'}`
    );
  }

  const humanTurn = snapshot.humanTurnObservability;
  lines.push('', '[Human Turn Observability]');
  if (!humanTurn) lines.push('No human turn observability diagnostic');
  else {
    lines.push(
      `Contract: ${humanTurn.contract || '-'}`,
      `Authority: ${humanTurn.authority || '-'} / realization=${humanTurn.realizationAuthority || '-'} / schema=${humanTurn.schemaVersion ?? '-'}`
    );
    const need = humanTurn.needAlignment;
    if (!need) lines.push('Need Alignment: none');
    else lines.push(
      `Need Alignment: authority=${need.authority || '-'} / primary=${need.primaryContribution || '-'} / acknowledgement=${need.acknowledgementRealization || '-'} / explanation=${need.explanationRole || '-'} / opening=${need.openingBias || '-'} / understanding=${need.understandingProof || '-'}`,
      `Need Constraints: preserveRequired=${need.constraints.preserveAllRequiredActs ?? '-'} / cannotCreateActs=${need.constraints.cannotCreateActs ?? '-'} / cannotChangeFactsOrPermission=${need.constraints.cannotChangeFactsOrPermission ?? '-'} / noRestatementAsValue=${need.constraints.noNeedRestatementAsSubstituteForValue ?? '-'}`
    );
    const shared = humanTurn.sharedContext;
    if (!shared) lines.push('Shared Context / Given-New: none');
    else lines.push(
      `Shared Context / Given-New: authority=${shared.authority || '-'} / currentTurn=${shared.currentTurnInformation || '-'} / priorContext=${shared.priorContext || '-'} / referential=${shared.referentialMode || '-'} / basis=${shared.referenceBasis || '-'} / newValueStart=${shared.newValueStart || '-'} / prior=${shared.priorContributionStatus || '-'} / reuse=${shared.priorContributionReuse || '-'}`,
      `Shared Context Constraints: avoidEvaluativeReceptionBeforeValue=${shared.avoidEvaluativeReceptionBeforeValue ?? '-'} / mustAdvanceBeyondGiven=${shared.mustAdvanceBeyondGiven ?? '-'} / cannotCreateActs=${shared.constraints.cannotCreateActs ?? '-'} / cannotChangeFactsOrPermission=${shared.constraints.cannotChangeFactsOrPermission ?? '-'} / cannotInventReferents=${shared.constraints.cannotInventReferents ?? '-'} / explicitReferenceRequiresSemanticNeed=${shared.constraints.explicitReferenceRequiresSemanticNeed ?? '-'}`
    );
    const reality = humanTurn.conversationReality;
    if (!reality) lines.push('Conversation Reality: none');
    else {
      lines.push(
        `Conversation Reality: authority=${reality.authority || '-'} / source=${reality.sourceAuthority || '-'} / privacy=${reality.privacyProjection || '-'} / currentTurn=${reality.currentTurn ?? '-'} / priorMessages=${reality.priorConversationMessages ?? '-'}`,
        `Exchange: state=${reality.exchange.state || '-'} / priorAssistantTurns=${reality.exchange.priorAssistantTurns ?? '-'}`,
        `Continuity: accepted=${reality.continuity.lastAssistantMoveAccepted ?? '-'} / rejected=${reality.continuity.lastAssistantMoveRejected ?? '-'} / requestedDeltas=${reality.continuity.recentRequestedDeltas.join(',') || 'none'}`,
        `Current Feedback: reception=${reality.currentFeedback.reception || '-'} / handling=${reality.currentFeedback.handlingMode || '-'} / strategyChange=${reality.currentFeedback.strategyChangeRequired ?? '-'} / correctionTarget=${reality.currentFeedback.correctionTarget || '-'} / requestedDeltas=${reality.currentFeedback.requestedDeltas.join(',') || 'none'}`
      );
      if (reality.activeTask) lines.push(`Active Task: status=${reality.activeTask.status || '-'} / responsibility=${reality.activeTask.responsibility || '-'} / createdTurn=${reality.activeTask.createdTurn ?? '-'} / lastActiveTurn=${reality.activeTask.lastActiveTurn ?? '-'} / unresolvedGoalCount=${reality.activeTask.unresolvedGoalCount ?? '-'}`);
      else lines.push('Active Task: none');
      lines.push(
        `Relevant Memories: ${reality.relevantMemories.length ? reality.relevantMemories.map((item) => `${item.kind || '-'}:${item.key || '-'}@${item.sourceTurn ?? '-'}(${item.confidence ?? '-'})`).join(' / ') : 'none'}`,
        `Recent Suspended Tasks: ${reality.recentSuspendedTasks.length ? reality.recentSuspendedTasks.map((item) => `${item.status || '-'}:${item.responsibility || '-'}@${item.createdTurn ?? '-'}->${item.lastActiveTurn ?? '-'}`).join(' / ') : 'none'}`,
        `Recent Assistant Moves: ${reality.recentAssistantMoves.length ? reality.recentAssistantMoves.map((item) => `accepted=${item.accepted ?? '-'},rejected=${item.rejected ?? '-'},delta=${item.requestedDeltas.join(',') || 'none'}`).join(' / ') : 'none'}`
      );
    }
    const shape = humanTurn.turnShape;
    lines.push(shape
      ? `Turn Shape: mode=${shape.mode || '-'} / beats=${shape.preferredBeats ?? '-'}..${shape.maxBeats ?? '-'} / acknowledgement=${shape.acknowledgement || '-'} / question=${shape.questionPlacement || '-'} / stop=${shape.stopBias || '-'}`
      : 'Turn Shape: none');
    lines.push(
      `Surface Budget: ${formatReadonlyRecord(humanTurn.surfaceBudget)}`,
      `Anti-AI Cadence: ${formatReadonlyRecord(humanTurn.antiAiCadence)}`,
      `Texture: ${formatReadonlyRecord(humanTurn.texture)}`,
      `Adaptation: ${formatReadonlyRecord(humanTurn.adaptation)}`
    );
  }

  const finalHumanTurn = snapshot.finalModelFacingHumanTurn;
  lines.push('', '[Final Model-Facing HumanTurn]');
  if (!finalHumanTurn || !Object.keys(finalHumanTurn).length) {
    lines.push('No final model-facing HumanTurn diagnostic');
  } else {
    const realization = readonlyRecord(finalHumanTurn.realization);
    const canonicalPlan = readonlyRecord(realization.canonicalPlan);
    const receptionContribution = readonlyRecord(canonicalPlan.receptionContribution);
    const semanticPermit = readonlyRecord(canonicalPlan.semanticPermit);
    const primary = readonlyRecord(realization.primary);
    const support = readonlyRecord(realization.support);
    const selected = readonlyRecord(realization.selectedComponents);
    const identity = readonlyRecord(selected.identity);
    const customerInput = readonlyRecord(selected.customerInput);
    const continuity = readonlyRecord(realization.continuity);
    const feedback = readonlyRecord(continuity.currentFeedback);
    const completion = readonlyRecord(realization.completion);
    const constraints = readonlyRecord(realization.constraints);
    const surface = readonlyRecord(finalHumanTurn.surface);
    const generationGuidance = readonlyRecord(surface.generationGuidance);
    const texture = readonlyRecord(surface.texture);
    const adaptation = readonlyRecord(surface.adaptation);
    const pcSurface = readonlyRecord(surface.explicitPcSurface);
    lines.push(
      `Authority: ${readDiagnosticValue(finalHumanTurn, 'authority')}`,
      `Realization Authority: ${readDiagnosticValue(realization, 'authority')}`,
      `Canonical Permit: acts=${readDiagnosticList(semanticPermit.selectedActTypes)} / reception=${readDiagnosticValue(receptionContribution, 'selected')}(${readDiagnosticList(receptionContribution.actTypes)}) / scope=${readDiagnosticValue(semanticPermit, 'customerVisibleContributionScope')} / personaSemanticDelta=${readDiagnosticValue(semanticPermit, 'personaSemanticDelta')}`,
      `Primary: contribution=${readDiagnosticValue(primary, 'contribution')} / target=${readDiagnosticValue(primary, 'target')} / specificity=${readDiagnosticValue(primary, 'requestedSpecificity')} / delta=${readDiagnosticValue(primary, 'requiredDelta')} / valueMode=${readDiagnosticValue(primary, 'currentTurnValueMode')}`,
      `Support: mode=${readDiagnosticValue(support, 'mode')}`,
      `Selected: identity=${readDiagnosticValue(identity, 'selected')}(${readDiagnosticValue(identity, 'mode')}) / customerInput=${readDiagnosticValue(customerInput, 'selected')}(${readDiagnosticValue(customerInput, 'disposition')}) / inputDependency=${readDiagnosticValue(customerInput, 'completionDependency')}`,
      `Continuity: prior=${readDiagnosticValue(continuity, 'priorContributionStatus')} / reuse=${readDiagnosticValue(continuity, 'priorContributionReuse')} / reception=${readDiagnosticValue(feedback, 'reception')} / correction=${readDiagnosticValue(feedback, 'correctionTarget')} / requestedDeltas=${readDiagnosticList(feedback.requestedDeltas)}`,
      `Completion: policy=${readDiagnosticValue(completion, 'policy')} / stopBias=${readDiagnosticValue(completion, 'stopBias')} / cadence=${readDiagnosticValue(completion, 'cadence')} / afterPrimary=${readDiagnosticValue(completion, 'afterPrimary')} / stopAfterQuestion=${readDiagnosticValue(completion, 'stopAfterQuestion')}`,
      `Constraints: cannotCreateActs=${readDiagnosticValue(constraints, 'cannotCreateActs')} / cannotChangeFactsOrPermission=${readDiagnosticValue(constraints, 'cannotChangeFactsOrPermission')} / noUnauthorizedIndependentContribution=${readDiagnosticValue(constraints, 'noUnauthorizedIndependentContribution')} / noUnauthorizedSemanticContribution=${readDiagnosticValue(constraints, 'noUnauthorizedSemanticContribution')} / semanticContributionScope=${readDiagnosticValue(constraints, 'semanticContributionScope')}`,
      `Surface Authority: ${readDiagnosticValue(surface, 'authority')}`,
      `Persona HOW Authority: ${readDiagnosticValue(generationGuidance, 'authority')} / semanticAuthority=${readDiagnosticValue(generationGuidance, 'semanticAuthority')}`,
      `Surface Texture: spoken=${readDiagnosticValue(texture, 'spokenRegister')} / brevity=${readDiagnosticValue(texture, 'brevity')} / sentenceShape=${readDiagnosticValue(texture, 'sentenceShape')} / rhythm=${readDiagnosticValue(texture, 'rhythmVariation')} / connective=${readDiagnosticValue(texture, 'connectiveDensity')} / explicitReasoning=${readDiagnosticValue(texture, 'explicitReasoning')} / particles=${readDiagnosticValue(texture, 'sentenceParticleLevel')} / emoji=${readDiagnosticValue(texture, 'emoji')}`,
      `Surface Adaptation: message=${readDiagnosticValue(adaptation, 'customerMessageShape')} / relation=${readDiagnosticValue(adaptation, 'relationshipDistance')} / mirror=${readDiagnosticValue(adaptation, 'mirrorIntensity')} / varyRecent=${readDiagnosticValue(adaptation, 'varyFromRecentStructure')}`,
      `Explicit PC Surface: naturalness=${readDiagnosticValue(pcSurface, 'naturalness')} / density=${readDiagnosticValue(pcSurface, 'responseDensity')} / colloquiality=${readDiagnosticValue(pcSurface, 'colloquiality')} / emoji=${readDiagnosticValue(pcSurface, 'emoji')}`
    );
  }

  const humanity = snapshot.humanityMetrics;
  lines.push('', '[Humanity Metric Semantics]');
  if (!humanity) lines.push('No humanity metric semantics diagnostic');
  else {
    lines.push(
      `Contract: ${humanity.contract || '-'}`,
      `Authority: ${humanity.authority || '-'}`,
      `Authority Effects: generation=${humanity.affectsGeneration ?? '-'} / selectionEligibility=${humanity.affectsSelectionEligibility ?? '-'} / finalCandidate=${humanity.affectsFinalCandidate ?? '-'} / delivery=${humanity.affectsDelivery ?? '-'}`,
      `Caution: ${humanity.caution || '-'}`,
      `Selected Candidate: ${humanity.selectedCandidateIndex ?? 'none'}`,
      `Human Realization Floor: ${humanity.humanRealizationFloor.status || '-'}(${humanity.humanRealizationFloor.score ?? '-'}) / semantics=${humanity.humanRealizationFloor.semantics || '-'}${humanity.humanRealizationFloor.issueKeys.length ? ` / issues=${humanity.humanRealizationFloor.issueKeys.join(',')}` : ''}`,
      `Headline: status=${humanity.headline.status || '-'} / humanityAvg=${humanity.headline.humanityAverageScore ?? '-'} / pairwiseUtility=${humanity.headline.pairwiseUtilityScore ?? '-'} / personaPreference=${humanity.headline.personaPreferenceScore ?? '-'} / highRisk=${humanity.headline.highRiskKeys.join(',') || 'none'}`,
      `Role Evidence: ${humanity.roleEvidence.status || '-'}(${humanity.roleEvidence.score ?? '-'}) / semantics=${humanity.roleEvidence.semantics || '-'} / fingerprint=${humanity.roleEvidence.configurationFingerprint || '-'}`,
      `Positive Role Evidence: ${humanity.roleEvidence.positiveEvidence.join(' / ') || 'none'}`,
      `Missing Role Evidence: ${humanity.roleEvidence.missingEvidence.join(' / ') || 'none'}`,
      'Metrics:'
    );
    humanity.metrics.forEach((metric) => lines.push(`- ${metric.key || '-'}: score=${metric.score ?? '-'} / risk=${metric.risk || '-'} / semantics=${metric.semantics || '-'} / evidence=${metric.evidence.join(' / ') || 'none'}`));
    lines.push(`Semantic Value: informationGain=${humanity.semanticValue.informationGainScore ?? '-'} / redundantParaphrase=${humanity.semanticValue.redundantParaphraseScore ?? '-'} / crossTurnInformationGain=${humanity.semanticValue.crossTurnInformationGainScore ?? '-'} / currentTurnValue=${humanity.semanticValue.currentTurnValueScore ?? '-'} / contribution=${humanity.semanticValue.decisionContributionKind || '-'}(${humanity.semanticValue.decisionContributionScore ?? '-'})`);
  }

  const composition = snapshot.turnComposition;
  lines.push('', '[Semantic Delta / Turn Composition]');
  if (!composition) lines.push('No turn composition diagnostic');
  else lines.push(
    `Continuity: ${composition.semanticDelta.continuity}`,
    `Current Focus: ${composition.semanticDelta.currentFocus} / ${composition.semanticDelta.currentFocusLabel}`,
    `Previous Focus: ${composition.semanticDelta.previousFocus || '-'}`,
    `Must Add New Information: ${composition.semanticDelta.mustAddNewInformation ? 'YES' : 'NO'}`,
    `Avoid Repeat: ${composition.semanticDelta.avoidRepeat ? 'YES' : 'NO'}`,
    `Evidence State: ${composition.semanticDelta.evidenceState}`,
    `Unknown Strategy: ${composition.semanticDelta.unknownStrategy}`,
    `Response Target: focus=${composition.semanticDelta.responseTarget?.focus || '-'} / specificity=${composition.semanticDelta.responseTarget?.requestedSpecificity || '-'} / priorCoverage=${composition.semanticDelta.responseTarget?.priorCoverage || '-'} / requiredDelta=${composition.semanticDelta.responseTarget?.requiredDelta || '-'} / knowledge=${composition.semanticDelta.responseTarget?.knowledgeRequirement || '-'} / source=${composition.semanticDelta.responseTarget?.source || '-'} / confidence=${composition.semanticDelta.responseTarget?.confidence ?? '-'}`,
    `Unresolved Need: ${composition.semanticDelta.responseTarget?.unresolvedNeed || '-'}`,
    `Response Target Evidence: ${composition.semanticDelta.responseTarget?.evidence?.join(' / ') || 'none'}`,
    `Beats: ${composition.beats.join(' / ') || 'none'}`,
    `Message Segments: preferred=${composition.preferredMessageSegments} / max=${composition.maxMessageSegments} / ${composition.segmentation}`,
    `Segment Plan: ${composition.segmentPlan.length ? composition.segmentPlan.map((segment) => `#${segment.index + 1}:${segment.purposes.join('+')}[${segment.roleSignals.join('+')}]${segment.mustCarryNewValue ? ':NEW_VALUE' : ''}`).join(' / ') : 'none'}`
  );

  const roleContext = snapshot.roleContext;
  lines.push('', '[Role Context]');
  if (!roleContext) lines.push('No role context diagnostic');
  else lines.push(
    `Source: ${roleContext.source}`,
    `Relation: ${roleContext.relationLabel || '-'}`,
    `Primary Scope: ${roleContext.primaryScope || '-'}`,
    `Support Areas: ${roleContext.supportAreas.join(' / ') || 'none'}`,
    `Service Boundary: ${roleContext.serviceBoundary || '-'}`,
    `Domain Label: ${roleContext.domainLabel || '-'}`,
    `Realization Anchor: ${roleContext.realizationAnchor || '-'}`
  );

  const resolvedRole = snapshot.resolvedRole;
  lines.push('', '[Resolved Role Contract]');
  if (!resolvedRole) lines.push('No resolved role diagnostic');
  else {
    lines.push(
      `Speaker Source: ${resolvedRole.speakerSource}`,
      `Speaker Profile Source: ${resolvedRole.speakerProfileSource}`,
      `Fingerprint: ${resolvedRole.configurationFingerprint}`,
      `Channel: ${resolvedRole.channel || '-'}`,
      `Account Tone: ${resolvedRole.accountExpression.tone || '-'}`,
      `Account Voice: ${resolvedRole.accountExpression.voice || '-'}`,
      `Account Background: ${resolvedRole.accountExpression.background || '-'}`,
      `Account Relationship: ${resolvedRole.accountExpression.relationship || '-'}`,
      `Compile Evidence: ${resolvedRole.compileEvidence.join(' / ') || 'none'}`,
      `Missing Fields: ${resolvedRole.missingFields.join(' / ') || 'none'}`,
      `Defaulted Fields: ${resolvedRole.defaultedFields.join(' / ') || 'none'}`,
      `Conflict Keys: ${resolvedRole.conflictKeys.join(' / ') || 'none'}`,
      'Field Sources:',
      ...formatFieldSources(resolvedRole)
    );
  }

  const decisionIntegrity = snapshot.decisionIntegrity;
  lines.push('', '[Decision Integrity Diagnostics]');
  if (!decisionIntegrity) lines.push('No decision integrity diagnostic');
  else {
    lines.push(
      `Contract: ${decisionIntegrity.contract || '-'}`,
      `Authority: ${decisionIntegrity.authority || '-'}`,
      `Authority Effects: generation=${decisionIntegrity.authorityEffects.generation} / selectionEligibility=${decisionIntegrity.authorityEffects.selectionEligibility} / finalCandidate=${decisionIntegrity.authorityEffects.finalCandidate} / delivery=${decisionIntegrity.authorityEffects.delivery} / send=${decisionIntegrity.authorityEffects.send}`,
      'Recognition Constraints:'
    );
    if (!decisionIntegrity.recognition.constraints.length) lines.push('- none');
    else decisionIntegrity.recognition.constraints.forEach((item) => lines.push(`- ${item.key || '-'} / recognitionId=${item.recognitionId || '-'} / confidence=${item.confidence ?? '-'} / evidenceFingerprints=${item.evidenceFingerprints.join(',') || '-'}`));
    lines.push('Relevant Constraints:');
    if (!decisionIntegrity.state.relevantConstraints.length) lines.push('- none');
    else decisionIntegrity.state.relevantConstraints.forEach((item) => lines.push(`- ${item.key || '-'} / id=${item.id || '-'} / sourceTurn=${item.sourceTurn ?? '-'} / confidence=${item.confidence ?? '-'} / valueFingerprint=${item.valueFingerprint || '-'}`));
    lines.push('Canonical Explicit Facts:');
    if (!decisionIntegrity.state.canonicalExplicitFacts.length) lines.push('- none');
    else decisionIntegrity.state.canonicalExplicitFacts.forEach((item) => lines.push(`- ${item.key || '-'} / valueFingerprint=${item.valueFingerprint || '-'}`));
    lines.push('Planning State Guidance Explicit Facts:');
    if (!decisionIntegrity.planning.stateGuidanceExplicitFacts.length) lines.push('- none');
    else decisionIntegrity.planning.stateGuidanceExplicitFacts.forEach((item) => lines.push(`- ${item.key || '-'} / valueFingerprint=${item.valueFingerprint || '-'}`));
    lines.push('Decision Acts:');
    if (!decisionIntegrity.planning.decisionActs.length) lines.push('- none');
    else decisionIntegrity.planning.decisionActs.forEach((item) => lines.push(`- ${item.type || '-'}(${item.necessity || '-'}) / reason=${item.reasonCode || '-'} / knownFingerprints=${item.knownFingerprints.join(',') || '-'}`));
  }

  const groundingAudit = snapshot.groundingAudit;
  lines.push('', '[Grounding / Provenance]');
  if (!groundingAudit) lines.push('No grounding provenance diagnostic');
  else {
    lines.push(
      `Contract: ${groundingAudit.contract} / authority=${groundingAudit.authority}`,
      `Authority Effects: generation=${groundingAudit.affectsGeneration} / selection=${groundingAudit.affectsSelectionEligibility} / finalCandidate=${groundingAudit.affectsFinalCandidate} / delivery=${groundingAudit.affectsDelivery}`,
      `Target: knowledge=${groundingAudit.responseTarget?.knowledgeRequirement || '-'} / evidence=${groundingAudit.responseTarget?.evidenceState || '-'} / unknown=${groundingAudit.responseTarget?.unknownStrategy || '-'}`,
      `Fact Evidence: ${groundingAudit.responseTarget?.factEvidence.join(' / ') || 'none'}`,
      `Allowed Grounding Refs: ${groundingAudit.allowedGroundingRefs.join(' / ') || 'none'}`,
      `Realized Grounding Refs: ${groundingAudit.realizedGroundingRefs.join(' / ') || 'none'}`,
      `Semantic Conformance: ${groundingAudit.conformanceDecision || '-'}`,
      'Selected Knowledge:'
    );
    if (!groundingAudit.selectedKnowledge.length) lines.push('- none');
    else groundingAudit.selectedKnowledge.forEach((entry) => {
      lines.push(`- ${entry.id || '-'} | ${entry.title || '-'} | entity=${entry.entityType || '-'}:${entry.entityKey || '-'} | reason=${entry.selectionReason || '-'} | score=${entry.relevanceScore ?? '-'} | match=${entry.matchEvidence.join(',') || '-'}`);
    });
    lines.push('Grounded Acts:');
    if (!groundingAudit.groundedActs.length) lines.push('- none');
    else groundingAudit.groundedActs.forEach((act) => {
      const refs = act.grounding.flatMap((item) => item.evidenceRefs);
      lines.push(`- ${act.type || '-'}(${act.necessity || '-'}) id=${act.id || '-'} refs=${refs.join(',') || '-'} reason=${act.reasonCode || '-'}`);
    });
    lines.push('Generated Bindings:');
    if (!groundingAudit.generatedBindings.length) lines.push('- none');
    else groundingAudit.generatedBindings.forEach((binding) => {
      lines.push(`- segment=${binding.index ?? '-'} acts=${binding.plannedActTypes.join(',') || '-'} allowedRefs=${binding.allowedGroundingRefs.join(',') || '-'} provenance=${binding.provenanceAuthority || '-'}`);
    });
    lines.push('Conformance Unit Checks:');
    if (!groundingAudit.unitChecks.length) lines.push('- none');
    else groundingAudit.unitChecks.forEach((unit) => {
      lines.push(`- segment=${unit.segmentIndex ?? '-'} unit=${unit.unitIndex ?? '-'} authorized=${unit.authorized} acts=${unit.realizedActIds.join(',') || '-'} realizedRefs=${unit.realizedGroundingRefs.join(',') || '-'}`);
    });
    groundingAudit.unitChecks.forEach((unit) => {
      lines.push(`- Evidence segment=${unit.segmentIndex} unit=${unit.unitIndex}: ${JSON.stringify({ semanticUnitBindings: unit.semanticUnitBindings, semanticSpans: unit.semanticSpans })}`);
    });
    const extensionKeys = Object.keys(groundingAudit.rawExtension || {});
    if (extensionKeys.length) {
      lines.push('V17+ Audit Extension:');
      for (const key of extensionKeys) {
        const value = groundingAudit.rawExtension[key];
        lines.push(`- ${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`);
      }
    }
  }

  const selection = snapshot.candidateSelection;
  lines.push('', '[Candidate Selection]');
  if (!selection) lines.push('No candidate selection diagnostic');
  else {
    lines.push(
      `Selected: ${selection.selectedCandidateIndex ?? 'none'}`,
      `Reason: ${selection.selectedReason || '-'}`,
      `Final Candidate: ${selection.selectedCandidateIdentity?.lexicalSha256 || '-'} / invariant=${selection.finalCandidateInvariant || '-'}`
    );
    selection.candidates.forEach((item) => {
      lines.push(formatCandidate(item));
      lines.push(`Semantic Fulfillment: ${item.semanticFulfillmentStatus || '-'}(${item.semanticFulfillmentScore ?? '-'})${item.semanticFulfillmentIssueKeys.length ? ` / ${item.semanticFulfillmentIssueKeys.join(',')}` : ''}`);
      lines.push(`Target Coverage: ${item.targetCoverageStatus || '-'}(${item.targetCoverageScore ?? '-'})${item.targetCoverageIssueKeys.length ? ` / ${item.targetCoverageIssueKeys.join(',')}` : ''}`);
      lines.push(`Human Realization Floor: ${item.humanRealizationFloorStatus || '-'}(${item.humanRealizationFloorScore ?? '-'})${item.humanRealizationFloorIssueKeys.length ? ` / ${item.humanRealizationFloorIssueKeys.join(',')}` : ''}`);
      lines.push(`Candidate Hash: ${item.candidateIdentity?.lexicalSha256 || '-'}`);
      lines.push(`Claim Authority: ${item.claimAuthorityStatus || '-'}${item.claimAuthorityIssueKeys.length ? ` / ${item.claimAuthorityIssueKeys.join(',')}` : ''}`);
      if (item.structuredSegments.length) lines.push(`Structured Segments: ${item.structuredSegments.map((segment) => `#${(segment.index ?? 0) + 1}:${segment.purposes.join('+')}[acts=${segment.plannedActTypes.join(',') || '-'}; refs=${segment.allowedGroundingRefs.join(',') || '-'}]=${segment.preview || '-'}`).join(' / ')}`);
      if (item.positiveRoleEvidence.length) lines.push(`Positive Role Evidence: ${item.positiveRoleEvidence.join(' / ')}`);
      if (item.missingRoleEvidence.length) lines.push(`Missing Role Evidence: ${item.missingRoleEvidence.join(' / ')}`);
    });
  }

  return lines.join('\n');
}

async function writeClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }
}

async function copySnapshot(snapshot: HveTurnDiagnosticSnapshot) {
  await writeClipboard(formatSnapshot(snapshot));
  ElMessage.success(`第 ${snapshot.turnNumber} 轮解析数据已复制（精简审计）`);
}

async function copySnapshotFull(snapshot: HveTurnDiagnosticSnapshot) {
  await writeClipboard(formatFullSnapshot(snapshot));
  ElMessage.success(`第 ${snapshot.turnNumber} 轮完整诊断已复制`);
}

async function copyAll() {
  if (!props.snapshots.length) return;
  await writeClipboard(props.snapshots.map((snapshot) => formatSnapshot(snapshot)).join('\n\n============================================================\n\n'));
  ElMessage.success(`解析数据已复制：共 ${props.snapshots.length} 条精简审计`);
}

async function copyAllFull() {
  if (!props.snapshots.length) return;
  await writeClipboard(props.snapshots.map((snapshot) => formatFullSnapshot(snapshot)).join('\n\n============================================================\n\n'));
  ElMessage.success(`已复制全部 ${props.snapshots.length} 条完整诊断`);
}
</script>

<style scoped>
.hve-diagnostics-panel {
  display: flex;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  background: var(--el-bg-color);
}

.hve-diagnostics-panel__header {
  display: flex;
  flex: none;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  padding: 14px 14px 12px;
}

.hve-diagnostics-panel__session {
  flex: none;
  margin: 10px 12px 0;
  border-radius: 8px;
  background: var(--el-fill-color-light);
  padding: 9px 10px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.6;
}

.hve-diagnostics-panel__body {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  padding: 10px 12px 14px;
}

.hve-diagnostics-panel__raw {
  margin: 0;
  border-radius: 8px;
  background: var(--el-fill-color-light);
  padding: 10px 11px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--el-text-color-regular);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 11px;
  line-height: 1.65;
  user-select: text;
}

.hve-diagnostics-collapse :deep(.el-collapse-item__header) {
  min-height: 54px;
  height: auto;
  line-height: 1.4;
}

.hve-diagnostics-collapse :deep(.el-collapse-item__content) {
  padding-bottom: 10px;
}
</style>
