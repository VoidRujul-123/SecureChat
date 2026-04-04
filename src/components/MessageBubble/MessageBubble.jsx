import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { decryptMessage } from '../../services/encryptionService';
import { Download, File as FileIcon, Edit2, Smile, ThumbsUp, Heart, Laugh, Pin, Bookmark } from 'lucide-react';

const MessageBubble = ({ message, onEdit, onReact, onPin, onBookmark, isBookmarksView, currentUserName }) => {
  const isMe = message.isMe;
  const [showOptions, setShowOptions] = useState(false);
  const [showReactions, setShowReactions] = useState(false);

  const reactions = message.reactions || {};
  const hasReactions = Object.keys(reactions).length > 0;

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      onMouseEnter={() => {
        if (window.hoverTimeout) clearTimeout(window.hoverTimeout);
        setShowOptions(true);
      }}
      onMouseLeave={() => {
        window.hoverTimeout = setTimeout(() => {
          if (!showReactions) setShowOptions(false);
        }, 300);
      }}
      style={{
        alignSelf: isMe ? 'flex-end' : 'flex-start',
        maxWidth: '85%',
        display: 'flex',
        flexDirection: isMe ? 'row-reverse' : 'row',
        alignItems: 'flex-end',
        gap: '10px',
        position: 'relative',
        marginBottom: hasReactions ? '20px' : '4px'
      }}
    >
      {!isMe && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
          <div style={{ 
            width: '28px', 
            height: '28px', 
            borderRadius: '50%', 
            background: 'var(--accent-secondary)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            fontSize: '12px',
            fontWeight: 'bold',
            color: 'white',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
          }}>
            {(message.sender || '?')[0].toUpperCase()}
          </div>
          <div style={{ fontSize: '8px', color: 'var(--text-secondary)', maxWidth: '40px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {message.sender}
          </div>
        </div>
      )}

      <div style={{ position: 'relative' }}>
        {isBookmarksView && (
          <div style={{ 
            fontSize: '10px', 
            color: 'var(--accent-secondary)', 
            marginBottom: '4px', 
            fontWeight: '600',
            display: 'flex',
            gap: '4px',
            opacity: 0.8
          }}>
            <span>{message.sender}</span>
            <span style={{ opacity: 0.5 }}>•</span>
            <span>{message.roomName || 'Direct Message'}</span>
          </div>
        )}
        <div style={{
          padding: '12px 16px',
          borderRadius: isMe ? '16px 16px 0 16px' : '0 16px 16px 16px',
          background: isMe ? 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))' : 'var(--glass-bg)',
          border: isMe ? 'none' : '1px solid var(--glass-border)',
          boxShadow: isMe ? '0 4px 15px rgba(124, 77, 255, 0.2)' : 'none',
          fontSize: '14px',
          lineHeight: '1.5',
          position: 'relative',
          color: 'white',
          minWidth: '60px'
        }}>
          {message.pinned === 1 && (
            <div style={{ position: 'absolute', top: '-10px', right: isMe ? 'auto' : '-10px', left: isMe ? '-10px' : 'auto', color: 'var(--accent-secondary)' }}>
              <Pin size={14} fill="currentColor" />
            </div>
          )}
          
          {message.fileData ? (
            <FileRenderer fileData={message.fileData} />
          ) : (
            <div style={{ wordBreak: 'break-word' }}>
              {message.text}
              {message.isEdited && (
                <span style={{ fontSize: '10px', opacity: 0.6, marginLeft: '8px', fontStyle: 'italic' }}>(Edited)</span>
              )}
            </div>
          )}

          <div style={{
            fontSize: '9px',
            color: isMe ? 'rgba(255, 255, 255, 0.7)' : 'var(--text-secondary)',
            marginTop: '6px',
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: '4px'
          }}>
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            {isMe && (
              <span style={{ color: message.readStatus === 'read' ? '#4fc3f7' : 'inherit' }}>
                {message.readStatus === 'read' ? '✔✔' : message.readStatus === 'delivered' ? '✔✔' : '✔'}
              </span>
            )}
          </div>
        </div>

        {/* Reaction Display */}
        {hasReactions && (
          <div style={{ 
            position: 'absolute', 
            bottom: '-18px', 
            left: isMe ? 'auto' : '0',
            right: isMe ? '0' : 'auto',
            display: 'flex', 
            gap: '4px',
            background: 'var(--bg-card)',
            padding: '2px 6px',
            borderRadius: '10px',
            border: '1px solid var(--glass-border)',
            fontSize: '10px'
          }}>
            {Object.entries(reactions).map(([emoji, users]) => {
              const userList = Array.isArray(users) ? users : [];
              const count = userList.length;
              if (count === 0) return null;
              
              const hasReacted = userList.includes(currentUserName);
              
              return (
                <span 
                  key={emoji} 
                  onClick={(e) => {
                    e.stopPropagation();
                    onReact(message.messageId, emoji);
                  }} 
                  style={{ 
                    cursor: 'pointer',
                    padding: '2px 6px',
                    borderRadius: '6px',
                    background: hasReacted ? 'var(--accent-primary)' : 'rgba(255,255,255,0.05)',
                    border: hasReacted ? 'none' : '1px solid var(--glass-border)',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    color: hasReacted ? 'white' : 'var(--text-secondary)'
                  }}
                  onMouseOver={(e) => {
                    if (!hasReacted) e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                  }}
                  onMouseOut={(e) => {
                    if (!hasReacted) e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                  }}
                >
                  <span style={{ fontSize: '11px' }}>{emoji}</span>
                  <span style={{ fontSize: '10px', fontWeight: '600' }}>{count}</span>
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Message Options Menu */}
      {showOptions && (
        <div style={{ 
          display: 'flex', 
          gap: '4px', 
          alignItems: 'center',
          background: 'var(--bg-card)',
          padding: '4px',
          borderRadius: '8px',
          border: '1px solid var(--glass-border)',
          position: 'absolute',
          top: '-35px',
          right: isMe ? '0' : 'auto',
          left: isMe ? 'auto' : '0',
          zIndex: 10
        }}>
          <button onClick={() => setShowReactions(!showReactions)} title="React" style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: '4px' }}>
            <Smile size={14} />
          </button>
          {isMe && !message.fileData && (
            <button onClick={() => onEdit(message.messageId, message.text)} title="Edit" style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: '4px' }}>
              <Edit2 size={14} />
            </button>
          )}
          <button onClick={() => onPin(message.messageId)} title="Pin" style={{ background: 'none', border: 'none', color: message.pinned === 1 ? 'var(--accent-secondary)' : 'white', cursor: 'pointer', padding: '4px' }}>
            <Pin size={14} />
          </button>
          <button onClick={() => onBookmark(message.messageId)} title="Bookmark" style={{ background: 'none', border: 'none', color: message.bookmarked === 1 ? 'var(--accent-secondary)' : 'white', cursor: 'pointer', padding: '4px' }}>
            <Bookmark size={14} />
          </button>

          {showReactions && (
            <div 
              className="glass" 
              style={{ 
                position: 'absolute', 
                bottom: '100%', 
                left: '0', 
                display: 'flex', 
                gap: '8px', 
                padding: '8px', 
                marginBottom: '12px' // Add some space
              }}
              onMouseEnter={() => {
                if (window.hoverTimeout) clearTimeout(window.hoverTimeout);
              }}
            >
              {/* Invisible bridge to prevent mouse-leave gaps */}
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, height: '12px' }} />
              
              {['👍', '❤️', '😂', '😮'].map(emoji => (
                <span 
                  key={emoji} 
                  onClick={() => { 
                    onReact(message.messageId, emoji); 
                    setShowReactions(false); 
                    setShowOptions(false);
                  }} 
                  style={{ cursor: 'pointer', fontSize: '16px', transition: 'transform 0.1s' }}
                  onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.3)'}
                  onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
                >
                  {emoji}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
};

const FileRenderer = ({ fileData }) => {
  let decryptedData = '';
  try {
    decryptedData = decryptMessage(fileData.data);
  } catch (e) {
    console.error("Failed to decrypt file data", e);
    return <div style={{ color: 'var(--danger)', fontSize: '12px' }}>[Error decrypting file]</div>;
  }

  if (!decryptedData) {
    return <div style={{ color: 'var(--danger)', fontSize: '12px' }}>[Invalid file data]</div>;
  }

  const isImage = fileData.type.startsWith('image/');

  if (isImage) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <img 
          src={decryptedData} 
          alt={fileData.name} 
          style={{ maxWidth: '100%', borderRadius: '8px', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.1)' }}
          onClick={() => window.open(decryptedData)}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '12px', opacity: 0.8, wordBreak: 'break-all', maxWidth: '75%' }}>{fileData.name}</div>
          <a
            href={decryptedData}
            download={fileData.name}
            style={{ fontSize: '11px', color: 'var(--accent-secondary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
            title="Download Image"
          >
            <Download size={14} /> 
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <div style={{ padding: '10px', background: 'rgba(255,255,255,0.1)', borderRadius: '8px' }}>
        <FileIcon size={24} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '13px', fontWeight: '500' }}>{fileData.name}</div>
        <a 
          href={decryptedData} 
          download={fileData.name}
          style={{ fontSize: '11px', color: 'var(--accent-secondary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          <Download size={12} /> Download
        </a>
      </div>
    </div>
  );
};

export default MessageBubble;
