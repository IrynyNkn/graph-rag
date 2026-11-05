import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { GraphView } from '../graph/GraphView';
import { Composer } from './Composer';
import { ConversationPicker } from './ConversationPicker';
import { MessageList } from './MessageList';
import { IDLE_TURN } from './turn-state';
import { selectGraph } from './turns';
import { useConversation, useConversations } from './use-conversations';
import { useTurn } from './use-turn';
import './chat.css';

export function ChatPage() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const { conversations, error: listError, create, remove } = useConversations();
  const { messages, isLoading, error: conversationError } = useConversation(conversationId);
  const failure = conversationError ?? listError;
  const { turn: anyTurn, send } = useTurn();
  const [selectedMessageId, setSelectedMessageId] = useState<number | null>(null);

  // A turn keeps running while the user looks at another conversation, but it belongs to its own.
  const turn = anyTurn.conversationId === conversationId ? anyTurn : IDLE_TURN;

  const handleSend = async (question: string) => {
    const id = conversationId ?? (await create()).id;
    if (conversationId === undefined) {
      navigate(`/chat/${id}`);
    }
    setSelectedMessageId(null);
    await send(id, question);
  };

  // Leaves first: an open conversation would be refetched after the delete, and retried on its 404.
  const handleRemove = async (id: string) => {
    if (id === conversationId) {
      navigate('/chat');
    }
    await remove(id);
  };

  return (
    <div className="chat">
      <section className="chat-column">
        <ConversationPicker
          conversations={conversations}
          activeId={conversationId}
          onNew={() => navigate('/chat')}
          onRemove={handleRemove}
        />
        {failure !== null && <p className="timeline-error is-global">{failure.message}</p>}
        <MessageList
          messages={messages}
          turn={turn}
          isLoading={isLoading}
          selectedMessageId={selectedMessageId}
          onSelect={setSelectedMessageId}
        />
        <Composer disabled={anyTurn.isStreaming} onSend={handleSend} />
      </section>
      {/* Both empty states are loud, so they would flash on the way to a saved conversation. */}
      {!isLoading && <GraphView graph={selectGraph(turn, messages, selectedMessageId)} />}
    </div>
  );
}
