import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router';
import { ConversationSwitcher } from '../features/chat/ConversationSwitcher';
import { LogoMark, PlusIcon } from './icons';
import { SNAPPY } from './motion';
import { ThemeToggle } from './ThemeToggle';

export function TopBar() {
  const navigate = useNavigate();
  return (
    <header className="topbar">
      <div className="topbar-start">
        <div className="topbar-brand">
          <LogoMark />
          <span>Graph RAG</span>
        </div>
        <nav className="topbar-nav" aria-label="Sections">
          <TopBarLink to="/chat">Chat</TopBarLink>
          <TopBarLink to="/documents">Documents</TopBarLink>
        </nav>
      </div>
      <ConversationSwitcher />
      <div className="topbar-tools">
        <button type="button" className="topbar-new" onClick={() => navigate('/chat')}>
          <PlusIcon />
          <span>New chat</span>
        </button>
        <ThemeToggle />
      </div>
    </header>
  );
}

function TopBarLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <NavLink to={to} className="topbar-link">
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="nav-highlight"
              className="topbar-highlight"
              transition={SNAPPY}
            />
          )}
          <span>{children}</span>
        </>
      )}
    </NavLink>
  );
}
