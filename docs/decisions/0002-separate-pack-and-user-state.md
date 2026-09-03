# ADR 0002：不可变题包与可变用户状态分离

- 状态：Accepted
- 日期：2026-09-01

## 背景

题目、正文、答案键和媒体是来源内容；用户答案、标记、练习 Session、作文草稿和版本会持续变化。若把两类数据写在同一 JSON 中，题包更新、重复安装、恢复与备份都会存在覆盖用户工作的风险，也会使双 Pane 错误地以视图副本作为状态身份。

## 决策

- `IELTSPack v1` 是版本化、安装后只读的源数据。
- Pack、Test、Module、Section、ContentBlock、QuestionGroup、Question 与 MediaAsset 均使用稳定 ID。
- 可变数据写入工作区中的 SQLite，不反写已安装题包。
- 答案以 `(session_id, question_id)` 为唯一键。
- 文字标记以稳定 `block_id` 和 `start/end + quote/prefix/suffix` 锚定；它属于 Session/内容，不属于左 Pane 或右 Pane。
- 作文草稿可以 upsert；手动版本和 submit 快照只能新增，不能被静默覆盖。
- 导入同一 pack ID 时拒绝覆盖；升级需要未来的显式升级流程与兼容检查。

## 结果

- 两个 Pane 渲染同一领域记录，答案与标记可以即时同步而无需复制。
- 题包可以校验、复制、备份或升级，而不会直接覆盖用户状态。
- Review 能追溯用户输入与当时使用的稳定内容 ID。
- schema、迁移、交叉引用检查和锚点恢复逻辑增加了实现成本。
- 若源文本在新题包版本中变化，offset 可能失效；系统必须使用 `quote + prefix + suffix` 尝试恢复，歧义时应报告而不是猜测。

## 未采用方案

- 每个 Pane 保存一份答案/标记：身份错误，会产生不同步与重复记录。
- 直接修改题包 JSON：破坏只读来源和升级安全。
- 仅使用像素、DOM 节点或屏幕坐标锚定：无法跨布局、刷新或字体变化稳定恢复。
