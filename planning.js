(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ScenarioPlanner = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  function number(value, label, min, max, integer = false) {
    const n = Number(value);
    if (value === '' || value == null || !Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) {
      throw new Error(`${label}需为 ${min}–${max} 之间的${integer ? '整数' : '数值'}。`);
    }
    return n;
  }

  function demandFor(scene, values) {
    if (!['coding','service','chatbi'].includes(scene)) throw new Error('未知场景。');
    const scale = number(values.scale,'业务规模',0.01,1000000);
    const frequency = scene === 'chatbi' ? 1 : number(values.frequency,'任务频率 / 对话轮数',0.01,10000);
    const calls = scene === 'service' ? 1 : number(values.calls,'每任务调用数',1,100,true);
    const input = number(values.input,'输入 tokens',1,1048576,true);
    const output = number(values.output,'输出 tokens',1,262144,true);
    const businessPerMinute = scene === 'coding' ? scale * frequency / 60 : scale * frequency;
    const rpm = businessPerMinute * calls;
    const qps=rpm/60, inputTps=qps*input, outputTps=qps*output;
    return {businessPerMinute,calls,rpm,qps,input,output,inputTps,outputTps,totalTps:inputTps+outputTps};
  }

  function planFor(scene, values, rows, profile) {
    const demand = demandFor(scene,values);
    const ttftLimit = number(values.ttftLimit,'首字 p99 目标',0.1,3600);
    const tpotLimit = number(values.tpotLimit,'TPOT avg 目标',1,10000);
    const taskLimit = scene === 'service' ? Infinity : number(values.taskLimit,'平均任务完成目标',0.1,86400);
    const external = scene === 'chatbi' ? number(values.external,'外部耗时假设',0,86400) : 0;
    const result = {demand, mock:!!profile?.mock, matched:false, recommended:null, options:[], status:'missing'};
    if (!rows.length || !profile) return result;
    result.matched = demand.input === profile.input && demand.output === profile.output;
    // Only compare latency targets with a sample of the same per-call token load.
    const evaluate = point => {
      const callSeconds = Number.isFinite(point.lat) ? point.lat : point.ttft/1000 + (profile.output-1)*point.tpot/1000;
      const taskSeconds = callSeconds*demand.calls + external;
      const withinTargets = result.matched && point.ttftP99/1000 <= ttftLimit && point.tpot <= tpotLimit && taskSeconds <= taskLimit;
      // QPS in the imported table is rounded. Respect both token budgets too.
      const effectiveQps = Math.min(point.qps,point.prompt/profile.input,point.completion/profile.output);
      const units = result.matched ? Math.max(1,Math.ceil(demand.qps/effectiveQps-1e-10)) : null;
      return {point,withinTargets,taskSeconds,units,effectiveQps,
        businessPerMinute:units === null ? null : effectiveQps*units*60/demand.calls,
        inputTps:units === null ? null : point.prompt*units,
        outputTps:units === null ? null : point.completion*units,
        totalTps:units === null ? null : (point.prompt+point.completion)*units};
    };
    const samples = rows.map(evaluate);
    const qualified = samples.filter(s=>s.withinTargets).sort((a,b)=>b.effectiveQps-a.effectiveQps);
    result.recommended = qualified[0] || null;
    result.status = !result.matched ? 'mismatch' : result.recommended ? 'ready' : 'unmet';
    result.options = [
      {id:'recommended',name:'推荐配置',point:null,units:null,businessPerMinute:null,...result.recommended},
      {id:'latency',name:'低延迟方案',...samples.reduce((a,b)=>a.point.ttftP99 <= b.point.ttftP99 ? a : b)},
      {id:'capacity',name:'高容量方案',...samples.reduce((a,b)=>a.effectiveQps >= b.effectiveQps ? a : b)}
    ];
    return result;
  }
  return {demandFor,planFor};
});
