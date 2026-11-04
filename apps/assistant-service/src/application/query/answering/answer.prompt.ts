import type { ChatMessage } from '@graph-rag/inference';
import type { ConversationHistory } from '../../conversations/conversation-history.js';
import type { AnswerContext } from './context-builder.js';

const KNOWLEDGE_INSTRUCTIONS = `You answer questions using only the knowledge below, which was retrieved from the user's documents.

Path notation:
- A --[relation]--> B means "A relation B".
- A <--[relation]-- B means "B relation A".

Rules:
- Use only the knowledge below. Never add anything from outside knowledge.
- Follow the paths to connect facts across several steps.
- Answer directly and concisely, in the language of the question, in plain text without Markdown.
- If the knowledge does not contain the answer, say that you could not find it in the documents. Do not guess.`;

const NO_KNOWLEDGE_INSTRUCTIONS = `You are an assistant that answers questions from the user's documents, but nothing relevant to this message was found in them.

If the message is a greeting or small talk, reply briefly and offer to answer questions about the documents. Otherwise say that you could not find this in the documents. Never answer from outside knowledge.`;

export function buildKnowledgeMessages(
  context: AnswerContext,
  history: ConversationHistory,
  question: string,
): ChatMessage[] {
  return buildMessages(`${KNOWLEDGE_INSTRUCTIONS}\n\n${formatContext(context)}`, history, question);
}

export function buildNoKnowledgeMessages(
  history: ConversationHistory,
  question: string,
): ChatMessage[] {
  return buildMessages(NO_KNOWLEDGE_INSTRUCTIONS, history, question);
}

export function buildMessages(
  instructions: string,
  { summary, messages }: ConversationHistory,
  question: string,
): ChatMessage[] {
  const system =
    summary === null ? instructions : `${instructions}\n\nEarlier in this conversation: ${summary}`;
  return [{ role: 'system', content: system }, ...messages, { role: 'user', content: question }];
}

function formatContext({ paths, descriptions, chunks }: AnswerContext): string {
  const passages = chunks.map((chunk) => `From "${chunk.documentName}":\n${chunk.text}`);
  return [
    formatSection('Knowledge graph paths', paths),
    formatSection('Entity descriptions', descriptions),
    formatSection('Source passages', passages, '\n\n'),
  ]
    .filter((section) => section.length > 0)
    .join('\n\n');
}

function formatSection(title: string, lines: string[], separator = '\n'): string {
  return lines.length > 0 ? `${title}:\n${lines.join(separator)}` : '';
}
