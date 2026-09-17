# 08 — Review System

Review 聚合四类来源：错题、用户标记题、生词、人工加入复习的内容。每个 review item 保留来源内容 ID、Session、原因、最近结果和下次到期时间。

首版调度采用可解释的固定间隔状态机（按日期到期）：

- `again`：置为明天且重置连续成功次数；
- `hard`：明天，保留当前成功阶段；
- `good`：按 1 / 3 / 7 / 14 天递进；
- `easy`：按 3 / 7 / 14 天递进。

所有间隔均记录事件日志，不覆盖历史。错题提交后可自动入队；标记题和生词由用户明确加入。删除题包前必须检查未完成 Session、review item、annotation 和 vocabulary 引用。

Review 页面至少提供 Due、Mistakes、Marked、Vocabulary、History 视图，并允许回到原文上下文。

Listening 错题可额外保存 `sourceStartMs`，回放时通过 Study 模式深链定位。Exam 模式不消费该字段，避免绕过顺序播放约束。
