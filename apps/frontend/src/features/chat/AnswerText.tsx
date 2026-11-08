import type { ComponentProps } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { closeOpenMarkers, rehypeLiveAnswer } from './answer-markdown';
import './AnswerText.css';

const REMARK_PLUGINS = [remarkGfm];
const LIVE_REHYPE_PLUGINS = [rehypeLiveAnswer];
// The text can come from any document, and the app must not fetch anything because of it.
const DISALLOWED_ELEMENTS = ['img'];
const COMPONENTS: Components = { a: AnswerLink };

interface AnswerTextProps {
  text: string;
  isLive?: boolean;
}

export function AnswerText({ text, isLive = false }: AnswerTextProps) {
  return (
    <div className="answer-text">
      <Markdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={isLive ? LIVE_REHYPE_PLUGINS : undefined}
        disallowedElements={DISALLOWED_ELEMENTS}
        unwrapDisallowed
        components={COMPONENTS}
      >
        {isLive ? closeOpenMarkers(text) : text}
      </Markdown>
    </div>
  );
}

/** A link in an answer must not take the user away from the conversation. */
function AnswerLink({ node: _node, children, ...props }: ComponentProps<'a'> & { node?: unknown }) {
  return (
    <a {...props} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}
