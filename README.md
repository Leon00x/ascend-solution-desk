# 昇腾场景方案

面向客户方案沟通的静态 Demo。直接在浏览器中打开 `index.html` 即可查看。

当前包含：

- Coding、聊天机器人 / AI 客服、ChatBI 场景卡片
- 聊天机器人与 ChatBI 默认使用 Ascend 910B 的 DeepSeek V4 Flash 0731 实测数据；Coding 最小配置为 2 台 Ascend 910C，GLM-5.3 性能为 Mock 数据
- 分档区域可切换 910B、910C 和 950DT；当前仅 DeepSeek / 910B 有实测、GLM-5.3 / 910C 有 Mock，其余组合待采集
- 吞吐、TTFT、TPOT 图表和测试明细
- 按所选档位的 TTFT、TPOT 节奏回放的聊天体验

原始参考数值保存在 `DeepSeek_V4_Flash_0731_capacity_planning.html`。平台按源文件标注的 910B 展示这组实测。当前只收录 DeepSeek 这一组实测记录；GLM-5.3 数据均为 Mock，仅用于界面演示，其他模型及配置显示为待采集。多套扩容按单套 QPS 线性估算，客户方案需在实际业务负载下验证。
