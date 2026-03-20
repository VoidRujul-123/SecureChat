import React, { useState, useEffect } from 'react';
import { Plus, Hash, Settings, LogOut, MessageSquare, Phone, Video, User as UserIcon, Copy, Trash, Bookmark } from 'lucide-react';
import { loadChats, subscribe } from '../../services/storageService';
import { getPeerStatus, getActiveConnections } from '../../services/webrtcService';

const Sidebar = ({ user, onLogout, activeRoom, onSelectRoom, onCreateRoom, onJoinRoom, peerId, onDeleteChat }) => {
  const [chats, setChats] = useState([]);
  const [peerStatus, setPeerStatus] = useState({});

  useEffect(() => {
    const fetchChats = async () => {
      const lowerUsername = user?.username?.toLowerCase();
      if (lowerUsername) {
        const storedChats = await loadChats(lowerUsername);
        setChats(storedChats);
      }
    };
    fetchChats();
    
    const unsubscribe = subscribe(fetchChats);
    
    // Status Polling
    const statusInterval = setInterval(() => {
        const statuses = {};
        const activeCounts = getActiveConnections();
        chats.forEach(chat => {
            if (chat.roomId.startsWith('room-')) {
                statuses[chat.roomId] = activeCounts[chat.roomId] > 0 ? 'online' : 'disconnected';
            } else {
                const targetId = chat.roomId.startsWith('securechat-') ? chat.roomId : `securechat-${chat.roomId}`;
                statuses[chat.roomId] = getPeerStatus(targetId);
            }
        });
        setPeerStatus(statuses);
    }, 3000);

    return () => {
        unsubscribe();
        clearInterval(statusInterval);
    };
  }, [user.username, chats]);

  const copyPeerId = () => {
    navigator.clipboard.writeText(peerId);
    alert("Peer ID copied to clipboard!");
  };

  return (
    <div className="sidebar w-100" style={{ 
      height: '100%', 
      borderRight: '1px solid var(--border-color)',
      display: 'flex',
      flexDirection: 'column',
      background: 'rgba(5, 5, 10, 0.5)'
    }}>
      <div className="sidebar-header" style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: '600' }}>
              {user.username[0].toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: '600' }}>{user.username}</div>
              <div style={{ fontSize: '10px', color: 'var(--success)' }}>Online</div>
            </div>
          </div>
          <button className="btn" onClick={onLogout} style={{ padding: '8px', color: 'var(--text-secondary)' }}>
            <LogOut size={18} />
          </button>
        </div>
        
        <div 
          onClick={copyPeerId}
          style={{ 
            fontSize: '11px', 
            background: 'var(--glass-bg)', 
            padding: '8px 12px', 
            borderRadius: '8px', 
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            border: '1px solid var(--glass-border)',
            color: 'var(--text-secondary)'
          }}
        >
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: '8px' }}>
            ID: {peerId}
          </div>
          <Copy size={12} />
        </div>
      </div>

      <div className="sidebar-actions" style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-secondary" onClick={onCreateRoom} style={{ flex: 1, fontSize: '12px' }}>
            <Plus size={14} /> Create
          </button>
          <button className="btn btn-secondary" onClick={onJoinRoom} style={{ flex: 1, fontSize: '12px' }}>
            <Hash size={14} /> Join
          </button>
        </div>
        <button 
          className={`btn ${activeRoom === 'bookmarks' ? 'btn-primary' : 'btn-secondary'}`} 
          onClick={() => onSelectRoom('bookmarks')} 
          style={{ width: '100%', fontSize: '12px' }}
        >
          <Bookmark size={14} /> Saved Messages
        </button>
      </div>

      <div className="sidebar-list" style={{ flex: 1, overflowY: 'auto', padding: '0 12px' }}>
        <div style={{ color: 'var(--text-secondary)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', padding: '12px 12px' }}>
          Recent Chats
        </div>
        {chats.map(chat => {
          const status = peerStatus[chat.roomId] || 'offline';
          const isOnline = status === 'online';
          
          return (
            <div 
              key={chat.roomId} 
              className={`chat-item ${activeRoom === chat.roomId ? 'active' : ''}`}
              onClick={() => onSelectRoom(chat.roomId)}
              style={{
                padding: '12px',
                borderRadius: '12px',
                cursor: 'pointer',
                marginBottom: '4px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                background: activeRoom === chat.roomId ? 'var(--glass-border)' : 'transparent',
                transition: 'background 0.2s',
                position: 'relative'
              }}
            >
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'var(--glass-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                {chat.roomId.startsWith('room-') ? (
                  <Hash size={18} color="var(--accent-secondary)" />
                ) : (
                  <UserIcon size={18} color="var(--accent-primary)" />
                )}
                {isOnline && (
                  <div style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: 'var(--success)',
                    position: 'absolute',
                    bottom: '-2px',
                    right: '-2px',
                    border: '2px solid var(--bg-dark)'
                  }} />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {chat.roomId.startsWith('room-') ? chat.name : (chat.name.startsWith('p2p-') ? chat.name.replace('Chat with ', '') : chat.name)}
                </div>
                <div style={{ fontSize: '11px', color: isOnline ? 'var(--success)' : 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', opacity: isOnline ? 0.8 : 0.5 }}>
                  {chat.roomId.startsWith('room-') ? (isOnline ? 'Active' : 'Group Room') : (chat.roomId.startsWith('p2p-') ? (isOnline ? 'Active Now' : 'Direct Message') : (isOnline ? 'Active Now' : 'Contact'))}
                </div>
              </div>
              <button 
                className="btn-delete"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDeleteChat(chat.roomId);
                }}
                style={{ 
                  padding: '8px', 
                  color: 'rgba(255,255,255,0.2)', 
                  background: 'transparent', 
                  transition: 'color 0.2s',
                  cursor: 'pointer',
                  zIndex: 10,
                  position: 'relative'
                }}
                onMouseOver={(e) => e.currentTarget.style.color = 'var(--danger)'}
                onMouseOut={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.2)'}
              >
                <Trash size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Sidebar;
