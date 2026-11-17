#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const fixturePath = path.join(__dirname, 'fixtures/hve3-human-realization-goal-alignment-0r13-e1-v1.json');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
let pass=0, fail=0;
function check(name, ok, detail='') { if(ok){pass++;console.log(`[PASS] ${name}`)} else {fail++;console.error(`[FAIL] ${name}${detail?` · ${detail}`:''}`)} }
check('Final product goal remains Universal Human Realization', fixture.finalProductGoal === 'UNIVERSAL_HUMAN_REALIZATION');
check('Direction gate is dev-only', fixture.authority === 'DEVELOPMENT_DIRECTION_GATE_ONLY');
check('Runtime scope is exactly two HumanTurn generation files', Array.isArray(fixture.allowedRuntimeFiles) && fixture.allowedRuntimeFiles.length === 2 && fixture.allowedRuntimeFiles.every((f)=>/customer-service-(human-turn-realization|generation-prompt\.builder)\.ts$/.test(f)));
for (const rel of fixture.allowedRuntimeFiles) check(`Scoped Runtime file exists: ${rel}`, fs.existsSync(path.join(root, rel)));
const runtimeText = fixture.allowedRuntimeFiles.map((rel)=>fs.readFileSync(path.join(root, rel),'utf8')).join('\n');
check('No role/industry/test-sentence hardcode in scoped Runtime', !/(宠物|女装|护肤|猫|柯基|转正答辩|行业分享会|闷痘)/u.test(runtimeText));
check('No second-model-call pattern in scoped Runtime', !/responses\.create|chat\.completions|generateContent|invokeModel|secondModel|humanizerModel/iu.test(runtimeText));
check('No phrase-blacklist implementation for the observed sample', !/includes\([^\n]*(这种需求|这个情况|你的需求)/u.test(runtimeText));
check('No global ban on explanation', /不是禁止解释|PRIMARY_VALUE/.test(runtimeText));
check('Need alignment declares REALIZATION_ONLY', /needAlignment[\s\S]*?authority:\s*'REALIZATION_ONLY'/.test(runtimeText));
check('Canonical required acts are preserved', /preserveAllRequiredActs:\s*true/.test(runtimeText));
check('No new fact/permission authority', /cannotChangeFactsOrPermission:\s*true/.test(runtimeText));
check('Stop conditions explicitly include P0 regression and behavior-only shortening failure', fixture.stopConditions.some((x)=>/P0 regression/.test(x)) && fixture.stopConditions.some((x)=>/shorter wording/.test(x)));
console.log(`\n[GOAL ALIGNMENT] PASS=${pass} FAIL=${fail}`);
process.exit(fail ? 1 : 0);
