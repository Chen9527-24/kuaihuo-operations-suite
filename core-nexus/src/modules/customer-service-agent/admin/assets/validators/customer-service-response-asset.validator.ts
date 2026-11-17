import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { CustomerServiceAssetType } from '../../../shared/constants/customer-service-foundation.constant';

@Injectable()
export class CustomerServiceResponseAssetValidator {
  validate(assetType: CustomerServiceAssetType, content: Record<string, unknown>) {
    if (assetType === 'EXACT_REPLY') this.validateExactReply(content);
    if (assetType === 'TEMPLATE_REPLY') this.validateTemplateReply(content);
    if (assetType === 'REQUIRED_POINTS') this.validateRequiredPoints(content);
    if (assetType === 'REQUIRED_WORKFLOW') this.validateRequiredWorkflow(content);
    if (assetType === 'STRATEGY_GROUP') this.validateStrategyGroup(content);
  }

  private validateStrategyGroup(content: Record<string, unknown>) {
    if (Number(content.schemaVersion) !== 1) throw new UnprocessableEntityException('策略配置组 schemaVersion 必须为 1。');
    if (!['ROLE_GLOBAL', 'SCENARIO', 'INTENT'].includes(String(content.scopeType || ''))) {
      throw new UnprocessableEntityException('策略配置组 scopeType 必须为 ROLE_GLOBAL、SCENARIO 或 INTENT。');
    }
    if (content.scopeType === 'INTENT' && content.enabledByDefault !== false) {
      throw new UnprocessableEntityException('意图专属策略必须由正式意图显式绑定，enabledByDefault 必须为 false。');
    }
    if (!isRecord(content.policy)) throw new UnprocessableEntityException('策略配置组必须提供 policy 对象。');
    if (!Object.keys(content.policy).length) throw new UnprocessableEntityException('策略配置组至少需要配置一项语气、措辞、结构或服务规则。');
    if (content.appliesTo !== undefined && !isRecord(content.appliesTo)) {
      throw new UnprocessableEntityException('策略配置组 appliesTo 必须是对象。');
    }
    if (content.enabledByDefault !== undefined && typeof content.enabledByDefault !== 'boolean') {
      throw new UnprocessableEntityException('enabledByDefault 必须是布尔值。');
    }
    if (content.priority !== undefined && (!Number.isInteger(Number(content.priority)) || Number(content.priority) < 0 || Number(content.priority) > 10000)) {
      throw new UnprocessableEntityException('策略配置组 priority 必须是 0～10000 的整数。');
    }
    const appliesTo = isRecord(content.appliesTo) ? content.appliesTo : {};
    for (const key of ['roleCodes', 'accountProfileIds', 'scenarios', 'intentKeys', 'intents', 'industryCodes', 'riskLevels']) {
      if (appliesTo[key] !== undefined && !uniqueStringArray(appliesTo[key])) {
        throw new UnprocessableEntityException(`appliesTo.${key} 必须是不重复的非空字符串数组。`);
      }
    }
    const tone = isRecord(content.policy.tone) ? content.policy.tone : {};
    for (const key of ['warmth', 'playfulness', 'formality', 'directness', 'emotionalIntensity']) {
      if (tone[key] !== undefined && (!Number.isFinite(Number(tone[key])) || Number(tone[key]) < 0 || Number(tone[key]) > 100)) {
        throw new UnprocessableEntityException(`${key} 必须是 0～100 的数值。`);
      }
    }
    const wording = isRecord(content.policy.wording) ? content.policy.wording : {};
    if (wording.tildePolicy !== undefined && !['FORBIDDEN', 'FOLLOW_CUSTOMER', 'ALLOWED'].includes(String(wording.tildePolicy))) {
      throw new UnprocessableEntityException('tildePolicy 值不合法。');
    }
    if (wording.emojiPolicy !== undefined && !['FORBIDDEN', 'LIMITED', 'FOLLOW_CUSTOMER', 'AUTO'].includes(String(wording.emojiPolicy))) {
      throw new UnprocessableEntityException('emojiPolicy 值不合法。');
    }
    if (wording.sentenceParticleFrequency !== undefined && !['NONE', 'LOW', 'MEDIUM'].includes(String(wording.sentenceParticleFrequency))) {
      throw new UnprocessableEntityException('sentenceParticleFrequency 值不合法。');
    }
    if (wording.emojiLimit !== undefined && (!Number.isInteger(Number(wording.emojiLimit)) || Number(wording.emojiLimit) < 0 || Number(wording.emojiLimit) > 10)) {
      throw new UnprocessableEntityException('emojiLimit 必须是 0～10 的整数。');
    }
    for (const key of ['forbiddenExpressions', 'cautiousExpressions', 'preferredExpressions', 'forbiddenSentenceParticles', 'semanticChecks']) {
      if (wording[key] !== undefined && !uniqueStringArray(wording[key])) {
        throw new UnprocessableEntityException(`${key} 必须是不重复的非空字符串数组。`);
      }
    }
    const structure = isRecord(content.policy.structure) ? content.policy.structure : {};
    for (const key of ['maxQuestions', 'maxCoreMoves', 'maxGuesses', 'maxSentences']) {
      const min = key === 'maxCoreMoves' || key === 'maxSentences' ? 1 : 0;
      if (structure[key] !== undefined && (!Number.isInteger(Number(structure[key])) || Number(structure[key]) < min || Number(structure[key]) > 20)) {
        throw new UnprocessableEntityException(`${key} 必须是 ${min}～20 的整数。`);
      }
    }
    for (const key of ['allowChoiceQuestions', 'requireAcknowledgeBeforeQuestion']) {
      if (structure[key] !== undefined && typeof structure[key] !== 'boolean') {
        throw new UnprocessableEntityException(`${key} 必须是布尔值。`);
      }
    }
    const service = isRecord(content.policy.service) ? content.policy.service : {};
    if (service.salesVisibility !== undefined && !['S0', 'S1', 'S2', 'S3'].includes(String(service.salesVisibility))) {
      throw new UnprocessableEntityException('salesVisibility 值不合法。');
    }
    if (service.productMentionPolicy !== undefined && !['PROHIBITED', 'CATEGORY_ONLY', 'SPECIFIC_IF_RELEVANT', 'SPECIFIC_ALLOWED'].includes(String(service.productMentionPolicy))) {
      throw new UnprocessableEntityException('productMentionPolicy 值不合法。');
    }
    if (service.firstMove !== undefined && !nonEmptyString(service.firstMove)) {
      throw new UnprocessableEntityException('firstMove 必须是非空字符串。');
    }
    if (service.stopConditions !== undefined && !uniqueStringArray(service.stopConditions)) {
      throw new UnprocessableEntityException('stopConditions 必须是不重复的非空字符串数组。');
    }
    const delivery = isRecord(content.policy.delivery) ? content.policy.delivery : {};
    if (delivery.mode !== undefined && !['AUTO', 'SINGLE', 'SEQUENTIAL'].includes(String(delivery.mode))) {
      throw new UnprocessableEntityException('delivery.mode 值不合法。');
    }
    for (const [key, min, max] of [['maxSegments', 1, 6], ['minDelayMs', 0, 5000], ['maxDelayMs', 0, 5000], ['splitThresholdChars', 20, 600]] as const) {
      if (delivery[key] !== undefined && (!Number.isInteger(Number(delivery[key])) || Number(delivery[key]) < min || Number(delivery[key]) > max)) {
        throw new UnprocessableEntityException(`delivery.${key} 必须是 ${min}～${max} 的整数。`);
      }
    }
    if (delivery.cancelRemainingOnCustomerMessage !== undefined && typeof delivery.cancelRemainingOnCustomerMessage !== 'boolean') {
      throw new UnprocessableEntityException('delivery.cancelRemainingOnCustomerMessage 必须是布尔值。');
    }
    if (delivery.minDelayMs !== undefined && delivery.maxDelayMs !== undefined && Number(delivery.maxDelayMs) < Number(delivery.minDelayMs)) {
      throw new UnprocessableEntityException('delivery.maxDelayMs 不得小于 delivery.minDelayMs。');
    }
  }

  private validateExactReply(content: Record<string, unknown>) {
    if (!nonEmptyString(content.text)) throw new UnprocessableEntityException('固定全文资产必须提供非空 text。');
  }

  private validateTemplateReply(content: Record<string, unknown>) {
    if (!nonEmptyString(content.template)) throw new UnprocessableEntityException('固定模板资产必须提供非空 template。');
    if (content.variables === undefined) return;
    if (!Array.isArray(content.variables)) throw new UnprocessableEntityException('variables 必须是数组。');
    for (const item of content.variables) {
      if (!isRecord(item) || !nonEmptyString(item.key)) {
        throw new UnprocessableEntityException('每个模板变量必须提供非空 key。');
      }
      if (item.required !== undefined && typeof item.required !== 'boolean') {
        throw new UnprocessableEntityException('模板变量 required 必须是布尔值。');
      }
    }
  }

  private validateRequiredPoints(content: Record<string, unknown>) {
    if (!stringArray(content.points)) throw new UnprocessableEntityException('必含要点资产必须提供非空字符串数组 points。');
  }

  private validateRequiredWorkflow(content: Record<string, unknown>) {
    if (!Array.isArray(content.steps) || !content.steps.length) {
      throw new UnprocessableEntityException('必走流程资产必须提供非空 steps。');
    }
    for (const step of content.steps) {
      if (!isRecord(step) || !nonEmptyString(step.code) || !nonEmptyString(step.name)) {
        throw new UnprocessableEntityException('每个流程步骤必须提供 code 和 name。');
      }
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && Boolean(value.trim());
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(nonEmptyString);
}

function uniqueStringArray(value: unknown): value is string[] {
  return Array.isArray(value)
    && value.every(nonEmptyString)
    && new Set(value.map((item) => item.trim())).size === value.length;
}
