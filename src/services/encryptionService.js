import CryptoJS from 'crypto-js';

let encryptionKey = null;

/**
 * Generates an encryption key from a passphrase.
 * @param {string} passphrase 
 */
export const generateKey = (passphrase) => {
  // Use SHA256 to create a consistent 256-bit key from any passphrase
  encryptionKey = CryptoJS.SHA256(passphrase).toString();
  return encryptionKey;
};

// Generates a predictable key for a specific room to allow users with different login passphrases to communicate securely
export const getRoomKey = (roomId) => {
  if (!roomId) return null;
  // Normalize roomId to ensure consistent key generation regardless of casing or whitespace
  const normalizedId = roomId.toLowerCase().trim();
  return CryptoJS.SHA256(normalizedId + "_SecureChatSharedKey_v1").toString();
};

/**
 * Encrypts a message using the generated key or room-specific key.
 * @param {string} message 
 * @param {string} roomId
 */
export const encryptMessage = (message, roomId = null) => {
  const key = roomId ? getRoomKey(roomId) : encryptionKey;
  if (!key) throw new Error("Encryption key not set. Please login first.");
  return CryptoJS.AES.encrypt(message, key).toString();
};

/**
 * Decrypts a cipher using the generated key or room-specific key.
 * @param {string} cipher 
 * @param {string} roomId
 */
export const decryptMessage = (cipher, roomId = null) => {
  const key = roomId ? getRoomKey(roomId) : encryptionKey;
  if (!key) throw new Error("Encryption key not set. Please login first.");
  try {
    const bytes = CryptoJS.AES.decrypt(cipher, key);
    // Use Utf8 for small text, but fall back to Latinn1 if Utf8 returns empty for large binary-in-base64 strings
    let text = '';
    try {
      text = bytes.toString(CryptoJS.enc.Utf8);
    } catch (e) {
      text = bytes.toString(CryptoJS.enc.Latin1);
    }
    
    if (!text && cipher) {
      text = bytes.toString(CryptoJS.enc.Latin1);
    }
    
    if (!text && cipher) throw new Error("Decryption returned empty string (likely wrong key)");
    return text;
  } catch (err) {
    throw new Error("Decryption completely failed (wrong key or malformed data)");
  }
};

/**
 * Clears the encryption key (for logout).
 */
export const clearKey = () => {
  encryptionKey = null;
};

export const hasKey = () => encryptionKey !== null;
