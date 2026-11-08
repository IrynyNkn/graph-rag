import { splitAnswer } from './answer-parts';

interface AnswerTextProps {
  text: string;
  isLive?: boolean;
}

export function AnswerText({ text, isLive = false }: AnswerTextProps) {
  const parts = splitAnswer(text);
  if (!isLive) {
    return parts.map((part, index) =>
      part.isBold ? <strong key={index}>{part.text}</strong> : part.text,
    );
  }
  return (
    <>
      <LiveWords text={parts.map((part) => part.text).join('')} />
      <span className="answer-caret" aria-hidden="true" />
    </>
  );
}

/** A word keeps its index as more text arrives, so that only the new ones run their entrance. */
function LiveWords({ text }: { text: string }) {
  return text.split(/(\s+)/).map((word, index) =>
    index % 2 === 1 ? (
      word
    ) : (
      <span key={index} className="word">
        {word}
      </span>
    ),
  );
}
