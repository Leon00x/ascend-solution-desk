# Scenario Business Modeling Implementation Plan

**Goal:** 把场景选型转为业务需求、负载、体验目标驱动的配置建议。

**Architecture:** 新增无依赖的 planning.js，导出纯函数供浏览器和 Node 测试共用。planning-ui.js 管理表单、方案和回放，index.html 保留样式、压测记录、图表和导航；业务输入按场景保存，通过纯函数生成需求与三种方案。

**Tech Stack:** HTML / CSS / 原生 JavaScript，Node 内建 test runner。

## Tasks

- [x] 1. tests/planning.test.cjs：业务换算、输入验证、负载不匹配、时延筛选和无数据测试；先观察缺失模块失败，再实现。
- [x] 2. planning.js：实现 `demandFor(scene, inputs)`、`planFor(scene, inputs, rows, profile)`。需求按 QPS × tokens 计算 TPS；容量受 QPS 和两类 token 吞吐共同约束并向上取整；不匹配时 units 和 businessPerMinute 为 null。推荐取满足 p99 TTFT、avg TPOT 和可选串行任务预算的最高有效调用吞吐点。
- [x] 3. index.html / planning-ui.js：卡片移除 tokens；新增业务表单、需求结果、负载来源、三方案卡片和推荐理由。所有容量出口（配置卡片、体验页、演示回复）共用同一规划结果。保留原始实测与性能数据筛选。
- [x] 4. README.md：说明三场景模型、Mock 负载、估算限制及测试命令。
- [x] 5. 33 项计算与 DOM 交互测试、脚本语法检查、独立审查；修复旧容量回复残留，增加窄屏样式，并修正 Mock 曲线纵轴。

## Verification limitation

浏览器工具拒绝访问 file:// 页面，未尝试绕过限制。用 happy-dom 在本地评估项目源代码完成交互验证；截图、实际浏览器布局和窄屏视觉仍未验证。

## Acceptance

Coding 主结果为输出 TPS，聊天为问答 QPS，ChatBI 为问题/分钟。修改 tokens 不匹配后，三方案、体验页及演示回复均不得显示业务设备推算。恢复负载后自动恢复估算。无达标方案时不伪造推荐；可选择其他压测点进行带标注的参考回放。

## Scene experience refinement

移除配置倍数；套数、设备数、总容量放在配置卡片。步骤 2 提供响应目标和放大的场景体验，双向联动参考方案。Coding 使用代码输出、聊天使用客服对话、ChatBI 使用未执行的 SQL 固定示例。新增步骤顺序、格式切换、同步选择和业务问题意图判断测试。

## TPS and workload matching

将所有展示和业务计算从每分钟 token 口径迁至每秒；保留每分钟交互用于业务解释。步骤 1 为需求 TPS/QPS，步骤 2 为单套压测 TPS/QPS 及单请求 Decode TPS。业务匹配与数据筛选共享输入输出负载目录。44 项测试通过，独立审查未发现计算或匹配缺陷；浏览器视觉仍未复核。
