'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');

const cache = new Map();

function loadFinalHumanTurnCompiler(root) {
  const key = path.resolve(root);
  if (cache.has(key)) return cache.get(key);
  const rel = 'src/modules/customer-service-agent/runtime/generation/customer-service-final-realization-authority.ts';
  const src = fs.readFileSync(path.join(root, rel), 'utf8');
  const instrumented = `${src}\nexports.__compile = compileCustomerServiceFinalModelFacingHumanTurn;\n`;
  const out = ts.transpileModule(instrumented, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    reportDiagnostics: true,
    fileName: rel,
  });
  const errors = (out.diagnostics || []).filter((d) => d.category === ts.DiagnosticCategory.Error);
  if (errors.length) throw new Error(`Final HumanTurn compiler transpile failed: ${errors.length}`);
  const sandbox = { exports: {}, module: { exports: {} }, require: () => ({}), console };
  sandbox.module.exports = sandbox.exports;
  vm.runInNewContext(out.outputText, sandbox, { filename: rel });
  const compile = sandbox.exports.__compile;
  if (typeof compile !== 'function') throw new Error('Final HumanTurn compiler not executable');
  const loaded = { compile, source: src, rel };
  cache.set(key, loaded);
  return loaded;
}

function defaultContract(pc = {}) {
  return {
    businessContext: {
      conversationStrategy: {
        policy: {
          humanBehavior: {
            naturalness: 'AUTO',
            responseDensity: 'AUTO',
            colloquiality: 'AUTO',
            questionFrequency: 'AUTO',
            businessAdvance: 'AUTO',
            returningContinuity: 'AUTO',
            emoji: 'AUTO',
            identityExposure: 'AUTO',
            segmentation: 'AUTO',
            ...pc,
          },
        },
      },
    },
  };
}

function normalizeFrame(input = {}) {
  const hasExplicitActs = Boolean(input && Object.prototype.hasOwnProperty.call(input, 'acts'));
  const frame = structuredCloneSafe(input);
  frame.interaction ||= { completion: 'CONTINUE' };
  frame.interaction.completion ??= 'CONTINUE';
  frame.acts ||= { required: [], preferred: [], optional: [], forbidden: [] };
  frame.acts.required ||= [];
  frame.acts.preferred ||= [];
  frame.acts.optional ||= [];
  frame.acts.forbidden ||= [];
  frame.serviceRealization ||= {};
  frame.serviceRealization.currentTurnValue ||= { mode: 'DIRECT', mustAddBeyondKnown: false };
  frame.serviceRealization.currentTurnValue.mode ??= 'DIRECT';
  frame.serviceRealization.currentTurnValue.mustAddBeyondKnown ??= false;
  frame.serviceRealization.contribution ||= { target: 'DIRECT_ANSWER', avoidReframeOnly: false, contributeBeforeOptionalAsk: false };
  frame.serviceRealization.contribution.target ??= 'DIRECT_ANSWER';
  frame.serviceRealization.contribution.avoidReframeOnly ??= false;
  frame.serviceRealization.contribution.contributeBeforeOptionalAsk ??= false;
  frame.serviceRealization.identity ||= { mode: 'NONE', stopAfterAnswer: false };
  frame.serviceRealization.identity.mode ??= 'NONE';
  frame.serviceRealization.identity.stopAfterAnswer ??= false;

  frame.humanTurnRealization ||= {};
  const h = frame.humanTurnRealization;
  h.persona ||= {};
  h.persona.corePresenceFidelity ||= { warmth: 50, directness: 50, formality: 50, energy: 50, playfulness: 0, emotionalExpressiveness: 40 };
  h.needAlignment ||= {};
  h.needAlignment.primaryContribution ??= 'ANSWER';
  h.needAlignment.acknowledgementRealization ??= 'NONE';
  h.needAlignment.explanationRole ??= 'MINIMAL';
  h.needAlignment.openingBias ??= 'PRIMARY_FIRST';
  h.participation ||= {};
  h.participation.questionDisposition ??= 'NONE';
  h.turnComposition ||= {};
  h.turnComposition.semanticDelta ||= {};
  h.turnComposition.semanticDelta.responseTarget ||= {};
  h.turnComposition.semanticDelta.responseTarget.requestedSpecificity ??= 'DIRECTION';
  h.turnComposition.semanticDelta.responseTarget.requiredDelta ??= 'NONE';
  h.sharedContext ||= {};
  h.sharedContext.priorContributionStatus ??= 'UNRESOLVED';
  h.sharedContext.priorContributionReuse ??= 'NORMAL';
  h.sharedContext.avoidEvaluativeReceptionBeforeValue ??= true;
  h.sharedContext.mustAdvanceBeyondGiven ??= true;
  h.conversationReality ||= {};
  h.conversationReality.continuity ||= {};
  h.conversationReality.continuity.recentRequestedDeltas ||= [];
  h.conversationReality.continuity.lastAssistantMoveAccepted ??= null;
  h.conversationReality.continuity.lastAssistantMoveRejected ??= false;
  h.conversationReality.currentFeedback ||= {};
  h.conversationReality.currentFeedback.reception ??= 'UNCLEAR';
  h.conversationReality.currentFeedback.correctionTarget ??= null;
  h.conversationReality.currentFeedback.requestedDeltas ||= [];
  h.surfaceBudget ||= {};
  h.surfaceBudget.completionPolicy ??= 'STOP_WHEN_ENOUGH';
  h.surfaceBudget.stopAfterQuestion ??= false;
  h.turnShape ||= {};
  h.turnShape.stopBias ??= 'MEDIUM';
  h.texture ||= {};
  h.texture.spokenRegister ??= 'HIGH';
  h.texture.brevity ??= 'BALANCED';
  h.texture.sentenceShape ??= 'MIXED';
  h.texture.fragmentAllowance ??= 'MEDIUM';
  h.texture.ellipsisAllowance ??= 'LOW';
  h.texture.rhythmVariation ??= 'MEDIUM';
  h.texture.connectiveDensity ??= 'LOW';
  h.texture.explicitReasoning ??= 'LOW';
  h.texture.completionCadence ??= 'LOW';
  h.texture.sentenceParticleLevel ??= 'LOW';
  h.texture.emoji ??= 'NONE';
  h.antiAiCadence ||= {};
  h.antiAiCadence.avoidRecapBeforeValue ??= true;
  h.antiAiCadence.preferImplicitTransitions ??= true;
  h.antiAiCadence.avoidSelfProcessNarration ??= true;
  h.adaptation ||= {};
  h.adaptation.customerMessageShape ??= 'NORMAL';
  h.adaptation.relationshipDistance ??= 'NEUTRAL';
  h.adaptation.mirrorIntensity ??= 'BALANCED';
  h.adaptation.varyFromRecentStructure ??= false;
  // Older Final-HumanTurn fixtures described their intended Canonical selection
  // only through realization fields. Production never does that: it compiles both
  // from one Plan. Keep those fixtures coherent now that compatibility views are
  // deliberately derived from Canonical Acts.
  if (!hasExplicitActs) synthesizeCanonicalActsForLegacyFixture(frame);
  return frame;
}

function synthesizeCanonicalActsForLegacyFixture(frame) {
  const add = (bucket, type) => {
    if (frame.acts.required.some((item) => item.type === type)
      || frame.acts.preferred.some((item) => item.type === type)
      || frame.acts.optional.some((item) => item.type === type)) return;
    frame.acts[bucket].push({ type, semantic: `Fixture-selected ${type}.`, authorityScope: 'PLAN_ONLY' });
  };
  const h = frame.humanTurnRealization;
  if (h.needAlignment.acknowledgementRealization === 'EXPLICIT_REQUIRED') add('required', 'PRESENCE_ACK');
  else if (h.needAlignment.acknowledgementRealization !== 'NONE') add('preferred', 'LIGHT_ACK');

  const identityActs = {
    AI_TRUTHFUL: 'DISCLOSE_AI_IDENTITY',
    PUBLIC_NAME: 'DISCLOSE_NAME',
    CONFIRM_RELATION: 'CONFIRM_ROLE',
    PUBLIC_IDENTITY: 'DISCLOSE_PUBLIC_IDENTITY',
    SERVICE_SCOPE: 'EXPLAIN_SERVICE_SCOPE',
  };
  if (identityActs[frame.serviceRealization.identity.mode]) add('required', identityActs[frame.serviceRealization.identity.mode]);

  if (h.participation.questionDisposition === 'REQUIRED') add('required', 'REQUEST_REQUIRED_SLOT');
  else if (h.participation.questionDisposition === 'ASK_ONE_IF_DECISION_RELEVANT') add('optional', 'REQUEST_OPTIONAL_PREFERENCE');

  const valueActs = {
    DIRECT_ANSWER: 'DIRECT_ANSWER',
    USEFUL_DIRECTION: 'PROVIDE_GENERAL_GUIDANCE',
    GROUNDED_FACT: 'EXPLAIN_GROUNDED_FACT',
    TASK_ADVANCE: 'REPORT_STATUS',
  };
  if (valueActs[frame.serviceRealization.contribution.target]) add('required', valueActs[frame.serviceRealization.contribution.target]);
}

function compileFinalHumanTurn(root, frame, pc = {}) {
  const { compile } = loadFinalHumanTurnCompiler(root);
  return compile(defaultContract(pc), normalizeFrame(frame));
}

function structuredCloneSafe(value) {
  return value == null ? {} : JSON.parse(JSON.stringify(value));
}

module.exports = {
  loadFinalHumanTurnCompiler,
  defaultContract,
  normalizeFrame,
  compileFinalHumanTurn,
};
