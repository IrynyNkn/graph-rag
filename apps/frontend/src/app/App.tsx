import { Navigate, NavLink, Route, Routes } from 'react-router';
import { ChatPage } from '../features/chat/ChatPage';
import { DocumentsPage } from '../features/documents/DocumentsPage';
import './app.css';

export function App() {
  return (
    <div className="app">
      <header className="app-header">
        <span className="app-title">Graph RAG</span>
        <nav className="app-nav">
          <NavLink to="/chat">Chat</NavLink>
          <NavLink to="/documents">Documents</NavLink>
        </nav>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Navigate to="/chat" replace />} />
          <Route path="/chat/:conversationId?" element={<ChatPage />} />
          <Route path="/documents" element={<DocumentsPage />} />
        </Routes>
      </main>
    </div>
  );
}
