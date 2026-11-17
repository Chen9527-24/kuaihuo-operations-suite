const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
let passed = 0;
let failed = 0;
const check = (name, ok, evidence = '') => {
  if (ok) {
    passed += 1;
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}${evidence ? ` :: ${evidence}` : ''}`);
  }
};

const loadTsModule = (source, fileName, requireStub = () => ({})) => {
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
    reportDiagnostics: true,
    fileName,
  });
  const syntaxErrors = (transpiled.diagnostics || []).filter((item) => item.category === ts.DiagnosticCategory.Error);
  if (syntaxErrors.length) throw new Error(`FAIL ${fileName} TypeScript syntax`);
  const box = { exports: {}, module: { exports: {} }, require: requireStub, console, process, Buffer };
  box.module.exports = box.exports;
  vm.runInNewContext(transpiled.outputText, box, { filename: fileName });
  return box.module.exports;
};

const behavior = read('src/modules/customer-service-agent/runtime/behavior/customer-service-behavior-memory.util.ts');
const stateType = read('src/modules/customer-service-agent/runtime/state/customer-service-conversation-state.type.ts');
const reducer = read('src/modules/customer-service-agent/runtime/state/customer-service-conversation-state.reducer.ts');
const canonical = read('src/modules/customer-service-agent/runtime/state/customer-service-canonical-conversation-state.service.ts');
const simulation = read('src/modules/customer-service-agent/runtime/simulation/customer-service-simulation.service.ts');
const deepRecognition = read('src/modules/customer-service-agent/runtime/understanding/customer-service-deep-recognition.service.ts');
const contextualReferent = read('src/modules/customer-service-agent/runtime/understanding/customer-service-contextual-referent.ts');
const semantics = read('src/modules/customer-service-agent/runtime/understanding/customer-service-explicit-semantics.ts');
const understandingType = read('src/modules/customer-service-agent/runtime/understanding/types/customer-service-message-understanding.type.ts');
const knowledge = read('src/modules/customer-service-agent/shared/context/customer-service-knowledge.util.ts');
const schema = read('prisma/schema.prisma');
const prompt = read('src/modules/customer-service-agent/runtime/generation/customer-service-generation-prompt.builder.ts');
const conformance = read('src/modules/customer-service-agent/runtime/generation/customer-service-semantic-conformance.service.ts');
const send = read('src/modules/customer-service-agent/runtime/generation/customer-service-hve3-execution.service.ts');
const runtimeReply = read('src/modules/customer-service-agent/runtime/reply/customer-service-runtime-reply.service.ts');
const interactionCompiler = read('src/modules/customer-service-agent/runtime/interaction/customer-service-interaction-plan-compiler.service.ts');
const channelReply = read('src/modules/customer-service-agent/runtime/channel/customer-service-channel-reply.service.ts');
const autoReplies = read('src/modules/auto-replies/auto-replies.service.ts');
const robotSession = read('src/modules/customer-service-agent/runtime/testing/customer-service-robot-test-dm-session.service.ts');

const behaviorRuntime = loadTsModule(
  behavior,
  'customer-service-behavior-memory.util.ts',
  (id) => {
    if (id.includes('customer-service-interaction-plan.type')) {
      return {
        CUSTOMER_SERVICE_ACT_TYPES: [],
        CUSTOMER_SERVICE_ANSWER_FOCUS_KINDS: [],
        CUSTOMER_SERVICE_INTERACTION_TYPES: [],
      };
    }
    return {};
  },
);
const contextualReferentRuntime = loadTsModule(contextualReferent, 'customer-service-contextual-referent.ts');
const semanticsRuntime = loadTsModule(semantics, 'customer-service-explicit-semantics.ts');
const knowledgeRuntime = loadTsModule(
  knowledge,
  'customer-service-knowledge.util.ts',
  (id) => {
    if (id.includes('customer-service-industry-code.util')) {
      return { canonicalizeCustomerServiceIndustryCode: (value) => String(value || '').trim().toUpperCase() || null };
    }
    if (id.includes('customer-service-business-scope.util')) {
      return { isCustomerServiceKnowledgeIndustryCoherent: () => ({ coherent: true, reason: null }) };
    }
    return {};
  },
);

const provenTrace = {
  hve3: {
    semanticConformance: {
      decision: 'PASS',
      unitChecks: [
        { authorized: true, realizedGroundingRefs: ['P003', 'P003'] },
        { authorized: false, realizedGroundingRefs: ['SHOULD_NOT_SURVIVE'] },
      ],
    },
  },
};
const unprovenTrace = {
  hve3: {
    semanticConformance: {
      decision: 'UNPROVEN_PRESERVED',
      unitChecks: [{ authorized: true, realizedGroundingRefs: ['P003'] }],
    },
  },
};
const removedTrace = {
  hve3: {
    semanticConformance: {
      decision: 'REMOVED_UNAUTHORIZED_SPANS',
      unitChecks: [{ authorized: true, realizedGroundingRefs: ['P003'] }],
    },
  },
};

check('Reply Trace extractor keeps only authorized realized Grounding from proven conformance',
  JSON.stringify(behaviorRuntime.extractCustomerServiceProvenGroundingRefsFromReplyTrace(provenTrace)) === JSON.stringify(['P003']));
check('UNPROVEN_PRESERVED cannot manufacture contextual entity continuity',
  behaviorRuntime.extractCustomerServiceProvenGroundingRefsFromReplyTrace(unprovenTrace).length === 0);
check('post-removal proven surviving Grounding may remain contextual evidence',
  JSON.stringify(behaviorRuntime.extractCustomerServiceProvenGroundingRefsFromReplyTrace(removedTrace)) === JSON.stringify(['P003']));

check('Conversation State primary reducer can persist task-bound proven assistant behavior in the same turn revision',
  stateType.includes('taskId?: string')
  && stateType.includes('realizedGroundingRefs?: string[]')
  && reducer.includes('assistantBehavior?: {')
  && reducer.includes('input.assistantBehavior')
  && reducer.includes('behavior: behavior || undefined')
  && reducer.includes('taskId,')
  && reducer.includes('realizedGroundingRefs: behaviorInput.realizedGroundingRefs')
  && reducer.includes("...(existing.behavior?.realizedGroundingRefs || [])")
  && canonical.includes('extractCustomerServiceProvenGroundingRefsFromReplyTrace(row.generationDetails)')
  && canonical.includes('realizedGroundingRefs: behaviorContext?.realizedGroundingRefs'));

check('Tuning Simulation transports final delivered proof into the primary state reducer before the next turn consumes it',
  simulation.includes('extractCustomerServiceProvenGroundingRefsFromReplyTrace(generation)')
  && simulation.includes('extractCustomerServiceProvenGroundedUnitsFromReplyTrace(generation)')
  && simulation.includes("planFulfillment === 'NOT_FULFILLED'")
  && simulation.includes('assistantBehavior,')
  && simulation.includes('priorDeliveredGroundingRefs: readLatestDeliveredGroundingRefs(prepared.dto.conversationState)')
  && simulation.includes('resolveCustomerServiceProvenEvidenceRecall({')
  && simulation.includes('assistantMoveLedger: readCustomerServiceConversationStateV2(dto.conversationState).assistantMoveLedger')
  && simulation.includes('const latestAssistant = state.assistantMoveLedger.at(-1)')
  && simulation.includes("latestAssistant?.behavior?.realizedGroundingRefs"));

check('Deep Recognition owns current-message named-offering segmentation without catalog or Grounding authority',
  understandingType.includes('namedOfferingMentionSpans?: string[]')
  && deepRecognition.includes('namedOfferingMentionSpans 必须始终输出数组')
  && deepRecognition.includes('不得输出 catalog/entity/Grounding ID')
  && deepRecognition.includes('resolveCustomerServiceNamedOfferingMentionSpans')
  && deepRecognition.includes('message.includes(span)'));

check('Deep Recognition contextual referent contract can represent a bounded delivered option set without lexical reconstruction',
  understandingType.includes("mode: 'SINGLE' | 'SET'")
  && deepRecognition.includes("status: 'NONE|UNIQUE|SET|AMBIGUOUS|UNRESOLVED'")
  && deepRecognition.includes('candidateIds')
  && deepRecognition.includes('sourceQuotes')
  && contextualReferent.includes("status === 'SET'")
  && contextualReferent.includes("candidateIds.length < 2")
  && contextualReferent.includes("candidate.text.includes(sourceQuote)"));

check('ordinary contextual delivered referent narrows recommendation authority instead of letting current retrieval widen the option set',
  interactionCompiler.includes("target.namedOfferingReferent?.status === 'EXACT_STRUCTURED_ENTITY'")
  && interactionCompiler.includes("target.namedOfferingReferent.source === 'CONTEXTUAL_GROUNDED_ENTITY'")
  && interactionCompiler.includes('&& !alternativeRequested')
  && interactionCompiler.includes('? businessFactGroundingEntries')
  && interactionCompiler.includes('.filter(isCustomerServiceRecommendationCapableKnowledgeEntry)'));

check('typed ANOTHER_OPTION excludes any exact resolved current referent from the alternative recommendation pool regardless of referent source',
  interactionCompiler.includes("requestedDeltas.includes('ANOTHER_OPTION')")
  && interactionCompiler.includes("const alternativeExcludedGroundingIds = alternativeRequested")
  && interactionCompiler.includes("target.namedOfferingReferent?.status === 'EXACT_STRUCTURED_ENTITY'")
  && interactionCompiler.includes('new Set(target.namedOfferingReferent.resolvedGroundingIds)')
  && interactionCompiler.includes('alternativeRequested && alternativeExcludedGroundingIds.size')
  && interactionCompiler.includes('knowledgeEntries.filter((entry) => !alternativeExcludedGroundingIds.has(entry.id))'));

check('ordinary contextual delivered-set bounding remains source-specific and disabled only for typed ANOTHER_OPTION',
  interactionCompiler.includes("target.namedOfferingReferent.source === 'CONTEXTUAL_GROUNDED_ENTITY'")
  && interactionCompiler.includes('&& !alternativeRequested')
  && interactionCompiler.includes('? businessFactGroundingEntries')
  && interactionCompiler.includes(': alternativeRequested && alternativeExcludedGroundingIds.size'));

check('Simulation transports typed named-offering spans into Knowledge without reconstructing entity identity',
  simulation.includes('namedOfferingMentionSpans: understanding.namedOfferingMentionSpans')
  && knowledge.includes('namedOfferingMentionSpans?: string[]')
  && knowledge.includes("kind: 'TYPED_MENTION_EXACT'")
  && knowledge.includes('normalizeCurrentMessageNamedOfferingMentionSpans')
  && knowledge.includes('canonicalSurfaces.has(mention)'));

check('Robot Test server-owned post-Conformance proof is transported without depending on Reply Trace persistence',
  runtimeReply.includes("authority: 'SERVER_RUNTIME_ASSISTANT_OBSERVATION_V1'")
  && runtimeReply.includes("source: 'RUNTIME_EXECUTION_AFTER_CONFORMANCE'")
  && runtimeReply.includes('buildRuntimeAssistantObservationProof(result.generation, result.contract)')
  && channelReply.includes('assistantObservationProof: result.assistantObservationProof')
  && autoReplies.includes('assistantObservationProof: result.assistantObservationProof')
  && robotSession.includes('normalizeRuntimeAssistantObservationProof(input.assistantObservationProof)')
  && robotSession.includes('Compatibility fallback for older/idempotent Robot Test results'));

const p003 = {
  id: 'P003',
  entityType: 'PRODUCT',
  entityKey: 'QH-HVE-P003',
  title: '青禾「轻盈A线」通勤半身裙',
  aliases: ['轻盈A线'],
  selectionReason: 'CURRENT_AND_STATE',
  matchEvidence: ['STRUCTURED:藏蓝', 'CONTENT:颜色'],
};
const p004 = {
  id: 'P004',
  entityType: 'PRODUCT',
  entityKey: 'QH-HVE-P004',
  title: '青禾「另一款」通勤半身裙',
  aliases: ['另一款'],
  selectionReason: 'CURRENT_AND_STATE',
  matchEvidence: ['CONTENT:颜色'],
};

const deliveredSetState = {
  assistantMoveLedger: [{
    behavior: {
      evidenceMessageIds: ['m1'],
      realizedGroundingRefs: ['P003', 'P004'],
      provenGroundedUnits: [
        { text: '「轻盈A线」通勤半身裙是 A 字版型', groundingRefs: ['P003'] },
        { text: '「另一款」通勤半身裙是直筒版型', groundingRefs: ['P004'] },
      ],
    },
  }],
};
const deliveredSetSelection = contextualReferentRuntime.resolveCustomerServiceContextualReferentSelection({
  status: 'SET',
  candidateId: null,
  candidateIds: ['delivered-unit-0', 'delivered-unit-1'],
  evidence: '前面这些',
  sourceQuote: '',
  sourceQuotes: ['轻盈A线', '另一款'],
  confidence: 0.96,
}, '前面这些里面你更建议哪一个？', deliveredSetState);
check('contextual referent producer resolves an explicit delivered option set only from validated prior candidates',
  deliveredSetSelection?.mode === 'SET'
  && deliveredSetSelection.evidence === '前面这些'
  && JSON.stringify(deliveredSetSelection.groundingRefs) === JSON.stringify(['P003', 'P004']));
check('ambiguous single-offering signal still fails closed instead of becoming a set',
  contextualReferentRuntime.resolveCustomerServiceContextualReferentSelection({
    status: 'AMBIGUOUS', evidence: '这款', confidence: 0.96,
  }, '这款颜色怎么样？', deliveredSetState) === null);

const p003RuntimeEntry = {
  id: 'P003',
  scopeType: 'ACCOUNT',
  scopeKey: 'ACCOUNT-1',
  entityType: 'PRODUCT',
  entityKey: 'QH-HVE-P003',
  aliases: ['轻盈A线'],
  category: 'PRODUCT',
  title: '青禾「轻盈A线」通勤半身裙',
  question: null,
  content: '高腰 A 字版型，腰臀不过度贴合，下摆自然展开并带里衬。面料中薄有垂坠感。',
  tags: ['通勤', '半身裙'],
  sourceType: 'MANUAL',
  sourceReference: null,
  revision: 1,
  effectiveFrom: null,
  effectiveTo: null,
  updatedAt: new Date(),
  collection: { id: 'COLLECTION-1', name: '通勤女装' },
};

const p002RuntimeEntry = {
  ...p003RuntimeEntry,
  id: 'P002',
  entityKey: 'QH-HVE-P002',
  aliases: ['清风棉麻'],
  title: '青禾「清风棉麻」短袖衬衫',
  content: '棉55%、亚麻30%、粘胶15%；短袖微宽松，轻薄透气，适合高温高湿通勤。',
  tags: ['清风棉麻短袖衬衫', '通勤', '高温高湿'],
};
const p008RuntimeEntry = {
  ...p003RuntimeEntry,
  id: 'P008',
  entityKey: 'QH-HVE-P008',
  aliases: ['柔光醋酸'],
  title: '青禾「柔光醋酸」通勤衬衫',
  content: '醋酸72%、聚酯28%；光泽柔和、垂坠感明显。建议冷水轻柔洗，不建议高温烘干。',
  tags: ['柔光醋酸', '通勤', '垂坠'],
};

const typedMerchantFactOwnership = () => ({
  authority: 'MESSAGE_UNDERSTANDING_FACT_OWNERSHIP',
  scope: 'CURRENT_BUSINESS_FACT',
  confidence: 0.99,
  evidence: [
    'TYPED_EVIDENCE_SCOPE:MERCHANT_BUSINESS',
    'TYPED_TURN_GOAL:ANSWER_INFORMATION',
  ],
  reason: 'Verifier fixture: merchant evidence scope is already owned by typed current-turn semantic understanding.',
  namedOfferingReferent: {
    authority: 'MESSAGE_UNDERSTANDING_NAMED_OFFERING_REFERENT',
    status: 'NONE',
    source: 'NONE',
    surface: null,
    resolvedGroundingIds: [],
  },
});
const contextualSelection = (evidence, groundingRefs, sourceQuote = 'previous delivered grounded offering', mode = 'SINGLE') => ({
  mode,
  evidence,
  sourceQuote,
  groundingRefs,
});

const merchantDecisionGoal = {
  key: 'SUPPORT_PURCHASE_DECISION',
  requestedContributionKind: 'DECISION_SUPPORT',
  requestedEvidenceScope: 'MERCHANT_BUSINESS',
  requestedDecisionMode: 'SELECT_OR_PRIORITIZE_OPTION',
};
const recallUnderstanding = (overrides = {}) => ({
  namedOfferingMentionSpans: [],
  contextualReferentSelection: null,
  factOwnership: { namedOfferingReferent: { source: 'NONE' } },
  humanContext: {
    requiredTurnGoals: [merchantDecisionGoal],
    conversationTaskState: { activeTaskId: 'task-A' },
    stateTruthSignal: { task: { relation: 'CONTINUE_CURRENT', targetTaskId: 'task-A' } },
    dialogueObligation: { userFeedback: 'UNCLEAR', requestedDeltas: [] },
  },
  ...overrides,
});
const taskBoundLedger = [
  { rejected: false, requestedDeltas: [], behavior: { taskId: 'task-A', realizedGroundingRefs: ['P002'] } },
  { rejected: false, requestedDeltas: [], behavior: { taskId: 'task-A', realizedGroundingRefs: ['P008'] } },
  { rejected: false, requestedDeltas: [], behavior: { taskId: 'task-B', realizedGroundingRefs: ['OTHER-TASK'] } },
];
check('same-task typed merchant decision recalls proven evidence across multiple prior assistant turns without wording inference',
  JSON.stringify(behaviorRuntime.resolveCustomerServiceProvenEvidenceRecall({
    understanding: recallUnderstanding(), assistantMoveLedger: taskBoundLedger,
  })) === JSON.stringify(['P002', 'P008']));

check('same-task recall cannot leak proven refs from a different task',
  !behaviorRuntime.resolveCustomerServiceProvenEvidenceRecall({
    understanding: recallUnderstanding(), assistantMoveLedger: taskBoundLedger,
  }).includes('OTHER-TASK'));

check('new task cannot inherit prior task proven evidence',
  behaviorRuntime.resolveCustomerServiceProvenEvidenceRecall({
    understanding: recallUnderstanding({ humanContext: {
      requiredTurnGoals: [merchantDecisionGoal], conversationTaskState: { activeTaskId: null },
      stateTruthSignal: { task: { relation: 'START_NEW', targetTaskId: null } },
      dialogueObligation: { userFeedback: 'UNCLEAR', requestedDeltas: [] },
    } }), assistantMoveLedger: taskBoundLedger,
  }).length === 0);

check('current typed named offering uses current identity path instead of replaying same-task candidate evidence',
  behaviorRuntime.resolveCustomerServiceProvenEvidenceRecall({
    understanding: recallUnderstanding({ namedOfferingMentionSpans: ['新的明确商品'] }),
    assistantMoveLedger: taskBoundLedger,
  }).length === 0);

check('typed request for another option suppresses prior candidate recall rather than repeating old options',
  behaviorRuntime.resolveCustomerServiceProvenEvidenceRecall({
    understanding: recallUnderstanding({ humanContext: {
      requiredTurnGoals: [merchantDecisionGoal], conversationTaskState: { activeTaskId: 'task-A' },
      stateTruthSignal: { task: { relation: 'CONTINUE_CURRENT', targetTaskId: 'task-A' } },
      dialogueObligation: { userFeedback: 'UNCLEAR', requestedDeltas: ['ANOTHER_OPTION'] },
    } }), assistantMoveLedger: taskBoundLedger,
  }).length === 0);

check('rejected prior assistant move is excluded from same-task evidence recall',
  JSON.stringify(behaviorRuntime.resolveCustomerServiceProvenEvidenceRecall({
    understanding: recallUnderstanding(), assistantMoveLedger: [
      { rejected: true, requestedDeltas: [], behavior: { taskId: 'task-A', realizedGroundingRefs: ['REJECTED'] } },
      { rejected: false, requestedDeltas: [], behavior: { taskId: 'task-A', realizedGroundingRefs: ['SURVIVES'] } },
    ],
  })) === JSON.stringify(['SURVIVES']));

check('non-merchant or non-decision typed goal cannot gain same-task positive recall authority',
  behaviorRuntime.resolveCustomerServiceProvenEvidenceRecall({
    understanding: recallUnderstanding({ humanContext: {
      requiredTurnGoals: [{ ...merchantDecisionGoal, requestedContributionKind: 'INFORMATION', requestedDecisionMode: 'NOT_APPLICABLE' }],
      conversationTaskState: { activeTaskId: 'task-A' },
      stateTruthSignal: { task: { relation: 'CONTINUE_CURRENT', targetTaskId: 'task-A' } },
      dialogueObligation: { userFeedback: 'UNCLEAR', requestedDeltas: [] },
    } }), assistantMoveLedger: taskBoundLedger,
  }).length === 0);

check('explicit contextual referent still narrows only the latest delivered proven refs',
  JSON.stringify(behaviorRuntime.resolveCustomerServiceProvenEvidenceRecall({
    understanding: recallUnderstanding({
      contextualReferentSelection: contextualSelection('这款', ['P008']),
    }),
    assistantMoveLedger: taskBoundLedger.slice(0, 2),
  })) === JSON.stringify(['P008']));

const sameTaskRecallForSelection = behaviorRuntime.resolveCustomerServiceProvenEvidenceRecall({
  understanding: recallUnderstanding(),
  assistantMoveLedger: taskBoundLedger,
});
const recalledKnowledge = knowledgeRuntime.selectCustomerServiceRuntimeKnowledgeDetailed(
  [p002RuntimeEntry, p008RuntimeEntry],
  { message: '继续当前判断', scenario: 'PRODUCT_CONSULT', intent: 'PURCHASE_INTEREST',
    priorDeliveredGroundingRefs: sameTaskRecallForSelection, maxEstimatedTokens: 2200 },
);
check('same-task proven refs reach the actual Knowledge selector as retrieval-only recall evidence',
  recalledKnowledge.selected.some((entry) => entry.id === 'P008'
    && entry.matchEvidence.includes('PRIOR_DELIVERED_GROUNDING_REF_RECALL')));

const noRecallKnowledge = knowledgeRuntime.selectCustomerServiceRuntimeKnowledgeDetailed(
  [p008RuntimeEntry],
  { message: '继续当前判断', scenario: 'PRODUCT_CONSULT', intent: 'PURCHASE_INTEREST', maxEstimatedTokens: 2200 },
);
check('without typed recall qualification an otherwise unrelated prior product is not admitted by history alone',
  !noRecallKnowledge.selected.some((entry) => entry.id === 'P008'));

const typedIdentityEntry = (entry, surface) => ({
  ...entry,
  selectionReason: 'CURRENT_MESSAGE',
  currentMessageEntityIdentity: {
    authority: 'RUNTIME_CURRENT_MESSAGE_ENTITY_IDENTITY',
    status: 'EXACT_STRUCTURED_ENTITY',
    kind: 'TYPED_MENTION_EXACT',
    surface,
  },
});

for (const message of [
  '清风棉麻短袖衬衫在高温高湿通勤是不是挺合适？',
  '清风棉麻短袖衬衫在梅雨季每天坐地铁通勤会不会太闷？',
  '清风棉麻短袖衬衫周一到周五办公室穿着怎么样？',
]) {
  const selection = knowledgeRuntime.selectCustomerServiceRuntimeKnowledgeDetailed(
    [p002RuntimeEntry],
    {
      message,
      namedOfferingMentionSpans: ['清风棉麻短袖衬衫'],
      scenario: 'PRODUCT_CONSULT',
      intent: 'ASK_INFORMATION',
      maxEstimatedTokens: 2200,
    },
  );
  const resolved = semanticsRuntime.finalizeCustomerServiceFactOwnershipFromGroundingEvidence({
    ownership: typedMerchantFactOwnership(),
    primaryScenario: 'PRODUCT_CONSULT',
    primaryIntent: 'ASK_INFORMATION',
    message,
    namedOfferingMentionSpans: ['清风棉麻短袖衬衫'],
    knowledgeEntries: selection.selected,
  });
  check(`typed mention span keeps canonical product identity independent of following open-language clause: ${message}`,
    selection.selected.length === 1
    && selection.selected[0].currentMessageEntityIdentity?.kind === 'TYPED_MENTION_EXACT'
    && selection.selected[0].currentMessageEntityIdentity?.surface === '清风棉麻短袖衬衫'
    && resolved.namedOfferingReferent.status === 'EXACT_STRUCTURED_ENTITY'
    && JSON.stringify(resolved.namedOfferingReferent.resolvedGroundingIds) === JSON.stringify(['P002'])
    && JSON.stringify(knowledgeRuntime.selectCustomerServiceBusinessFactGroundingEntries({
      entries: selection.selected, factOwnership: resolved,
    }).map((entry) => entry.id)) === JSON.stringify(['P002']));
}

const typedQuotedProductCoreMessage = '这个「清风棉麻」短袖衬衫我先不考虑，店里还有别的吗？';
const typedQuotedProductCoreSpan = '「清风棉麻」短袖衬衫';
const typedQuotedProductCoreSelection = knowledgeRuntime.selectCustomerServiceRuntimeKnowledgeDetailed(
  [p002RuntimeEntry],
  {
    message: typedQuotedProductCoreMessage,
    namedOfferingMentionSpans: [typedQuotedProductCoreSpan],
    scenario: 'PRODUCT_CONSULT',
    intent: 'ASK_INFORMATION',
    maxEstimatedTokens: 2200,
  },
);
const typedQuotedProductCoreResolved = semanticsRuntime.finalizeCustomerServiceFactOwnershipFromGroundingEvidence({
  ownership: typedMerchantFactOwnership(),
  primaryScenario: 'PRODUCT_CONSULT',
  primaryIntent: 'ASK_INFORMATION',
  message: typedQuotedProductCoreMessage,
  namedOfferingMentionSpans: [typedQuotedProductCoreSpan],
  knowledgeEntries: typedQuotedProductCoreSelection.selected,
});
check('typed quoted label plus canonical product suffix resolves the same structured product without lexical reconstruction',
  typedQuotedProductCoreSelection.selected.length === 1
  && typedQuotedProductCoreSelection.selected[0].currentMessageEntityIdentity?.kind === 'TYPED_MENTION_EXACT'
  && typedQuotedProductCoreSelection.selected[0].currentMessageEntityIdentity?.surface === '清风棉麻短袖衬衫'
  && typedQuotedProductCoreResolved.namedOfferingReferent.status === 'EXACT_STRUCTURED_ENTITY'
  && JSON.stringify(typedQuotedProductCoreResolved.namedOfferingReferent.resolvedGroundingIds) === JSON.stringify(['P002']));

const typedQuotedLongerUnknownMessage = '这个「清风棉麻」短袖衬衫至尊纪念版是纯棉的吗？';
const typedQuotedLongerUnknownSpan = '「清风棉麻」短袖衬衫至尊纪念版';
const typedQuotedLongerUnknownSelection = knowledgeRuntime.selectCustomerServiceRuntimeKnowledgeDetailed(
  [p002RuntimeEntry],
  {
    message: typedQuotedLongerUnknownMessage,
    namedOfferingMentionSpans: [typedQuotedLongerUnknownSpan],
    scenario: 'PRODUCT_CONSULT',
    intent: 'ASK_INFORMATION',
    maxEstimatedTokens: 2200,
  },
);
const typedQuotedLongerUnknownResolved = semanticsRuntime.finalizeCustomerServiceFactOwnershipFromGroundingEvidence({
  ownership: typedMerchantFactOwnership(),
  primaryScenario: 'PRODUCT_CONSULT',
  primaryIntent: 'ASK_INFORMATION',
  message: typedQuotedLongerUnknownMessage,
  namedOfferingMentionSpans: [typedQuotedLongerUnknownSpan],
  knowledgeEntries: typedQuotedLongerUnknownSelection.selected,
});
check('typed quoted longer unknown offering still cannot inherit the shorter canonical product',
  typedQuotedLongerUnknownSelection.selected.every((entry) => !entry.currentMessageEntityIdentity)
  && typedQuotedLongerUnknownResolved.namedOfferingReferent.status === 'UNMATCHED_NAMED_OFFERING'
  && typedQuotedLongerUnknownResolved.namedOfferingReferent.resolvedGroundingIds.length === 0);
const typedLongerUnknownMessage = '清风棉麻短袖衬衫至尊纪念版是纯棉的吗？';
const typedLongerUnknownSpan = '清风棉麻短袖衬衫至尊纪念版';
const typedLongerUnknownSelection = knowledgeRuntime.selectCustomerServiceRuntimeKnowledgeDetailed(
  [p002RuntimeEntry],
  {
    message: typedLongerUnknownMessage,
    namedOfferingMentionSpans: [typedLongerUnknownSpan],
    scenario: 'PRODUCT_CONSULT',
    intent: 'ASK_INFORMATION',
    maxEstimatedTokens: 2200,
  },
);
const typedLongerUnknownResolved = semanticsRuntime.finalizeCustomerServiceFactOwnershipFromGroundingEvidence({
  ownership: typedMerchantFactOwnership(),
  primaryScenario: 'PRODUCT_CONSULT',
  primaryIntent: 'ASK_INFORMATION',
  message: typedLongerUnknownMessage,
  namedOfferingMentionSpans: [typedLongerUnknownSpan],
  knowledgeEntries: typedLongerUnknownSelection.selected,
});
check('typed mention span fails closed for a longer customer-named offering that only contains a known canonical core',
  typedLongerUnknownSelection.selected.every((entry) => !entry.currentMessageEntityIdentity)
  && typedLongerUnknownResolved.namedOfferingReferent.status === 'UNMATCHED_NAMED_OFFERING'
  && typedLongerUnknownResolved.namedOfferingReferent.resolvedGroundingIds.length === 0
  && knowledgeRuntime.selectCustomerServiceBusinessFactGroundingEntries({
    entries: typedLongerUnknownSelection.selected, factOwnership: typedLongerUnknownResolved,
  }).length === 0);

const typedEmptyProjectionMessage = '清风棉麻是纯棉的吗？';
const typedEmptyProjectionSelection = knowledgeRuntime.selectCustomerServiceRuntimeKnowledgeDetailed(
  [p002RuntimeEntry],
  {
    message: typedEmptyProjectionMessage,
    namedOfferingMentionSpans: [],
    scenario: 'PRODUCT_CONSULT',
    intent: 'ASK_INFORMATION',
    maxEstimatedTokens: 2200,
  },
);
const typedEmptyProjectionResolved = semanticsRuntime.finalizeCustomerServiceFactOwnershipFromGroundingEvidence({
  ownership: typedMerchantFactOwnership(),
  primaryScenario: 'PRODUCT_CONSULT',
  primaryIntent: 'ASK_INFORMATION',
  message: typedEmptyProjectionMessage,
  namedOfferingMentionSpans: [],
  knowledgeEntries: typedEmptyProjectionSelection.selected,
});
check('present typed mention projection is authoritative even when empty and cannot manufacture exact identity',
  typedEmptyProjectionSelection.selected.every((entry) => !entry.currentMessageEntityIdentity)
  && typedEmptyProjectionResolved.namedOfferingReferent.status === 'NONE');

const typedPartialMentionMessage = '棉麻的成分是什么？';
const typedPartialMentionSelection = knowledgeRuntime.selectCustomerServiceRuntimeKnowledgeDetailed(
  [p002RuntimeEntry],
  {
    message: typedPartialMentionMessage,
    namedOfferingMentionSpans: ['棉麻'],
    scenario: 'PRODUCT_CONSULT',
    intent: 'ASK_INFORMATION',
    maxEstimatedTokens: 2200,
  },
);
const typedPartialMentionResolved = semanticsRuntime.finalizeCustomerServiceFactOwnershipFromGroundingEvidence({
  ownership: typedMerchantFactOwnership(),
  primaryScenario: 'PRODUCT_CONSULT',
  primaryIntent: 'ASK_INFORMATION',
  message: typedPartialMentionMessage,
  namedOfferingMentionSpans: ['棉麻'],
  knowledgeEntries: typedPartialMentionSelection.selected,
});
check('typed partial offering mention remains fail-closed when it cannot prove one structured entity',
  typedPartialMentionSelection.selected.every((entry) => !entry.currentMessageEntityIdentity)
  && typedPartialMentionResolved.namedOfferingReferent.status === 'UNMATCHED_NAMED_OFFERING'
  && knowledgeRuntime.selectCustomerServiceBusinessFactGroundingEntries({
    entries: typedPartialMentionSelection.selected, factOwnership: typedPartialMentionResolved,
  }).length === 0);

const p002DuplicateRuntimeEntry = {
  ...p002RuntimeEntry,
  id: 'P002-DUPLICATE',
  entityKey: 'QH-HVE-P002-DUPLICATE',
};
const typedAmbiguousMessage = '清风棉麻短袖衬衫面料成分是什么？';
const typedAmbiguousSelection = knowledgeRuntime.selectCustomerServiceRuntimeKnowledgeDetailed(
  [p002RuntimeEntry, p002DuplicateRuntimeEntry],
  {
    message: typedAmbiguousMessage,
    namedOfferingMentionSpans: ['清风棉麻短袖衬衫'],
    scenario: 'PRODUCT_CONSULT',
    intent: 'ASK_INFORMATION',
    maxEstimatedTokens: 2200,
  },
);
const typedAmbiguousResolved = semanticsRuntime.finalizeCustomerServiceFactOwnershipFromGroundingEvidence({
  ownership: typedMerchantFactOwnership(),
  primaryScenario: 'PRODUCT_CONSULT',
  primaryIntent: 'ASK_INFORMATION',
  message: typedAmbiguousMessage,
  namedOfferingMentionSpans: ['清风棉麻短袖衬衫'],
  knowledgeEntries: typedAmbiguousSelection.selected,
});
check('typed exact mention mapping to multiple canonical entities remains ambiguous and ungrounded',
  typedAmbiguousSelection.selected.filter((entry) => entry.currentMessageEntityIdentity?.kind === 'TYPED_MENTION_EXACT').length === 2
  && typedAmbiguousResolved.namedOfferingReferent.status === 'AMBIGUOUS_EXACT_STRUCTURED_ENTITY'
  && knowledgeRuntime.selectCustomerServiceBusinessFactGroundingEntries({
    entries: typedAmbiguousSelection.selected, factOwnership: typedAmbiguousResolved,
  }).length === 0);

const typedGenericQuestionMessage = '夏天衬衫一般怎么挑？';
const typedGenericQuestionSelection = knowledgeRuntime.selectCustomerServiceRuntimeKnowledgeDetailed(
  [p002RuntimeEntry],
  {
    message: typedGenericQuestionMessage,
    namedOfferingMentionSpans: [],
    scenario: 'PRODUCT_CONSULT',
    intent: 'ASK_INFORMATION',
    maxEstimatedTokens: 2200,
  },
);
const typedGenericResolved = semanticsRuntime.finalizeCustomerServiceFactOwnershipFromGroundingEvidence({
  ownership: typedMerchantFactOwnership(),
  primaryScenario: 'PRODUCT_CONSULT',
  primaryIntent: 'ASK_INFORMATION',
  message: typedGenericQuestionMessage,
  namedOfferingMentionSpans: [],
  knowledgeEntries: typedGenericQuestionSelection.selected,
});
check('typed generic product question with no named offering cannot gain exact entity authority',
  typedGenericQuestionSelection.selected.every((entry) => !entry.currentMessageEntityIdentity)
  && typedGenericResolved.namedOfferingReferent.status === 'NONE');

for (const message of [
  '我还是先看裙子吧。这条轻盈A线我挺喜欢的，就是夏天坐办公室时间长，我比较怕闷，里衬坐久了会不会容易贴腿？',
  '这条轻盈A线我更中意，里衬是什么材质？',
  '轻盈A线看起来挺利落，面料成分是什么？',
  '这条轻盈A线我还蛮中意的，就是我夏天特别怕闷，坐久了里衬会不会容易往腿上粘？',
]) {
  const selection = knowledgeRuntime.selectCustomerServiceRuntimeKnowledgeDetailed(
    [p003RuntimeEntry],
    {
      message,
      namedOfferingMentionSpans: ['轻盈A线'],
      scenario: 'PRODUCT_CONSULT',
      intent: 'ASK_INFORMATION',
      maxEstimatedTokens: 2200,
    },
  );
  const resolved = semanticsRuntime.finalizeCustomerServiceFactOwnershipFromGroundingEvidence({
    ownership: typedMerchantFactOwnership(),
    primaryScenario: 'PRODUCT_CONSULT',
    primaryIntent: 'ASK_INFORMATION',
    message,
    namedOfferingMentionSpans: ['轻盈A线'],
    knowledgeEntries: selection.selected,
  });
  check(`typed canonical product mention remains exact identity across different surrounding customer predicates: ${message}`,
    selection.selected.some((entry) => entry.currentMessageEntityIdentity?.status === 'EXACT_STRUCTURED_ENTITY'
      && String(entry.currentMessageEntityIdentity?.surface || '').toLowerCase() === '轻盈a线')
    && resolved.namedOfferingReferent.status === 'EXACT_STRUCTURED_ENTITY'
    && resolved.namedOfferingReferent.source === 'STRUCTURED_ENTITY'
    && JSON.stringify(resolved.namedOfferingReferent.resolvedGroundingIds) === JSON.stringify(['P003'])
    && JSON.stringify(knowledgeRuntime.selectCustomerServiceBusinessFactGroundingEntries({
      entries: selection.selected, factOwnership: resolved,
    }).map((entry) => entry.id)) === JSON.stringify(['P003']));
}

const typedProjectionMessage = '这条轻盈A线我还蛮中意的，就是我夏天特别怕闷，坐久了里衬会不会容易往腿上粘？';
const typedProjectionSelection = knowledgeRuntime.selectCustomerServiceRuntimeKnowledgeDetailed(
  [p003RuntimeEntry],
  {
    message: typedProjectionMessage,
    namedOfferingMentionSpans: ['轻盈A线'],
    scenario: 'PRODUCT_CONSULT',
    intent: 'ASK_INFORMATION',
    maxEstimatedTokens: 2200,
  },
).selected;
const typedProjectionResolved = semanticsRuntime.finalizeCustomerServiceFactOwnershipFromGroundingEvidence({
  ownership: typedMerchantFactOwnership(),
  primaryScenario: 'PRODUCT_CONSULT',
  primaryIntent: 'ASK_INFORMATION',
  message: typedProjectionMessage,
  namedOfferingMentionSpans: ['轻盈A线'],
  knowledgeEntries: typedProjectionSelection,
});
check('typed exact-entity projection is sufficient Authority without legacy lexical matchEvidence',
  typedProjectionSelection[0]?.currentMessageEntityIdentity?.status === 'EXACT_STRUCTURED_ENTITY'
  && typedProjectionResolved.namedOfferingReferent.status === 'EXACT_STRUCTURED_ENTITY'
  && JSON.stringify(typedProjectionResolved.namedOfferingReferent.resolvedGroundingIds) === JSON.stringify(['P003']));

const similarityOnlySelection = typedProjectionSelection.map((entry) => ({
  ...entry,
  currentMessageEntityIdentity: null,
}));
const similarityOnlyResolved = semanticsRuntime.finalizeCustomerServiceFactOwnershipFromGroundingEvidence({
  ownership: typedMerchantFactOwnership(),
  primaryScenario: 'PRODUCT_CONSULT',
  primaryIntent: 'ASK_INFORMATION',
  message: typedProjectionMessage,
  namedOfferingMentionSpans: ['轻盈A线'],
  knowledgeEntries: similarityOnlySelection,
});
check('retrieval similarity alone cannot manufacture exact current-entity Authority when typed identity is absent',
  similarityOnlyResolved.namedOfferingReferent.status === 'UNMATCHED_NAMED_OFFERING'
  && knowledgeRuntime.selectCustomerServiceBusinessFactGroundingEntries({
    entries: similarityOnlySelection, factOwnership: similarityOnlyResolved,
  }).length === 0);

for (const [message, namedSpan] of [
  ['这条轻盈A线旗舰限定版，面料成分是什么？', '轻盈A线旗舰限定版'],
  ['这条轻盈A线Pro，里衬是什么材质？', '轻盈A线Pro'],
]) {
  const selection = knowledgeRuntime.selectCustomerServiceRuntimeKnowledgeDetailed(
    [p003RuntimeEntry],
    {
      message,
      namedOfferingMentionSpans: [namedSpan],
      scenario: 'PRODUCT_CONSULT',
      intent: 'ASK_INFORMATION',
      maxEstimatedTokens: 2200,
    },
  );
  const resolved = semanticsRuntime.finalizeCustomerServiceFactOwnershipFromGroundingEvidence({
    ownership: typedMerchantFactOwnership(),
    primaryScenario: 'PRODUCT_CONSULT',
    primaryIntent: 'ASK_INFORMATION',
    message,
    namedOfferingMentionSpans: [namedSpan],
    knowledgeEntries: selection.selected,
  });
  check(`longer product-like suffix still cannot inherit the shorter exact product: ${message}`,
    selection.selected.every((entry) => !entry.currentMessageEntityIdentity)
    && resolved.namedOfferingReferent.status === 'UNMATCHED_NAMED_OFFERING'
    && knowledgeRuntime.selectCustomerServiceBusinessFactGroundingEntries({
      entries: selection.selected, factOwnership: resolved,
    }).length === 0);
}

const currentOwnership = typedMerchantFactOwnership();
const contextualMessage = '这款颜色有深灰、燕麦、藏蓝吗？';
const contextualResolved = semanticsRuntime.finalizeCustomerServiceFactOwnershipFromGroundingEvidence({
  ownership: currentOwnership,
  primaryScenario: 'PRODUCT_CONSULT',
  primaryIntent: 'ASK_INFORMATION',
  message: contextualMessage,
  priorDeliveredGroundingRefs: ['P003'],
  contextualReferentSelection: contextualSelection('这款', ['P003']),
  knowledgeEntries: [p003],
});
check('typed contextual follow-up resolves from one prior delivered proven Grounding entity',
  contextualResolved.namedOfferingReferent.status === 'EXACT_STRUCTURED_ENTITY'
  && contextualResolved.namedOfferingReferent.source === 'CONTEXTUAL_GROUNDED_ENTITY'
  && JSON.stringify(contextualResolved.namedOfferingReferent.resolvedGroundingIds) === JSON.stringify(['P003'])
  && contextualResolved.evidence.includes('REFERENT:CONTEXTUAL_DELIVERED_GROUNDED_OFFERING'));

const contextualGrounding = knowledgeRuntime.selectCustomerServiceBusinessFactGroundingEntries({
  entries: [p003],
  factOwnership: contextualResolved,
});
check('typed contextual referent authorizes only its already-proven structured entry id',
  contextualGrounding.length === 1 && contextualGrounding[0].id === 'P003');

const noContextualSelection = semanticsRuntime.finalizeCustomerServiceFactOwnershipFromGroundingEvidence({
  ownership: currentOwnership,
  primaryScenario: 'PRODUCT_CONSULT',
  primaryIntent: 'ASK_INFORMATION',
  message: '颜色有深灰、燕麦、藏蓝吗？',
  priorDeliveredGroundingRefs: ['P003'],
  knowledgeEntries: [p003],
});
check('prior delivered Grounding alone cannot promote identity without typed contextual referent evidence',
  noContextualSelection.namedOfferingReferent.status !== 'EXACT_STRUCTURED_ENTITY'
  && noContextualSelection.namedOfferingReferent.source !== 'CONTEXTUAL_GROUNDED_ENTITY');

const missingPriorEntry = semanticsRuntime.finalizeCustomerServiceFactOwnershipFromGroundingEvidence({
  ownership: currentOwnership,
  primaryScenario: 'PRODUCT_CONSULT',
  primaryIntent: 'ASK_INFORMATION',
  message: '这款颜色怎么样？',
  priorDeliveredGroundingRefs: ['P003'],
  contextualReferentSelection: contextualSelection('这款', ['P003']),
  knowledgeEntries: [p004],
});
check('typed contextual ref absent from current structured Knowledge fails closed',
  missingPriorEntry.namedOfferingReferent.status !== 'EXACT_STRUCTURED_ENTITY'
  && knowledgeRuntime.selectCustomerServiceBusinessFactGroundingEntries({ entries: [p004], factOwnership: missingPriorEntry }).length === 0);

const ambiguousContextual = semanticsRuntime.finalizeCustomerServiceFactOwnershipFromGroundingEvidence({
  ownership: currentOwnership,
  primaryScenario: 'PRODUCT_CONSULT',
  primaryIntent: 'ASK_INFORMATION',
  message: '这款颜色怎么样？',
  priorDeliveredGroundingRefs: ['P003', 'P004'],
  contextualReferentSelection: contextualSelection('这款', ['P003', 'P004']),
  knowledgeEntries: [p003, p004],
});
check('typed contextual selection spanning multiple entity owners stays ambiguous instead of choosing one',
  ambiguousContextual.namedOfferingReferent.status === 'AMBIGUOUS_EXACT_STRUCTURED_ENTITY'
  && ambiguousContextual.namedOfferingReferent.source === 'CONTEXTUAL_GROUNDED_ENTITY'
  && knowledgeRuntime.selectCustomerServiceBusinessFactGroundingEntries({ entries: [p003, p004], factOwnership: ambiguousContextual }).length === 0);

const optionSetContextual = semanticsRuntime.finalizeCustomerServiceFactOwnershipFromGroundingEvidence({
  ownership: currentOwnership,
  primaryScenario: 'PRODUCT_COMPARE',
  primaryIntent: 'PURCHASE_INTEREST',
  message: '前面这些里面你更建议哪一个？',
  priorDeliveredGroundingRefs: ['P003', 'P004'],
  contextualReferentSelection: contextualSelection('前面这些', ['P003', 'P004'], '轻盈A线\n另一款', 'SET'),
  knowledgeEntries: [p003, p004],
});
check('typed delivered option-set referent preserves multiple structured owners as one bounded recommendation Authority',
  optionSetContextual.namedOfferingReferent.status === 'EXACT_STRUCTURED_ENTITY'
  && optionSetContextual.namedOfferingReferent.source === 'CONTEXTUAL_GROUNDED_ENTITY'
  && optionSetContextual.evidence.includes('REFERENT_RESOLUTION:EXACT_STRUCTURED_ENTITY_SET')
  && JSON.stringify(optionSetContextual.namedOfferingReferent.resolvedGroundingIds.sort()) === JSON.stringify(['P003', 'P004'])
  && JSON.stringify(knowledgeRuntime.selectCustomerServiceBusinessFactGroundingEntries({
    entries: [p003, p004], factOwnership: optionSetContextual,
  }).map((entry) => entry.id).sort()) === JSON.stringify(['P003', 'P004']));

const explicitOtherMessage = '这款不是，我问另一款的颜色。';
const explicitOtherEntry = typedIdentityEntry(p004, '另一款');
const explicitOtherResolved = semanticsRuntime.finalizeCustomerServiceFactOwnershipFromGroundingEvidence({
  ownership: currentOwnership,
  primaryScenario: 'PRODUCT_CONSULT',
  primaryIntent: 'ASK_INFORMATION',
  message: explicitOtherMessage,
  namedOfferingMentionSpans: ['另一款'],
  priorDeliveredGroundingRefs: ['P003'],
  contextualReferentSelection: contextualSelection('这款', ['P003']),
  knowledgeEntries: [explicitOtherEntry],
});
check('current typed exact named entity outranks prior contextual grounded referent',
  explicitOtherResolved.namedOfferingReferent.status === 'EXACT_STRUCTURED_ENTITY'
  && explicitOtherResolved.namedOfferingReferent.source === 'STRUCTURED_ENTITY'
  && explicitOtherResolved.namedOfferingReferent.resolvedGroundingIds[0] === 'P004');

for (const [message, namedSpan] of [
  ['这款远山纪念款是什么面料？', '远山纪念款'],
  ['这款轻盈A线纪念版是什么面料？', '轻盈A线纪念版'],
]) {
  const result = semanticsRuntime.finalizeCustomerServiceFactOwnershipFromGroundingEvidence({
    ownership: currentOwnership,
    primaryScenario: 'PRODUCT_CONSULT',
    primaryIntent: 'ASK_INFORMATION',
    message,
    namedOfferingMentionSpans: [namedSpan],
    priorDeliveredGroundingRefs: ['P003'],
    contextualReferentSelection: contextualSelection('这款', ['P003']),
    knowledgeEntries: [p003],
  });
  check(`current typed named offering cannot inherit prior proof when it is unmatched: ${message}`,
    result.namedOfferingReferent.status === 'UNMATCHED_NAMED_OFFERING'
    && result.namedOfferingReferent.source !== 'CONTEXTUAL_GROUNDED_ENTITY'
    && knowledgeRuntime.selectCustomerServiceBusinessFactGroundingEntries({ entries: [p003], factOwnership: result }).length === 0);
}

const subsetContext = semanticsRuntime.finalizeCustomerServiceFactOwnershipFromGroundingEvidence({
  ownership: currentOwnership,
  primaryScenario: 'PRODUCT_CONSULT',
  primaryIntent: 'ASK_INFORMATION',
  message: '这款颜色怎么样？',
  priorDeliveredGroundingRefs: ['P003', 'P004'],
  contextualReferentSelection: contextualSelection('这款', ['P003', 'P004']),
  knowledgeEntries: [p003],
});
check('retrieval dropping one typed contextual reference cannot turn unresolved context into unique identity',
  subsetContext.namedOfferingReferent.status !== 'EXACT_STRUCTURED_ENTITY'
  && knowledgeRuntime.selectCustomerServiceBusinessFactGroundingEntries({ entries: [p003], factOwnership: subsetContext }).length === 0);

const sameOwnerEntries = [p003, { ...p003, id: 'P003-DETAIL' }];
const completeSameOwner = semanticsRuntime.finalizeCustomerServiceFactOwnershipFromGroundingEvidence({
  ownership: currentOwnership,
  primaryScenario: 'PRODUCT_CONSULT',
  primaryIntent: 'ASK_INFORMATION',
  message: '这款颜色怎么样？',
  priorDeliveredGroundingRefs: ['P003', 'P003-DETAIL'],
  contextualReferentSelection: contextualSelection('这款', ['P003', 'P003-DETAIL']),
  knowledgeEntries: sameOwnerEntries,
});
check('complete typed contextual evidence for multiple records of one entity owner preserves identity',
  completeSameOwner.namedOfferingReferent.status === 'EXACT_STRUCTURED_ENTITY'
  && JSON.stringify(completeSameOwner.namedOfferingReferent.resolvedGroundingIds.sort()) === JSON.stringify(['P003', 'P003-DETAIL'].sort())
  && knowledgeRuntime.selectCustomerServiceBusinessFactGroundingEntries({ entries: sameOwnerEntries, factOwnership: completeSameOwner }).length === 2);

const explicitDespiteIncompleteHistory = semanticsRuntime.finalizeCustomerServiceFactOwnershipFromGroundingEvidence({
  ownership: currentOwnership,
  primaryScenario: 'PRODUCT_CONSULT',
  primaryIntent: 'ASK_INFORMATION',
  message: explicitOtherMessage,
  namedOfferingMentionSpans: ['另一款'],
  priorDeliveredGroundingRefs: ['P003', 'MISSING'],
  contextualReferentSelection: contextualSelection('这款', ['P003']),
  knowledgeEntries: [explicitOtherEntry],
});
check('current typed exact identity remains authoritative despite incomplete historical references',
  explicitDespiteIncompleteHistory.namedOfferingReferent.status === 'EXACT_STRUCTURED_ENTITY'
  && explicitDespiteIncompleteHistory.namedOfferingReferent.source === 'STRUCTURED_ENTITY'
  && explicitDespiteIncompleteHistory.namedOfferingReferent.resolvedGroundingIds[0] === 'P004');

check('current-offering continuity keeps typed referent state as Authority rather than replaying retrieval evidence',
  understandingType.includes("'CONTEXTUAL_GROUNDED_ENTITY'")
  && semantics.includes('REFERENT:CONTEXTUAL_DELIVERED_GROUNDED_OFFERING')
  && knowledge.includes('RUNTIME_CURRENT_MESSAGE_ENTITY_IDENTITY')
  && knowledge.includes('typedResolvedEntryIds.has(entry.id)')
  && knowledge.includes('isCustomerServiceStructuredEntityKnowledgeEntry(entry)')
  && !semantics.includes("selectionReason === 'STATE' && CURRENT_BUSINESS_CONTEXTUAL_OFFERING_REFERENT_PATTERN"));

check('narrow reopen adds no schema migration, Prompt, Conformance, or Send branch',
  !schema.includes('contextualGroundedReferent')
  && !prompt.includes('CONTEXTUAL_GROUNDED_ENTITY')
  && !conformance.includes('CONTEXTUAL_GROUNDED_ENTITY')
  && !send.includes('CONTEXTUAL_GROUNDED_ENTITY'));

// Exercise the real primary Conversation State reducer used by Tuning Simulation.
// This closes the prior coverage gap where downstream consumers were tested with
// manually supplied refs but the Natural Live persistence owner was not.
function verifyPrimaryReducerDeliveredProofTransport() {
  process.env.TS_NODE_TRANSPILE_ONLY = '1';
  process.env.TS_NODE_PROJECT = path.join(root, 'tsconfig.json');
  require('ts-node/register/transpile-only');
  const reducerRuntime = require(path.join(root,
    'src/modules/customer-service-agent/runtime/state/customer-service-conversation-state.reducer.ts'));
  const referentRuntime = require(path.join(root,
    'src/modules/customer-service-agent/runtime/understanding/customer-service-contextual-referent.ts'));
  const g = {
    key: 'SUPPORT_PURCHASE_DECISION', requestedContributionKind: 'DECISION_SUPPORT',
    requestedEvidenceScope: 'MERCHANT_BUSINESS', requestedDecisionMode: 'SELECT_OR_PRIORITIZE_OPTION',
    name: '支持购买判断', priority: 1000, confidence: .95, evidence: ['fixture'], reason: 'fixture',
    responseRequirement: 'fixture', source: 'MODEL', deferred: false,
  };
  const understanding = {
    source: 'MODEL', primaryScenario: 'PRODUCT_CONSULT', primaryIntent: 'PURCHASE_INTEREST',
    riskLevel: 'LOW', emotion: 'NEUTRAL', topics: [], intentRanking: [], recognizedItems: [],
    confidence: .95, reasons: [], customerRequestedRefund: false, customerRejectedRecommendation: false,
    requiresHumanReview: false,
    humanContext: {
      primaryMotive: 'PURCHASE_DECISION', secondaryMotives: [], mindset: 'TASK_FOCUSED',
      relationshipState: 'OPEN', conversationStance: 'FRIENDLY_SERVICE', commercialOpenness: 'ACTIVE',
      commercialOpennessScore: 90, commercialStrategy: { stage: 'PRODUCT_RECOMMENDATION' },
      statedNeeds: [], inferredNeeds: [], valueOpportunities: [], evidence: [], uncertainties: [],
      emotionalDisclosure: { detected: false, polarity: 'NONE', mode: 'NONE', confidence: 0, adviceRequested: false, evidence: [] },
      emotionStrategy: {}, interactionStrategy: {}, replyStrategy: {}, semanticMoveBudget: {},
      dominantTurnGoal: g, rankedTurnGoals: [g], requiredTurnGoals: [g], requiredResponseActs: [],
      conversationTaskState: {
        currentTurnRelation: 'NEW_REQUEST', activeScenario: 'PRODUCT_CONSULT', activeIntent: 'PURCHASE_INTEREST',
        status: 'NONE', lastAssistantRequest: null, pendingSlots: [], providedSlots: [], unresolvedGoals: [],
        suspendedTasks: [], internalHandling: { required: false, status: 'NONE', scenario: null, reason: null, customerVisibleDisclosure: 'HIDDEN' },
        requestResponseType: 'NONE', activeTaskId: null, longHorizonStatus: 'ACTIVE', responsibility: 'NONE',
        semanticQuestions: [], evidence: ['当前责任：NONE'],
      },
      dialogueObligation: {
        previousAssistantMove: 'UNKNOWN', userFeedback: 'UNCLEAR', feedbackHandlingMode: 'NONE',
        acknowledgementRequired: false, requestedDeltas: [], feedbackTargetTurnNo: null,
        strategyChangeRequired: false, rejectedMove: null, correctionTarget: null, unresolvedNeed: null,
        repairObligation: false, forbiddenRepeatedMoves: [], acceptedConversationStyle: [],
        currentResponseObligation: 'fixture', evidence: [], confidence: .9, source: 'HEURISTIC',
      },
      stateTruthSignal: {
        authority: 'STATE_MUTATION_EVIDENCE_ONLY',
        task: { relation: 'START_NEW', targetTaskId: null, evidence: '想看一条半身裙', confidence: .9 },
        memory: { action: 'NONE', targetMemoryId: null, replacementValue: null, evidence: '', confidence: 0 },
        entity: { action: 'NONE', targetEntityId: null, replacementValue: null, evidence: '', confidence: 0 },
      },
    },
  };
  const previous = reducerRuntime.emptyCustomerServiceConversationStateV2();
  const next = reducerRuntime.reduceCustomerServiceConversationState({
    previous,
    dto: { message: '想看一条半身裙', conversationHistory: [], conversationState: previous, customerState: {}, variables: {} },
    understanding,
    assistantDraft: '先看青禾轻盈A线半身裙。',
    evidenceMessageIds: ['customer-message-1'],
    assistantBehavior: {
      replyAttemptId: 'analysis-1', planFulfillment: 'FULFILLED', realizedGroundingRefs: ['P003'],
      provenGroundedUnits: [{ text: '先看青禾轻盈A线半身裙。', groundingRefs: ['P003'] }],
    },
  });
  const latest = next.assistantMoveLedger.at(-1);
  const candidates = referentRuntime.getCustomerServiceDeliveredReferentCandidates(next);
  check('primary Tuning-state reducer persists proven Grounding on the same single revision',
    next.revision === previous.revision + 1
    && latest?.behavior?.planFulfillment === 'FULFILLED'
    && latest?.behavior?.taskId === next.activeTaskId
    && JSON.stringify(latest?.behavior?.realizedGroundingRefs) === '["P003"]'
    && latest?.behavior?.evidenceMessageIds?.[0] === 'customer-message-1');
  check('next-turn contextual referent producer can consume the state proof without manual ref injection',
    candidates.length === 1 && JSON.stringify(candidates[0].groundingRefs) === '["P003"]'
    && candidates[0].text.includes('轻盈A线'));
  const continuedUnderstanding = {
    ...understanding, namedOfferingMentionSpans: [], contextualReferentSelection: null,
    factOwnership: { namedOfferingReferent: { source: 'NONE' } },
    humanContext: { ...understanding.humanContext,
      requiredTurnGoals: [g],
      conversationTaskState: { ...understanding.humanContext.conversationTaskState,
        currentTurnRelation: 'CONTINUATION', activeTaskId: next.activeTaskId },
      stateTruthSignal: { ...understanding.humanContext.stateTruthSignal,
        task: { relation: 'CONTINUE_CURRENT', targetTaskId: next.activeTaskId, evidence: '继续当前任务', confidence: .95 } },
    },
  };
  check('persisted task-bound proof is directly eligible for same-task typed decision recall on the next turn',
    JSON.stringify(behaviorRuntime.resolveCustomerServiceProvenEvidenceRecall({
      understanding: continuedUnderstanding, assistantMoveLedger: next.assistantMoveLedger,
    })) === JSON.stringify(['P003']));
}

try {
  verifyPrimaryReducerDeliveredProofTransport();
} catch (error) {
  check('primary Tuning-state reducer delivered-proof transport execution', false, error.stack || String(error));
}

// Execute the real Robot Test persistence adapter with scoped storage doubles.
// Inspect its reducer input and saved snapshot; source-string checks alone missed
// the missing transport in this entry point. This does not call a model or DB.
async function verifyRobotTestTransport() {
  const reducerInputs = [];
  const serviceModule = loadTsModule(
    read('src/modules/customer-service-agent/runtime/testing/customer-service-robot-test-dm-session.service.ts'),
    'customer-service-robot-test-dm-session.service.ts',
    (id) => {
      if (id === '@nestjs/common') return {
        Injectable: () => (target) => target,
        Logger: class { warn() {} },
      };
      if (id.includes('customer-service-behavior-memory.util')) return behaviorRuntime;
      if (id.includes('customer-service-conversation-state.reducer')) return {
        readCustomerServiceConversationStateV2: (value) => value,
        reduceCustomerServiceObservedAssistantAction: (input) => {
          reducerInputs.push(input);
          return { ...input.previous, revision: input.previous.revision + 1,
            transportedGroundingRefs: input.realizedGroundingRefs || [] };
        },
      };
      return {};
    },
  );
  const SessionService = serviceModule.CustomerServiceRobotTestDmSessionService;
  const fixture = { id: 'session', stateRevision: 4,
    contextSnapshot: { conversationStateV2: { revision: 4, schemaVersion: 2 } } };
  async function run({ generationDetails, missing = false, lookupThrows = false,
    byAttempt = false, conflict = false, assistantObservationProof = null }) {
    reducerInputs.length = 0;
    const queries = [];
    const writes = [];
    const service = new SessionService({ customerServiceReplyTrace: {
      findFirst: async (query) => {
        queries.push(query);
        if (lookupThrows) throw new Error('trace unavailable');
        return missing ? null : { generationDetails, runtimeContract: null };
      },
    } }, {
      updateConversationStateScoped: async (write) => {
        writes.push(write);
        return !(conflict && writes.length === 1);
      },
      findScoped: async () => ({ ...fixture, stateRevision: 5,
        contextSnapshot: { conversationStateV2: { revision: 5, schemaVersion: 2 } } }),
    }, {});
    await service.commitObservedAssistantBehavior({ session: fixture, tenantId: 'tenant',
      assistantText: '已保存的客服消息', evidenceMessageIds: ['delivered-message'],
      replyTraceId: byAttempt ? null : 'trace', replyAttemptId: 'attempt', assistantObservationProof });
    return { queries, writes, inputs: [...reducerInputs] };
  }
  const serverProof = {
    authority: 'SERVER_RUNTIME_ASSISTANT_OBSERVATION_V1',
    source: 'RUNTIME_EXECUTION_AFTER_CONFORMANCE',
    planFulfillment: 'FULFILLED',
    behaviorPlan: null,
    interactionPlanV2: null,
    realizedGroundingRefs: ['P003'],
    provenGroundedUnits: [{ text: '已保存的客服消息', groundingRefs: ['P003'] }],
  };
  const primaryProof = await run({ assistantObservationProof: serverProof, lookupThrows: true });
  check('Robot Test consumes in-memory server proof before any Reply Trace lookup',
    primaryProof.queries.length === 0
    && JSON.stringify(primaryProof.inputs[0].realizedGroundingRefs) === '["P003"]'
    && JSON.stringify(primaryProof.writes[0].contextSnapshot.conversationStateV2.transportedGroundingRefs) === '["P003"]');
  const notFulfilledProof = await run({ assistantObservationProof: { ...serverProof,
    planFulfillment: 'NOT_FULFILLED', realizedGroundingRefs: ['SHOULD_NOT_SURVIVE'] } });
  check('NOT_FULFILLED in-memory proof cannot transport Grounding even if malformed input carries refs',
    notFulfilledProof.queries.length === 0
    && notFulfilledProof.inputs[0].planFulfillment === 'NOT_FULFILLED'
    && notFulfilledProof.inputs[0].realizedGroundingRefs.length === 0);

  const positive = await run({ generationDetails: provenTrace });
  check('Robot Test adapter transports proven refs from tenant-scoped Trace into the persisted snapshot',
    positive.queries[0].where.tenantId === 'tenant'
    && positive.queries[0].where.id === 'trace'
    && JSON.stringify(positive.inputs[0].realizedGroundingRefs) === '["P003"]'
    && JSON.stringify(positive.writes[0].contextSnapshot.conversationStateV2.transportedGroundingRefs) === '["P003"]'
    && positive.inputs[0].evidenceMessageIds[0] === 'delivered-message');
  const invalidProofFallback = await run({ generationDetails: provenTrace,
    assistantObservationProof: { ...serverProof, authority: 'UNTRUSTED' } });
  check('invalid/non-server proof is ignored and compatibility Trace lookup remains fail-safe',
    invalidProofFallback.queries.length === 1
    && JSON.stringify(invalidProofFallback.inputs[0].realizedGroundingRefs) === '["P003"]');
  const selectedUnproven = { hve3: { ...unprovenTrace.hve3, selectedCandidateIndex: 0 } };
  // Minimal fixture derived from the 2026-09-08 PC diagnostic summary, not a
  // replay of the unavailable raw Reply Trace or a claim about fabric facts.
  const liveProductId = 'cmti6nicv003awfj0jp5jgdne';
  const liveKnowledge = { id: liveProductId, entityType: 'PRODUCT',
    entityKey: 'QH-HVE-P001', title: '青禾「云感轻垂」通勤西裤',
    selectionReason: 'CURRENT_AND_STATE', matchEvidence: ['STRUCTURED:面料'] };
  const afterRemoval = await run({ lookupThrows: true, assistantObservationProof: {
    ...serverProof,
    realizedGroundingRefs: [liveProductId],
    provenGroundedUnits: [{ text: '已保存的客服消息', groundingRefs: [liveProductId] }],
  } });
  const followupMessage = '那这款是什么面料？夏天办公室穿会不会太闷？';
  const followupOwnership = typedMerchantFactOwnership();
  const resolveFollowup = (priorDeliveredGroundingRefs) =>
    semanticsRuntime.finalizeCustomerServiceFactOwnershipFromGroundingEvidence({
      ownership: followupOwnership, primaryScenario: 'PRODUCT_CONSULT',
      primaryIntent: 'ASK_INFORMATION', message: followupMessage,
      priorDeliveredGroundingRefs,
      contextualReferentSelection: contextualSelection('那这款', [liveProductId], '已保存的客服消息'),
      knowledgeEntries: [liveKnowledge],
    });
  const resolvedFollowup = resolveFollowup(afterRemoval.writes[0].contextSnapshot
    .conversationStateV2.transportedGroundingRefs);
  check('in-memory post-Conformance proof reaches next-turn referent and business Grounding consumers even when Trace lookup is unavailable',
    resolvedFollowup.namedOfferingReferent.status === 'EXACT_STRUCTURED_ENTITY'
    && resolvedFollowup.namedOfferingReferent.source === 'CONTEXTUAL_GROUNDED_ENTITY'
    && JSON.stringify(knowledgeRuntime.selectCustomerServiceBusinessFactGroundingEntries({
      entries: [liveKnowledge], factOwnership: resolvedFollowup,
    }).map((entry) => entry.id)) === JSON.stringify([liveProductId]));
  const missingTransport = resolveFollowup([]);
  check('same selected Knowledge without transported proof cannot authorize the contextual product',
    missingTransport.namedOfferingReferent.status !== 'EXACT_STRUCTURED_ENTITY'
    && knowledgeRuntime.selectCustomerServiceBusinessFactGroundingEntries({
      entries: [liveKnowledge], factOwnership: missingTransport,
    }).length === 0);
  for (const [label, options] of [
    ['unproven selected reply', { generationDetails: selectedUnproven }],
    ['missing Trace', { missing: true }],
    ['failed Trace lookup', { lookupThrows: true }],
  ]) {
    const result = await run(options);
    check(`Robot Test ${label} preserves the saved observation without creating Grounding proof`,
      result.writes.length === 1 && result.inputs[0].realizedGroundingRefs.length === 0);
  }
  const fallback = await run({ generationDetails: provenTrace, byAttempt: true });
  check('Robot Test reply-attempt lookup carries the same proven refs and tenant scope',
    fallback.queries[0].where.replyAttemptId === 'attempt'
    && fallback.queries[0].where.tenantId === 'tenant'
    && JSON.stringify(fallback.inputs[0].realizedGroundingRefs) === '["P003"]');
  const retry = await run({ generationDetails: provenTrace, conflict: true });
  check('Robot Test CAS retry retains proof while using the refreshed state revision',
    retry.writes.length === 2 && retry.writes[0].expectedRevision === 4
    && retry.writes[1].expectedRevision === 5 && retry.inputs[1].previous.revision === 5
    && JSON.stringify(retry.inputs[1].realizedGroundingRefs) === '["P003"]');
}

verifyRobotTestTransport().catch((error) => {
  check('Robot Test transport adapter execution', false, error.stack || String(error));
}).finally(() => {
  console.log(`\nR2.2 Contextual Grounded Referent Continuity: ${passed}/${passed + failed} PASS`);
  if (failed) process.exitCode = 1;
});
