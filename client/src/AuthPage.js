// client/src/AuthPage.js
import React, { useState } from 'react';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { auth } from './firebaseConfig';
import './AuthPage.css';

function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null); // New state for success messages

  const toggleForm = () => {
    setIsLogin(!isLogin);
    setError(null);
    setSuccessMessage(null); // Clear messages when toggling
    setEmail('');
    setPassword('');
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null); // Clear previous messages
    setLoading(true);

    try {
      if (isLogin) {
        // Login
        await signInWithEmailAndPassword(auth, email, password);
        console.log('User logged in successfully!');
        // App.js handles the redirect via onAuthStateChanged
      } else {
        // Sign Up
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        console.log('User signed up successfully!');

        // --- NEW: Send email verification ---
        await sendEmailVerification(userCredential.user);
        setSuccessMessage('Account created! Please check your email to verify your account.');
        // We might want to keep the user on this page or redirect to a specific
        // "Please verify email" page, but for now, App.js will redirect to Dashboard.
        // We'll add a warning on Dashboard for unverified users.
      }
    } catch (firebaseError) {
      console.error('Authentication error:', firebaseError.message);
      setError(firebaseError.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>{isLogin ? 'Login' : 'Sign Up'}</h2>
        <form onSubmit={handleAuth}>
          <div className="form-group">
            <label htmlFor="email">Email:</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password:</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />
          </div>

          {error && <p className="error-message">{error}</p>}
          {successMessage && <p className="success-message">{successMessage}</p>} {/* Display success */}

          <button type="submit" disabled={loading}>
            {loading ? (isLogin ? 'Logging In...' : 'Signing Up...') : (isLogin ? 'Login' : 'Sign Up')}
          </button>
        </form>

        <button onClick={toggleForm} disabled={loading}>
          {isLogin ? 'Need an account? Sign Up' : 'Already have an account? Login'}
        </button>
      </div>
    </div>
  );
}

export default AuthPage;