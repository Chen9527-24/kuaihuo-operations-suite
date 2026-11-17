import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import {
  CUSTOMER_SERVICE_GUIDELINE_BINDING_TYPES,
  CUSTOMER_SERVICE_GUIDELINE_CRITICALITIES,
  type CustomerServiceGuidelineAction,
  type CustomerServiceGuidelineRelationships,
  type CustomerServiceGuidelineVersionDraftContent,
} from './customer-service-guideline.type';
import { CUSTOMER_SERVICE_ACT_TYPES } from '../interaction/customer-service-interaction-plan.type';
import { CustomerServiceGuidelineConditionEvaluator } from './customer-service-guideline-condition-evaluator';

@Injectable()
export class CustomerServiceGuidelineValidator {
  constructor(private readonly conditionEvaluator: CustomerServiceGuidelineConditionEvaluator) {}

  validate(content: CustomerServiceGuidelineVersionDraftContent) {
    if (!content || typeof content !== 'object') throw new UnprocessableEntityException('Guideline 版本内容不能为空。');
    if (!CUSTOMER_SERVICE_GUIDELINE_BINDING_TYPES.includes(content.binding?.type as any) || !clean(content.binding?.key)) {
      throw new UnprocessableEntityException('Guideline binding 无效。');
    }
    if (!CUSTOMER_SERVICE_GUIDELINE_CRITICALITIES.includes(content.criticality as any)) {
      throw new UnprocessableEntityException('Guideline criticality 无效。');
    }
    if (!Number.isInteger(content.priority) || content.priority < 0 || content.priority > 100000) {
      throw new UnprocessableEntityException('Guideline priority 必须是 0~100000 的整数。');
    }
    const condition = this.conditionEvaluator.validate(content.condition);
    if (condition.status === 'INVALID') throw new UnprocessableEntityException(`Guideline condition 无效：${condition.reasonCode}`);
    if (!Array.isArray(content.actions) || !content.actions.length) throw new UnprocessableEntityException('Guideline 至少需要一个 Action。');
    for (const action of content.actions) validateAction(action);
    validateRelationships(content.relationships || {});
    return true;
  }
}

function validateAction(action: CustomerServiceGuidelineAction) {
  if (!action || typeof action !== 'object' || !clean((action as any).op)) throw new UnprocessableEntityException('Guideline Action 无效。');
  if ('act' in action && !CUSTOMER_SERVICE_ACT_TYPES.includes(action.act as any)) {
    throw new UnprocessableEntityException(`Guideline Action act 无效：${String(action.act)}`);
  }
  if (action.op === 'SUPPRESS_ACT' && !['HARD', 'SOFT'].includes(action.enforcement)) {
    throw new UnprocessableEntityException('SUPPRESS_ACT 必须明确 HARD / SOFT。');
  }
  if (action.op === 'USE_RESPONSE_ASSET' && (!clean(action.assetId) || !clean(action.versionId))) {
    throw new UnprocessableEntityException('USE_RESPONSE_ASSET 必须锁定 assetId + versionId。');
  }
  if (action.op === 'SET_REALIZATION_PREFERENCE' && !['density', 'toneProfile', 'colloquiality', 'segmentation', 'emoji'].includes(action.key)) {
    throw new UnprocessableEntityException('SET_REALIZATION_PREFERENCE key 无效。');
  }
}
function validateRelationships(value: CustomerServiceGuidelineRelationships) {
  if (value.dependencies && (!['ALL', 'ANY'].includes(value.dependencies.mode) || !Array.isArray(value.dependencies.refs))) {
    throw new UnprocessableEntityException('Guideline dependencies 无效。');
  }
  for (const ref of [...(value.dependencies?.refs || []), ...(value.excludes || []), ...(value.prioritizeOver || [])]) {
    if (!['GUIDELINE', 'TAG'].includes(ref.kind) || !clean(ref.value)) throw new UnprocessableEntityException('Guideline relationship ref 无效。');
  }
}
function clean(value: unknown) { return String(value ?? '').trim(); }
