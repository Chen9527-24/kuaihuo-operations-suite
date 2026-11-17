#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const runnerPath = path.join(__dirname, 'run-v520-release-build-gate.cjs');
const { parsePackageManager, packageManagerInvocation, classifyBuildFailure } = require(runnerPath);
let pass=0,fail=0;
function check(name,condition,detail=''){if(condition){pass++;console.log(`PASS ${name}`)}else{fail++;console.error(`FAIL ${name}${detail?` :: ${detail}`:''}`)}}
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const declared=parsePackageManager(pkg.packageManager);
check('release build gate uses project-declared package manager',declared?.name==='pnpm'&&declared?.version==='9.15.0',JSON.stringify(declared));
const winInvocation=packageManagerInvocation('pnpm',['--version'],'win32','C:/Windows/System32/cmd.exe');
const posixInvocation=packageManagerInvocation('pnpm',['--version'],'linux');
check('Windows release build invokes pnpm.cmd through cmd.exe',winInvocation.command==='C:/Windows/System32/cmd.exe'&&JSON.stringify(winInvocation.args)===JSON.stringify(['/d','/c','pnpm.cmd','--version']),JSON.stringify(winInvocation));
check('POSIX release build keeps direct pnpm executable',posixInvocation.command==='pnpm'&&JSON.stringify(posixInvocation.args)===JSON.stringify(['--version']),JSON.stringify(posixInvocation));
check('missing executable is classified as environment blocker',classifyBuildFailure({error:{code:'ENOENT'},stdout:'',stderr:''})==='BUILD_ENVIRONMENT_BLOCKED');
check('missing module build failure is classified as environment blocker',classifyBuildFailure({stdout:'',stderr:"Error: Cannot find module '@nestjs/common'"})==='BUILD_ENVIRONMENT_BLOCKED');
check('TypeScript compile failure remains a real build failure',classifyBuildFailure({stdout:'',stderr:"src/x.ts(1,1): error TS2322: Type 'string' is not assignable to type 'number'."})==='BUILD_FAIL');
const runnerSrc=fs.readFileSync(runnerPath,'utf8');
check('release build requires node_modules instead of fabricating dependencies',runnerSrc.includes("node_modules is absent; release build cannot be proven"));
check('release build requires exact declared pnpm version',runnerSrc.includes('pnpm version mismatch: expected='));
check('release build executes the real project build script',runnerSrc.includes("['run', 'build']"));
check('release build routes both version probe and build through platform-aware package-manager spawn', /spawnPackageManager\(declared\.name, \['--version'\]/.test(runnerSrc) && /spawnPackageManager\(declared\.name, \['run', 'build'\]/.test(runnerSrc));
const runtimeFiles=[];
function walk(dir){if(!fs.existsSync(dir))return;for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())walk(f);else if(/\.ts$/.test(f))runtimeFiles.push(f)}}
walk(path.join(root,'src/modules/customer-service-agent/runtime'));
const leaks=runtimeFiles.filter((f)=>/release-build-gate|run-v520-release-build/i.test(fs.readFileSync(f,'utf8'))).map((f)=>path.relative(root,f));
check('Runtime never imports or references release build gate',leaks.length===0,leaks.join(', '));
console.log(`\nRelease Build Gate: ${pass}/${pass+fail} PASS`);if(fail)process.exit(1);
