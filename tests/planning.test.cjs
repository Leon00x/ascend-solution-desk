const {test} = require('node:test');
const assert = require('node:assert/strict');
let planner;
try { planner = require('../planning.js'); } catch {}
const profile = {input:3069, output:512, mock:false};
const inputs = {scale:30, frequency:6, calls:1, input:3069, output:512, ttftLimit:4, tpotLimit:30, taskLimit:30, external:2};
const rows = [
  {conc:2,qps:.18,ttft:1346,ttftP99:1702,tpot:18.1,lat:10.588,prompt:554.63,completion:92.53},
  {conc:16,qps:1.22,ttft:1660,ttftP99:3629,tpot:20,lat:11.886,prompt:3734,completion:622.94},
  {conc:64,qps:3.88,ttft:2910,ttftP99:10513,tpot:22.4,lat:14.336,prompt:11900,completion:1985.41}
];
test('planner exposes demand and recommendation functions',()=>{
  assert.equal(typeof planner?.demandFor,'function');
  assert.equal(typeof planner?.planFor,'function');
});
test('Coding translates developers and multi-step tasks into separate token budgets',()=>{
  const d=planner.demandFor('coding',{...inputs,scale:100,frequency:6,calls:3,input:8192,output:1024});
  assert.equal(d.businessPerMinute,10); assert.equal(d.rpm,30);
  assert.equal(d.inputTps,4096); assert.equal(d.outputTps,512);
});
test('chat peak sessions expand into question rounds, not simultaneous users',()=>{
  const d=planner.demandFor('service',inputs);
  assert.equal(d.businessPerMinute,180); assert.equal(d.rpm,180); assert.equal(d.qps,3);
});
test('ChatBI separates user questions from model calls',()=>{
  const d=planner.demandFor('chatbi',{...inputs,scale:12,calls:2});
  assert.equal(d.businessPerMinute,12); assert.equal(d.rpm,24);
});
test('recommendation uses p99 TTFT and maximum qualified throughput',()=>{
  const p=planner.planFor('service',inputs,rows,profile);
  assert.equal(p.recommended.point.conc,16); assert.equal(p.recommended.units,3);
  assert.equal(p.options.find(x=>x.id==='capacity').withinTargets,false);
  assert.equal(p.recommended.outputTps,622.94*3);
});
test('mismatched input or output tokens never produce business capacity or equipment recommendations',()=>{
  for(const changed of [{input:8192},{output:1024}]){
    const p=planner.planFor('service',{...inputs,...changed},rows,profile);
    assert.equal(p.status,'mismatch'); assert.equal(p.recommended,null);
    for(const o of p.options){assert.equal(o.units,null);assert.equal(o.businessPerMinute,null);}
  }
});
test('no qualified sample yields no recommendation',()=>{
  const p=planner.planFor('service',{...inputs,ttftLimit:.5},rows,profile);
  assert.equal(p.status,'unmet');assert.equal(p.recommended,null);
});
test('no measured profile or rows yields no inferred deployment',()=>{
  const p=planner.planFor('chatbi',inputs,[],null);
  assert.equal(p.status,'missing'); assert.equal(p.recommended,null); assert.deepEqual(p.options,[]);
});
test('ChatBI task duration includes sequential calls and assumed external latency',()=>{
  const p=planner.planFor('chatbi',{...inputs,scale:12,calls:2,taskLimit:24},rows,profile);
  assert.equal(p.recommended.point.conc,2);
  assert.equal(p.recommended.taskSeconds,10.588*2+2);
  assert.ok(Math.abs(p.recommended.businessPerMinute-.18*60*3/2)<1e-9);
});
test('invalid and non-finite demand is rejected instead of fabricating a result',()=>{
  for(const value of [0,-1,NaN,Infinity,'']){
    assert.throws(()=>planner.demandFor('coding',{...inputs,input:value}),/输入/);
  }
});
test('Mock recommendations retain their provenance',()=>{
  const p=planner.planFor('coding',{...inputs,scale:100,frequency:6,calls:1,taskLimit:120},rows,{...profile,mock:true});
  assert.equal(p.mock,true);
});
test('output cadence target is applied in addition to first-token latency',()=>{
  const p=planner.planFor('service',{...inputs,tpotLimit:19},rows,profile);
  assert.equal(p.recommended.point.conc,2);
});
test('external execution time can exhaust the ChatBI task budget',()=>{
  const p=planner.planFor('chatbi',{...inputs,external:30},rows,profile);
  assert.equal(p.status,'unmet'); assert.equal(p.recommended,null);
});
test('fractional tokens and calls cannot silently produce a configuration',()=>{
  assert.throws(()=>planner.demandFor('coding',{...inputs,calls:1.5}),/整数/);
  assert.throws(()=>planner.demandFor('coding',{...inputs,output:1.5}),/整数/);
});
test('rounded QPS cannot overstate capacity beyond either token budget',()=>{
  const sample={conc:4,qps:.38,ttft:1562,ttftP99:2479,tpot:16.7,lat:10.083,prompt:1154.34,completion:192.58};
  const p=planner.planFor('service',{...inputs,scale:3.8},[sample],profile);
  assert.equal(p.recommended.units,2);
  assert.ok(p.recommended.inputTps>=p.demand.inputTps);
  assert.ok(p.recommended.outputTps>=p.demand.outputTps);
});

test('all scenarios express token demand per second and total equals input plus output',()=>{
  for(const scene of ['coding','service','chatbi']){
    const d=planner.demandFor(scene,inputs);
    assert.equal(d.inputTps,d.qps*3069);
    assert.equal(d.outputTps,d.qps*512);
    assert.equal(d.totalTps,d.inputTps+d.outputTps);
    assert.equal(d.inputTpm,undefined);
  }
});
 test('deployment TPS is single-suite throughput times suite count with no minute conversion',()=>{
  const p=planner.planFor('service',inputs,rows,profile);
  assert.equal(p.recommended.inputTps,3734*3);
  assert.equal(p.recommended.outputTps,622.94*3);
  assert.equal(p.recommended.totalTps,(3734+622.94)*3);
});
