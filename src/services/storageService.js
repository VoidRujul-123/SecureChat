import Dexie from 'dexie';
import { broadcastMessage } from './supabaseService';
import { decryptMessage } from './encryptionService';

export const db = new Dexie('SecureChatDB_v2');

// Handle version changes to prevent blocking between tabs
db.on('versionchange', () => {
  db.close();
  window.location.reload(); 
});

db.version(5).stores({
  messages: '++id, messageId, roomId, owner, sender, timestamp, [owner+roomId], [owner+messageId], [owner+bookmarked], [owner+pinned]',
  chats: '[owner+roomId], owner, roomId, name, timestamp'
}).upgrade(tx => {
  // Database upgraded to v5
});

export let isDbFailed = false;
export const memoryStore = { messages: [], chats: [] };

db.open().catch(err => {
  console.error("Critical: Failed to open db. Using in-memory fallback:", err);
  isDbFailed = true;
});

const listeners = [];

export const subscribe = (listener) => {
  listeners.push(listener);
  return () => {
    const index = listeners.indexOf(listener);
    if (index > -1) listeners.splice(index, 1);
  };
};

export const notify = () => listeners.forEach(l => l());

const pendingSaves = new Map();

/**
 * Saves an encrypted message to the database with concurrency lock.
 * @param {Object} messageObj 
 * @param {string} owner The username of the currently logged-in user
 */
export const saveMessage = async (messageObj, owner) => {
  if (!owner) throw new Error("Owner (username) is required to save messages");

  const lockKey = `${owner}-${messageObj.messageId}`;
  
  if (pendingSaves.has(lockKey)) {
    await pendingSaves.get(lockKey).catch(() => {});
  }

  const saveOperation = (async () => {
    let existing;
    if (isDbFailed) {
      existing = memoryStore.messages.find(m => m.owner === owner && m.messageId === messageObj.messageId);
    } else {
      try {
        existing = await db.messages.where('[owner+messageId]').equals([owner, messageObj.messageId]).first();
      } catch (err) {
        isDbFailed = true;
        existing = memoryStore.messages.find(m => m.owner === owner && m.messageId === messageObj.messageId);
      }
    }
    
    if (existing) {
      // If it exists, we might be receiving an update (edit, reaction, signal, etc.)
      const { messageId, owner: msgOwner, ...updates } = messageObj;
      if (isDbFailed) {
        Object.assign(existing, updates);
      } else {
        try {
          await db.messages.update(existing.id, updates);
        } catch (e) {
          isDbFailed = true;
          Object.assign(existing, updates);
        }
      }
    } else {
      const newMsg = {
        reactions: {},
        pinned: 0,
        bookmarked: 0,
        readStatus: 'sent',
        ...messageObj,
        owner,
        timestamp: messageObj.timestamp || Date.now()
      };
      
      if (isDbFailed) {
        memoryStore.messages.push(newMsg);
      } else {
        try {
          await db.messages.add(newMsg);
        } catch (e) {
          isDbFailed = true;
          memoryStore.messages.push(newMsg);
        }
      }
    }
    
    const isUpdateOnly = messageObj.type === 'UPDATE' || messageObj.type === 'READ_RECEIPT';
    if (!isUpdateOnly || !existing) {
      const chatObj = {
        roomId: messageObj.roomId,
        owner,
        name: messageObj.roomName || messageObj.roomId,
        lastMessage: messageObj.encryptedText ? (messageObj.fileData ? '[File]' : decryptMessage(messageObj.encryptedText)) : (messageObj.fileData ? '[File]' : (existing?.encryptedText ? decryptMessage(existing.encryptedText) : '')),
        timestamp: messageObj.timestamp || Date.now()
      };
      
      const updateMemoryChat = () => {
        const idx = memoryStore.chats.findIndex(c => c.owner === owner && c.roomId === messageObj.roomId);
        if (idx >= 0) memoryStore.chats[idx] = chatObj;
        else memoryStore.chats.push(chatObj);
      };

      if (isDbFailed) {
        updateMemoryChat();
      } else {
        try {
          await db.chats.put(chatObj);
        } catch(e) {
          isDbFailed = true;
          updateMemoryChat();
        }
      }
    }

    if (messageObj.sender === owner && !messageObj.fromSupabase && !isUpdateOnly) {
        broadcastMessage(messageObj);
    }
  })();

  pendingSaves.set(lockKey, saveOperation);

  try {
    await saveOperation;
  } finally {
    // Keep it in map for a brief window to prevent micro-race conditions just in case
    setTimeout(() => pendingSaves.delete(lockKey), 1000);
    notify();
  }
};

/**
 * Updates specific properties of a message.
 */
export const updateMessageProperties = async (messageId, owner, updates) => {
  if (isDbFailed) {
    const msg = memoryStore.messages.find(m => m.owner === owner && m.messageId === messageId);
    if (msg) {
      Object.assign(msg, updates);
      notify();
      return true;
    }
    return false;
  }

  try {
    const msg = await db.messages.where('[owner+messageId]').equals([owner, messageId]).first();
    if (msg) {
      await db.messages.update(msg.id, updates);
      notify();
      return true;
    }
    return false;
  } catch (e) {
    isDbFailed = true;
    const msg = memoryStore.messages.find(m => m.owner === owner && m.messageId === messageId);
    if (msg) {
      Object.assign(msg, updates);
      notify();
      return true;
    }
    return false;
  }
};

/**
 * Gets a single message by ID.
 */
export const getMessage = async (messageId, owner) => {
  if (isDbFailed) {
    return memoryStore.messages.find(m => m.owner === owner && m.messageId === messageId);
  }
  try {
    return await db.messages.where('[owner+messageId]').equals([owner, messageId]).first();
  } catch (e) {
    isDbFailed = true;
    return memoryStore.messages.find(m => m.owner === owner && m.messageId === messageId);
  }
};

/**
 * Creates or updates a chat entry manually.
 */
export const saveChat = async (chatObj) => {
  if (isDbFailed) {
    const idx = memoryStore.chats.findIndex(c => c.owner === chatObj.owner && c.roomId === chatObj.roomId);
    if (idx >= 0) memoryStore.chats[idx] = chatObj;
    else memoryStore.chats.push(chatObj);
    notify();
    return;
  }
  try {
    await db.chats.put(chatObj);
    notify();
  } catch (e) {
    isDbFailed = true;
    const idx = memoryStore.chats.findIndex(c => c.owner === chatObj.owner && c.roomId === chatObj.roomId);
    if (idx >= 0) memoryStore.chats[idx] = chatObj;
    else memoryStore.chats.push(chatObj);
    notify();
  }
};

/**
 * Loads all messages for a specific room and owner.
 * @param {string} roomId 
 * @param {string} owner
 */
export const loadMessages = async (roomId, owner) => {
  if (!owner) return [];
  if (isDbFailed) {
    const msgs = memoryStore.messages.filter(m => m.owner === owner && m.roomId === roomId);
    return msgs.sort((a, b) => a.timestamp - b.timestamp);
  }
  try {
    return await db.messages
      .where('[owner+roomId]')
      .equals([owner, roomId])
      .sortBy('timestamp');
  } catch (e) {
    isDbFailed = true;
    const msgs = memoryStore.messages.filter(m => m.owner === owner && m.roomId === roomId);
    return msgs.sort((a, b) => a.timestamp - b.timestamp);
  }
};

/**
 * Loads all chat summaries for a specific owner.
 * @param {string} owner
 */
export const loadChats = async (owner) => {
  if (!owner) return [];
  if (isDbFailed) {
    const chats = memoryStore.chats.filter(c => c.owner === owner);
    return chats.sort((a, b) => b.timestamp - a.timestamp);
  }
  try {
    const chats = await db.chats
      .where('owner')
      .equals(owner)
      .toArray();
      
    return chats.sort((a, b) => b.timestamp - a.timestamp);
  } catch (e) {
    isDbFailed = true;
    const chats = memoryStore.chats.filter(c => c.owner === owner);
    return chats.sort((a, b) => b.timestamp - a.timestamp);
  }
};

/**
 * Deletes chat history for a room or all rooms.
 */
export const deleteChatHistory = async (roomId, owner) => {
  if (isDbFailed) {
    if (roomId) {
      memoryStore.messages = memoryStore.messages.filter(m => !(m.owner === owner && m.roomId === roomId));
      memoryStore.chats = memoryStore.chats.filter(c => !(c.owner === owner && c.roomId === roomId));
    } else {
      memoryStore.messages = memoryStore.messages.filter(m => m.owner !== owner);
      memoryStore.chats = memoryStore.chats.filter(c => c.owner !== owner);
    }
    notify();
    return;
  }
  try {
    if (roomId) {
      await db.messages.where('[owner+roomId]').equals([owner, roomId]).delete();
      await db.chats.where('[owner+roomId]').equals([owner, roomId]).delete();
    } else {
      await db.messages.where('owner').equals(owner).delete();
      await db.chats.where('owner').equals(owner).delete();
    }
    notify();
  } catch (e) {
    isDbFailed = true;
    if (roomId) {
      memoryStore.messages = memoryStore.messages.filter(m => !(m.owner === owner && m.roomId === roomId));
      memoryStore.chats = memoryStore.chats.filter(c => !(c.owner === owner && c.roomId === roomId));
    } else {
      memoryStore.messages = memoryStore.messages.filter(m => m.owner !== owner);
      memoryStore.chats = memoryStore.chats.filter(c => c.owner !== owner);
    }
    notify();
  }
};

/**
 * Gets bookmarked messages for a user
 */
export const getBookmarkedMessages = async (owner) => {
  if (!owner) return [];
  if (isDbFailed) {
    const msgs = memoryStore.messages.filter(m => m.owner === owner && m.bookmarked === 1);
    return msgs.sort((a, b) => a.timestamp - b.timestamp);
  }
  try {
    return await db.messages.where('[owner+bookmarked]').equals([owner, 1]).toArray();
  } catch (e) {
    isDbFailed = true;
    const msgs = memoryStore.messages.filter(m => m.owner === owner && m.bookmarked === 1);
    return msgs.sort((a, b) => a.timestamp - b.timestamp);
  }
};

/**
 * Gets a specific chat by roomId
 */
export const getChat = async (roomId, owner) => {
  if (!owner || !roomId) return null;
  if (isDbFailed) {
    return memoryStore.chats.find(c => c.owner === owner && c.roomId === roomId);
  }
  try {
    return await db.chats.where('[owner+roomId]').equals([owner, roomId]).first();
  } catch (e) {
    isDbFailed = true;
    return memoryStore.chats.find(c => c.owner === owner && c.roomId === roomId);
  }
};
