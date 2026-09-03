# ADR 0004：IELTSPack v1 限制为单 Test、每类单 Module

- 状态：已接受
- 日期：2026-09-02

## 背景

v1 使用固定文件名 `modules/reading.json`、`modules/listening.json` 和 `modules/writing.json`。如果同时允许一个 pack 存在多个 Test 或同类型多个 Module，文件布局无法无歧义地定位模块；UI 也可能把用户选择的第二个 Test 错误路由到第一个模块。

## 决策

`IELTSPack v1` 恰好包含一个 Test，并且 Reading、Listening、Writing 每种类型最多包含一个 Module。`manifest.tests[0].moduleIds` 引用 pack 中的全部模块，模块的 `testId` 必须指向这个唯一 Test。

前端 Zod、Rust 导入校验、原创示例和 `docs/DATA_FORMAT.md` 必须同时执行该限制。多 Test 和自定义模块文件映射只能通过后续 `schemaVersion` 引入。

## 结果

- v1 的文件解析、路由和离线安装保持确定性。
- Library 仍按 Pack → Test → Module 展示，但 v1 每个 Pack 只有一个 Test。
- 未来增加多 Test 时需要新 schema、明确的模块文件映射、迁移兼容测试和按 route ID 选择模块，不能改变既有 v1 语义。
