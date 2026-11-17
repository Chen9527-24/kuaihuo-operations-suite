import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

const ALLOWED_ROOT_KEYS = new Set([
  'schemaVersion',
  'site',
  'navigation',
  'hero',
  'system',
  'products',
  'workflow',
  'cooperation',
  'cta',
  'footer',
  'contact',
]);

const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const MAX_DEPTH = 10;
const MAX_ARRAY_ITEMS = 50;
const MAX_OBJECT_KEYS = 120;
const MAX_STRING_LENGTH = 8000;

export function validateWebsiteContent(value: Record<string, unknown>, maxBytes: number): Prisma.InputJsonObject {
  if (!isPlainObject(value)) throw new BadRequestException('官网配置必须是对象');
  for (const key of Object.keys(value)) {
    if (!ALLOWED_ROOT_KEYS.has(key)) throw new BadRequestException(`官网配置包含不支持的顶级字段：${key}`);
  }
  if (value.schemaVersion !== 1) throw new BadRequestException('官网配置 schemaVersion 必须为 1');

  validateJsonValue(value, '$', 0);
  validateWebsiteSchema(value);
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, 'utf8') > maxBytes) {
    throw new BadRequestException(`官网配置不能超过 ${Math.floor(maxBytes / 1024)}KB`);
  }
  return JSON.parse(serialized) as Prisma.InputJsonObject;
}

function validateWebsiteSchema(value: Record<string, unknown>): void {
  const site = objectAt(value.site, '$.site');
  stringsAt(site, ['title', 'description', 'brandName'], '$.site');
  stringsAt(site, ['faviconUrl', 'siteUrl', 'qrCodeUrl'], '$.site', true);
  if (site.siteUrl && !/^https:\/\//i.test(String(site.siteUrl))) {
    throw new BadRequestException('官网配置 $.site.siteUrl 必须为空或使用 https 地址');
  }

  const navigation = objectAt(value.navigation, '$.navigation');
  stringsAt(navigation, ['system', 'products', 'cooperation', 'contact'], '$.navigation');

  const hero = objectAt(value.hero, '$.hero');
  stringsAt(hero, ['eyebrow', 'emphasis', 'summary', 'partnersTitle', 'partnersNote'], '$.hero');
  stringArrayAt(hero.titleLines, '$.hero.titleLines', 2, 2);
  objectArrayAt(hero.partners, '$.hero.partners', 1, 20).forEach((partner, index) => {
    stringsAt(partner, ['name', 'imageUrl'], `$.hero.partners[${index}]`);
  });

  const system = moduleAt(value.system, '$.system');
  stringsAt(system, ['kicker', 'emphasis', 'summary', 'proofTitle', 'proofSummary', 'loginImageUrl', 'dashboardImageUrl'], '$.system');
  stringArrayAt(system.titleLines, '$.system.titleLines', 1, 2);

  const products = moduleAt(value.products, '$.products');
  stringsAt(products, ['kicker', 'emphasis', 'summary', 'guideText', 'guideRecommendation'], '$.products');
  stringArrayAt(products.titleLines, '$.products.titleLines', 1, 2);
  const productKeys = ['acquisition', 'assistant', 'hotstart', 'director', 'avatar'];
  const productItems = objectArrayAt(products.items, '$.products.items', 5, 5);
  const receivedProductKeys = productItems.map((item, index) => {
    stringsAt(item, ['key', 'no', 'type', 'title', 'tabSummary', 'summary', 'output', 'boundary'], `$.products.items[${index}]`);
    return String(item.key);
  });
  if (new Set(receivedProductKeys).size !== 5 || productKeys.some((key) => !receivedProductKeys.includes(key))) {
    throw new BadRequestException('官网配置 $.products.items 必须保留五个固定产品 key');
  }

  const workflow = moduleAt(value.workflow, '$.workflow');
  stringsAt(workflow, ['kicker', 'emphasis'], '$.workflow');
  stringArrayAt(workflow.titleLines, '$.workflow.titleLines', 1, 2);
  objectArrayAt(workflow.steps, '$.workflow.steps', 4, 4).forEach((step, index) => {
    stringsAt(step, ['no', 'kicker', 'title', 'tabSummary', 'summary'], `$.workflow.steps[${index}]`);
    stringArrayAt(step.outputs, `$.workflow.steps[${index}].outputs`, 1, 8);
  });

  const cooperation = moduleAt(value.cooperation, '$.cooperation');
  stringsAt(cooperation, ['kicker', 'emphasis', 'summary'], '$.cooperation');
  stringArrayAt(cooperation.titleLines, '$.cooperation.titleLines', 1, 2);
  objectArrayAt(cooperation.modes, '$.cooperation.modes', 3, 3).forEach((mode, index) => {
    stringsAt(mode, ['no', 'code', 'name', 'audience'], `$.cooperation.modes[${index}]`);
    stringArrayAt(mode.titleLines, `$.cooperation.modes[${index}].titleLines`, 2, 2);
    stringArrayAt(mode.deliverables, `$.cooperation.modes[${index}].deliverables`, 1, 8);
  });

  const cta = moduleAt(value.cta, '$.cta');
  stringsAt(cta, ['kicker', 'emphasis', 'buttonText'], '$.cta');
  stringArrayAt(cta.titleLines, '$.cta.titleLines', 1, 2);

  const footer = objectAt(value.footer, '$.footer');
  stringsAt(footer, ['connectionTitle', 'connectionSummary', 'contactTitle', 'contactSummary', 'contactLinkText', 'slogan'], '$.footer');

  const contact = objectAt(value.contact, '$.contact');
  stringsAt(contact, ['pageTitle', 'pageDescription', 'formKicker', 'formTitle', 'submitText', 'privacyNote', 'successMessage', 'qrNote'], '$.contact');
  stringArrayAt(contact.qrTitleLines, '$.contact.qrTitleLines', 2, 2);
  stringArrayAt(contact.challengeOptions, '$.contact.challengeOptions', 1, 20);
  stringArrayAt(contact.nextSteps, '$.contact.nextSteps', 3, 3);
}

function objectAt(value: unknown, path: string): Record<string, unknown> {
  if (!isPlainObject(value)) throw new BadRequestException(`官网配置缺少对象：${path}`);
  return value;
}

function moduleAt(value: unknown, path: string): Record<string, unknown> {
  const module = objectAt(value, path);
  if (typeof module.enabled !== 'boolean') throw new BadRequestException(`官网配置字段必须是布尔值：${path}.enabled`);
  return module;
}

function stringsAt(value: Record<string, unknown>, keys: string[], path: string, allowEmpty = false): void {
  for (const key of keys) {
    if (typeof value[key] !== 'string' || (!allowEmpty && !String(value[key]).trim())) {
      throw new BadRequestException(`官网配置字段必须是${allowEmpty ? '' : '非空'}文本：${path}.${key}`);
    }
  }
}

function stringArrayAt(value: unknown, path: string, min: number, max: number): string[] {
  if (!Array.isArray(value) || value.length < min || value.length > max || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new BadRequestException(`官网配置字段必须包含 ${min}${min === max ? '' : `-${max}`} 项非空文本：${path}`);
  }
  return value;
}

function objectArrayAt(value: unknown, path: string, min: number, max: number): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length < min || value.length > max || value.some((item) => !isPlainObject(item))) {
    throw new BadRequestException(`官网配置字段必须包含 ${min}${min === max ? '' : `-${max}`} 项对象：${path}`);
  }
  return value as Record<string, unknown>[];
}

function validateJsonValue(value: unknown, path: string, depth: number): void {
  if (depth > MAX_DEPTH) throw new BadRequestException(`官网配置层级过深：${path}`);
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new BadRequestException(`官网配置包含无效数字：${path}`);
    return;
  }
  if (typeof value === 'string') {
    if (value.length > MAX_STRING_LENGTH) throw new BadRequestException(`官网配置文本过长：${path}`);
    if (/^\s*javascript:/i.test(value)) throw new BadRequestException(`官网配置包含不安全链接：${path}`);
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_ITEMS) throw new BadRequestException(`官网配置列表项目过多：${path}`);
    value.forEach((item, index) => validateJsonValue(item, `${path}[${index}]`, depth + 1));
    return;
  }
  if (!isPlainObject(value)) throw new BadRequestException(`官网配置包含不支持的数据类型：${path}`);

  const keys = Object.keys(value);
  if (keys.length > MAX_OBJECT_KEYS) throw new BadRequestException(`官网配置对象字段过多：${path}`);
  for (const key of keys) {
    if (FORBIDDEN_KEYS.has(key)) throw new BadRequestException(`官网配置包含危险字段：${path}.${key}`);
    validateJsonValue(value[key], `${path}.${key}`, depth + 1);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
