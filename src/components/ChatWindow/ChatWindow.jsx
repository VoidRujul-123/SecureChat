import React, { useState, useRef, useEffect } from 'react';
import { Send, Smile, Paperclip, Copy, ShieldCheck, Search, Palette, X, ArrowLeft } from 'lucide-react';
import MessageBubble from '../MessageBubble/MessageBubble';
import EmojiPickerComponent from '../EmojiPicker/EmojiPicker';
import { getPeer } from '../../services/webrtcService';

const themes = [
  { id: 'dark', name: 'Dark Theme' },
  { id: 'hacker-green', name: 'Hacker Green' },
  { id: 'purple-neon', name: 'Purple Neon' },
  { id: 'minimal-white', name: 'Minimal White' }
];

const ChatWindow = ({ 
  activeRoom, 
  messages, 
  onSendMessage, 
  peerId, 
  onEditMessage, 
  onReactMessage, 
  onPinMessage, 
  onBookmarkMessage,
  typingUser,
  onTyping,
  isBookmarksView,
  currentUserName,
  onBack
}) => {
  const [inputText, setInputText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [editingMessage, setEditingMessage] = useState(null);
  
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = (e) => {
    e.preventDefault();
    if (!inputText.trim() || !activeRoom) return;
    
    if (editingMessage) {
      onEditMessage(editingMessage.id, inputText);
      setEditingMessage(null);
    } else {
      onSendMessage(inputText);
    }
    setInputText('');
  };

  const onEmojiClick = (emojiData) => {
    setInputText(prev => prev + emojiData.emoji);
    setShowEmojiPicker(false);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert("File too large (max 5MB)");
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        onSendMessage(null, {
          name: file.name,
          type: file.type,
          data: event.target.result
        });
      };
      reader.readAsDataURL(file);
      e.target.value = ''; // Reset input
    }
  };

  const handleEditClick = (id, text) => {
    setEditingMessage({ id, text });
    setInputText(text);
  };

  const changeTheme = (themeId) => {
    document.body.setAttribute('data-theme', themeId);
    localStorage.setItem('securechat-theme', themeId);
    setShowThemePicker(false);
  };

  useEffect(() => {
    const savedTheme = localStorage.getItem('securechat-theme');
    if (savedTheme) {
      document.body.setAttribute('data-theme', savedTheme);
    }
  }, []);

  const filteredMessages = searchQuery 
    ? messages.filter(m => m.text?.toLowerCase().includes(searchQuery.toLowerCase()))
    : messages;

  const pinnedMessages = messages.filter(m => m.pinned === 1);

  if (!activeRoom) {
    return (
      <div className="chat-window-empty w-100" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
        <div style={{ padding: '20px', borderRadius: '50%', background: 'var(--glass-bg)', marginBottom: '20px' }}>
          <ShieldCheck size={48} />
        </div>
        <h3>Select a chat or create a new room</h3>
        <p style={{ marginTop: '8px', fontSize: '14px' }}>Peer ID: <code style={{ color: 'var(--accent-secondary)' }}>{peerId}</code></p>
        <button 
          className="btn btn-secondary" 
          style={{ marginTop: '16px' }}
          onClick={() => {
            navigator.clipboard.writeText(peerId);
            alert("Peer ID copied to clipboard!");
          }}
        >
          <Copy size={14} /> Copy My Peer ID
        </button>
      </div>
    );
  }

  return (
    <div className="chat-window w-100" style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      <div className="chat-header" style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button className="btn-icon d-md-none me-2 p-0" style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }} onClick={onBack}>
              <ArrowLeft size={20} />
            </button>
            <div style={{ fontSize: '15px', fontWeight: '600' }}>{activeRoom}</div>
            <div style={{ fontSize: '10px', color: 'var(--success)', background: 'rgba(0, 230, 118, 0.1)', padding: '2px 8px', borderRadius: '10px' }}>Encrypted</div>
          </div>
          {typingUser && (
            <div style={{ fontSize: '11px', color: 'var(--accent-secondary)', marginTop: '2px' }}>{typingUser} is typing...</div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={() => setShowSearch(!showSearch)} className="btn-icon" style={{ color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}>
            <Search size={20} />
          </button>
          <button onClick={() => setShowThemePicker(!showThemePicker)} className="btn-icon" style={{ color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}>
            <Palette size={20} />
          </button>
        </div>
      </div>

      {showSearch && (
        <div style={{ padding: '12px 24px', background: 'var(--bg-card)', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '10px' }}>
          <input 
            type="text" 
            placeholder="Search messages..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ flex: 1, padding: '8px 12px', fontSize: '14px' }}
            autoFocus
          />
          <button onClick={() => { setShowSearch(false); setSearchQuery(''); }} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>
      )}

      {showThemePicker && (
        <div className="glass" style={{ position: 'absolute', top: '70px', right: '24px', zIndex: 100, padding: '12px', width: '200px' }}>
          <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>Select Theme</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {themes.map(t => (
              <button 
                key={t.id} 
                className="btn-secondary" 
                style={{ padding: '8px', fontSize: '13px', justifyContent: 'flex-start' }}
                onClick={() => changeTheme(t.id)}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {pinnedMessages.length > 0 && (
        <div style={{ padding: '8px 24px', background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ fontSize: '10px', color: 'var(--accent-secondary)', fontWeight: 'bold' }}>PINNED MESSAGES</div>
          {pinnedMessages.slice(0, 2).map(m => (
            <div key={m.messageId} style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              📍 {m.text}
            </div>
          ))}
          {pinnedMessages.length > 2 && <div style={{ fontSize: '10px' }}>+ {pinnedMessages.length - 2} more</div>}
        </div>
      )}

      <div className="messages-container" style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {filteredMessages.map((msg) => (
          <MessageBubble 
            key={msg.messageId} 
            message={msg} 
            onEdit={handleEditClick}
            onReact={onReactMessage}
            onPin={onPinMessage}
            onBookmark={onBookmarkMessage}
            isBookmarksView={isBookmarksView}
            currentUserName={currentUserName}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area" style={{ padding: '24px', position: 'relative' }}>
        {editingMessage && (
          <div style={{ position: 'absolute', bottom: '100%', left: '24px', right: '24px', padding: '8px 16px', background: 'var(--bg-card)', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '12px' }}>Editing: <span style={{ color: 'var(--text-secondary)' }}>{editingMessage.text}</span></div>
            <button onClick={() => { setEditingMessage(null); setInputText(''); }} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}><X size={14} /></button>
          </div>
        )}
        {showEmojiPicker && (
          <div style={{ position: 'absolute', bottom: '80px', left: '24px', zIndex: 100 }}>
            <EmojiPickerComponent onEmojiClick={onEmojiClick} />
          </div>
        )}
        <form onSubmit={handleSend} className="glass" style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', gap: '8px' }}>
          <button 
            type="button" 
            className="btn" 
            style={{ padding: '8px', color: 'var(--text-secondary)' }}
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          >
            <Smile size={20} />
          </button>
          <button 
            type="button" 
            className="btn" 
            style={{ padding: '8px', color: 'var(--text-secondary)' }}
            onClick={() => fileInputRef.current.click()}
          >
            <Paperclip size={20} />
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            style={{ display: 'none' }} 
          />
          <input 
            type="text" 
            placeholder="Type a secure message..." 
            value={inputText}
            onChange={(e) => {
              setInputText(e.target.value);
              onTyping();
            }}
            style={{ flex: 1, border: 'none', background: 'transparent' }}
          />
          <button type="submit" className="btn btn-primary" style={{ padding: '10px' }}>
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatWindow;
