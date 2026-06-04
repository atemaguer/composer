import { useEffect, useState } from "react";
import { TextAttributes } from "@opentui/core";
import { providerLabel, type QuestionAnswer } from "@composer/client";
import { useTui } from "../store.js";
import { activeSession } from "../types.js";
import type { RuntimeApi } from "../runtime.js";

/**
 * Inline clarifying-question prompt shown directly above the composer when an
 * engine asks (AskUserQuestion / request_user_input). The focused <select> owns
 * the keyboard while visible; choosing an option answers that question and
 * advances to the next (multi-question), or sends the answers on the last one.
 * Multi-select questions are answered as single-select in the TUI.
 */
export function QuestionPrompt({ runtime }: { runtime: RuntimeApi }) {
  const { state } = useTui();
  const question = activeSession(state)?.pendingQuestion;
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<QuestionAnswer[]>([]);

  // Reset the local cursor whenever a new question opens.
  useEffect(() => {
    setIndex(0);
    setAnswers([]);
  }, [question?.id]);

  if (!question) {
    return null;
  }

  const item = question.questions[index];
  if (!item) {
    return null;
  }

  const pick = (label: string) => {
    const next = [...answers, { questionId: item.id, selected: [label] }];
    if (index + 1 < question.questions.length) {
      setAnswers(next);
      setIndex(index + 1);
      return;
    }
    runtime.answerQuestion(question.id, next);
  };

  const counter =
    question.questions.length > 1
      ? ` (${index + 1}/${question.questions.length})`
      : "";

  return (
    <box
      border
      borderStyle="rounded"
      borderColor="#7dcfff"
      backgroundColor="#1a1b26"
      style={{ flexShrink: 0, marginX: 1, paddingX: 1, flexDirection: "column" }}
    >
      <text fg="#7dcfff">
        {question.provider === "claude" ? "Claude" : question.provider === "codex" ? "Codex" : "Compose"}
        {" asks"}
        {counter}:
      </text>
      {item.header ? (
        <text attributes={TextAttributes.DIM}>{item.header}</text>
      ) : null}
      <text fg="#c0caf5">{item.question}</text>
      <select
        focused
        showDescription
        wrapSelection
        style={{ height: Math.min(item.options.length, 6) }}
        options={item.options.map((option) => ({
          name: option.recommended ? `${option.label}  (recommended)` : option.label,
          description: option.description ?? "",
          value: option.label
        }))}
        onSelect={(_i, option) => {
          if (option) {
            pick((option as { value: string }).value);
          }
        }}
      />
      <text attributes={TextAttributes.DIM}>↑↓ choose · enter answer</text>
    </box>
  );
}
