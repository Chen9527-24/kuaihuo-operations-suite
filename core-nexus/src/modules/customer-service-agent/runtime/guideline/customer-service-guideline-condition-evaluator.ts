import { Injectable } from '@nestjs/common';
import {
  CUSTOMER_SERVICE_GUIDELINE_OPERATORS,
  type CustomerServiceGuidelineCondition,
  type CustomerServiceGuidelineConditionLeaf,
  type CustomerServiceGuidelineConditionResult,
  type CustomerServiceGuidelineContextSnapshot,
  type CustomerServiceGuidelineFactValue,
  type CustomerServiceGuidelineOperator,
} from './customer-service-guideline.type';
import { getCustomerServicePolicyFactDefinition } from './customer-service-policy-fact-registry';

@Injectable()
export class CustomerServiceGuidelineConditionEvaluator {
  validate(condition: unknown): CustomerServiceGuidelineConditionResult {
    return evaluateNode(condition, null, true);
  }

  evaluate(condition: unknown, snapshot: CustomerServiceGuidelineContextSnapshot): CustomerServiceGuidelineConditionResult {
    return evaluateNode(condition, snapshot, false);
  }
}

function evaluateNode(
  value: unknown,
  snapshot: CustomerServiceGuidelineContextSnapshot | null,
  validationOnly: boolean,
): CustomerServiceGuidelineConditionResult {
  if (value === null || value === undefined || (isRecord(value) && Object.keys(value).length === 0)) {
    return result('MATCHED', 'EMPTY_CONDITION', []);
  }
  if (!isRecord(value)) return result('INVALID', 'CONDITION_NOT_OBJECT', []);

  const groupKeys = ['all', 'any', 'not'].filter((key) => Object.prototype.hasOwnProperty.call(value, key));
  const hasLeaf = 'fact' in value || 'op' in value || 'value' in value;
  if (groupKeys.length + (hasLeaf ? 1 : 0) !== 1) return result('INVALID', 'CONDITION_NODE_AMBIGUOUS', []);

  if ('all' in value) {
    if (!Array.isArray(value.all) || !value.all.length) return result('INVALID', 'ALL_REQUIRES_NON_EMPTY_ARRAY', []);
    const children = value.all.map((child) => evaluateNode(child, snapshot, validationOnly));
    const invalid = children.find((item) => item.status === 'INVALID');
    if (invalid) return merge('INVALID', 'ALL_CHILD_INVALID', children);
    const notMatched = children.find((item) => item.status === 'NOT_MATCHED');
    if (notMatched) return merge('NOT_MATCHED', 'ALL_CHILD_FALSE', children);
    const unknown = children.find((item) => item.status === 'UNKNOWN');
    if (unknown && !validationOnly) return merge('UNKNOWN', 'ALL_CHILD_UNKNOWN', children);
    return merge('MATCHED', 'ALL_MATCHED', children);
  }
  if ('any' in value) {
    if (!Array.isArray(value.any) || !value.any.length) return result('INVALID', 'ANY_REQUIRES_NON_EMPTY_ARRAY', []);
    const children = value.any.map((child) => evaluateNode(child, snapshot, validationOnly));
    const invalid = children.find((item) => item.status === 'INVALID');
    if (invalid) return merge('INVALID', 'ANY_CHILD_INVALID', children);
    if (children.some((item) => item.status === 'MATCHED')) return merge('MATCHED', 'ANY_MATCHED', children);
    if (children.some((item) => item.status === 'UNKNOWN') && !validationOnly) return merge('UNKNOWN', 'ANY_CHILD_UNKNOWN', children);
    return merge('NOT_MATCHED', 'ANY_ALL_FALSE', children);
  }
  if ('not' in value) {
    const child = evaluateNode(value.not, snapshot, validationOnly);
    if (child.status === 'INVALID' || child.status === 'UNKNOWN') return child;
    return result(child.status === 'MATCHED' ? 'NOT_MATCHED' : 'MATCHED', 'NOT_RESULT', child.evidence);
  }
  return evaluateLeaf(value as unknown as CustomerServiceGuidelineConditionLeaf, snapshot, validationOnly);
}

function evaluateLeaf(
  leaf: CustomerServiceGuidelineConditionLeaf,
  snapshot: CustomerServiceGuidelineContextSnapshot | null,
  validationOnly: boolean,
): CustomerServiceGuidelineConditionResult {
  const fact = clean(leaf.fact);
  const op = clean(leaf.op) as CustomerServiceGuidelineOperator;
  const definition = getCustomerServicePolicyFactDefinition(fact);
  if (!definition) return result('INVALID', 'UNKNOWN_FACT', [{ fact, expected: leaf.value, op, status: 'INVALID' }]);
  if (!CUSTOMER_SERVICE_GUIDELINE_OPERATORS.includes(op) || !definition.allowedOperators.includes(op)) {
    return result('INVALID', 'OPERATOR_NOT_ALLOWED', [{ fact, expected: leaf.value, op, status: 'INVALID' }]);
  }
  const expectedCheck = validateExpectedValue(definition.valueType, op, leaf.value);
  if (!expectedCheck.ok) return result('INVALID', 'reason' in expectedCheck ? expectedCheck.reason : 'VALUE_TYPE_MISMATCH', [{ fact, expected: leaf.value, op, status: 'INVALID' }]);
  if (validationOnly) return result('MATCHED', 'LEAF_VALID', [{ fact, expected: leaf.value, op, status: 'VALID' }]);
  if (!snapshot) return result('INVALID', 'SNAPSHOT_REQUIRED', []);
  if (snapshot.unavailableFacts.includes(fact as any) || !Object.prototype.hasOwnProperty.call(snapshot.facts, fact)) {
    return result('UNKNOWN', 'FACT_UNAVAILABLE', [{ fact, expected: leaf.value, op, status: 'UNKNOWN' }]);
  }
  const actual = snapshot.facts[fact as keyof typeof snapshot.facts] as CustomerServiceGuidelineFactValue | undefined;
  const matched = compare(actual, op, leaf.value);
  return result(matched ? 'MATCHED' : 'NOT_MATCHED', matched ? 'LEAF_MATCHED' : 'LEAF_NOT_MATCHED', [{ fact, actual, expected: leaf.value, op, status: matched ? 'MATCHED' : 'NOT_MATCHED' }]);
}

function validateExpectedValue(type: string, op: CustomerServiceGuidelineOperator, value: unknown): { ok: true } | { ok: false; reason: string } {
  if (op === 'EXISTS' || op === 'NOT_EXISTS') return { ok: true };
  if (op === 'IN' || op === 'NOT_IN') {
    if (!Array.isArray(value) || !value.length) return { ok: false, reason: 'SET_OPERATOR_REQUIRES_ARRAY' };
    return value.every((item) => primitiveMatches(type === 'STRING_ARRAY' ? 'STRING' : type, item)) ? { ok: true } : { ok: false, reason: 'SET_VALUE_TYPE_MISMATCH' };
  }
  if (op === 'CONTAINS') {
    if (type === 'STRING' && typeof value === 'string') return { ok: true };
    if (type === 'STRING_ARRAY' && typeof value === 'string') return { ok: true };
    return { ok: false, reason: 'CONTAINS_VALUE_TYPE_MISMATCH' };
  }
  return primitiveMatches(type, value) ? { ok: true } : { ok: false, reason: 'VALUE_TYPE_MISMATCH' };
}

function primitiveMatches(type: string, value: unknown) {
  if (type === 'STRING') return typeof value === 'string';
  if (type === 'NUMBER') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'BOOLEAN') return typeof value === 'boolean';
  if (type === 'STRING_ARRAY') return Array.isArray(value) && value.every((item) => typeof item === 'string');
  return false;
}

function compare(actual: unknown, op: CustomerServiceGuidelineOperator, expected: unknown) {
  if (op === 'EXISTS') return actual !== undefined && actual !== null && actual !== '';
  if (op === 'NOT_EXISTS') return actual === undefined || actual === null || actual === '';
  if (op === 'EQ') return normalizedEqual(actual, expected);
  if (op === 'NE') return !normalizedEqual(actual, expected);
  if (op === 'IN') return Array.isArray(expected) && expected.some((item) => normalizedEqual(actual, item));
  if (op === 'NOT_IN') return Array.isArray(expected) && !expected.some((item) => normalizedEqual(actual, item));
  if (op === 'CONTAINS') {
    if (Array.isArray(actual)) return actual.some((item) => normalizedEqual(item, expected));
    return typeof actual === 'string' && typeof expected === 'string' && actual.toLocaleLowerCase().includes(expected.toLocaleLowerCase());
  }
  if (typeof actual !== 'number' || typeof expected !== 'number') return false;
  if (op === 'GT') return actual > expected;
  if (op === 'GTE') return actual >= expected;
  if (op === 'LT') return actual < expected;
  if (op === 'LTE') return actual <= expected;
  return false;
}

function normalizedEqual(left: unknown, right: unknown) {
  if (typeof left === 'string' && typeof right === 'string') return left.trim().toUpperCase() === right.trim().toUpperCase();
  if (Array.isArray(left) && Array.isArray(right)) return JSON.stringify(left) === JSON.stringify(right);
  return left === right;
}

function result(status: CustomerServiceGuidelineConditionResult['status'], reasonCode: string, evidence: CustomerServiceGuidelineConditionResult['evidence']): CustomerServiceGuidelineConditionResult {
  return { status, reasonCode, evidence };
}
function merge(status: CustomerServiceGuidelineConditionResult['status'], reasonCode: string, children: CustomerServiceGuidelineConditionResult[]) {
  return result(status, reasonCode, children.flatMap((item) => item.evidence).slice(0, 80));
}
function isRecord(value: unknown): value is Record<string, any> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function clean(value: unknown) { return String(value ?? '').trim(); }
