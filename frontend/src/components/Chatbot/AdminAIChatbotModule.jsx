import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  Bot,
  FileSearch,
  SendHorizontal,
  Trash2,
  Users
} from 'lucide-react';
import { apiUrl } from '../../utils/api';
import './AdminAIChatbotModule.css';

const INITIAL_MESSAGES = [
  {
    id: 'assistant-welcome',
    role: 'assistant',
    content:
      'Ask about resident counts, resident information, gate activity, visitor behavior, complaints, or facility activity. I only answer from the current HOA system data.'
  }
];

const SUGGESTED_PROMPTS = [
  'How many approved residents do we currently have?',
  'Summarize the latest security concerns from entry logs, complaints, and visitors.',
  'Show me the latest gate activity and unusual access patterns.',
  'Which facilities are getting the most reservations lately?',
  'Find resident information related to Dela Cruz.',
  'How many renters are currently expired or nearing expiry?'
];

const CAPABILITIES = [
  {
    icon: Users,
    title: 'Resident lookup',
    description: 'Check counts, household records, renter status, and approval-related details.'
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

const createMessage = (role, content, extra = {}) => ({
  id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  role,
  content,
  ...extra
});

const formatTime = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

const AdminAIChatbotModule = ({ token, showAlert }) => {
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const threadRef = useRef(null);

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages, sending]);

  const promptCountLabel = useMemo(
    () => `${SUGGESTED_PROMPTS.length} quick prompts`,
    []
  );

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

  const handlePromptClick = (prompt) => {
    sendMessage(prompt);
  };

  const clearConversation = () => {
    if (sending) {
      return;
    }

    setMessages(INITIAL_MESSAGES);
    setInput('');
  };

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
        </div>
      </div>

      <div className="admin-ai-chatbot__workspace">
        <aside className="admin-ai-chatbot__sidebar">
          <div className="admin-ai-chatbot__panel">
            <div className="admin-ai-chatbot__panel-head">
              <div>
                <h3>Quick prompts</h3>
                <p>Tap one to send it instantly.</p>
              </div>
              <span className="admin-ai-chatbot__pill">{promptCountLabel}</span>
            </div>

            <div className="admin-ai-chatbot__prompt-list">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="admin-ai-chatbot__prompt"
                  onClick={() => handlePromptClick(prompt)}
                  disabled={sending}
                >
                  <span>{prompt}</span>
                  <SendHorizontal size={14} />
                </button>
              ))}
            </div>
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

        <section className="admin-ai-chatbot__conversation">
          <div className="admin-ai-chatbot__conversation-head">
            <div>
              <h3>Conversation</h3>
              <p>Use short questions for the fastest admin summaries.</p>
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

          <div className="admin-ai-chatbot__composer">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value.slice(0, 1500))}
              onKeyDown={handleKeyDown}
              placeholder="Ask about residents, gate activity, complaints, facility usage, or other admin summaries..."
              rows={4}
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
        </section>
      </div>
    </div>
  );
};

export default AdminAIChatbotModule;
