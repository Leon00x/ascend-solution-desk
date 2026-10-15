const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname,'..');

async function page(t){
  const {Window} = await import('happy-dom');
  // Evaluate only checked-in application source; no external resources are loaded.
  const w = new Window({url:'http://localhost/',settings:{enableJavaScriptEvaluation:true,disableJavaScriptFileLoading:true,disableCSSFileLoading:true,suppressInsecureJavaScriptEnvironmentWarning:true}});
  t.after(()=>w.happyDOM.close());
  const source=fs.readFileSync(path.join(root,'index.html'),'utf8');
  w.document.write(source.replace(/<script[\s\S]*?<\/script>/g,''));
  for(const name of ['planning.js','planning-ui.js']) vm.runInContext(fs.readFileSync(path.join(root,name),'utf8'),w,{filename:name});
  vm.runInContext([...source.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1],w,{filename:'index.html'});
  const $=s=>w.document.querySelector(s);
  const input=(key,value)=>{const el=$(`[data-field="${key}"]`);el.value=String(value);el.dispatchEvent(new w.Event('input'));};
  const change=(selector,value)=>{const el=$(selector);el.value=value;el.dispatchEvent(new w.Event('change'));};
  return {w,$,input,change};
}
test('page initializes with chat business load and tokens only in the configuration panel',async t=>{
  const {$}=await page(t);
  assert.equal($('#scenarioStrip').textContent.includes('tokens'),false);
  assert.equal($('#businessFields [data-field="input"]').value,'3069');
  assert.match($('#demandSummary').textContent,/3QPS/);
  assert.match($('#tierGrid').textContent,/推荐配置/);
  assert.match($('.tier-card.selected .tier-capacity').textContent,/QPS/);
});
test('Coding and ChatBI display different demand units and save independent input values',async t=>{
  const {$,input}=await page(t);
  $('[data-index="0"]').click();
  assert.match($('#demandSummary').textContent,/3,413.33TPS/);
  assert.match($('.tier-card.selected .tier-capacity').textContent,/TPS/);
  input('scale',200);
  $('[data-index="2"]').click();
  assert.match($('#demandSummary').textContent,/0.4QPS/);
  assert.ok($('[data-field="external"]'));
  assert.match($('#tierGrid').textContent,/平均问数完成粗估/);
  $('[data-index="0"]').click(); assert.equal($('[data-field="scale"]').value,'200');
});
test('mismatched load suppresses deployment in cards, multiplier, experience and demo replies',async t=>{
  const {w,$,input}=await page(t);
  input('input',8192);
  assert.match($('#planNotice').textContent,/不匹配/);
  assert.equal($('#multInput'),null);
  assert.equal($('.tier-capacity'),null);
  assert.equal(/\d+ 套 · \d+ 台/.test($('#tierGrid').textContent),false);
  $('[data-tier="1"]').click();
  assert.equal($('.tier-capacity'),null);
  assert.match(w.eval('mockReply("多少用户 QPS")'),/没有可用的容量估算/);
  $('#restoreLoad').click();
  assert.match($('.tier-card.selected .tier-capacity').textContent,/QPS/);
});
test('no target match and unavailable chips do not leave stale deployment estimates',async t=>{
  const {$,input,change}=await page(t);
  input('ttftLimit',.5);
  assert.match($('#planNotice').textContent,/没有测试点/);
  assert.equal($('.tier-card.selected'),null);
  assert.equal($('#miniSend').disabled,true);
  change('#planChip','950DT');
  assert.match($('#planNotice').textContent,/暂无对应/);
  assert.equal($('.tier-card.selected .tier-capacity'),null);
  assert.equal($('#miniSend').disabled,true);
});
test('Coding Agent preset requires its own load and preserves response targets when restored',async t=>{
  const {$,change}=await page(t);
  $('[data-index="0"]').click();
  change('#codingPreset','agent');
  assert.equal($('[data-field="input"]').value,'32768');
  assert.match($('#planNotice').textContent,/不匹配/);
  $('#restoreLoad').click();
  assert.equal($('[data-field="input"]').value,'8192');
  assert.equal($('[data-field="ttftLimit"]').value,'8');
  assert.ok($('.tier-card.selected .tier-capacity'));
});
test('Coding defaults to developer count and one usage tier with four collapsed parameters',async t=>{
  const {$}=await page(t); $('[data-index="0"]').click();
  assert.equal($('[data-field="scale"]').getAttribute('aria-label'),'开发者人数');
  assert.equal($('#codingPreset').value,'collaboration');
  assert.equal($('#codingAdvanced').open,false);
  assert.equal($('#codingAdvanced').querySelectorAll('[data-field]').length,4);
  assert.match($('#codingLoadSummary').textContent,/60.*2.*8,192.*1,024/);
});
test('custom Coding values survive collapse and presets replace only the four bundled values',async t=>{
  const {$,input,change}=await page(t); $('[data-index="0"]').click();
  input('scale',200); $('#codingAdvanced').open=true;
  input('frequency',75); input('calls',4);
  assert.equal($('#codingPreset').value,'custom');
  $('#codingAdvanced').open=false;
  assert.equal($('[data-field="frequency"]').value,'75');
  change('#codingPreset','assist');
  assert.equal($('[data-field="scale"]').value,'200');
  assert.equal($('[data-field="frequency"]').value,'30');
  assert.equal($('[data-field="calls"]').value,'1');
  assert.equal($('[data-field="input"]').value,'8192');
  assert.equal($('[data-field="output"]').value,'1024');
  assert.equal($('[data-field="ttftLimit"]').value,'8');
});
test('invalid entry removes previous capacity and recovers without changing focus',async t=>{
  const {$,input}=await page(t);
  const el=$('[data-field="scale"]');el.focus();
  input('scale','');
  assert.match($('#planNotice').textContent,/业务规模/);
  assert.equal($('.tier-card.selected .tier-capacity'),null);
  input('scale',60);
  assert.match($('#demandSummary').textContent,/6QPS/);
  assert.equal(el.ownerDocument.activeElement,el);
});
test('configuration cards contain deployment size and capacity and sync the step two preview',async t=>{
  const {$}=await page(t);
  assert.match($('.tier-card.selected .tier-need').textContent,/3 套 · 6 台/);
  assert.equal($('#plus'),null);
  assert.match($('.tier-card.selected .tier-need').textContent,/3 套 · 6 台/);
  $('[data-tier="2"]').click();
  assert.match($('.tier-card.selected .tier-state').textContent,/超出所设响应目标/);
  assert.equal($('#previewPlan').value,'2');
  assert.match($('#miniTierMeta').textContent,/高容量方案/);
});
test('changing scenario cancels an in-flight replay before it writes old output',async t=>{
  const {w,$}=await page(t);
  const replay=w.eval('runReplay({preventDefault(){}})');
  assert.equal($('#miniSend').disabled,true);
  $('[data-index="0"]').click();
  await replay;
  assert.match($('#miniAnswer').textContent,/代码/);
  assert.equal($('#miniSend').disabled,false);
});
test('a complete local replay restores the send button',async t=>{
  const {w,$}=await page(t);
  w.setTimeout=resolve=>{queueMicrotask(resolve);return 1;};
  await w.eval('runReplay({preventDefault(){}})');
  assert.match($('#miniAnswer').textContent,/订单/);
  assert.match($('#miniStatus').textContent,/完成/);
  assert.equal($('#miniSend').disabled,false);
});
test('Mock chart scales to its new workload and navigation still renders benchmarks',async t=>{
  const {$}=await page(t);
  $('[data-index="0"]').click();
  for(const point of $('#chartSvg polyline').getAttribute('points').split(' ')){
    assert.ok(Number(point.split(',')[1])>=50);
  }
  $('[data-view="benchmarks"]').click();
  assert.equal($('#benchmarks').classList.contains('active'),true);
  assert.match($('#dataTabNote').textContent,/8,192/);
  assert.equal($('#benchmarkRows2').children.length,5);
});
test('completed capacity replies are cleared when the business load changes',async t=>{
  const {w,$,input}=await page(t);
  w.setTimeout=resolve=>{queueMicrotask(resolve);return 1;};
  $('#miniInput').value='QPS 容量';
  await w.eval('runReplay({preventDefault(){}})');
  assert.match($('#miniAnswer').textContent,/3 套 1P1D/);
  input('input',8192);
  assert.equal($('#miniAnswer').textContent.includes('3 套 1P1D'),false);
  assert.equal($('.tier-card.selected .tier-capacity'),null);
});
test('changing selected configuration clears replies calculated for the prior scale',async t=>{
  const {w,$}=await page(t);
  w.setTimeout=resolve=>{queueMicrotask(resolve);return 1;};
  $('#miniInput').value='QPS';
  await w.eval('runReplay({preventDefault(){}})');
  assert.match($('#miniAnswer').textContent,/3 套 1P1D/);
  $('[data-tier="2"]').click();
  assert.equal($('#miniAnswer').textContent.includes('3 套 1P1D'),false);
  assert.match($('.tier-card.selected .tier-need').textContent,/1 套/);
});
test('large scene-specific experience is in step two before configuration cards',async t=>{
  const {$}=await page(t);
  assert.ok($('#experienceStep #miniExperience'));
  assert.ok($('#experienceStep #targetFields'));
  assert.equal($('#solutions').textContent.includes('配置倍数'),false);
  assert.ok($('#experienceStep').compareDocumentPosition($('#tierGrid')) & 4);
  assert.equal($('#miniExperience').dataset.scene,'service');
  $('[data-index="0"]').click();
  assert.equal($('#miniExperience').dataset.scene,'coding');
  assert.ok($('#miniStage pre code#miniAnswer'));
});
test('Coding preview produces code while chat and ChatBI use their own examples',async t=>{
  const {w,$}=await page(t);
  w.setTimeout=resolve=>{queueMicrotask(resolve);return 1;};
  $('[data-index="0"]').click();
  await w.eval('runReplay({preventDefault(){}})');
  assert.match($('#miniAnswer').textContent,/async function|Promise/);
  $('[data-index="2"]').click();
  await w.eval('runReplay({preventDefault(){}})');
  assert.match($('#miniAnswer').textContent,/SELECT/);
  assert.match($('#miniAnswer').textContent,/待接入|示例/);
});
test('step two preview selection and configuration cards stay synchronized',async t=>{
  const {$,change}=await page(t);
  change('#previewPlan','1');
  assert.equal($('[data-tier="1"]').getAttribute('aria-pressed'),'true');
  assert.match($('#miniTierMeta').textContent,/低延迟方案/);
});
test('experience tier sits with response targets and fills editable p99 TTFT and avg TPOT',async t=>{
  const {$,change,input}=await page(t);
  assert.ok($('.experience-targets #previewPlan'));
  assert.equal($('#miniExperience #previewPlan'),null);
  change('#previewPlan','1');
  assert.equal($('[data-field="ttftLimit"]').value,'1.71');
  assert.equal($('[data-field="tpotLimit"]').value,'18.1');
  assert.match($('#previewTargetHint').textContent,/p99/);
  input('ttftLimit',4);input('tpotLimit',30);
  assert.equal($('[data-field="ttftLimit"]').value,'4');
  assert.equal($('[data-field="tpotLimit"]').value,'30');
  assert.ok($('.tier-card.selected .tier-capacity'));
});
test('mismatched reference tiers never overwrite business latency targets',async t=>{
  const {$,change,input}=await page(t);
  input('input',8192);change('#previewPlan','1');
  assert.equal($('[data-field="ttftLimit"]').value,'4');
  assert.equal($('[data-field="tpotLimit"]').value,'30');
  assert.match($('#previewTargetHint').textContent,/不回填/);
  assert.equal($('.tier-card.selected .tier-capacity'),null);
});
test('ordinary requests mentioning users or concurrent code are not capacity questions',async t=>{
  const {w,$}=await page(t);
  $('[data-index="0"]').click();
  assert.match(w.eval('mockReply("实现用户登录函数")'),/async function/);
  assert.match(w.eval('mockReply("实现并发请求")'),/async function/);
  $('[data-index="2"]').click();
  assert.match(w.eval('mockReply("查询每个用户本月消费")'),/SELECT/);
});
test('both benchmark panels expose token-length filters for actual available loads',async t=>{
  const {$}=await page(t);
  for(const suffix of ['', '2']){
    assert.equal($('#inputLengthFilter'+suffix).value,'3069');
    assert.equal($('#outputLengthFilter'+suffix).value,'512');
  }
  $('[data-index="0"]').click();
  assert.equal($('#inputLengthFilter').value,'8192');
  assert.equal($('#outputLengthFilter2').value,'1024');
  assert.equal($('#benchmarkRows').children.length,5);
});
test('benchmark token lengths become unavailable when the chosen model has no data',async t=>{
  const {$,change}=await page(t);
  $('#chartTip').style.display='block';
  change('#modelFilter','GLM-5.3 Flash · 待采集');
  assert.equal($('#inputLengthFilter').disabled,true);
  assert.equal($('#outputLengthFilter').disabled,true);
  assert.equal($('#inputLengthFilter').value,'');
  assert.match($('#rowCount').textContent,/0 条/);
  assert.equal($('#inputLengthFilter2').disabled,false);
  assert.equal($('#chartTip').style.display,'none');
  assert.equal($('#chartSvg').onpointermove,null);
});
test('token filtering keeps real input-output pairs separate without changing business demand',async t=>{
  const {w,$,change}=await page(t);
  vm.runInContext(`benchmarkSets.push(
    {chip:'910B',model:'DeepSeek V4 Flash 0731',input:3069,output:1024,rows:[{...data[0],conc:90}]},
    {chip:'910B',model:'DeepSeek V4 Flash 0731',input:8192,output:2048,rows:[{...data[0],conc:99}]}
  );renderChartAndTable();`,w);
  const demand=$('#demandSummary').textContent;
  change('#outputLengthFilter','1024');
  assert.equal($('#benchmarkRows').children.length,1);
  assert.equal($('#benchmarkRows tr td').textContent,'90');
  change('#inputLengthFilter','8192');
  assert.equal($('#outputLengthFilter').value,'2048');
  assert.equal($('#outputLengthFilter').options.length,1);
  assert.equal($('#benchmarkRows tr td').textContent,'99');
  assert.equal($('#demandSummary').textContent,demand);
  assert.equal($('[data-field="input"]').value,'3069');
  assert.equal($('#benchmarkRows2').children.length,13);
  assert.match($('#homeDataNote').textContent,/8,192.*2,048/);
});

test('standalone performance experience page is removed and inline replay still works',async t=>{
  const {w,$}=await page(t);
  assert.ok(!$('#experience'));
  assert.ok(!$('[data-view="experience"]'));
  assert.ok(!$('#chatForm'));
  assert.equal(w.document.querySelectorAll('.nav button').length,2);
  w.setTimeout=resolve=>{queueMicrotask(resolve);return 1;};
  await w.eval('runReplay({preventDefault(){}})');
  assert.match($('#miniStatus').textContent,/完成/);
  $('[data-view="benchmarks"]').click();
  assert.equal($('#benchmarks').classList.contains('active'),true);
  $('[data-view="solutions"]').click();
  assert.ok($('#solutions.active #miniExperience'));
});

test('every scene exposes workload-specific QPS and input/output/total TPS in steps one and two',async t=>{
  const {$}=await page(t);
  for(const scene of [0,1,2]){
    $('[data-index="'+scene+'"]').click();
    const demand=$('#demandSummary').textContent;
    assert.match(demand,/QPS/);assert.match(demand,/需求输入 TPS/);assert.match(demand,/需求输出 TPS/);assert.match(demand,/需求总吞吐/);
    assert.match($('#demandLoad').textContent,/输入.*输出.*tokens/);
    const measured=$('#experienceMetrics').textContent;
    for(const label of ['输入 TPS','输出 TPS','总吞吐','QPS','Decode TPS'])assert.ok(measured.includes(label),label);
    assert.match($('#experienceLoad').textContent,/单套.*并发/);
    assert.equal($('#solutions').textContent.includes('TPM'),false);
  }
});
 test('step two labels reference-only throughput for unmatched loads and clears metrics without data',async t=>{
  const {$,input,change}=await page(t);
  input('input',8192);
  assert.match($('#experienceLoad').textContent,/不匹配/);
  change('#previewPlan','1');
  assert.match($('#experienceLoad').textContent,/3,069.*512/);
  assert.match($('#experienceLoad').textContent,/不匹配/);
  change('#planChip','950DT');
  assert.match($('#experienceMetrics').textContent,/待测/);
  assert.equal($('#experienceMetrics [data-metric="totalTps"] strong').textContent,'—');
});
 test('business workload matches exact token-length benchmark records when available',async t=>{
  const {w,$,input}=await page(t);
  vm.runInContext(`benchmarkSets.push({chip:'910B',model:'DeepSeek V4 Flash 0731',input:8192,output:2048,rows:[{...data[0],conc:99,qps:.1,prompt:819.2,completion:204.8,total:1024}]});`,w);
  input('input',8192);input('output',2048);
  assert.match($('#experienceLoad').textContent,/8,192.*2,048/);
  assert.equal($('#planNotice').textContent.includes('不匹配'),false);
  assert.equal($('#experienceMetrics [data-metric="totalTps"] strong').textContent,'1,024');
  assert.match($('#miniTierMeta').textContent,/99 并发/);
});
test('business model selector is available in every scene with independent saved selections',async t=>{
  const {$,change}=await page(t);
  assert.ok($('#businessFields #businessModel'));
  assert.equal($('#businessModel').value,'DeepSeek V4 Flash 0731');
  change('#businessModel','GLM-5.3 · Mock 数据');
  $('[data-index="0"]').click();
  assert.equal($('#businessModel').value,'GLM-5.3 · Mock 数据');
  change('#businessModel','DeepSeek V4 Flash 0731');
  $('[data-index="1"]').click();
  assert.equal($('#businessModel').value,'GLM-5.3 · Mock 数据');
  assert.equal($('#planChip').value,'910C');
  $('[data-index="0"]').click();
  assert.equal($('#businessModel').value,'DeepSeek V4 Flash 0731');
  assert.equal($('#planChip').value,'910B');
  $('[data-index="2"]').click();assert.ok($('#businessModel'));
});
test('changing model uses only its records and preserves business assumptions',async t=>{
  const {$,change}=await page(t);
  const demand=$('#demandSummary').textContent;
  change('#businessModel','GLM-5.3 · Mock 数据');
  assert.equal($('[data-field="input"]').value,'3069');
  assert.equal($('[data-field="output"]').value,'512');
  assert.equal($('#demandSummary').textContent,demand);
  assert.match($('#planNotice').textContent,/不匹配/);
  assert.match($('#experienceLoad').textContent,/GLM-5.3/);
  assert.match($('#experienceLoad').textContent,/Mock/);
  assert.equal($('#modelFilter').value,'GLM-5.3 · Mock 数据');
  assert.equal($('#inputLengthFilter').value,'8192');
  $('#restoreLoad').click();
  assert.ok($('.tier-card.selected .tier-capacity'));
  assert.match($('#miniTierMeta').textContent,/Mock/);
});
test('a model without data clears prior performance but keeps calculated demand',async t=>{
  const {$,change}=await page(t);
  const demand=$('#demandSummary').textContent;
  change('#businessModel','GLM-5.3 Flash · 待采集');
  assert.equal($('#demandSummary').textContent,demand);
  assert.match($('#businessModelHint').textContent,/待采集/);
  assert.equal($('#miniSend').disabled,true);
  assert.equal($('#experienceMetrics [data-metric="totalTps"] strong').textContent,'—');
  assert.equal($('.tier-capacity'),null);
  assert.equal($('#benchmarkRows').children.length,1);
  assert.match($('#rowCount').textContent,/0 条/);
  change('#businessModel','DeepSeek V4 Flash 0731');
  assert.ok($('.tier-card.selected .tier-capacity'));
});
test('chat business load uses a compact preset with three collapsed editable values',async t=>{
  const {$}=await page(t);
  assert.ok($('#businessFields #businessModel'));
  assert.ok($('#businessFields > [class="model-field"] [data-field="scale"]'));
  assert.equal($('#servicePreset').value,'dialogue');
  assert.equal($('#serviceAdvanced').open,false);
  assert.equal($('#serviceAdvanced').querySelectorAll('[data-field]').length,3);
  assert.match($('#serviceLoadSummary').textContent,/6.*3,069.*512/);
  assert.match($('#demandSummary').textContent,/3QPS/);
});
test('chat presets preserve volume, model and targets and support persistent custom load',async t=>{
  const {$,input,change}=await page(t);
  input('scale',60);$('#serviceAdvanced').open=true;
  input('frequency',8);
  assert.equal($('#servicePreset').value,'custom');
  $('#serviceAdvanced').open=false;
  assert.equal($('[data-field="frequency"]').value,'8');
  change('#servicePreset','knowledge');
  assert.equal($('[data-field="scale"]').value,'60');
  assert.equal($('#businessModel').value,'DeepSeek V4 Flash 0731');
  assert.equal($('[data-field="ttftLimit"]').value,'4');
  assert.equal($('[data-field="input"]').value,'8192');
  assert.equal($('[data-field="output"]').value,'1024');
  assert.match($('#planNotice').textContent,/不匹配/);
  input('output',768);
  $('[data-index="0"]').click();$('[data-index="1"]').click();
  assert.equal($('#servicePreset').value,'custom');
  assert.equal($('[data-field="output"]').value,'768');
  assert.equal($('[data-field="scale"]').value,'60');
});
test('restoring measured chat load updates preset classification without overwriting round count',async t=>{
  const {$,change}=await page(t);
  change('#servicePreset','brief');
  assert.match($('#planNotice').textContent,/不匹配/);
  $('#restoreLoad').click();
  assert.equal($('#servicePreset').value,'custom');
  assert.equal($('[data-field="frequency"]').value,'3');
  assert.equal($('[data-field="input"]').value,'3069');
  assert.equal($('[data-field="output"]').value,'512');
  assert.ok($('.tier-card.selected .tier-capacity'));
});
