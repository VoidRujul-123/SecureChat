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

/**
 * Encrypts a message using the generated key.
 * @param {string} message 
 */
export const encryptMessage = (message) => {
  if (!encryptionKey) throw new Error("Encryption key not set. Please login first.");
  return CryptoJS.AES.encrypt(message, encryptionKey).toString();
};

/**
 * Decrypts a cipher using the generated key.
 * @param {string} cipher 
 */
export const decryptMessage = (cipher) => {
  if (!encryptionKey) throw new Error("Encryption key not set. Please login first.");
  const bytes = CryptoJS.AES.decrypt(cipher, encryptionKey);
  return bytes.toString(CryptoJS.enc.Utf8);
};

/**
 * Clears the encryption key (for logout).
 */
export const clearKey = () => {
  encryptionKey = null;
};

export const hasKey = () => encryptionKey !== null;
