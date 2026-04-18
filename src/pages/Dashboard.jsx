import React, { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from '../components/Sidebar/Sidebar';
import ChatWindow from '../components/ChatWindow/ChatWindow';
import { createPeerConnection, connectToRoom, sendMessage, getPeer } from '../services/webrtcService';
import { subscribeToMessages } from '../services/supabaseService';
import { saveMessage, loadMessages, loadChats, subscribe, db, saveChat, notify, updateMessageProperties, getMessage, getBookmarkedMessages, getChat, deleteChatHistory } from '../services/storageService';
import { encryptMessage, decryptMessage } from '../services/encryptionService';


const Dashboard = ({ user, onLogout }) => {
  const [activeRoom, setActiveRoom] = useState(null);
  const activeRoomRef = useRef(null);
  const [messages, setMessages] = useState([]);
  const [peerInitialized, setPeerInitialized] = useState(false);
  const [typingUser, setTypingUser] = useState(null);
  const typingTimeoutRef = useRef(null);
  const processedMessagesRef = useRef(new Set());

  const getSymmetricalId = useCallback((user1, user2) => {
    if (!user1 || !user2) return null;
    const u1 = user1.toLowerCase().trim();
    const u2 = user2.toLowerCase().trim();
    const sorted = [u1, u2].sort();
    return `p2p-${sorted[0]}-${sorted[1]}`;
  }, []);

  const refreshMessages = useCallback(async () => {
    const lowerOwner = user?.username?.toLowerCase();
    if (!lowerOwner) return;

    let storedMessages = [];
    if (activeRoom === 'bookmarks') {
      storedMessages = await getBookmarkedMessages(lowerOwner);
    } else if (activeRoom) {
      storedMessages = await loadMessages(activeRoom, lowerOwner);
    }

    const decryptedMessages = (storedMessages || []).map(m => {
      let text = '';
      try {
        text = m.fileData ? '[File]' : (m.encryptedText ? decryptMessage(m.encryptedText, m.roomId) : '');
      } catch (e) {
        console.error("Failed to decrypt message:", e);
        text = '[Decryption Failed]';
      }
      const lowerMe = user?.username?.toLowerCase() || '';
      return {
        ...m,
        text,
        isMe: m.sender?.toLowerCase() === lowerMe
      };
    });
    setMessages(decryptedMessages);
  }, [activeRoom, user?.username]);

  useEffect(() => {
    const unsubscribe = subscribe(() => {
      refreshMessages();
    });
    return () => unsubscribe();
  }, [refreshMessages]);

  const handleReceivedMessage = useCallback(async (data, fromPeer) => {
    if (!data) return;

    // Global Deduplication for Production Reliability
    const dedupeId = data.packetId || data.messageId;
    if (dedupeId && processedMessagesRef.current.has(dedupeId)) return;
    if (dedupeId) processedMessagesRef.current.add(dedupeId);

    if (data.type === 'TYPING') {
      if (data.roomId === activeRoomRef.current) {
        setTypingUser(data.sender);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => setTypingUser(null), 3000);
      }
      return;
    }

    if (data.type === 'READ_RECEIPT') {
      await updateMessageProperties(data.messageId, user.username.toLowerCase(), { readStatus: 'read' });
      return;
    }

    const isRoomMessage = data.roomId && data.roomId.startsWith('room-');
    const isP2P = data.roomId && data.roomId.startsWith('p2p-');
    const senderName = (data.sender || fromPeer?.replace('securechat-', '') || 'Unknown').toLowerCase();
    
    // Determine the local room ID
    let localRoomId = data.roomId;
    if (!isRoomMessage && !isP2P) {
        // Fallback for legacy messages or direct Peer ID routing
        localRoomId = getSymmetricalId(user.username, senderName);
    }

    // Auto-create chat in sidebar if it doesn't exist
    const existingChat = await getChat(localRoomId, user.username.toLowerCase());
    if (!existingChat) {
        await saveChat({
            roomId: localRoomId,
            owner: user.username.toLowerCase(),
            name: isRoomMessage ? (data.roomName || data.roomId) : `Chat with ${senderName}`,
            lastMessage: 'New message...',
            timestamp: Date.now()
        });
        notify();
    }
    
    const messageToSave = {
      ...data,
      roomId: localRoomId,
      sender: senderName,
      roomName: isRoomMessage ? (data.roomName || data.roomId) : senderName
    };
    
    await saveMessage(messageToSave, user.username.toLowerCase());

    // Aggressively pop up the chat window if receiving a new message 
    if (activeRoomRef.current !== localRoomId && data.type !== 'UPDATE' && data.type !== 'READ_RECEIPT') {
        setActiveRoom(localRoomId);
        activeRoomRef.current = localRoomId;
        setTypingUser(null);
    }

    if (activeRoomRef.current === localRoomId && !data.fromSupabase && data.messageId) {
      sendMessage(localRoomId, { type: 'READ_RECEIPT', messageId: data.messageId, roomId: localRoomId });
    }
  }, [user.username, getSymmetricalId]);

  useEffect(() => {
    if (user.username) {
      createPeerConnection(user.username.toLowerCase(), handleReceivedMessage, null);
      const timer = setInterval(() => {
          if (getPeer()?.open) {
              setPeerInitialized(true);
              clearInterval(timer);
          }
      }, 500);
      return () => clearInterval(timer);
    }
  }, [user.username, handleReceivedMessage]);
  // SUPABASE REALTIME
  useEffect(() => {
    if (!user?.username) return;

    const lowerMe = user.username.toLowerCase();
    
    // Global User Subscription: Listen for messages sent to ME in ANY room
    const globalUnsubscribe = subscribeToMessages(
      `user-${lowerMe}`, 
      (newMessage) => {
        if (newMessage.sender.toLowerCase() === lowerMe) return;
        const cleanPayload = (newMessage) => {
          const constructed = {
            messageId: newMessage.message_id || newMessage.messageId,
            roomId: newMessage.room_id || newMessage.roomId,
            sender: (newMessage.sender || '').toLowerCase(),
            type: newMessage.type,
            fromSupabase: true
          };
          if (newMessage.encrypted_text || newMessage.encryptedText) constructed.encryptedText = newMessage.encrypted_text || newMessage.encryptedText;
          if (newMessage.file_data || newMessage.fileData) constructed.fileData = newMessage.file_data || newMessage.fileData;
          if (newMessage.timestamp) constructed.timestamp = new Date(newMessage.timestamp).getTime();
          if (newMessage.isEdited !== undefined) constructed.isEdited = newMessage.isEdited;
          if (newMessage.pinned !== undefined) constructed.pinned = newMessage.pinned;
          if (newMessage.bookmarked !== undefined) constructed.bookmarked = newMessage.bookmarked;
          if (newMessage.reactions !== undefined) constructed.reactions = newMessage.reactions;
          return constructed;
        };

        handleReceivedMessage(cleanPayload(newMessage));
      }
    );

    // Active Room Subscription
    let activeUnsubscribe = null;
    if (activeRoom && activeRoom !== 'bookmarks') {
      activeUnsubscribe = subscribeToMessages(
        activeRoom, 
        (newMessage) => {
          if ((newMessage.sender || '').toLowerCase() === lowerMe) return;
          
          const cleanPayload = (newMessage) => {
            const constructed = {
              messageId: newMessage.message_id || newMessage.messageId,
              roomId: newMessage.room_id || newMessage.roomId,
              sender: (newMessage.sender || '').toLowerCase(),
              type: newMessage.type,
              fromSupabase: true
            };
            if (newMessage.encrypted_text || newMessage.encryptedText) constructed.encryptedText = newMessage.encrypted_text || newMessage.encryptedText;
            if (newMessage.file_data || newMessage.fileData) constructed.fileData = newMessage.file_data || newMessage.fileData;
            if (newMessage.timestamp) constructed.timestamp = new Date(newMessage.timestamp).getTime();
            if (newMessage.isEdited !== undefined) constructed.isEdited = newMessage.isEdited;
            if (newMessage.pinned !== undefined) constructed.pinned = newMessage.pinned;
            if (newMessage.bookmarked !== undefined) constructed.bookmarked = newMessage.bookmarked;
            if (newMessage.reactions !== undefined) constructed.reactions = newMessage.reactions;
            return constructed;
          };

          handleReceivedMessage(cleanPayload(newMessage));
        }
      );
    }
    
    return () => {
        globalUnsubscribe && globalUnsubscribe();
        activeUnsubscribe && activeUnsubscribe();
    };
  }, [user?.username, activeRoom, handleReceivedMessage]);

  useEffect(() => {
    if (peerInitialized && user.username) {
      const autoConnect = async () => {
        const storedChats = await loadChats(user.username.toLowerCase());
        for (const chat of storedChats) {
            if (chat.roomId === 'bookmarks') continue;
            let target = chat.roomId;
            
            if (chat.roomId.startsWith('room-')) {
                const parts = chat.roomId.split('-');
                if (parts.length >= 2) target = `securechat-${parts[1].toLowerCase()}`;
            } else if (chat.roomId.startsWith('p2p-')) {
                const parts = chat.roomId.split('-');
                const other = parts.slice(1).find(u => u !== user.username.toLowerCase());
                if (other) target = `securechat-${other}`;
            }
            
            if (target && target !== getPeer()?.id) connectToRoom(target, chat.roomId);
        }
      };
      autoConnect();
    }
  }, [peerInitialized, user.username]);

  const handleSelectRoom = async (roomId) => {
    setActiveRoom(roomId);
    activeRoomRef.current = roomId;
    setTypingUser(null);
    
    if (roomId && roomId !== 'bookmarks') {
      import('../services/supabaseService').then(m => m.loadSupabaseMessages(roomId))
        .then(history => {
            if (history) history.forEach(msg => saveMessage(msg, user.username.toLowerCase()));
        });
    }
  };

  useEffect(() => { refreshMessages(); }, [activeRoom, refreshMessages]);

  const handleCreateRoom = async () => {
    const roomId = `room-${user.username.toLowerCase()}-${Math.random().toString(36).substr(2, 6)}`;
    await saveChat({
      roomId,
      owner: user.username.toLowerCase(),
      name: roomId,
      lastMessage: '',
      timestamp: Date.now()
    });
    handleSelectRoom(roomId);
  };

  const handleJoinRoom = async () => {
    const inputId = prompt("Enter Peer Username or Room ID:");
    if (!inputId) return;

    let lowerInput = inputId.toLowerCase().trim();
    if (lowerInput.startsWith('securechat-')) {
        lowerInput = lowerInput.replace('securechat-', '');
    }

    let roomId = lowerInput;
    let targetPeerId = lowerInput;

    if (lowerInput.startsWith('room-')) {
        const parts = lowerInput.split('-');
        if (parts.length >= 2) targetPeerId = `securechat-${parts[1]}`;
    } else {
        roomId = getSymmetricalId(user.username, lowerInput);
        targetPeerId = `securechat-${lowerInput}`;
    }

    await saveChat({
      roomId,
      owner: user.username.toLowerCase(),
      name: lowerInput.startsWith('room-') ? lowerInput : `Chat with ${lowerInput}`,
      lastMessage: '',
      timestamp: Date.now()
    });

    connectToRoom(targetPeerId, roomId);
    handleSelectRoom(roomId);
  };

  const handleSendMessage = async (text, fileData = null) => {
    if (!activeRoom || activeRoom === 'bookmarks') return;

    const encryptedText = text ? encryptMessage(text, activeRoom) : '';
    const messageObj = {
      messageId: `${user.username.toLowerCase()}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      roomId: activeRoom,
      sender: user.username.toLowerCase(),
      senderPeerId: getPeer()?.id || `securechat-${user.username.toLowerCase()}`,
      encryptedText,
      fileData: fileData ? {
        name: fileData.name,
        type: fileData.type,
        data: encryptMessage(fileData.data, activeRoom)
      } : null,
      timestamp: Date.now(),
      readStatus: 'sent',
      packetId: `${user.username.toLowerCase()}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`
    };

    sendMessage(activeRoom, messageObj);
    await saveMessage(messageObj, user.username.toLowerCase());
  };

  const handleEditMessage = async (messageId, newText) => {
    const msg = await getMessage(messageId, user.username.toLowerCase());
    if (!msg) return;

    const encryptedText = encryptMessage(newText, msg.roomId);
    await updateMessageProperties(messageId, user.username.toLowerCase(), { encryptedText, isEdited: true });
    
    const payload = { 
      messageId, 
      roomId: msg.roomId, 
      encryptedText, 
      isEdited: true, 
      type: 'UPDATE',
      sender: user.username.toLowerCase(),
      packetId: `${user.username.toLowerCase()}-${Date.now()}-edit-${Math.random().toString(36).substr(2, 5)}`
    };
    sendMessage(msg.roomId, payload);
    import('../services/supabaseService').then(m => m.sendRealtimeBroadcast(msg.roomId, payload, user.username.toLowerCase()));
  };

  const handleReactMessage = async (messageId, emoji) => {
    const msg = await getMessage(messageId, user.username.toLowerCase());
    if (!msg) return;
    
    const reactions = { ...(msg.reactions || {}) };
    const userList = Array.isArray(reactions[emoji]) ? reactions[emoji] : [];
    const lowerUser = user.username.toLowerCase();
    
    if (userList.includes(lowerUser)) {
      reactions[emoji] = userList.filter(u => u !== lowerUser);
    } else {
      reactions[emoji] = [...userList, lowerUser];
    }
    
    if (reactions[emoji].length === 0) delete reactions[emoji];
    
    await updateMessageProperties(messageId, lowerUser, { reactions });
    const payload = { 
      messageId, 
      roomId: msg.roomId, 
      reactions, 
      type: 'UPDATE',
      sender: lowerUser,
      packetId: `${lowerUser}-${Date.now()}-react-${emoji}-${Math.random().toString(36).substr(2, 5)}`
    };
    sendMessage(msg.roomId, payload);
    import('../services/supabaseService').then(m => m.sendRealtimeBroadcast(msg.roomId, payload, lowerUser));
  };

  const handlePinMessage = async (messageId) => {
    const msg = await getMessage(messageId, user.username.toLowerCase());
    if (!msg) return;
    
    const pinned = msg.pinned === 1 ? 0 : 1;
    await updateMessageProperties(messageId, user.username.toLowerCase(), { pinned });
    const payload = { 
      messageId, 
      roomId: msg.roomId, 
      pinned, 
      type: 'UPDATE',
      sender: user.username.toLowerCase(),
      packetId: `${user.username.toLowerCase()}-${Date.now()}-pin-${Math.random().toString(36).substr(2, 5)}`
    };
    sendMessage(msg.roomId, payload);
    import('../services/supabaseService').then(m => m.sendRealtimeBroadcast(msg.roomId, payload, user.username.toLowerCase()));
  };

  const handleBookmarkMessage = async (messageId) => {
    const msg = await getMessage(messageId, user.username.toLowerCase());
    if (!msg) return;
    const bookmarked = msg.bookmarked === 1 ? 0 : 1;
    await updateMessageProperties(messageId, user.username.toLowerCase(), { bookmarked });
  };

  const handleTyping = () => {
    if (!activeRoom || activeRoom === 'bookmarks') return;
    const now = Date.now();
    if (window.lastTypingSent && now - window.lastTypingSent < 2000) return;
    window.lastTypingSent = now;

    sendMessage(activeRoom, { 
      type: 'TYPING', 
      sender: user.username.toLowerCase(), 
      roomId: activeRoom,
      packetId: `${user.username.toLowerCase()}-${Date.now()}-typing`
    });
  };

  const handleDeleteChat = async (roomId) => {
    if (confirm("Are you sure?")) {
      await deleteChatHistory(roomId, user.username.toLowerCase());
      if (activeRoom === roomId) setActiveRoom(null);
    }
  };

  return (
    <div className="dashboard-container d-flex flex-row row m-0 p-0" style={{ height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <div className={`h-100 p-0 ${activeRoom ? 'd-none d-md-flex' : 'd-flex'} col-12 col-md-4 col-lg-3`}>
        <Sidebar 
          user={user} 
          onLogout={onLogout} 
          activeRoom={activeRoom}
          onSelectRoom={handleSelectRoom}
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          peerId={getPeer()?.id || 'Initializing...'}
          onDeleteChat={handleDeleteChat}
        />
      </div>
      <div className={`h-100 p-0 ${activeRoom ? 'd-flex' : 'd-none d-md-flex'} col-12 col-md-8 col-lg-9`}>
        <ChatWindow 
          activeRoom={activeRoom}
          isBookmarksView={activeRoom === 'bookmarks'}
          messages={messages}
          onSendMessage={handleSendMessage}
          onEditMessage={handleEditMessage}
          onReactMessage={handleReactMessage}
          onPinMessage={handlePinMessage}
          onBookmarkMessage={handleBookmarkMessage}
          peerId={getPeer()?.id || ''}
          typingUser={typingUser}
          onTyping={handleTyping}
          currentUserName={user.username.toLowerCase()}
          onBack={() => setActiveRoom(null)}
        />
      </div>
    </div>
  );
};

export default Dashboard;
