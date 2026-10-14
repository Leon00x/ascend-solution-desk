# 昇腾算力选型台

面向客户方案沟通的静态 Demo。直接在浏览器中打开 `index.html` 即可查看。

当前包含：

- Coding、聊天机器人 / AI 客服、ChatBI 场景卡片
- 默认选择 Ascend 910C；基于 DeepSeek V4 Flash 0731 实测数据，以及 Coding 场景 GLM-5.3 Mock 数据的体验分档与容量估算
- 分档区域可切换 910C、910B 和 950DT；后两种卡型暂无数据，界面显示待采集
- 吞吐、TTFT、TPOT 图表和测试明细
- 按所选档位的 TTFT、TPOT 节奏回放的聊天体验

原始参考数值保存在 `DeepSeek_V4_Flash_0731_capacity_planning.html`。该文件中的 910B 卡型标注已由项目方更正为 910C；平台按 910C 展示这组实测。当前只收录 DeepSeek 这一组实测记录；GLM-5.3 数据均为 Mock，仅用于界面演示，其他模型及配置显示为待采集。多套扩容按单套 QPS 线性估算，客户方案需在实际业务负载下验证。
