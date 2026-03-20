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

db.open().catch(err => {
  console.error("Critical: Failed to open db:", err);
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
    const existing = await db.messages.where('[owner+messageId]').equals([owner, messageObj.messageId]).first();
    
    if (existing) {
      // If it exists, we might be receiving an update (edit, reaction, signal, etc.)
      const { messageId, owner: msgOwner, ...updates } = messageObj;
      await db.messages.update(existing.id, updates);
    } else {
      await db.messages.add({
        reactions: {},
        pinned: 0,
        bookmarked: 0,
        readStatus: 'sent',
        ...messageObj,
        owner,
        timestamp: messageObj.timestamp || Date.now()
      });
    }
    
    const isUpdateOnly = messageObj.type === 'UPDATE' || messageObj.type === 'READ_RECEIPT';
    if (!isUpdateOnly || !existing) {
      await db.chats.put({
        roomId: messageObj.roomId,
        owner,
        name: messageObj.roomName || messageObj.roomId,
        lastMessage: messageObj.encryptedText ? (messageObj.fileData ? '[File]' : decryptMessage(messageObj.encryptedText)) : (messageObj.fileData ? '[File]' : (existing?.encryptedText ? decryptMessage(existing.encryptedText) : '')),
        timestamp: messageObj.timestamp || Date.now()
      });
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
  const msg = await db.messages.where('[owner+messageId]').equals([owner, messageId]).first();
  if (msg) {
    await db.messages.update(msg.id, updates);
    notify();
    return true;
  }
  return false;
};

/**
 * Gets a single message by ID.
 */
export const getMessage = async (messageId, owner) => {
  return await db.messages.where('[owner+messageId]').equals([owner, messageId]).first();
};

/**
 * Creates or updates a chat entry manually.
 */
export const saveChat = async (chatObj) => {
  await db.chats.put(chatObj);
  notify();
};

/**
 * Loads all messages for a specific room and owner.
 * @param {string} roomId 
 * @param {string} owner
 */
export const loadMessages = async (roomId, owner) => {
  if (!owner) return [];
  return await db.messages
    .where('[owner+roomId]')
    .equals([owner, roomId])
    .sortBy('timestamp');
};

/**
 * Loads all chat summaries for a specific owner.
 * @param {string} owner
 */
export const loadChats = async (owner) => {
  if (!owner) return [];
  const chats = await db.chats
    .where('owner')
    .equals(owner)
    .toArray();
    
  return chats.sort((a, b) => b.timestamp - a.timestamp);
};

/**
 * Deletes chat history for a room or all rooms.
 * @param {string} roomId 
 */
export const deleteChatHistory = async (roomId) => {
  if (roomId) {
    await db.messages.where('roomId').equals(roomId).delete();
    await db.chats.where('roomId').equals(roomId).delete();
  } else {
    await db.messages.clear();
    await db.chats.clear();
  }
};
