import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = (supabaseUrl && supabaseUrl !== 'YOUR_SUPABASE_URL') 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;

if (!supabase) {
  console.warn('Supabase: Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Backend sync is disabled.');
}

/**
 * Broadcasts an encrypted message to the 'messages' table.
 */
export const sendRealtimeBroadcast = (roomId, payload, sender) => {
    if (!supabase) return;

    // 1. Notify the room (p2p-a-b or room-xyz)
    const roomTopic = `room:${roomId}`;
    const existingRoom = supabase.getChannels().find(c => c.topic === `realtime:${roomTopic}`);
    if (existingRoom && existingRoom.state === 'joined') {
        existingRoom.send({ type: 'broadcast', event: 'new_msg', payload });
    } else {
        const tempRoom = supabase.channel(roomTopic);
        tempRoom.subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                tempRoom.send({ type: 'broadcast', event: 'new_msg', payload });
                setTimeout(() => supabase.removeChannel(tempRoom), 2000);
            }
        });
    }

    // 2. If it's a P2P room, also notify the recipient specifically
    if (sender && roomId.startsWith('p2p-')) {
        const parts = roomId.split('-');
        const recipient = parts.slice(1).find(u => u.toLowerCase() !== sender.toLowerCase());
        if (recipient) {
            const userTopic = `room:user-${recipient.toLowerCase()}`;
            const existingUser = supabase.getChannels().find(c => c.topic === `realtime:${userTopic}`);
            if (existingUser && existingUser.state === 'joined') {
                existingUser.send({ type: 'broadcast', event: 'new_msg', payload });
            } else {
                const tempUser = supabase.channel(userTopic);
                tempUser.subscribe((status) => {
                    if (status === 'SUBSCRIBED') {
                        tempUser.send({ type: 'broadcast', event: 'new_msg', payload });
                        setTimeout(() => supabase.removeChannel(tempUser), 2000);
                    }
                });
            }
        }
    }
};

export const broadcastMessage = async (messageObj) => {
  if (!supabase) return false;
  try {
    const payload = {
      message_id: messageObj.messageId,
      room_id: messageObj.roomId,
      sender: messageObj.sender,
      encrypted_text: messageObj.encryptedText,
      file_data: messageObj.fileData,
      timestamp: new Date(messageObj.timestamp).toISOString()
    };

    const { error } = await supabase.from('messages').insert([payload]);
    if (error) throw error;

    // Trigger the real-time notification
    sendRealtimeBroadcast(messageObj.roomId, payload, messageObj.sender);

    return true;
  } catch (err) {
    console.error('Supabase: Failed to broadcast:', err);
    return false;
  }
};

/**
 * Subscribes to real-time message updates for the whole app.
 */
const roomChannels = {}; // roomId -> channel

export const subscribeToMessages = (roomId, onNewMessage) => {
  if (!supabase) return () => {};
  
  const channel = supabase
    .channel(`room:${roomId}`)
    // Listen for database changes (persisted messages)
    .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'messages', 
        filter: `room_id=eq.${roomId}` 
    }, (payload) => {
        onNewMessage(payload.new);
    })
    // Listen for real-time broadcasts (ephemeral notifications)
    .on('broadcast', { event: 'new_msg' }, ({ payload }) => {
        onNewMessage(payload);
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};

/**
 * Loads recent messages from Supabase for a specific room.
 */
export const loadSupabaseMessages = async (roomId, limit = 50) => {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('room_id', roomId)
      .order('timestamp', { ascending: true })
      .limit(limit);
      
    if (error) throw error;
    return data.map(m => ({
        messageId: m.message_id,
        roomId: m.room_id,
        sender: m.sender,
        encryptedText: m.encrypted_text,
        fileData: m.file_data,
        timestamp: new Date(m.timestamp).getTime()
    }));
  } catch (err) {
    console.error('Supabase: Failed to load messages:', err);
    return [];
  }
};
