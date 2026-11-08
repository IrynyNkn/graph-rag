import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { GraphView } from '../graph/GraphView';
import { Composer } from './Composer';
import { MessageList } from './MessageList';
import { IDLE_TURN } from './turn-state';
import { isChatEmpty, selectGraph } from './turns';
import { useConversation, useConversations } from './use-conversations';
import { useHeldGraph } from './use-held-graph';
import { useTurn } from './use-turn';
import './chat.css';

export function ChatPage() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const { error: listError, create } = useConversations();
  const { messages, isLoading, error: conversationError } = useConversation(conversationId);
  const failure = conversationError ?? listError;
  const { turn: anyTurn, send } = useTurn();
  const [selectedMessageId, setSelectedMessageId] = useState<number | null>(null);

  // A turn keeps running while the user looks at another conversation, but it belongs to its own.
  const turn = anyTurn.conversationId === conversationId ? anyTurn : IDLE_TURN;
  const isEmpty = isChatEmpty(messages, turn, isLoading);
  const graph = useHeldGraph(selectGraph(turn, messages, selectedMessageId), isLoading);

  const handleSend = async (question: string) => {
    const id = conversationId ?? (await create()).id;
    if (conversationId === undefined) {
      navigate(`/chat/${id}`);
    }
    setSelectedMessageId(null);
    await send(id, question);
  };

  return (
    <div className="chat">
      <section className={isEmpty ? 'chat-column is-empty' : 'chat-column'}>
        {failure !== null && <p className="chat-error">{failure.message}</p>}
        <MessageList
          messages={messages}
          turn={turn}
          isEmpty={isEmpty}
          selectedMessageId={selectedMessageId}
          onSelect={setSelectedMessageId}
        />
        <Composer isCentered={isEmpty} disabled={anyTurn.isStreaming} onSend={handleSend} />
      </section>
      <GraphView
        graph={graph}
        isSearching={turn.isStreaming && turn.graph === null}
        isAnswering={turn.isStreaming && turn.graph !== null}
      />
    </div>
  );
}
