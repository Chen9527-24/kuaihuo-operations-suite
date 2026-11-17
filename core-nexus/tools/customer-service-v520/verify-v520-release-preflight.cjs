#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const runnerPath = path.join(__dirname, 'run-v520-release-preflight.cjs');
const { timestampForFile, collectChangedFileArgs, collectFirewallArgs } = require(runnerPath);
let pass=0,fail=0;
function check(name,condition,detail=''){if(condition){pass++;console.log(`PASS ${name}`)}else{fail++;console.error(`FAIL ${name}${detail?` :: ${detail}`:''}`)}}
check('preflight timestamp is filename-safe',!/[:.]/.test(timestampForFile(new Date('2026-08-15T15:21:30.123Z'))),timestampForFile(new Date('2026-08-15T15:21:30.123Z')));
const args=collectChangedFileArgs(['--changed-file','src/a.ts','--changed-file','src/b.ts']);
check('preflight preserves explicit changed-file arguments',JSON.stringify(args)===JSON.stringify(['--changed-file','src/a.ts','--changed-file','src/b.ts']),JSON.stringify(args));
const firewallArgs=collectFirewallArgs(['--changed-file','src/a.ts','--live-trace','trace-a.txt','--live-trace','trace-b.txt']);
check('preflight forwards live-trace evidence to Regression Firewall',JSON.stringify(firewallArgs)===JSON.stringify(['--changed-file','src/a.ts','--live-trace','trace-a.txt','--live-trace','trace-b.txt']),JSON.stringify(firewallArgs));
let missingRejected=false;try{collectChangedFileArgs([])}catch{missingRejected=true}
check('preflight refuses to infer an empty change set',missingRejected);
const src=fs.readFileSync(runnerPath,'utf8');
check('preflight runs the real Release Build Gate',/run-v520-release-build-gate\.cjs/.test(src));
check('preflight runs the real Regression Firewall',/run-v520-release-regression-firewall\.cjs/.test(src));
check('preflight streams stdout and stderr to both console and durable log',/process\.stdout\.write\(chunk\)/.test(src)&&/process\.stderr\.write\(chunk\)/.test(src)&&/logStream\.write\(chunk\)/.test(src));
check('preflight log lives under ignored customer-service artifacts directory',/const artifactsDir = path\.join\(__dirname, 'artifacts'\)/.test(src));
console.log(`\nRelease Preflight: ${pass}/${pass+fail} PASS`);if(fail)process.exit(1);
