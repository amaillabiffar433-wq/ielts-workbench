import { displayQuestionCorrectAnswer, questionNumberLabel, type QuestionAnswerValue } from "../../domain";
import type { Question } from "../../domain/pack";
import { questionContainerId } from "./questionDomIds";
import "./QuestionRenderer.css";

export type QuestionRendererProps = {
  question: Question;
  answer?: QuestionAnswerValue;
  onAnswer: (questionId: string, answer: QuestionAnswerValue) => void;
  disabled?: boolean;
  showCorrectAnswer?: boolean;
  instanceId?: string;
  displayNumber?: number;
  inline?: boolean;
  disabledOptionIds?: ReadonlySet<string>;
};

function CorrectAnswer({ question }: { question: Question }) {
  return <p className="question__answer-key">参考答案：{displayQuestionCorrectAnswer(question)}</p>;
}

export function QuestionRenderer({
  question,
  answer = "",
  onAnswer,
  disabled = false,
  showCorrectAnswer = false,
  instanceId = "question-view",
  displayNumber = question.number,
  inline = false,
  disabledOptionIds = new Set(),
}: QuestionRendererProps) {
  const domPrefix = `${instanceId}-${question.id}`;
  const legendId = `${domPrefix}-legend`;
  const containerId = questionContainerId(instanceId, question.id);

  return (
    <section
      aria-labelledby={legendId}
      className={`question${inline ? " question--inline" : ""}`}
      data-question-id={question.id}
      id={containerId}
      tabIndex={-1}
    >
      <div className="question__number" aria-hidden="true">{question.type === "multiple-choice" ? questionNumberLabel(question) : displayNumber}</div>
      <div className="question__body">
        <p className="question__prompt" id={legendId}>{question.prompt}</p>
        {question.source?.needsReview && (
          <span className="question__review-badge">待完善题型 · 保留原始提取文本</span>
        )}
        {question.type === "single-choice" && (
          <fieldset aria-labelledby={legendId} className="question__options" disabled={disabled}>
            <legend className="sr-only">选择一个答案</legend>
            {question.options.map((option) => (
              <label key={option.id}>
                <input
                  checked={(Array.isArray(answer) ? answer[0] : answer) === option.id}
                  name={domPrefix}
                  onChange={() => onAnswer(question.id, option.id)}
                  type="radio"
                  value={option.id}
                />
                <span className="question__option-label">{option.label}</span>
                <span>{option.text}</span>
              </label>
            ))}
          </fieldset>
        )}
        {question.type === "multiple-choice" && (() => {
          const selected = Array.isArray(answer) ? [...answer] : answer ? [answer] : [];
          return (
            <fieldset aria-labelledby={legendId} className="question__options" disabled={disabled}>
              <legend className="question__selection-limit">请选择 {question.selectionCount} 项（按题包契约{question.scoringMode === "per-correct-option" ? "逐项计分" : "整组计分"}）</legend>
              {question.options.map((option) => {
                const checked = selected.includes(option.id);
                return (
                  <label key={option.id}>
                    <input
                      checked={checked}
                      disabled={!checked && selected.length >= question.selectionCount}
                      onChange={() => onAnswer(question.id, checked ? selected.filter((id) => id !== option.id) : [...selected, option.id])}
                      type="checkbox"
                      value={option.id}
                    />
                    <span className="question__option-label">{option.label}</span>
                    <span>{option.text}</span>
                  </label>
                );
              })}
              <span className="question__limit">已选 {selected.length}/{question.selectionCount}</span>
            </fieldset>
          );
        })()}
        {question.type === "true-false-not-given" && (
          <fieldset aria-labelledby={legendId} className="question__options question__options--horizontal" disabled={disabled}>
            <legend className="sr-only">选择 True、False 或 Not Given</legend>
            {[
              ["true", "True"],
              ["false", "False"],
              ["not-given", "Not Given"],
            ].map(([value, label]) => (
              <label key={value}>
                <input
                  checked={answer === value}
                  name={domPrefix}
                  onChange={() => onAnswer(question.id, value)}
                  type="radio"
                  value={value}
                />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>
        )}
        {question.type === "yes-no-not-given" && (
          <fieldset aria-labelledby={legendId} className="question__options question__options--horizontal" disabled={disabled}>
            <legend className="sr-only">选择 Yes、No 或 Not Given</legend>
            {[["yes", "Yes"], ["no", "No"], ["not-given", "Not Given"]].map(([value, label]) => (
              <label key={value}>
                <input
                  checked={(Array.isArray(answer) ? answer[0] : answer) === value}
                  name={domPrefix}
                  onChange={() => onAnswer(question.id, value)}
                  type="radio"
                  value={value}
                />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>
        )}
        {question.type === "matching" && (
          <label className="question__matching">
            <span>匹配选项</span>
            <select
              aria-label={`第 ${displayNumber} 题匹配选项`}
              className="select"
              disabled={disabled}
              onChange={(event) => onAnswer(question.id, event.target.value)}
              value={Array.isArray(answer) ? answer[0] ?? "" : answer}
            >
              <option value="">请选择</option>
              {question.options.map((option) => (
                <option disabled={disabledOptionIds.has(option.id)} key={option.id} value={option.id}>{option.label} · {option.text}</option>
              ))}
            </select>
            <span className="question__limit">{question.allowOptionReuse ? "该题组允许重复使用选项" : "该题组每个选项只能使用一次"}</span>
          </label>
        )}
        {(question.type === "short-answer" || question.type === "fill-blank") && (
          <div className="question__text-answer">
            {question.type === "fill-blank" && (
              <p className="question__sentence">
                {question.sentence.replace("{{blank}}", (typeof answer === "string" ? answer : answer.join(" ")) || "________")}
              </p>
            )}
            <label className="sr-only" htmlFor={`${domPrefix}-answer`}>第 {displayNumber} 题答案</label>
            <input
              aria-describedby={question.maxWords ? `${domPrefix}-limit` : undefined}
              className="input"
              disabled={disabled}
              id={`${domPrefix}-answer`}
              onChange={(event) => onAnswer(question.id, event.target.value)}
              placeholder="输入答案"
              spellCheck={false}
              type="text"
              value={Array.isArray(answer) ? answer.join(" ") : answer}
            />
            {question.maxWords && (
              <span className="question__limit" id={`${domPrefix}-limit`}>
                不超过 {question.maxWords} 个单词
              </span>
            )}
          </div>
        )}
        {showCorrectAnswer && <CorrectAnswer question={question} />}
      </div>
    </section>
  );
}
