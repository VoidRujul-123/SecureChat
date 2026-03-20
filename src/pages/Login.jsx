import React, { useState } from 'react';
import { generateKey } from '../services/encryptionService';
import { Shield, Lock, User } from 'lucide-react';
import { motion } from 'framer-motion';

const Login = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username || !passphrase) return;

    setLoading(true);
    // Simulate some work for aesthetic effect
    setTimeout(() => {
      generateKey(passphrase);
      onLogin({ username });
      setLoading(false);
    }, 1500);
  };

  return (
    <div className="login-page d-flex vh-100 justify-content-center align-items-center" style={{ 
      background: 'radial-gradient(circle at top right, #1a1a2e, #0a0a0c)'
    }}>
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass p-4 text-center" 
        style={{ width: '100%', maxWidth: '400px', margin: '0 15px' }}
      >
        <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'center' }}>
          <div className="btn-primary" style={{ padding: '15px', borderRadius: '50%' }}>
            <Shield size={32} />
          </div>
        </div>
        
        <h1 style={{ marginBottom: '8px', fontSize: '24px' }}>SecureChat</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '32px', fontSize: '14px' }}>
          Your privacy, protected by math.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ position: 'relative' }}>
            <User size={18} style={{ position: 'absolute', left: '12px', top: '14px', color: 'var(--text-secondary)' }} />
            <input 
              type="text" 
              placeholder="Username" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={{ paddingLeft: '40px', width: '100%' }}
              required
            />
          </div>
          
          <div style={{ position: 'relative' }}>
            <Lock size={18} style={{ position: 'absolute', left: '12px', top: '14px', color: 'var(--text-secondary)' }} />
            <input 
              type="password" 
              placeholder="Secret Passphrase" 
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              style={{ paddingLeft: '40px', width: '100%' }}
              required
            />
          </div>

          <button 
            type="submit" 
            className="btn btn-primary" 
            disabled={loading}
            style={{ marginTop: '10px' }}
          >
            {loading ? 'Initializing...' : 'Unlock SecureChat'}
          </button>
        </form>

        <p style={{ marginTop: '24px', fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>
          No data is ever stored on a server.
        </p>
      </motion.div>
    </div>
  );
};

export default Login;
