import { Navigate, Route, Routes } from 'react-router';
import { ChatPage } from '../features/chat/ChatPage';
import { DocumentsPage } from '../features/documents/DocumentsPage';
import { TopBar } from './TopBar';
import './app.css';

export function App() {
  return (
    <div className="app">
      <TopBar />
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
