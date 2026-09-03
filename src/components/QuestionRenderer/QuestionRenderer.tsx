import type { Question } from "../../domain/pack";
import { questionContainerId } from "./questionDomIds";
import "./QuestionRenderer.css";

export type QuestionRendererProps = {
  question: Question;
  answer?: string;
  onAnswer: (questionId: string, answer: string) => void;
  disabled?: boolean;
  showCorrectAnswer?: boolean;
  instanceId?: string;
};

function CorrectAnswer({ question }: { question: Question }) {
  let answer: string | null;

  switch (question.type) {
    case "single-choice":
      answer = question.correctOptionId
        ? question.options.find((option) => option.id === question.correctOptionId)?.text ?? question.correctOptionId
        : null;
      break;
    case "true-false-not-given":
      answer = question.correctAnswer?.replace("not-given", "Not Given") ?? null;
      break;
    case "short-answer":
    case "fill-blank":
      answer = question.acceptableAnswers.length > 0 ? question.acceptableAnswers.join(" / ") : null;
      break;
  }

  if (!answer) return <p className="question__answer-key">参考答案尚未录入，请人工核对。</p>;
  return <p className="question__answer-key">参考答案：{answer}</p>;
}

export function QuestionRenderer({
  question,
  answer = "",
  onAnswer,
  disabled = false,
  showCorrectAnswer = false,
  instanceId = "question-view",
}: QuestionRendererProps) {
  const domPrefix = `${instanceId}-${question.id}`;
  const legendId = `${domPrefix}-legend`;
  const containerId = questionContainerId(instanceId, question.id);

  return (
    <section
      aria-labelledby={legendId}
      className="question"
      data-question-id={question.id}
      id={containerId}
      tabIndex={-1}
    >
      <div className="question__number" aria-hidden="true">{question.number}</div>
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
                  checked={answer === option.id}
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
        {(question.type === "short-answer" || question.type === "fill-blank") && (
          <div className="question__text-answer">
            {question.type === "fill-blank" && (
              <p className="question__sentence">
                {question.sentence.replace("{{blank}}", answer || "________")}
              </p>
            )}
            <label className="sr-only" htmlFor={`${domPrefix}-answer`}>第 {question.number} 题答案</label>
            <input
              aria-describedby={question.maxWords ? `${domPrefix}-limit` : undefined}
              className="input"
              disabled={disabled}
              id={`${domPrefix}-answer`}
              onChange={(event) => onAnswer(question.id, event.target.value)}
              placeholder="输入答案"
              spellCheck={false}
              type="text"
              value={answer}
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
