import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  Bot,
  FileSearch,
  Maximize2,
  MessageSquare,
  SendHorizontal,
  Trash2,
  Users,
  X
} from 'lucide-react';
import { apiUrl } from '../../utils/api';
import './AdminAIChatbotModule.css';

const INITIAL_MESSAGES = [
  {
    id: 'assistant-welcome',
    role: 'assistant',
    content:
      'Ask about resident counts, resident information, renter status, gate activity, visitor behavior, complaints, or facility activity. I only answer from the current HOA system data.',
    createdAt: '2026-07-21T08:00:00+08:00'
  }
];

const CHAT_STORAGE_KEY = 'ecotrend-admin-ai-chatbot-history-v2';
const DOCK_POSITION_STORAGE_KEY = 'ecotrend-admin-ai-chatbot-dock-position-v1';

const SUGGESTED_PROMPTS = [
  'How many approved residents do we currently have?',
  'Resident "Dela Cruz" - show account data, address, and vehicles.',
  'Renter "Santos" - show approval status and expiry details.',
  'Summarize the latest security concerns from entry logs, complaints, and visitors.',
  'Show me the latest gate activity and unusual access patterns.',
  'Which facilities are getting the most reservations lately?',
  'How many renters are currently expired or nearing expiry?'
];

const DOCK_PROMPTS = SUGGESTED_PROMPTS.slice(0, 3);

const CAPABILITIES = [
  {
    icon: Users,
    title: 'Resident lookup',
    description: 'Check counts, household records, renter status, approval details, and attached vehicles.'
  },
  {
    icon: Activity,
    title: 'Security summaries',
    description: 'Review gate movement, visitor activity, delivery flow, and unusual patterns.'
  },
  {
    icon: FileSearch,
    title: 'Operations context',
    description: 'Ask about complaints, facility reservations, and current administrative pressure points.'
  }
];

const QUICK_PATTERNS = [
  'Resident "Family Name"',
  'Renter "Family Name"',
  'Get data for resident: Family Name',
  'Info on "Resident Name"'
];

const createMessage = (role, content, extra = {}) => ({
  id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  role,
  content,
  ...extra
});

const readStoredMessages = () => {
  if (typeof window === 'undefined') {
    return INITIAL_MESSAGES;
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(CHAT_STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return INITIAL_MESSAGES;
    }

    const validMessages = parsed.filter(
      (item) =>
        item &&
        ['assistant', 'user'].includes(String(item.role || '').toLowerCase()) &&
        String(item.content || '').trim()
    );

    return validMessages.length > 0 ? validMessages : INITIAL_MESSAGES;
  } catch (error) {
    return INITIAL_MESSAGES;
  }
};

const readStoredDockPosition = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(DOCK_POSITION_STORAGE_KEY) || 'null');
    const x = Number(parsed?.x);
    const y = Number(parsed?.y);

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }

    return { x, y };
  } catch (error) {
    return null;
  }
};

const formatTime = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

const AdminAIChatbotModule = ({ token, showAlert, mode = 'page', onExpand }) => {
  const [messages, setMessages] = useState(() => readStoredMessages());
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [dockOpen, setDockOpen] = useState(false);
  const [dockPosition, setDockPosition] = useState(() => readStoredDockPosition());
  const dockRef = useRef(null);
  const dockDragRef = useRef(null);
  const ignoreNextLauncherClickRef = useRef(false);
  const threadRef = useRef(null);
  const isDock = mode === 'dock';

  useEffect(() => {
    if (threadRef.current && (!isDock || dockOpen)) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [dockOpen, isDock, messages, sending]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
    }
  }, [messages]);

  useEffect(() => {
    if (!isDock || typeof window === 'undefined') {
      return undefined;
    }

    const handleResize = () => {
      setDockPosition((current) => {
        if (!current) {
          return current;
        }

        const launcher = dockRef.current?.querySelector('.admin-ai-chatbot-dock__launcher');
        const width = launcher?.offsetWidth || 148;
        const height = launcher?.offsetHeight || 60;
        const margin = 12;
        const next = {
          x: Math.min(Math.max(margin, current.x), window.innerWidth - width - margin),
          y: Math.min(Math.max(margin, current.y), window.innerHeight - height - margin)
        };

        window.localStorage.setItem(DOCK_POSITION_STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => window.removeEventListener('resize', handleResize);
  }, [isDock]);

  useEffect(() => {
    if (!isDock || typeof window === 'undefined') {
      return;
    }

    if (dockPosition) {
      window.localStorage.setItem(DOCK_POSITION_STORAGE_KEY, JSON.stringify(dockPosition));
    } else {
      window.localStorage.removeItem(DOCK_POSITION_STORAGE_KEY);
    }
  }, [dockPosition, isDock]);

  useEffect(() => {
    if (!isDock || typeof window === 'undefined') {
      return undefined;
    }

    const handleWindowPointerMove = (event) => {
      const drag = dockDragRef.current;

      if (!drag) {
        return;
      }

      const dx = event.clientX - drag.startClientX;
      const dy = event.clientY - drag.startClientY;

      if (!drag.moved && Math.hypot(dx, dy) < 4) {
        return;
      }

      event.preventDefault();
      drag.moved = true;
      ignoreNextLauncherClickRef.current = true;

      const margin = 12;
      setDockPosition({
        x: Math.min(Math.max(margin, drag.startX + dx), window.innerWidth - drag.width - margin),
        y: Math.min(Math.max(margin, drag.startY + dy), window.innerHeight - drag.height - margin)
      });
    };

    const handleWindowPointerUp = () => {
      const drag = dockDragRef.current;

      if (drag?.moved) {
        ignoreNextLauncherClickRef.current = true;
      }

      dockDragRef.current = null;
    };

    window.addEventListener('pointermove', handleWindowPointerMove, { passive: false });
    window.addEventListener('pointerup', handleWindowPointerUp);
    window.addEventListener('pointercancel', handleWindowPointerUp);

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
      window.removeEventListener('pointercancel', handleWindowPointerUp);
    };
  }, [isDock]);

  const promptCountLabel = useMemo(
    () => `${SUGGESTED_PROMPTS.length} quick prompts`,
    []
  );
  const hasConversation = useMemo(
    () => messages.some((message) => message.role === 'user'),
    [messages]
  );
  const showDockSuggestions = !hasConversation && !sending;

  const sendMessage = async (messageOverride = '') => {
    const trimmedMessage = String(messageOverride || input).trim();

    if (!trimmedMessage || sending) {
      return;
    }

    const historyPayload = messages
      .filter((message) => ['user', 'assistant'].includes(message.role))
      .slice(-8)
      .map((message) => ({
        role: message.role,
        content: message.content
      }));

    const nextUserMessage = createMessage('user', trimmedMessage, {
      createdAt: new Date().toISOString()
    });

    setMessages((current) => [...current, nextUserMessage]);
    setInput('');
    setSending(true);

    try {
      const response = await fetch(apiUrl('/admin-ai/chat'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          message: trimmedMessage,
          history: historyPayload
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Unable to reach the admin AI chatbot right now.');
      }

      setMessages((current) => [
        ...current,
        createMessage('assistant', data.reply || 'No response was generated.', {
          createdAt: new Date().toISOString()
        })
      ]);
    } catch (error) {
      const message = error.message || 'Unable to reach the admin AI chatbot right now.';

      setMessages((current) => [
        ...current,
        createMessage('assistant', message, {
          createdAt: new Date().toISOString(),
          tone: 'error'
        })
      ]);

      if (typeof showAlert === 'function') {
        showAlert(message, 'error');
      }
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  const clearConversation = () => {
    if (sending) {
      return;
    }

    setMessages(INITIAL_MESSAGES);
    setInput('');
  };

  const handleLauncherPointerDown = (event) => {
    if (!isDock || event.button !== 0) {
      return;
    }

    event.preventDefault();

    const launcherRect = event.currentTarget.getBoundingClientRect();
    const dockRect = dockRef.current?.getBoundingClientRect() || launcherRect;

    dockDragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: dockPosition?.x ?? dockRect.left,
      startY: dockPosition?.y ?? dockRect.top,
      width: launcherRect.width,
      height: launcherRect.height,
      moved: false
    };
  };

  const renderPromptList = (compact = false) => (
    <div className={`admin-ai-chatbot__prompt-list ${compact ? 'is-compact' : ''}`}>
      {SUGGESTED_PROMPTS.map((prompt) => (
        <button
          key={prompt}
          type="button"
          className="admin-ai-chatbot__prompt"
          onClick={() => sendMessage(prompt)}
          disabled={sending}
        >
          <span>{prompt}</span>
          <SendHorizontal size={14} />
        </button>
      ))}
    </div>
  );

  const renderDockPromptList = () => (
    <div className="admin-ai-chatbot-dock__prompt-list">
      {DOCK_PROMPTS.map((prompt) => (
        <button
          key={prompt}
          type="button"
          className="admin-ai-chatbot-dock__prompt"
          onClick={() => sendMessage(prompt)}
          disabled={sending}
        >
          <span>{prompt}</span>
          <SendHorizontal size={14} />
        </button>
      ))}
    </div>
  );

  const renderThread = () => (
    <div className="admin-ai-chatbot__thread" ref={threadRef}>
      {messages.map((message) => (
        <article
          key={message.id}
          className={`admin-ai-chatbot__message admin-ai-chatbot__message--${message.role} ${
            message.tone === 'error' ? 'is-error' : ''
          }`}
        >
          <div className="admin-ai-chatbot__message-avatar">
            {message.role === 'assistant' ? <Bot size={16} /> : <Users size={16} />}
          </div>
          <div className="admin-ai-chatbot__message-body">
            <div className="admin-ai-chatbot__message-meta">
              <strong>{message.role === 'assistant' ? 'AI Assistant' : 'You'}</strong>
              {message.createdAt && <span>{formatTime(message.createdAt)}</span>}
            </div>
            <p>{message.content}</p>
          </div>
        </article>
      ))}

      {sending && (
        <article className="admin-ai-chatbot__message admin-ai-chatbot__message--assistant is-pending">
          <div className="admin-ai-chatbot__message-avatar">
            <Bot size={16} />
          </div>
          <div className="admin-ai-chatbot__message-body">
            <div className="admin-ai-chatbot__message-meta">
              <strong>AI Assistant</strong>
              <span>Thinking</span>
            </div>
            <div className="admin-ai-chatbot__typing">
              <span />
              <span />
              <span />
            </div>
          </div>
        </article>
      )}
    </div>
  );

  const renderComposer = (compact = false) => (
    <div className={`admin-ai-chatbot__composer ${compact ? 'is-compact' : ''}`}>
      <textarea
        value={input}
        onChange={(event) => setInput(event.target.value.slice(0, 1500))}
        onKeyDown={handleKeyDown}
        placeholder='Try: Resident "Dela Cruz" or Get data for resident: Santos'
        rows={compact ? 2 : 4}
        disabled={sending}
      />
      <div className="admin-ai-chatbot__composer-footer">
        <span>{input.trim().length}/1500</span>
        <button
          type="button"
          className="admin-ai-chatbot__send-btn"
          onClick={() => sendMessage()}
          disabled={!input.trim() || sending}
        >
          <SendHorizontal size={16} />
          <span>{sending ? 'Sending...' : 'Send question'}</span>
        </button>
      </div>
    </div>
  );

  if (isDock) {
    const dockStyle = dockPosition
      ? {
          left: `${dockPosition.x}px`,
          top: `${dockPosition.y}px`,
          right: 'auto',
          bottom: 'auto'
        }
      : undefined;

    return (
      <div
        className={`admin-ai-chatbot-dock ${dockOpen ? 'is-open' : ''} ${dockPosition ? 'is-positioned' : ''}`}
        style={dockStyle}
        ref={dockRef}
      >
        {dockOpen && (
          <button
            type="button"
            className="admin-ai-chatbot-dock__backdrop"
            onClick={() => setDockOpen(false)}
            aria-label="Close AI chatbot"
          />
        )}

        <div className="admin-ai-chatbot-dock__shell">
          {dockOpen && (
            <section className="admin-ai-chatbot-dock__panel" aria-label="Admin AI Chatbot popup">
              <div className="admin-ai-chatbot-dock__panel-head">
                <div>
                  <div className="admin-ai-chatbot__kicker">
                    <Bot size={15} />
                    <span>Admin AI Chatbot</span>
                  </div>
                  <p>Resident, renter, and security lookups without leaving the page.</p>
                </div>
                <div className="admin-ai-chatbot-dock__actions">
                  <button
                    type="button"
                    className="admin-ai-chatbot-dock__icon-btn"
                    onClick={() => {
                      if (typeof onExpand === 'function') {
                        onExpand();
                      }
                      setDockOpen(false);
                    }}
                    aria-label="Open full AI chatbot module"
                  >
                    <Maximize2 size={16} />
                  </button>
                  <button
                    type="button"
                    className="admin-ai-chatbot-dock__icon-btn"
                    onClick={() => setDockOpen(false)}
                    aria-label="Close AI chatbot popup"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              <div className="admin-ai-chatbot-dock__shortcut-row">
                {QUICK_PATTERNS.map((pattern) => (
                  <button
                    key={pattern}
                    type="button"
                    className="admin-ai-chatbot-dock__shortcut"
                    onClick={() => setInput(pattern)}
                  >
                    {pattern}
                  </button>
                ))}
              </div>

              {showDockSuggestions ? renderDockPromptList() : null}
              {hasConversation || sending ? renderThread() : null}
              {renderComposer(true)}
            </section>
          )}

          <button
            type="button"
            className="admin-ai-chatbot-dock__launcher"
            onPointerDown={handleLauncherPointerDown}
            onClick={() => {
              if (ignoreNextLauncherClickRef.current) {
                ignoreNextLauncherClickRef.current = false;
                return;
              }

              setDockOpen((current) => !current);
            }}
            aria-label={dockOpen ? 'Hide AI chatbot' : 'Show AI chatbot'}
            title="Click to open, drag to move"
          >
            <div className="admin-ai-chatbot-dock__launcher-icon">
              <MessageSquare size={18} />
            </div>
            <div className="admin-ai-chatbot-dock__launcher-copy">
              <strong>h-AI</strong>
              <span>Need help?</span>
            </div>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-ai-chatbot">
      <div className="admin-ai-chatbot__hero">
        <div className="admin-ai-chatbot__hero-copy">
          <div className="admin-ai-chatbot__kicker">
            <Bot size={16} />
            <span>Admin AI Chatbot</span>
          </div>
          <h2>Ask the system for grounded resident and security answers</h2>
          <p>
            This admin-only assistant reads the current resident, gate, complaint, and facility data
            already stored in your portal, then replies in a concise operational format.
          </p>
          <div className="admin-ai-chatbot__shortcut-row">
            {QUICK_PATTERNS.map((pattern) => (
              <button
                key={pattern}
                type="button"
                className="admin-ai-chatbot__shortcut"
                onClick={() => setInput(pattern)}
              >
                {pattern}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="admin-ai-chatbot__workspace">
        <section className="admin-ai-chatbot__conversation">
          <div className="admin-ai-chatbot__conversation-head">
            <div>
              <h3>Conversation</h3>
              <p>Use direct prompts like resident names, renter checks, and gate summaries.</p>
            </div>
            <button
              type="button"
              className="admin-ai-chatbot__clear-btn"
              onClick={clearConversation}
              disabled={sending}
            >
              <Trash2 size={15} />
              <span>Clear chat</span>
            </button>
          </div>

          {renderThread()}
          {renderComposer()}
        </section>

        <aside className="admin-ai-chatbot__sidebar">
          <div className="admin-ai-chatbot__panel">
            <div className="admin-ai-chatbot__panel-head">
              <div>
                <h3>Quick prompts</h3>
                <p>Tap one to send it instantly.</p>
              </div>
              <span className="admin-ai-chatbot__pill">{promptCountLabel}</span>
            </div>

            {renderPromptList()}
          </div>

          <div className="admin-ai-chatbot__panel">
            <div className="admin-ai-chatbot__panel-head">
              <div>
                <h3>What it can answer</h3>
                <p>Best for quick admin retrieval and summaries.</p>
              </div>
            </div>

            <div className="admin-ai-chatbot__capability-list">
              {CAPABILITIES.map((item) => {
                const Icon = item.icon;

                return (
                  <div key={item.title} className="admin-ai-chatbot__capability">
                    <div className="admin-ai-chatbot__capability-icon">
                      <Icon size={16} />
                    </div>
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="admin-ai-chatbot__notice">
              <AlertCircle size={16} />
              <p>
                The chatbot stays grounded to current system records. If a detail is missing in the
                database, it should say so instead of inventing an answer.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default AdminAIChatbotModule;

