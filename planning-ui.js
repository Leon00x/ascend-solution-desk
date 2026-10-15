// Scenario inputs and presentation. All capacity decisions come from ScenarioPlanner.
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const sceneConfigs = {
  coding:{focus:'吞吐 TPS · 任务处理能力',scaleLabel:'开发者人数',scaleUnit:'人',frequencyLabel:'每人每小时交互',frequencyUnit:'次 / 时',callsLabel:'每次交互模型调用',businessUnit:'交互 / 分钟',
    description:'填写开发者人数，选择使用档位，即可估算输入 / 输出 TPS。档位包含交互频率、调用次数与输入输出负载，也可展开自行调整。',
    assumption:'开发者人数 × 每人每小时交互次数 ÷ 60 × 每次交互调用数 = 模型调用 / 分钟。档位为演示假设，不是实测使用率；按所填人数参与所选强度估算。多步调用按串行、相同平均负载粗估，未计缓存与重试。',
    defaults:{scale:100,frequency:60,calls:2,input:8192,output:1024,ttftLimit:8,tpotLimit:30,taskLimit:120,external:0}},
  service:{focus:'首字 TTFT · 输出流畅度',scaleLabel:'高峰每分钟新会话',scaleUnit:'会话 / 分',frequencyLabel:'每会话问答轮数',frequencyUnit:'轮',businessUnit:'问答 / 分钟',
    description:'选择模型、填写高峰会话量，再选择使用档位。轮数与输入输出长度自动带入，也可展开自定义；优先保障首字等待与输出流畅度。',
    assumption:'高峰新会话 / 分钟 × 每会话问答轮数 = 问答 / 分钟。档位是可调整的演示假设，不是实测使用率。按高峰稳态估算，每轮一次模型调用；新会话数不等于同时在线人数。',
    defaults:{scale:30,frequency:6,calls:1,input:3069,output:512,ttftLimit:4,tpotLimit:30,taskLimit:30,external:0}},
  chatbi:{focus:'首字 TTFT · 问数完成时间',scaleLabel:'高峰每分钟问题',scaleUnit:'问题 / 分',callsLabel:'每问题模型调用',businessUnit:'问题 / 分钟',
    description:'把问数拆成 SQL 生成、数据库执行与结果总结。优先关注首字反馈，同时评估得到完整分析结果的平均耗时。',
    assumption:'问题 / 分钟 × 每问题模型调用数 = 模型调用 / 分钟。SQL 与总结按相同平均负载、串行调用粗估；数据库执行等外部耗时为客户假设，未实测。',
    defaults:{scale:12,frequency:1,calls:2,input:3069,output:512,ttftLimit:4,tpotLimit:40,taskLimit:30,external:2}}
};
const codingPresets = {
  assist:{frequency:30,calls:1,input:8192,output:1024},
  collaboration:{frequency:60,calls:2,input:8192,output:1024},
  agent:{frequency:120,calls:5,input:32768,output:2048}
};
const codingPresetNames={assist:'轻度 · 辅助编程',collaboration:'中度 · 持续协作',agent:'重度 · Agent 密集使用',custom:'自定义'};
const servicePresets={
  brief:{frequency:3,input:1536,output:256},
  dialogue:{frequency:6,input:3069,output:512},
  knowledge:{frequency:10,input:8192,output:1024}
};
const servicePresetNames={brief:'轻度 · 简短问答',dialogue:'中度 · 多轮客服',knowledge:'重度 · 知识库对话',custom:'自定义'};
let servicePreset='dialogue', serviceAdvancedOpen=false;
const sceneValues = Object.fromEntries(Object.entries(sceneConfigs).map(([id,c])=>[id,{...c.defaults}]));
const businessModels=['DeepSeek V4 Flash 0731','GLM-5.3 · Mock 数据','GLM-5.3 Flash · 待采集'];
const sceneModels={coding:'GLM-5.3 · Mock 数据',service:'DeepSeek V4 Flash 0731',chatbi:'DeepSeek V4 Flash 0731'};
const sceneChips={coding:'910C',service:'910B',chatbi:'910B'};
let codingPreset = 'collaboration', codingAdvancedOpen = false, currentPlan = null, planningError = '', replayEpoch = 0, miniBusy = false;
const fmt = (n,digits=0) => n.toLocaleString('zh-CN',{maximumFractionDigits:digits});
function sceneId(){ return scenarios[selected].id; }
function scenarioModel(id=sceneId()){ return sceneModels[id].replace(/ · (Mock 数据|待采集)$/,''); }
function scenarioBenchmarkSet(){
  const v=sceneValues[sceneId()], model=sceneModels[sceneId()];
  const candidates=benchmarkCandidates($('#planChip').value,model);
  return candidates.find(set=>set.input===v.input&&set.output===v.output)||candidates[0]||null;
}
function scenarioData(){ return scenarioBenchmarkSet()?.rows||[]; }
function activeProfile(){ const set=scenarioBenchmarkSet();return set?.rows.length?{input:set.input,output:set.output,mock:!!set.mock||set.rows.some(row=>row.mock)}:null; }
function sourceLabel(){ const p=activeProfile();return !p?'待采集':p.mock?'Mock 数据':'实测数据'; }
function selectedPlan(){ return currentPlan?.options[selectedTierIndex] || null; }
function tierPoint(){ return selectedPlan()?.point || null; }
function capacityValid(){ return !!(currentPlan?.matched && selectedPlan()?.units); }

function renderScenarios(){
  $('#scenarioStrip').innerHTML=scenarios.map((s,i)=>{
    const sets=benchmarkCandidates(sceneChips[s.id],sceneModels[s.id]), source=!sets.length?'待采集':sets.every(set=>set.mock)?'Mock 参考':'实测参考';
    return `<button class="scenario ${i===selected?'selected':''}" data-index="${i}" aria-pressed="${i===selected}"><span class="scenario-title-row"><span class="scenario-icon">${scenarioIcons[s.id]}</span><span class="scenario-title">${s.title}</span></span><span class="scenario-text"><span class="scenario-desc">${sceneCardCopy[s.id]}</span></span><span class="scenario-fit"><small>${sceneConfigs[s.id].focus}</small><span class="scenario-baseline">当前模型 · ${scenarioModel(s.id)}<br>Ascend ${sceneChips[s.id]} · ${source}</span></span></button>`;
  }).join('');
  $$('.scenario').forEach(b=>b.onclick=()=>selectScenario(+b.dataset.index));
}
function syncBusinessDataFilters(){
  for(const suffix of ['', '2']){
    $('#modelFilter'+suffix).value=sceneModels[sceneId()];
    $('#chipFilter'+suffix).selectedIndex=$('#planChip').selectedIndex;
  }
}
function updateModelHint(){
  const sets=benchmarkSets.filter(set=>set.model===sceneModels[sceneId()]&&set.rows.length);
  $('#businessModelHint').textContent=!sets.length?'该模型暂无性能记录，待采集；保留业务需求计算。':
    '已收录 '+[...new Set(sets.map(set=>'Ascend '+set.chip))].join(' / ')+' · '+(sets.every(set=>set.mock)?'仅 Mock 演示数据':'有实测参考')+'；按模型、卡型和输入输出长度匹配。';
}
function selectBusinessModel(value){
  if(!businessModels.includes(value))return;
  sceneModels[sceneId()]=value;
  const sets=benchmarkSets.filter(set=>set.model===value&&set.rows.length);
  if(sets.length&&!sets.some(set=>set.chip===$('#planChip').value)) $('#planChip').value=sets[0].chip;
  sceneChips[sceneId()]=$('#planChip').value;
  selectedTierIndex=0;
  syncBusinessDataFilters();renderScenarios();renderBusinessFields();refreshPlanning();renderChartAndTable();
}
function numberField(key,label,unit,hint,{min=.01,max=1000000,step='any'}={}){
  return `<label class="model-field"><span>${label}</span><div class="field-value"><input type="number" data-field="${key}" aria-label="${label}" min="${min}" max="${max}" step="${step}" value="${sceneValues[sceneId()][key]}" required/><em>${unit}</em></div><small>${hint}</small></label>`;
}
function renderBusinessFields(){
  if($('#codingAdvanced')) codingAdvancedOpen=$('#codingAdvanced').open;
  if($('#serviceAdvanced')) serviceAdvancedOpen=$('#serviceAdvanced').open;
  const id=sceneId(), c=sceneConfigs[id];
  $('#businessFields').classList.toggle('coding-fields',id==='coding'||id==='service');
  const fields=[
    numberField('scale',c.scaleLabel,c.scaleUnit,id==='coding'?'参与本次容量估算的开发者人数':'使用高峰期间到达量'),
    id!=='chatbi'?numberField('frequency',c.frequencyLabel,c.frequencyUnit,id==='coding'?'一次补全触发、提问或指令计一次交互':'一问一答计为一轮',{max:10000}):'',
    id!=='service'?numberField('calls',c.callsLabel,'次',id==='coding'?'包含后续自动调用':'例如 SQL 生成 + 结果总结',{min:1,max:100,step:1}):'',
    numberField('input','单次调用平均输入','tokens',id==='coding'?'提示词 + 代码上下文':id==='service'?'提示词 + 历史对话 + 检索内容':'提示词 + Schema / 查询结果',{min:1,max:1048576,step:1}),
    numberField('output','单次调用平均输出','tokens',id==='coding'?'代码、解释或工具指令':id==='service'?'单轮回答长度':'SQL 或分析总结的平均长度',{min:1,max:262144,step:1})
  ];
  const modelField='<label class="model-field model-choice"><span>推理模型</span><select id="businessModel" aria-label="选择业务模型">'+businessModels.map(model=>'<option>'+model+'</option>').join('')+'</select><small id="businessModelHint"></small></label>';
  $('#businessFields').innerHTML=id==='coding'?`${modelField}${fields[0]}<label class="model-field"><span>使用档位</span><select id="codingPreset" aria-label="Coding 使用档位">${Object.entries(codingPresetNames).map(([key,name])=>`<option value="${key}" ${key==='custom'?'disabled':''}>${name}</option>`).join('')}</select><small>档位统一设置其余四项，支持自定义</small></label><div class="coding-load-summary" id="codingLoadSummary"></div><details class="coding-advanced" id="codingAdvanced" ${codingAdvancedOpen?'open':''}><summary>调整参数 · 交互频率、调用次数与输入输出</summary><div class="coding-advanced-fields">${fields.slice(1).join('')}</div></details>`:[modelField,...fields].join('');
  $('#businessModel').value=sceneModels[id];
  $('#businessModel').onchange=e=>selectBusinessModel(e.target.value);
  if(id==='service'){
    $('#businessFields').innerHTML=`${modelField}${fields[0]}<label class="model-field"><span>使用档位</span><select id="servicePreset" aria-label="聊天使用档位">${Object.entries(servicePresetNames).map(([key,name])=>`<option value="${key}" ${key==='custom'?'disabled':''}>${name}</option>`).join('')}</select><small>默认带入轮数和输入输出，支持自定义</small></label><div class="coding-load-summary" id="serviceLoadSummary"></div><details class="coding-advanced" id="serviceAdvanced" ${serviceAdvancedOpen?'open':''}><summary>调整参数 · 会话轮数与输入输出</summary><div class="coding-advanced-fields service-advanced-fields">${fields.slice(1).join('')}</div></details>`;
    $('#businessModel').value=sceneModels[id];
    $('#businessModel').onchange=e=>selectBusinessModel(e.target.value);
    syncServiceSummary();
    $('#serviceAdvanced').ontoggle=e=>{serviceAdvancedOpen=e.target.open;};
    $('#servicePreset').onchange=e=>{
      servicePreset=e.target.value;Object.assign(sceneValues.service,servicePresets[servicePreset]);
      renderBusinessFields();selectedTierIndex=0;refreshPlanning();
    };
  }
  if(id==='coding'){
    syncCodingSummary();
    $('#codingAdvanced').ontoggle=e=>{codingAdvancedOpen=e.target.open;};
    $('#codingPreset').onchange=e=>{
      codingPreset=e.target.value; Object.assign(sceneValues.coding,codingPresets[codingPreset]);
      codingAdvancedOpen=$('#codingAdvanced').open;
      renderBusinessFields(); selectedTierIndex=0; refreshPlanning();
    };
  }
  $('#targetFields').innerHTML=[
    numberField('ttftLimit','首字等待 p99 上限','秒','用长尾首字等待筛选压测点',{min:.1,max:3600}),
    numberField('tpotLimit','逐 token 耗时 avg 上限','ms','约束单次调用的输出节奏',{min:1,max:10000}),
    id!=='service'?numberField('taskLimit',id==='chatbi'?'平均问数完成目标':'平均交互完成目标','秒','均值粗估，不代表任务 p99',{min:.1,max:86400}):'',
    id==='chatbi'?numberField('external','外部耗时假设','秒','数据库执行 / 工具耗时合计，未实测',{min:0,max:86400}):''
  ].join('');
  $$('[data-field]').forEach(el=>el.oninput=()=>{
    sceneValues[id][el.dataset.field]=el.value===''?'':Number(el.value);
    if(id==='coding'&&['frequency','calls','input','output'].includes(el.dataset.field)){codingPreset='custom';syncCodingSummary();}
    if(id==='service'&&['frequency','input','output'].includes(el.dataset.field)){servicePreset='custom';syncServiceSummary();}
    selectedTierIndex=0; refreshPlanning();
  });
}
function syncServiceSummary(){
  if(!$('#serviceLoadSummary'))return;
  const v=sceneValues.service,value=n=>typeof n==='number'&&Number.isFinite(n)?fmt(n,2):'—';
  $('#servicePreset').value=servicePreset;
  $('#serviceLoadSummary').textContent=`${servicePresetNames[servicePreset]}假设：每会话 ${value(v.frequency)} 轮问答 · 每轮输入 ${value(v.input)} / 输出 ${value(v.output)} tokens。用于需求估算，不是实测使用率；性能按实际负载记录匹配。`;
}
function syncCodingSummary(){
  if(!$('#codingLoadSummary'))return;
  const v=sceneValues.coding, value=n=>typeof n==='number'&&Number.isFinite(n)?fmt(n,2):'—';
  $('#codingPreset').value=codingPreset;
  $('#codingLoadSummary').textContent=`${codingPresetNames[codingPreset]}假设：每人 ${value(v.frequency)} 次交互 / 小时 · 每次 ${value(v.calls)} 次调用 · 输入 ${value(v.input)} / 输出 ${value(v.output)} tokens。用于需求估算，不是实测使用率。`;
}
function selectScenario(i){
  selected=i; selectedTierIndex=0;
  const s=scenarios[i], c=sceneConfigs[s.id];
  renderScenarios(); $('#sceneHeading').textContent=s.heading; $('#sceneDescription').textContent=c.description;
  $('#sceneTags').innerHTML=s.tags.map(t=>`<span class="tag">${t}</span>`).join('');
  $('#assumptionText').textContent=c.assumption;
  $('#planChip').value=sceneChips[s.id];
  syncBusinessDataFilters();
  renderBusinessFields(); refreshPlanning(); renderChartAndTable();
}
function refreshPlanning(){
  resetReplay(); planningError='';
  try { currentPlan=ScenarioPlanner.planFor(sceneId(),sceneValues[sceneId()],scenarioData(),activeProfile()); }
  catch(error){ currentPlan=null; planningError=error.message; }
  renderDemand(); renderTierCards(); updateExperience();
}
function renderDemand(){
  updateModelHint();
  const id=sceneId(), c=sceneConfigs[id], d=currentPlan?.demand;
  $('#planStrategy').textContent=id==='coding'?'吞吐优先：在时延约束内，选择单套调用吞吐最高的测试点。':id==='service'?'体验优先：先筛首字 p99 与输出节奏，再估算问答容量。':'响应优先：先筛首字 p99、输出节奏与平均问数完成预算。';
  if(!d){ $('#demandLoad').textContent='业务负载待完善'; $('#demandSummary').innerHTML='<div class="demand-stat"><span>需求待计算</span><strong>—</strong></div>'; $('#formulaNote').textContent=planningError; return; }
  $('#demandLoad').textContent='业务负载 · '+scenarioModel()+' · 单次调用输入 '+fmt(d.input)+' / 输出 '+fmt(d.output)+' tokens';
  const stats=[['需求输入 TPS',d.inputTps,'TPS'],['需求输出 TPS',d.outputTps,'TPS'],['需求总吞吐',d.totalTps,'TPS'],['模型调用需求',d.qps,'QPS']];
  $('#demandSummary').innerHTML=stats.map(([label,n,unit])=>`<div class="demand-stat"><span>${label}</span><strong>${fmt(n,2)}</strong><small>${unit}</small></div>`).join('');
  $('#formulaNote').textContent=`${id==='coding'?`基于「${codingPresetNames[codingPreset]}」假设估算。`:id==='service'?`基于「${servicePresetNames[servicePreset]}」假设估算。`:''}${fmt(d.businessPerMinute,2)} ${c.businessUnit} × ${d.calls} 次模型调用 = ${fmt(d.rpm,2)} 次调用 / 分钟（${fmt(d.qps,3)} QPS）。输入 / 输出 TPS = QPS × 对应 tokens；总吞吐 = 输入 TPS + 输出 TPS。`;
}
function renderTierCards(){
  const profile=activeProfile(), p=currentPlan;
  $('#benchmarkContext').innerHTML=profile?`<span><strong>${sourceLabel()}依据</strong> · ${scenarioModel()} / Ascend ${$('#planChip').value} · 1P1D / 2 台</span><span>每次调用输入 <strong>${fmt(profile.input)}</strong> / 输出 <strong>${fmt(profile.output)}</strong> tokens <button id="restoreLoad" type="button">使用此参考负载</button></span>`:'<span>当前模型、卡型组合尚无性能数据。</span>';
  if($('#restoreLoad')) $('#restoreLoad').onclick=()=>{Object.assign(sceneValues[sceneId()],{input:profile.input,output:profile.output});if(sceneId()==='coding')codingPreset=Object.keys(codingPresets).find(key=>Object.entries(codingPresets[key]).every(([k,v])=>sceneValues.coding[k]===v))||'custom';if(sceneId()==='service')servicePreset=Object.keys(servicePresets).find(key=>Object.entries(servicePresets[key]).every(([k,v])=>sceneValues.service[k]===v))||'custom';renderBusinessFields();selectedTierIndex=0;refreshPlanning();};
  const messages={
    ready:`${p?.mock?'Mock 演示：':'参考建议：'}已筛选首字 p99、TPOT avg${sceneId()==='service'?'':'及平均任务完成预算'}，推荐其中单套吞吐最高的测试点。${sceneId()==='chatbi'?'首字指标只代表首个模型调用，不代表数据库查询结果已返回。':''}套数为线性估算，未计冗余与业务链路验证。`,
    mismatch:'业务输入 / 输出与参考负载不匹配。已更新需求 TPS；配置数量、业务容量和目标达标判定暂停。下方仅展示原负载的性能参考，需要对应负载压测后才能推荐。',
    unmet:'当前负载有参考数据，但没有测试点同时满足全部响应目标。请调整目标或补充其他配置的压测；低延迟、高容量方案可供比较，不作为达标推荐。',
    missing:'暂无对应模型与卡型的性能数据。业务需求已计算，配置与容量等待压测记录。'
  };
  $('#planNotice').textContent=planningError || messages[p?.status] || '请完善业务输入。';
  $('#planNotice').classList.toggle('warning',p?.status!=='ready');
  if(!p?.options.length){ $('#tierGrid').innerHTML='<div class="bench-empty" style="grid-column:1/-1">暂无可比较方案</div>'; return; }
  $('#tierGrid').innerHTML=p.options.map((o,i)=>{
    const d=o.point;
    if(!d) return `<button class="tier-card" disabled><span class="tier-name">推荐配置</span><div class="tier-empty">${p.status==='mismatch'?'业务负载待测':p.status==='unmet'?'暂无满足目标的测试点':'暂无数据'}<br>补齐依据后再给出设备建议。</div></button>`;
    const coding=sceneId()==='coding', bi=sceneId()==='chatbi';
    const primary=coding?fmt(d.completion,2):fmt(d.ttftP99/1000,2), primaryUnit=coding?'输出 TPS / 套':'秒';
    const state=!p.matched?'负载不匹配 · 仅供参考':o.withinTargets?'满足所设参考约束':'超出所设响应目标';
    return `<button class="tier-card ${i===selectedTierIndex?'selected':''}" data-tier="${i}" aria-pressed="${i===selectedTierIndex}"><span class="tier-name">${o.name}${p.mock?'<span class="mock-mark">Mock</span>':''}</span><div class="tier-conc">单套 ${d.conc} 并发 · ${sourceLabel()}</div><div class="tier-primary-label">${coding?'单套输出吞吐':'首字等待 TTFT p99'}</div><div class="tier-primary">${primary}<small>${primaryUnit}</small></div><div class="tier-metric"><span>${coding?'输入 TPS / 套':'TTFT avg'}</span><b>${coding?fmt(d.prompt,2):`${fmt(d.ttft/1000,2)} s`}</b></div>${coding?`<div class="tier-metric"><span>TTFT avg / p99</span><b>${fmt(d.ttft/1000,2)} / ${fmt(d.ttftP99/1000,2)} s</b></div>`:""}<div class="tier-metric"><span>TPOT avg</span><b>${fmt(d.tpot,1)} ms</b></div><div class="tier-metric"><span>${bi?'平均问数完成粗估':coding?'平均任务完成粗估':'参考单套调用 QPS'}</span><b>${bi||coding?(p.matched?`${fmt(o.taskSeconds,2)} s`:'待测'):fmt(d.qps,2)}</b></div><div class="tier-state ${o.withinTargets?'':'warning'}">${state}</div><div class="tier-need">${p.matched?'按当前需求参考估算':'设备数量待评估'}<strong>${p.matched?`${o.units} 套 · ${o.units*2} 台`:'—'}</strong><small>1 套 = 2 台 Ascend ${$('#planChip').value} · 1P1D</small></div>${p.matched?`<div class="tier-capacity">参考总容量 <strong>${fmt(capacityPrimary(o).value,2)}</strong> ${capacityPrimary(o).unit}<br>输入 ${fmt(o.inputTps,2)} / 输出 ${fmt(o.outputTps,2)} TPS<br>总吞吐 ${fmt(o.totalTps,2)} TPS · 模型调用 ${fmt(o.effectiveQps*o.units,2)} QPS</div>`:''}</button>`;
  }).join('');
  $$('[data-tier]').forEach(b=>b.onclick=()=>{resetReplay();selectedTierIndex=+b.dataset.tier;renderTierCards();updateExperience();});
}
function capacityPrimary(o){
  return sceneId()==='coding'?{value:o.outputTps,unit:'TPS'}:sceneId()==='chatbi'?{value:o.businessPerMinute,unit:'问题 / 分钟'}:{value:o.businessPerMinute/60,unit:'QPS'};
}
function capacitySummary(o=selectedPlan()){
  if(!currentPlan?.matched||!o?.units)return '当前负载没有匹配的业务容量依据。';
  const c=capacityPrimary(o);
  return '参考总容量 '+fmt(c.value,2)+' '+c.unit+'；输入 '+fmt(o.inputTps,2)+' TPS，输出 '+fmt(o.outputTps,2)+' TPS，总吞吐 '+fmt(o.totalTps,2)+' TPS，模型调用 '+fmt(o.effectiveQps*o.units,2)+' QPS。多套容量为线性估算，未计冗余，需业务压测验证。';
}
function renderExperienceMetrics(){
  const d=tierPoint(), profile=activeProfile(), p=currentPlan;
  $('#experienceLoad').textContent=profile?
    `${sourceLabel()}负载 · 输入 ${fmt(profile.input)} / 输出 ${fmt(profile.output)} tokens · 单套 ${d?d.conc+' 并发':'待选并发'} · Ascend ${$('#planChip').value} / ${scenarioModel()}${p?.matched?' · 负载匹配':' · 与业务负载不匹配，仅供参考'}`:
    '当前模型、卡型暂无对应压测负载，吞吐待测。';
  const metrics=[
    ['inputTps','输入 TPS',d?.prompt,'TPS / 套'],
    ['outputTps','输出 TPS',d?.completion,'TPS / 套'],
    ['totalTps','总吞吐',d?d.total??(d.prompt+d.completion):null,'TPS / 套'],
    ['qps','压测 QPS',d?.qps,'QPS / 套'],
    ['decodeTps','Decode TPS',d?d.decode??1000/d.tpot:null,'TPS / 请求']
  ];
  $('#experienceMetrics').innerHTML=metrics.map(([key,label,value,unit])=>`<div class="experience-metric" data-metric="${key}"><span>${label}</span><strong>${Number.isFinite(value)?fmt(value,2):'—'}</strong><small>${Number.isFinite(value)?unit:'待测'}</small></div>`).join('');
  $('#experienceMetricNote').textContent='TPS = tokens/s。输入、输出与总吞吐是该并发下的单套聚合能力；Decode TPS 是单请求输出速度。总吞吐 = 输入 TPS + 输出 TPS，不能用 Decode TPS 代替。套数同时受 QPS 和两类吞吐约束。';
}
function updateExperience(){
  const o=selectedPlan(), d=o?.point, p=currentPlan;
  $('#previewPlan').innerHTML='<option value="" disabled>请选择可用参考点</option>'+(p?.options||[]).map((item,i)=>'<option value="'+i+'" '+(!item.point?'disabled':'')+'>'+item.name+(!item.point?' · 待评估':'')+'</option>').join('');
  $('#previewPlan').value=d?String(selectedTierIndex):'';
  $('#previewPlan').disabled=!p?.options.some(item=>item.point);
  $('#previewTargetHint').textContent=!p?.options.length?'暂无可用参考档位。':p.matched?'选择档位回填 TTFT p99 与 TPOT avg；数值向上取整后可继续手动修改。交互完成预算保持不变。':'当前业务负载与参考负载不同，仅切换回放，不回填响应目标。';
  renderExperienceMetrics();
  $('#miniSend').disabled=!d||miniBusy;
  $('#miniTierMeta').textContent=d?o.name+' · '+sourceLabel()+' · 单套 '+d.conc+' 并发':'待选择可用参考点';
  $('#miniIntro').textContent=d?'仅回放参考负载下的单次调用：TTFT avg '+fmt(d.ttft/1000,2)+' s / TPOT avg '+fmt(d.tpot,1)+' ms。'+(!p.matched?'与当前业务负载不同。':'')+'不模拟 Agent、检索或 SQL 执行链路。':'当前无可用参考点。可在体验方案中选择已有测试点，或补充相应压测。';
}
function resetReplay(){
  replayEpoch++; miniBusy=false;
  renderSceneExperience();
  $('#miniStatus').textContent='演示文案按参考 TTFT / TPOT 近似回放，不代表完整业务链路。';
}
const sceneExperiences={
  coding:{title:'Coding · 代码生成',label:'TypeScript · 固定演示代码',file:'request.ts',placeholder:'// 输入编程需求，查看代码生成与输出节奏。',prompts:['用 TypeScript 实现一个带重试的请求函数','实现一个防抖函数，支持取消']},
  service:{title:'聊天 · 客服对话',label:'客服回复 · 演示文案',placeholder:'发送客户问题，查看首字等待和对话输出。',prompts:['订单超过预计时间还没送到，怎么办？','如何申请退换货？']},
  chatbi:{title:'ChatBI · 自然语言问数',label:'SQL · 示例查询，未连接数据库',file:'analysis.sql',placeholder:'-- 输入业务问题，查看 SQL 与分析步骤示例。',prompts:['按区域分析本季度销售趋势','查询本月销售额最高的十个产品']}
};
let experienceScene=null;
function renderSceneExperience(){
  const id=sceneId(), e=sceneExperiences[id], changed=experienceScene!==id;
  experienceScene=id;
  $('#miniExperience').dataset.scene=id;
  $('#miniTitle').textContent=e.title;
  if(changed) $('#miniInput').value=e.prompts[0];
  $('#miniInput').placeholder=id==='coding'?'输入编程需求…':id==='chatbi'?'输入想分析的业务问题…':'输入客户问题…';
  $('#miniSend').textContent=id==='coding'?'生成代码':id==='chatbi'?'生成查询':'发送体验';
  $('#miniStage').innerHTML='<div class="preview-prompt" id="miniPrompt"></div><div class="preview-response-label"></div>'+(id==='service'?'<div class="mini-answer chat-answer" id="miniAnswer"></div>':'<div class="preview-file"></div><pre class="preview-code"><code class="mini-answer" id="miniAnswer"></code></pre>');
  $('#miniPrompt').textContent=$('#miniInput').value;
  $('#miniStage .preview-response-label').textContent=e.label;
  if($('#miniStage .preview-file')) $('#miniStage .preview-file').textContent=e.file;
  $('#miniAnswer').textContent=e.placeholder;
  const host=$('#miniPrompts');host.replaceChildren();
  for(const prompt of e.prompts){
    const button=document.createElement('button');button.type='button';button.textContent=prompt;
    button.onclick=()=>{const input=$('#miniInput');input.value=prompt;$('#miniPrompt').textContent=prompt;input.focus();};
    host.appendChild(button);
  }
}
function mockReply(text){
  if(/qps|tpm|设备数量|部署规模|容量|需要多少(?:套|台)|支持多少(?:开发者|用户)|承载多少/i.test(text)){
    if(!capacityValid()) return '当前业务负载没有可用的容量估算。请先匹配输入输出长度与模型、卡型的压测记录；此窗口只回放选中参考点的响应节奏。';
    return `${sceneConfigs[sceneId()].focus}是本场景的选型重点。当前参考配置为 ${selectedPlan().units} 套 1P1D；${capacitySummary()}${!selectedPlan().withinTargets?'所选方案超出响应目标。':''}${currentPlan.mock?'当前性能均为 Mock 数据。':''}`;
  }
  if(sceneId()==='coding') return /防抖/.test(text)?`// 演示代码：仅供响应节奏回放，未调用模型生成
function debounce(fn: () => void, delay = 300) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = () => {
    clearTimeout(timer);
    timer = setTimeout(fn, delay);
  };
  run.cancel = () => clearTimeout(timer);
  return run;
}`:`// 演示代码：仅供响应节奏回放，未调用模型生成
async function requestWithRetry<T>(
  url: string,
  retries = 3,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(String(response.status));
      return await response.json() as T;
    } catch (error) {
      if (attempt >= retries) throw error;
      await new Promise(resolve =>
        setTimeout(resolve, 500 * 2 ** attempt));
    }
  }
}`;
  if(sceneId()==='chatbi') return /产品/.test(text)?`-- SQL 示例；表名与字段需匹配实际数据源
SELECT product_name, SUM(amount) AS sales
FROM sales_orders
WHERE order_date >= DATE_TRUNC('month', CURRENT_DATE)
  AND order_date < DATE_TRUNC('month', CURRENT_DATE)
      + INTERVAL '1 month'
GROUP BY product_name
ORDER BY sales DESC
LIMIT 10;

-- 查询结果待接入，未执行数据库查询。
-- 返回数据后再解读产品贡献与集中度。`:`-- SQL 示例；表名与字段需匹配实际数据源
SELECT region,
       DATE_TRUNC('month', order_date) AS month,
       SUM(amount) AS sales
FROM sales_orders
WHERE order_date >= DATE_TRUNC('quarter', CURRENT_DATE)
  AND order_date < DATE_TRUNC('quarter', CURRENT_DATE)
      + INTERVAL '3 months'
GROUP BY region, DATE_TRUNC('month', order_date)
ORDER BY region, month;

-- 查询结果待接入，未执行数据库查询。
-- 返回数据后再分析各区域月度变化。`;
  return /退|换/.test(text)?'您好，可以先在订单详情查看退换货入口，并根据页面提示提交申请。\n\n如果找不到入口，请提供订单编号，我会协助核实订单状态和适用规则。具体条件、费用和处理时效以商家的实际政策为准。\n\n（演示回复，未查询真实订单或商家政策。）':'您好，理解您等待订单的心情。请提供订单编号，我会协助核实最新物流状态，并确认是否出现配送异常。\n\n如果已经超过预计送达时间，我们可以进一步联系物流核实，并根据实际情况协助处理。\n\n（演示回复，未查询真实订单或联系物流。）';
}
async function runReplay(event){
  event.preventDefault();
  const input=$('#miniInput'), q=input.value.trim(), d=tierPoint();
  if(!q||!d||miniBusy) return;
  const epoch=replayEpoch, reply=mockReply(q), prefix=currentPlan.mock?'Mock · ':'参考基线 · ';
  miniBusy=true;
  const target=$('#miniAnswer');
  $('#miniPrompt').textContent=q;
  target.textContent='';
  const status=$('#miniStatus');
  const send=$('#miniSend'); send.disabled=true;
  status.textContent=`${prefix}等待首字 ${fmt(d.ttft/1000,2)} 秒`;
  await new Promise(resolve=>setTimeout(resolve,d.ttft));
  if(epoch!==replayEpoch) return;
  status.textContent=`${prefix}输出中 · TPOT ${fmt(d.tpot,1)} ms`;
  for(let offset=2;offset<reply.length+2;offset+=2){
    if(epoch!==replayEpoch) return;
    target.textContent=reply.slice(0,offset);
    $('#miniStage').scrollTop=$('#miniStage').scrollHeight;
    await new Promise(resolve=>setTimeout(resolve,Math.max(16,d.tpot*2)));
  }
  if(epoch!==replayEpoch) return;
  status.textContent=`${prefix}完成 · TTFT avg ${fmt(d.ttft/1000,2)} s · 演示文案 / 近似节奏`;
  miniBusy=false;
  send.disabled=!tierPoint();
}
function hookPlanning(){
  $('#previewPlan').onchange=e=>{
    const index=Number(e.target.value), option=currentPlan?.options[index];
    if(!Number.isInteger(index)||!option?.point)return;
    selectedTierIndex=index;
    if(currentPlan.matched){
      Object.assign(sceneValues[sceneId()],{
        ttftLimit:Math.ceil(option.point.ttftP99/10-1e-10)/100,
        tpotLimit:Math.ceil(option.point.tpot*10-1e-10)/10
      });
      renderBusinessFields();refreshPlanning();
    }else{resetReplay();renderTierCards();updateExperience();}
  };
  $('#miniForm').onsubmit=runReplay;
}
