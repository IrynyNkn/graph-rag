import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { GraphView } from '../graph/GraphView';
import { Composer } from './Composer';
import { ConversationList } from './ConversationList';
import { MessageList } from './MessageList';
import { selectGraph } from './selected-graph';
import { useConversation, useConversations } from './use-conversations';
import { IDLE_TURN } from './turn-state';
import { useTurn } from './use-turn';

export function ChatPage() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const { conversations, error: listError, create, remove } = useConversations();
  const { messages, error: conversationError } = useConversation(conversationId);
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

  const handleRemove = async (id: string) => {
    await remove(id);
    if (id === conversationId) {
      navigate('/chat');
    }
  };

  return (
    <div className="chat">
      <ConversationList
        conversations={conversations}
        activeId={conversationId}
        onNew={() => navigate('/chat')}
        onRemove={handleRemove}
      />
      <div className="chat-main">
        {failure !== null && <p className="error chat-error">{failure.message}</p>}
        <MessageList
          messages={messages}
          turn={turn}
          selectedMessageId={selectedMessageId}
          onSelect={setSelectedMessageId}
        />
        <Composer disabled={anyTurn.isStreaming} onSend={handleSend} />
      </div>
      <GraphView graph={selectGraph(turn, messages, selectedMessageId)} />
    </div>
  );
}
