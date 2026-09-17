import { Flag } from "lucide-react";
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
  flagged?: boolean;
  onToggleFlag?: () => void;
};

function CorrectAnswer({ question }: { question: Question }) {
  return <p className="question__answer-key">Answer: {displayQuestionCorrectAnswer(question)}</p>;
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
  flagged = false,
  onToggleFlag,
}: QuestionRendererProps) {
  const domPrefix = `${instanceId}-${question.id}`;
  const legendId = `${domPrefix}-legend`;
  const containerId = questionContainerId(instanceId, question.id);

  if (inline && (question.type === "short-answer" || question.type === "fill-blank")) {
    const answerId = `${domPrefix}-answer`;
    const limitId = `${domPrefix}-limit`;
    return (
      <span
        aria-labelledby={legendId}
        className={`question question--inline${flagged ? " question--flagged" : ""}`}
        data-question-id={question.id}
        id={containerId}
        tabIndex={-1}
      >
        <span className="question__number" aria-hidden="true">{displayNumber}</span>
        <span className="question__body">
          <span className="sr-only" id={legendId}>{question.prompt}</span>
          <span className="question__text-answer">
            <label className="sr-only" htmlFor={answerId}>Answer for question {displayNumber}</label>
            <input
              aria-describedby={question.maxWords ? limitId : undefined}
              className="input"
              disabled={disabled}
              id={answerId}
              onChange={(event) => onAnswer(question.id, event.target.value)}
              spellCheck={false}
              type="text"
              value={Array.isArray(answer) ? answer.join(" ") : answer}
            />
            {question.maxWords && (
              <span className="sr-only" id={limitId}>Maximum {question.maxWords} word{question.maxWords === 1 ? "" : "s"}</span>
            )}
          </span>
        </span>
        {onToggleFlag && (
          <button
            aria-label={`${flagged ? "Remove review flag from" : "Flag"} question ${displayNumber} for review`}
            aria-pressed={flagged}
            className="question__flag"
            onClick={onToggleFlag}
            title={flagged ? "Remove review flag" : "Flag for review"}
            type="button"
          ><Flag aria-hidden="true" size={13} /></button>
        )}
      </span>
    );
  }

  return (
    <section
      aria-labelledby={legendId}
      className={`question${inline ? " question--inline" : ""}${flagged ? " question--flagged" : ""}`}
      data-question-id={question.id}
      id={containerId}
      tabIndex={-1}
    >
      <div className="question__index">
        <div className="question__number" aria-hidden="true">{question.type === "multiple-choice" ? questionNumberLabel(question) : displayNumber}</div>
        {onToggleFlag && (
          <button
            aria-label={`${flagged ? "Remove review flag from" : "Flag"} question ${displayNumber} for review`}
            aria-pressed={flagged}
            className="question__flag"
            onClick={onToggleFlag}
            title={flagged ? "Remove review flag" : "Flag for review"}
            type="button"
          ><Flag aria-hidden="true" size={13} /></button>
        )}
      </div>
      <div className="question__body">
        <p className="question__prompt" id={legendId}>{question.prompt}</p>
        {question.type === "single-choice" && (
          <fieldset aria-labelledby={legendId} className="question__options" disabled={disabled}>
            <legend className="sr-only">Choose one answer</legend>
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
              <legend className="question__selection-limit">Choose {question.selectionCount} options ({question.scoringMode === "per-correct-option" ? "scored per correct option" : "scored as a set"})</legend>
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
              <span className="question__limit">Selected {selected.length}/{question.selectionCount}</span>
            </fieldset>
          );
        })()}
        {question.type === "true-false-not-given" && (
          <fieldset aria-labelledby={legendId} className="question__options question__options--horizontal" disabled={disabled}>
            <legend className="sr-only">Choose True, False, or Not Given</legend>
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
            <legend className="sr-only">Choose Yes, No, or Not Given</legend>
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
            <span>Match</span>
            <select
              aria-label={`Matching option for question ${displayNumber}`}
              className="select"
              disabled={disabled}
              onChange={(event) => onAnswer(question.id, event.target.value)}
              value={Array.isArray(answer) ? answer[0] ?? "" : answer}
            >
              <option value="">Choose</option>
              {question.options.map((option) => (
                <option disabled={disabledOptionIds.has(option.id)} key={option.id} value={option.id}>{option.label} · {option.text}</option>
              ))}
            </select>
            <span className="question__limit">{question.allowOptionReuse ? "Options may be reused in this group" : "Each option may be used once in this group"}</span>
          </label>
        )}
        {(question.type === "short-answer" || question.type === "fill-blank") && (
          <div className="question__text-answer">
            {question.type === "fill-blank" && (
              <p className="question__sentence">
                {question.sentence.replace("{{blank}}", (typeof answer === "string" ? answer : answer.join(" ")) || "________")}
              </p>
            )}
            <label className="sr-only" htmlFor={`${domPrefix}-answer`}>Answer for question {displayNumber}</label>
            <input
              aria-describedby={question.maxWords ? `${domPrefix}-limit` : undefined}
              className="input"
              disabled={disabled}
              id={`${domPrefix}-answer`}
              onChange={(event) => onAnswer(question.id, event.target.value)}
              placeholder="Enter answer"
              spellCheck={false}
              type="text"
              value={Array.isArray(answer) ? answer.join(" ") : answer}
            />
            {question.maxWords && (
              <span className="question__limit" id={`${domPrefix}-limit`}>
                No more than {question.maxWords} word{question.maxWords === 1 ? "" : "s"}
              </span>
            )}
          </div>
        )}
        {showCorrectAnswer && <CorrectAnswer question={question} />}
      </div>
    </section>
  );
}
