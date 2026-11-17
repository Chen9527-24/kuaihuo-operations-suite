#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
let ts;
try { ts = require('typescript'); } catch { ts = require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript'); }
const root = path.resolve(__dirname, '../..');
let pass = 0, fail = 0;
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.error(`FAIL ${name}${detail ? ` :: ${detail}` : ''}`); }
}
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function syntax(rel) {
  const source = read(rel);
  const result = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, experimentalDecorators: true, esModuleInterop: true },
    reportDiagnostics: true,
    fileName: rel,
  });
  check(`${path.basename(rel)} TypeScript syntax`, !(result.diagnostics || []).some((d) => d.category === ts.DiagnosticCategory.Error));
  return source;
}
const rel = 'src/modules/customer-service-agent/admin/calibrations/customer-service-calibrations.service.ts';
const src = syntax(rel);
const dtoRel = 'src/modules/customer-service-agent/admin/calibrations/dto/apply-calibration-record.dto.ts';
const dtoSrc = syntax(dtoRel);
check('apply DTO exposes validated 1-based analysisIteration selector',
  dtoSrc.includes('analysisIteration?: number')
  && dtoSrc.includes('@IsInt()')
  && dtoSrc.includes('@Min(1)'));

const applyStart = src.indexOf('async applyCurrentTestReply(');
const applyEnd = src.indexOf('async createKnowledgeRevisionDraft(', applyStart);
const applyBlock = applyStart >= 0 && applyEnd > applyStart ? src.slice(applyStart, applyEnd) : '';
check('current test reply can be manually replaced before long-term tuning publication and follows applied historical iteration when present',
  applyBlock.includes("if (item.status === 'ARCHIVED')")
  && applyBlock.includes('appliedAnalysisIteration')
  && applyBlock.includes('selectCalibrationAnalysisVersion(item, appliedIteration)')
  && applyBlock.includes('withSelectedCalibrationAnalysis(item, selectedAnalysis)')
  && !applyBlock.includes("item.status !== 'APPLIED_TUNING'")
  && !applyBlock.includes('请先应用校准'));

const tuneStart = src.indexOf('async applyToTuning(');
const tuneEnd = src.indexOf('async applyCurrentTestReply(', tuneStart);
const tuneBlock = tuneStart >= 0 && tuneEnd > tuneStart ? src.slice(tuneStart, tuneEnd) : '';
check('understanding misclassification still cannot be auto-published as expression tuning',
  tuneBlock.includes("problemTypes.includes('UNDERSTANDING_MISCLASSIFICATION')")
  && tuneBlock.includes('不能自动发布为表达校准规则'));

check('apply-to-tuning accepts a server-resolved historical calibration iteration',
  tuneBlock.includes('selectCalibrationAnalysisVersion(item, dto.analysisIteration)')
  && src.includes('function selectCalibrationAnalysisVersion(')
  && src.includes('refinementHistorySchemaVersion')
  && src.includes('无效的校准轮次'));

check('selected iteration owns directives example and current test reply instead of silently using latest analysis',
  tuneBlock.includes('normalizeTuningDirectives(selectedAnalysis.tuningDirectives)')
  && tuneBlock.includes('preferredReply: selectedAnalysis.suggestedReply')
  && tuneBlock.includes('analysisIteration: selectedAnalysis.iteration')
  && tuneBlock.includes('withSelectedCalibrationAnalysis(record, selectedAnalysis)'));

check('applied historical iteration is auditable and same-scope switch is enforced',
  tuneBlock.includes('appliedAnalysisIteration: selectedAnalysis.iteration')
  && tuneBlock.includes('appliedAnalysisVersionCount: selectedAnalysis.totalIterations')
  && tuneBlock.includes('已生效校准切换历史轮次时必须保持原作用域'));

check('switching versions replaces the sole contribution from this record without deleting unrelated profile memory',
  tuneBlock.includes('replacingOnlyContributionFromThisRecord')
  && tuneBlock.includes('existingSourceRecordIds.length === 1')
  && tuneBlock.includes('? recordDirectives')
  && tuneBlock.includes('mergeImmediateCalibrationMemoryDirectives(recordDirectives, existingDirectives)'));

check('refinement compares full calibration output rather than suggested reply only',
  src.includes('function isMeaningfullyDifferentCalibrationOutput(')
  && src.includes('canonicalizeCalibrationRecommendationsForComparison')
  && src.includes('canonicalizeCalibrationDirectivesForComparison')
  && src.includes('stableJsonHash(previousComparable) !== stableJsonHash(nextComparable)'));

check('refinement primary/review attempts use bounded higher diversity only for refinement',
  src.includes('temperature: refinementContext ? 0.18 : 0.1')
  && src.includes('temperature: 0.32'));

check('final no-change preserves previous version instead of raising a blocking BadRequest',
  src.includes("diagnostics.finalStatus = 'REFINEMENT_NO_MEANINGFUL_CHANGE_PRESERVED'")
  && src.includes('diagnostics.refinementHistory = priorHistory')
  && src.includes('return this.get(id, user);')
  && !src.includes("throw new BadRequestException('继续校准仍未形成实质变化；上一版结果已保留"));

console.log(`\nCalibration Admin Authority + Refinement Reliability: ${pass}/${pass + fail} PASS`);
if (fail) process.exit(1);
