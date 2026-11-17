#!/usr/bin/env node
'use strict';

process.env.TS_NODE_TRANSPILE_ONLY = '1';
process.env.TS_NODE_PROJECT = require('path').resolve(__dirname, '../../tsconfig.json');
require('ts-node/register/transpile-only');

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const {
  resolveCustomerServiceFixedQa,
  normalizeCustomerServiceFixedQaText,
  fixedQaFuzzySimilarity,
} = require(path.join(root, 'src/modules/customer-service-agent/shared/context/customer-service-fixed-qa.util.ts'));

let pass = 0;
let fail = 0;
function check(name, condition, detail = '') {
  if (condition) {
    pass += 1;
    console.log(`PASS ${name}`);
  } else {
    fail += 1;
    console.error(`FAIL ${name}${detail ? ` :: ${detail}` : ''}`);
  }
}

function entry(id, config, answer = `answer-${id}`, overrides = {}) {
  return {
    id,
    collectionId: `collection-${id}`,
    scopeType: 'COLLECTION',
    scopeKey: `collection-${id}`,
    entityType: 'FIXED_QA',
    entityKey: null,
    aliases: [],
    structuredData: { fixedQa: { schemaVersion: 1, priority: 200, loadingDelay: { minMs: 1800, maxMs: 4200 }, ...config } },
    references: [],
    authorityLevel: 'BUSINESS_FACT',
    bindingPriority: 120,
    bindingTargetType: 'STORE',
    bindingTargetKey: 'store-1',
    collection: { id: `collection-${id}`, name: `collection-${id}`, industryCode: null, revision: 1 },
    category: 'FAQ',
    title: `rule-${id}`,
    question: null,
    content: answer,
    tags: [],
    sourceType: 'MANUAL',
    sourceReference: null,
    revision: 1,
    effectiveFrom: null,
    effectiveTo: null,
    updatedAt: new Date(),
    ...overrides,
  };
}

check('normalization is deterministic across punctuation/spacing/case',
  normalizeCustomerServiceFixedQaText('  How To 修改地址？ ') === normalizeCustomerServiceFixedQaText('how to修改地址'));

check('fuzzy similarity is deterministic and bounded',
  fixedQaFuzzySimilarity('你家有没有狗粮', '你家有狗粮吗') >= 0.68
    && fixedQaFuzzySimilarity('你家有没有狗粮', '你家有狗粮吗') <= 1);

const legacyExact = resolveCustomerServiceFixedQa([
  entry('legacy-exact', { matchType: 'EXACT', triggerPhrases: ['你家有没有狗粮'], requiredKeywords: [], excludedKeywords: [] }),
], '你家有狗粮吗');
check('historical EXACT metadata is ignored and FIXED_QA now matches fuzzily',
  legacyExact?.entryId === 'legacy-exact' && legacyExact.matchType === 'FUZZY' && legacyExact.matchScore >= 0.68,
  JSON.stringify(legacyExact));
check('configured random loading remains within bounds', Boolean(legacyExact && legacyExact.delayMs >= 1800 && legacyExact.delayMs <= 4200), JSON.stringify(legacyExact));

const legacyContains = resolveCustomerServiceFixedQa([
  entry('legacy-contains', { matchType: 'CONTAINS', triggerPhrases: ['怎么修改收货地址'], requiredKeywords: [], excludedKeywords: [] }),
], '怎么改收货地址');
check('historical CONTAINS metadata is also normalized to FUZZY',
  legacyContains?.entryId === 'legacy-contains' && legacyContains.matchType === 'FUZZY', JSON.stringify(legacyContains));

const legacyKeyword = resolveCustomerServiceFixedQa([
  entry('legacy-keyword', { matchType: 'KEYWORD_COMBINATION', triggerPhrases: [], requiredKeywords: ['地址', '修改'], excludedKeywords: [] }, 'legacy-keyword', { question: '地址 + 修改' }),
], '地址修改');
check('historical keyword-only fixed QA gets a compatibility phrase and still uses FUZZY',
  legacyKeyword?.entryId === 'legacy-keyword' && legacyKeyword.matchType === 'FUZZY', JSON.stringify(legacyKeyword));

const semanticCollisionMiss = resolveCustomerServiceFixedQa([
  entry('refund', { matchType: 'EXACT', triggerPhrases: ['你们支持退款吗'], requiredKeywords: [], excludedKeywords: [] }),
], '你们支持换货吗');
check('high lexical overlap with a different business meaning stays below fixed-direct fuzzy threshold',
  semanticCollisionMiss === null, JSON.stringify(semanticCollisionMiss));

const unrelatedMiss = resolveCustomerServiceFixedQa([
  entry('dog-food', { matchType: 'EXACT', triggerPhrases: ['你家有没有狗粮'], requiredKeywords: [], excludedKeywords: [] }),
], '什么时候发货');
check('unrelated question does not fuzzy-match fixed direct reply', unrelatedMiss === null, JSON.stringify(unrelatedMiss));

const excluded = resolveCustomerServiceFixedQa([
  entry('excluded', { matchType: 'EXACT', triggerPhrases: ['修改地址'], requiredKeywords: [], excludedKeywords: ['退货地址'] }),
], '我想修改退货地址');
check('excluded keyword still vetoes an otherwise matching fuzzy rule', excluded === null, JSON.stringify(excluded));

const applicabilityWins = resolveCustomerServiceFixedQa([
  entry('role-high-priority', { triggerPhrases: ['测试问题'], requiredKeywords: [], excludedKeywords: [], priority: 900 }, 'role', { bindingTargetType: 'ROLE', bindingTargetKey: 'role-1' }),
  entry('account-lower-priority', { triggerPhrases: ['测试问题'], requiredKeywords: [], excludedKeywords: [], priority: 100 }, 'account', { bindingTargetType: 'ACCOUNT', bindingTargetKey: 'account-1' }),
], '测试问题');
check('more specific ACCOUNT applicability still wins before rule priority', applicabilityWins?.answer === 'account', JSON.stringify(applicabilityWins));

const closerPhraseWins = resolveCustomerServiceFixedQa([
  entry('farther', { triggerPhrases: ['你家有没有狗粮'], requiredKeywords: [], excludedKeywords: [], priority: 200 }),
  entry('closer', { triggerPhrases: ['你家有狗粮吗'], requiredKeywords: [], excludedKeywords: [], priority: 200 }),
], '你家有狗粮吗');
check('at equal applicability and priority the closest fuzzy phrase wins', closerPhraseWins?.entryId === 'closer' && closerPhraseWins.matchScore === 1, JSON.stringify(closerPhraseWins));

const ambiguous = resolveCustomerServiceFixedQa([
  entry('a', { triggerPhrases: ['你家有狗粮吗'], requiredKeywords: [], excludedKeywords: [], priority: 200 }, 'answer-a'),
  entry('b', { triggerPhrases: ['你家有狗粮吗'], requiredKeywords: [], excludedKeywords: [], priority: 200 }, 'answer-b'),
], '你家有狗粮吗');
check('equal fuzzy competitors with different answers fail closed instead of arbitrary direct output', ambiguous === null, JSON.stringify(ambiguous));

const sameAnswerDuplicate = resolveCustomerServiceFixedQa([
  entry('a', { triggerPhrases: ['你家有狗粮吗'], requiredKeywords: [], excludedKeywords: [], priority: 200 }, 'same-answer'),
  entry('b', { triggerPhrases: ['你家有狗粮吗'], requiredKeywords: [], excludedKeywords: [], priority: 200 }, 'same-answer'),
], '你家有狗粮吗');
check('duplicate fuzzy rules with the same answer remain safe and deterministic', sameAnswerDuplicate?.answer === 'same-answer', JSON.stringify(sameAnswerDuplicate));

const nonFixedIgnored = resolveCustomerServiceFixedQa([
  entry('generic', { triggerPhrases: ['测试问题'], requiredKeywords: [], excludedKeywords: [] }, 'must-not-match', { entityType: 'FAQ' }),
], '测试问题');
check('ordinary Knowledge entries can never become fixed direct replies', nonFixedIgnored === null, JSON.stringify(nonFixedIgnored));

const knowledgeService = fs.readFileSync(path.join(root, 'src/modules/customer-service-agent/admin/knowledge-entries/customer-service-knowledge-entries.service.ts'), 'utf8');
const repository = fs.readFileSync(path.join(root, 'src/modules/customer-service-agent/infrastructure/persistence/customer-service-knowledge-entry.repository.ts'), 'utf8');
const simulation = fs.readFileSync(path.join(root, 'src/modules/customer-service-agent/runtime/simulation/customer-service-simulation.service.ts'), 'utf8');
const compiler = fs.readFileSync(path.join(root, 'src/modules/customer-service-agent/runtime/compiler/customer-service-runtime-contract-compiler.service.ts'), 'utf8');
const deterministic = fs.readFileSync(path.join(root, 'src/modules/customer-service-agent/runtime/compiler/customer-service-deterministic-response-compiler.service.ts'), 'utf8');
const generator = fs.readFileSync(path.join(root, 'src/modules/customer-service-agent/runtime/generation/customer-service-reply-generator.service.ts'), 'utf8');
const delivery = fs.readFileSync(path.join(root, 'src/modules/customer-service-agent/runtime/generation/customer-service-message-delivery-planner.ts'), 'utf8');
const channel = fs.readFileSync(path.join(root, 'src/modules/customer-service-agent/runtime/channel/customer-service-channel-reply.service.ts'), 'utf8');
const autoReplies = fs.readFileSync(path.join(root, 'src/modules/auto-replies/auto-replies.service.ts'), 'utf8');
const fixedQaSource = fs.readFileSync(path.join(root, 'src/modules/customer-service-agent/shared/context/customer-service-fixed-qa.util.ts'), 'utf8');

check('all FIXED_QA modes converge to a single FUZZY runtime owner',
  fixedQaSource.includes("export type CustomerServiceFixedQaMatchType = 'FUZZY'")
    && fixedQaSource.includes("matchType: 'FUZZY'")
    && !fixedQaSource.includes("config.matchType === 'EXACT'")
    && !fixedQaSource.includes("config.matchType === 'CONTAINS'"));
check('scope/applicability admission is repository-owned before question matching',
  repository.includes("targetType: 'ACCOUNT'")
    && repository.includes("targetType: 'STORE'")
    && repository.includes("targetType: 'ROLE'")
    && repository.includes('findRuntimeCandidates'));
check('fixed QA miss cannot leak exact answer into ordinary HVE retrieval context',
  knowledgeService.includes("entries.filter((entry) => !isCustomerServiceFixedQaEntry(entry))"));
check('runtime checks FIXED_QA before deep recognition and skips recognition model on hit',
  simulation.includes('const fixedQaMatch = await this.resolveFixedQa')
    && simulation.includes('if (!fixedQaMatch)')
    && simulation.indexOf('const fixedQaMatch = await this.resolveFixedQa') < simulation.indexOf('this.deepRecognitionService.refine'));
check('fixed QA compiles into existing deterministic exact-reply route without a new generator',
  compiler.includes('this.deterministicCompiler.compileFixedQa')
    && deterministic.includes('exactReply: match.answer')
    && deterministic.includes('fixedQa: match'));
check('generation explicitly exposes FIXED_QA and therefore makes model bypass observable',
  generator.includes("| 'FIXED_QA'")
    && generator.includes("contract.replyPlan.fixedQa ? 'FIXED_QA' : 'EXACT_REPLY'"));
check('configured random delay applies only to fixed-QA first delivery segment',
  delivery.includes('fixedQaFirstDelay(contract)')
    && delivery.includes('contract.replyPlan.fixedQa?.delayMs'));
check('COMMENT/DM channel preflight avoids admission AI when account-bound fixed QA matches',
  channel.includes('fixedQaPrecheck')
    && channel.includes("provider: result.replySource === 'FIXED_QA' ? 'FIXED_QA' : 'DEEPSEEK'"));
check('formal auto-reply resolves fixed QA before imported dataset/provider routing',
  autoReplies.includes('const fixedQaMatch = await this.resolveAutoReplyFixedQa')
    && autoReplies.indexOf('const fixedQaMatch = await this.resolveAutoReplyFixedQa') < autoReplies.indexOf('const datasetId = dto.datasetId')
    && autoReplies.includes("provider: 'FIXED_QA'")
    && autoReplies.includes("generationSource: 'FIXED_QA'"));
check('formal runtime consumes the configured fixed-QA delay before returning the exact reply',
  autoReplies.includes('return this.applyFixedQaRuntimeDelay(result)')
    && autoReplies.includes('await new Promise<void>((resolve) => setTimeout(resolve, delayMs))')
    && autoReplies.includes('fixedQaRuntimeDelayAppliedMs: delayMs')
    && autoReplies.includes('delayBeforeMs: 0'));
check('fixed-QA direct projection explicitly records model and HVE bypass',
  autoReplies.includes('modelCalled: false')
    && autoReplies.includes('hveInvoked: false')
    && autoReplies.includes("replySource: 'FIXED_QA'"));
check('no new Fixed-QA Prisma table or migration dependency was introduced',
  !knowledgeService.includes('customerServiceFixedQa')
    && !repository.includes('customerServiceFixedQa'));

console.log(`\nAccount-bound Fixed QA Fuzzy Direct Reply: ${pass}/${pass + fail} PASS`);
if (fail) process.exit(1);
