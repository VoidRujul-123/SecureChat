import { Peer } from 'peerjs';

let peer = null;
let peerConnections = {}; // peerId -> connection
let roomParticipants = {}; // roomId -> Set of peerIds
let peerStatus = {}; // peerId -> status

let currentUsername = null;
let onMessageCallback = null;
let onCallCallback = null;
let isInitializing = false;

const seenMessages = new Set();
const CACHE_SIZE = 1000;
const HEARTBEAT_INTERVAL = 3000;

const normalizeId = (id) => {
    if (!id) return '';
    let val = id.toLowerCase().trim();
    if (val.startsWith('securechat-')) val = val.replace('securechat-', '');
    return val;
};

const toPeerId = (username) => `securechat-${normalizeId(username)}`;

export const createPeerConnection = (username, onMessage, onCall) => {
  onMessageCallback = onMessage;
  onCallCallback = onCall;

  const normalizedUser = normalizeId(username);
  if (peer && currentUsername === normalizedUser && !peer.destroyed) {
    return peer;
  }

  if (isInitializing) return peer;
  isInitializing = true;

  if (peer) peer.destroy();
  currentUsername = normalizedUser;
  const pId = toPeerId(normalizedUser);

  console.log('[P2P] Starting Peer:', pId);

  peer = new Peer(pId, {
    debug: 1,
    config: {
      'iceServers': [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' },
        {
          urls: "turn:openrelay.metered.ca:80",
          username: "openrelayproject",
          credential: "openrelayproject"
        },
        {
          urls: "turn:openrelay.metered.ca:443",
          username: "openrelayproject",
          credential: "openrelayproject"
        },
        {
          urls: "turn:openrelay.metered.ca:443?transport=tcp",
          username: "openrelayproject",
          credential: "openrelayproject"
        }
      ],
      'sdpSemantics': 'unified-plan'
    }
  });

  peer.on('open', (id) => {
    console.log('[P2P] Ready:', id);
    isInitializing = false;
    startHeartbeat();
  });

  peer.on('connection', (conn) => setupConnectionListeners(conn));
  peer.on('call', (call) => onCallCallback && onCallCallback(call));
  
  peer.on('disconnected', () => {
    console.warn('[P2P] Disconnected, reconnecting...');
    peer.reconnect();
  });

  peer.on('error', (err) => {
    console.error('[P2P] Global Error:', err.type, err);
    isInitializing = false;
  });

  return peer;
};

const startHeartbeat = () => {
    const timer = setInterval(() => {
        if (!peer || peer.destroyed) return clearInterval(timer);
        Object.values(peerConnections).forEach(conn => {
            if (conn && conn.open) {
                try { conn.send({ type: 'PING' }); } catch(e) {}
            }
        });
    }, HEARTBEAT_INTERVAL);
};

const setupConnectionListeners = (conn) => {
  if (!conn) return;

  if (peerConnections[conn.peer]?.open && !conn.open) return;
  peerConnections[conn.peer] = conn;

  conn.on('open', () => {
    console.log('[P2P] Link Open with:', conn.peer);
    peerStatus[conn.peer] = 'online';
    
    const roomId = conn.metadata?.roomId;
    if (roomId) {
        if (!roomParticipants[roomId]) roomParticipants[roomId] = new Set();
        roomParticipants[roomId].add(conn.peer);
        if (roomId.startsWith('room-')) {
            broadcastRoomSync(roomId, conn.metadata?.roomName);
        }
    }
  });

  conn.on('data', (data) => {
    if (!data) return;

    if (data.type === 'PING') {
        peerStatus[conn.peer] = 'online';
        return;
    }

    const dedupeId = data.packetId || data.messageId;
    if (dedupeId) {
        if (seenMessages.has(dedupeId)) return;
        seenMessages.add(dedupeId);
        if (seenMessages.size > CACHE_SIZE) {
            const first = seenMessages.values().next().value;
            seenMessages.delete(first);
        }
    }

    if (onMessageCallback) onMessageCallback(data, conn.peer);

    if (data.type === 'ROOM_SYNC') {
        const { roomId, roomName, participants } = data;
        if (!roomId || !participants) return;

        if (!roomParticipants[roomId]) roomParticipants[roomId] = new Set();
        let changed = false;
        participants.forEach(pId => {
            if (pId && pId !== peer.id && !roomParticipants[roomId].has(pId)) {
                roomParticipants[roomId].add(pId);
                changed = true;
                if (!peerConnections[pId] || !peerConnections[pId].open) {
                    connectToRoom(pId, roomId, { roomName });
                }
            }
        });
        if (changed) broadcastRoomSync(roomId, roomName);
    }

    if (data.roomId?.startsWith('room-') && data.type !== 'ROOM_SYNC') {
        relayMessage(data.roomId, data, conn.peer);
    }
  });

  conn.on('close', () => cleanupPeer(conn.peer));
  conn.on('error', () => cleanupPeer(conn.peer));
};

const cleanupPeer = (peerId) => {
    delete peerConnections[peerId];
    peerStatus[peerId] = 'offline';
    Object.keys(roomParticipants).forEach(rId => {
        if (roomParticipants[rId]) roomParticipants[rId].delete(peerId);
    });
};

const broadcastRoomSync = (roomId, roomName) => {
    if (!peer?.id || !roomId) return;
    const members = Array.from(roomParticipants[roomId] || []);
    const fullList = [...members, peer.id];
    members.forEach(pId => {
        const conn = peerConnections[pId];
        if (conn && conn.open) {
            conn.send({ type: 'ROOM_SYNC', roomId, roomName, participants: fullList });
        }
    });
};

const relayMessage = (roomId, message, excludePeerId) => {
  const participants = roomParticipants[roomId];
  if (!participants) return;
  participants.forEach(pId => {
    if (pId !== excludePeerId) {
      const conn = peerConnections[pId];
      if (conn && conn.open) conn.send(message);
    }
  });
};

export const connectToRoom = (targetId, roomId, metadata = {}) => {
  if (!peer || !targetId) return null;
  const targetPeerId = targetId.startsWith('securechat-') ? targetId : toPeerId(targetId);
  if (targetPeerId === peer.id) return null;

  const existing = peerConnections[targetPeerId];
  // Prevent WebRTC race conditions by returning pending/connecting channels instead of spawning a competing duplicate
  if (existing) return existing;

  console.log('[P2P] Connecting to:', targetPeerId);
  const conn = peer.connect(targetPeerId, {
    metadata: { ...metadata, roomId },
    reliable: true
  });
  
  if (conn) setupConnectionListeners(conn);
  return conn;
};

export const sendMessage = (roomId, message) => {
  if (!roomId || !peer) return false;

  const isGroup = roomId.startsWith('room-');
  const isP2P = roomId.startsWith('p2p-');
  
  let targets = [];
  if (isGroup) {
      targets = Array.from(roomParticipants[roomId] || []);
  } else if (isP2P) {
      // Extract the other person's name from p2p-name1-name2
      const parts = roomId.split('-');
      const otherName = parts.slice(1).find(name => toPeerId(name) !== peer.id);
      if (otherName) targets = [toPeerId(otherName)];
  } else {
      targets = [roomId.startsWith('securechat-') ? roomId : toPeerId(roomId)];
  }

  if (targets.length === 0 && !isGroup) return false;

  let sentCount = 0;
  targets.forEach(tId => {
    let conn = peerConnections[tId];
    
    if (!conn || !conn.open) {
        conn = connectToRoom(tId, roomId, { roomName: message.roomName });
        if (conn && !conn.open) {
            const onOpen = () => {
                if (conn.open) conn.send(message);
                conn.off('open', onOpen);
            };
            conn.on('open', onOpen);
            sentCount++;
            return;
        }
    }

    if (conn && conn.open) {
        try {
            conn.send(message);
            sentCount++;
        } catch(e) {
            console.error('[P2P] Send failed to', tId, e);
        }
    }
  });

  if (sentCount === 0 && (isGroup || isP2P)) {
      Object.values(peerConnections).forEach(conn => {
          if (conn && conn.open) {
              try { conn.send(message); sentCount++; } catch(e) {}
          }
      });
  }

  return sentCount > 0;
};

export const getPeer = () => peer;
export const getPeerStatus = (peerId) => peerStatus[peerId] || 'offline';
export const getRoomParticipants = (roomId) => Array.from(roomParticipants[roomId] || []);
export const getActiveConnections = () => {
    const counts = {};
    Object.keys(roomParticipants).forEach(r => counts[r] = roomParticipants[r].size);
    return counts;
};
