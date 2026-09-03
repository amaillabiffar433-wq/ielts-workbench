import { useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  FileJson,
  FileText,
  FolderOpen,
  PackagePlus,
  ScanText,
  ShieldCheck,
} from "lucide-react";
import { Link } from "react-router-dom";

import { PageHeader } from "../../components/common/PageHeader";
import { ORIGINAL_DEMO_PACK_FOLDER } from "../../infrastructure/demo";
import type {
  InstalledPackSummary,
  PackValidationIssue,
  PackValidationReport,
} from "../../infrastructure/repositories/LearningRepository";
import {
  desktopRuntimeAvailable,
  pickPackDirectory,
} from "../../infrastructure/workspace/folderPicker";
import { useWorkbenchStore } from "../../stores/workbenchStore";
import "./import-center.css";

type ImportPhase = "idle" | "selecting" | "validating" | "ready" | "installing" | "installed";

const moduleLabels = {
  reading: "Reading",
  listening: "Listening",
  writing: "Writing",
} as const;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function IssueList({
  title,
  issues,
  severity,
}: {
  title: string;
  issues: readonly PackValidationIssue[];
  severity: "error" | "warning";
}) {
  if (issues.length === 0) return null;
  return (
    <section
      aria-labelledby={`validation-${severity}-title`}
      className={`validation-issue-group validation-issue-group--${severity}`}
      role={severity === "error" ? "alert" : undefined}
    >
      <h3 id={`validation-${severity}-title`}>
        <AlertTriangle aria-hidden="true" size={16} />
        {title}（{issues.length}）
      </h3>
      <ul>
        {issues.map((issue, index) => (
          <li key={`${issue.code ?? severity}-${issue.path}-${index}`}>
            <div>
              <strong>{issue.code ?? (severity === "error" ? "VALIDATION_ERROR" : "VALIDATION_WARNING")}</strong>
              {issue.path && <code>{issue.path}</code>}
            </div>
            <span>{issue.message}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ImportCenterPage() {
  const installedPacks = useWorkbenchStore((state) => state.installedPacks);
  const validatePack = useWorkbenchStore((state) => state.validatePack);
  const installPack = useWorkbenchStore((state) => state.installPack);
  const clearError = useWorkbenchStore((state) => state.clearError);
  const storeError = useWorkbenchStore((state) => state.error);

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [phase, setPhase] = useState<ImportPhase>("idle");
  const [report, setReport] = useState<PackValidationReport | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [installed, setInstalled] = useState<InstalledPackSummary | null>(null);

  const desktop = desktopRuntimeAvailable();
  const duplicate = report?.pack
    ? installedPacks.find((candidate) => candidate.id === report.pack?.id) ?? null
    : null;
  const reportComplete = Boolean(report?.valid && report.pack);
  const canInstall = reportComplete && !duplicate && confirmed && phase !== "installing";
  const displayedError = localError ?? storeError;

  const resetForPath = (path: string) => {
    clearError();
    setLocalError(null);
    setSelectedPath(path);
    setReport(null);
    setInstalled(null);
    setConfirmed(false);
  };

  const runValidation = async (path: string) => {
    resetForPath(path);
    setPhase("validating");
    try {
      const nextReport = await validatePack(path);
      setReport(nextReport);
      setPhase("ready");
      if (nextReport.valid && !nextReport.pack) {
        setLocalError("校验结果缺少 manifest 元数据，不能进入安装步骤。");
      }
    } catch (error) {
      setLocalError(`无法校验所选目录：${errorMessage(error)}`);
      setPhase("ready");
    }
  };

  const choosePack = async () => {
    clearError();
    setLocalError(null);
    setPhase("selecting");
    try {
      const path = await pickPackDirectory();
      if (!path) {
        setPhase("idle");
        return;
      }
      await runValidation(path);
    } catch (error) {
      setLocalError(`无法打开题包目录选择器：${errorMessage(error)}`);
      setPhase("idle");
    }
  };

  const installValidatedPack = async () => {
    if (!selectedPath || !canInstall) return;
    clearError();
    setLocalError(null);
    setPhase("installing");
    try {
      const summary = await installPack(selectedPath);
      setInstalled(summary);
      setConfirmed(false);
      setPhase("installed");
    } catch (error) {
      setLocalError(`安装失败，现有题包没有被覆盖。${errorMessage(error) ? ` 详情：${errorMessage(error)}` : ""}`);
      setPhase("ready");
    }
  };

  return (
    <main className="page import-center-page">
      <PageHeader
        title="导入中心"
        description="Phase 1 只接受本地 `IELTSPack v1` 文件夹。预览只读；明确确认后，桌面端会重新校验并复制到工作区 packs 目录。"
      />

      {!desktop && (
        <div className="notice-banner import-browser-notice" role="status">
          <FileJson aria-hidden="true" size={18} />
          <div>
            <strong>浏览器演示不能读取任意本地文件夹</strong>
            <span>可使用内置原创 demo 路径演示校验报告。它已经安装，因此也会演示重复 ID 防覆盖提示。</span>
          </div>
        </div>
      )}

      {displayedError && (
        <div className="error-banner import-error" role="alert">
          <AlertTriangle aria-hidden="true" size={18} />
          <div>
            <strong>导入流程未完成</strong>
            <div>{displayedError}</div>
          </div>
          <button className="button button--ghost" onClick={() => { setLocalError(null); clearError(); }} type="button">
            关闭
          </button>
        </div>
      )}

      <div className="import-center-layout">
        <section aria-labelledby="pack-import-title" className="import-workflow-panel">
          <div className="import-panel-heading">
            <div>
              <span className="import-panel-eyebrow">SUPPORTED NOW</span>
              <h2 id="pack-import-title">IELTSPack v1 文件夹</h2>
            </div>
            <span className="status-badge status-badge--success">
              <ShieldCheck aria-hidden="true" size={13} />
              离线校验
            </span>
          </div>

          <ol className="import-steps" aria-label="题包导入步骤">
            <li className={selectedPath ? "is-complete" : "is-current"}>
              <span>1</span>
              <div><strong>选择目录</strong><small>通过系统目录选择器授予一次性读取范围</small></div>
            </li>
            <li className={report ? (report.valid ? "is-complete" : "is-error") : selectedPath ? "is-current" : ""}>
              <span>2</span>
              <div><strong>校验与预览</strong><small>检查 manifest、模块 JSON、ID、路径和媒体引用</small></div>
            </li>
            <li className={installed ? "is-complete" : reportComplete && !duplicate ? "is-current" : ""}>
              <span>3</span>
              <div><strong>确认安装</strong><small>重新校验后复制，不覆盖重复 pack ID</small></div>
            </li>
          </ol>

          <div className="import-source-row">
            <div className="import-source-path">
              <span className="field-label">所选源目录</span>
              {selectedPath ? <code>{selectedPath}</code> : <span>尚未选择</span>}
            </div>
            <button className="button" disabled={phase === "selecting" || phase === "validating" || phase === "installing"} onClick={() => void choosePack()} type="button">
              <FolderOpen aria-hidden="true" size={17} />
              {phase === "selecting" ? "正在打开…" : selectedPath ? "重新选择" : "选择题包目录"}
            </button>
            {!desktop && (
              <button
                className="button"
                disabled={phase === "validating" || phase === "installing"}
                onClick={() => void runValidation(ORIGINAL_DEMO_PACK_FOLDER)}
                type="button"
              >
                验证内置原创 demo
              </button>
            )}
          </div>

          <div aria-live="polite" className="import-live-status">
            {phase === "validating" && "正在读取并校验题包；尚未写入工作区。"}
            {phase === "installing" && "正在重新校验并安装；请勿断开工作区磁盘。"}
            {phase === "installed" && "题包已安装并登记。"}
          </div>

          {report && (
            <section aria-labelledby="validation-report-title" className="validation-report">
              <div className="validation-report__heading">
                <div>
                  <h2 id="validation-report-title">校验报告</h2>
                  <p>报告只预览源目录；安装命令仍会重新校验。</p>
                </div>
                <span className={`status-badge ${report.valid ? "status-badge--success" : "status-badge--warning"}`}>
                  {report.valid ? <CheckCircle2 aria-hidden="true" size={13} /> : <AlertTriangle aria-hidden="true" size={13} />}
                  {report.valid ? "结构有效" : "存在阻止安装的错误"}
                </span>
              </div>

              {report.pack && (
                <dl className="pack-preview-metadata">
                  <div><dt>标题</dt><dd>{report.pack.title}</dd></div>
                  <div><dt>Pack ID</dt><dd><code>{report.pack.id}</code></dd></div>
                  <div><dt>来源标签</dt><dd>{report.pack.sourceLabel}</dd></div>
                  <div>
                    <dt>模块</dt>
                    <dd>{report.pack.modules.map((module) => moduleLabels[module]).join(" / ")}</dd>
                  </div>
                  <div><dt>语言</dt><dd>{report.pack.language}</dd></div>
                  <div><dt>署名</dt><dd>{report.pack.attribution ?? "未提供"}</dd></div>
                </dl>
              )}

              <IssueList issues={report.errors} severity="error" title="错误" />
              <IssueList issues={report.warnings} severity="warning" title="警告" />

              {report.valid && report.errors.length === 0 && report.warnings.length === 0 && (
                <div className="validation-clean-result">
                  <CheckCircle2 aria-hidden="true" size={17} />
                  未发现结构错误或警告。请核对元数据与版权来源后再安装。
                </div>
              )}

              {duplicate && (
                <div className="notice-banner duplicate-pack-warning" role="alert">
                  <AlertTriangle aria-hidden="true" size={18} />
                  <div>
                    <strong>Pack ID 已安装：{duplicate.id}</strong>
                    <span>为保护只读题包和用户状态，本轮拒绝覆盖、合并或自动重命名。现有题包保持不变。</span>
                  </div>
                </div>
              )}

              {reportComplete && !duplicate && (
                <div className="install-confirmation">
                  <label>
                    <input
                      checked={confirmed}
                      onChange={(event) => setConfirmed(event.currentTarget.checked)}
                      type="checkbox"
                    />
                    <span>
                      我已核对题包 ID、来源与模块，并确认自己有权使用这些本地材料。安装将复制内容，不修改源目录。
                    </span>
                  </label>
                  <button
                    className="button button--primary"
                    disabled={!canInstall}
                    onClick={() => void installValidatedPack()}
                    type="button"
                  >
                    <PackagePlus aria-hidden="true" size={17} />
                    {phase === "installing" ? "正在安装…" : "确认安装到工作区"}
                  </button>
                </div>
              )}

              {installed && (
                <div className="import-success" role="status">
                  <CheckCircle2 aria-hidden="true" size={20} />
                  <div>
                    <strong>{installed.title} 已安装</strong>
                    <span>数据库已登记 pack ID：{installed.id}</span>
                  </div>
                  <Link className="button" to="/library">返回题库</Link>
                </div>
              )}
            </section>
          )}
        </section>

        <aside aria-labelledby="unsupported-import-title" className="unsupported-import-panel">
          <div className="import-panel-heading">
            <div>
              <span className="import-panel-eyebrow">ASSISTED IMPORT</span>
              <h2 id="unsupported-import-title">文档来源</h2>
            </div>
          </div>
          <p>Reading PDF 已提供本地文本层提取；扫描件 OCR 与其他格式仍保持关闭。</p>
          <ul className="unsupported-import-list">
            <li>
              <FileText aria-hidden="true" size={18} />
              <div><strong>Reading PDF</strong><span>页面预览、范围选择、规则提取与人工校正</span></div>
              <Link className="button" to="/import/pdf">导入 PDF</Link>
            </li>
            <li>
              <FileText aria-hidden="true" size={18} />
              <div><strong>DOCX</strong><span>后续接入同一文档来源适配器</span></div>
              <button className="button" disabled type="button">暂不可用</button>
            </li>
            <li>
              <ScanText aria-hidden="true" size={18} />
              <div><strong>扫描件 / OCR</strong><span>不会把图片自动发送到外部服务</span></div>
              <button className="button" disabled type="button">暂不可用</button>
            </li>
            <li>
              <Bot aria-hidden="true" size={18} />
              <div><strong>AI 辅助解析</strong><span>Provider 尚未配置，导入不依赖 AI</span></div>
              <button className="button" disabled type="button">保持离线</button>
            </li>
          </ul>
          <div className="unsupported-import-note">
            <ShieldCheck aria-hidden="true" size={17} />
            <span>不抓取、不热链第三方题站；仓库和 demo 不包含 Cambridge 真题或媒体。</span>
          </div>
        </aside>
      </div>
    </main>
  );
}
