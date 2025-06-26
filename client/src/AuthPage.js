// client/src/AuthPage.js
import React, { useState, useEffect } from 'react';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth'; // Removed sendEmailVerification
import { auth, db } from './firebaseConfig';
import { collection, getDocs, query, limit, where } from 'firebase/firestore'; // Removed doc, getDoc, setDoc
import { useNavigate } from 'react-router-dom'; // Keep useNavigate, but it will not be used for signup redirect now
import './AuthPage.css';

function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);
  const [allowSignUp, setAllowSignUp] = useState(true);

  const navigate = useNavigate(); // Still needed for potential future explicit navigations if not auth-driven

  useEffect(() => {
    const checkSuperAdminExists = async () => {
      try {
        const usersCollectionRef = collection(db, 'users');
        const superAdminQuery = query(usersCollectionRef, where('role', '==', 'superAdmin'), limit(1));
        const superAdminSnapshot = await getDocs(superAdminQuery);

        if (!superAdminSnapshot.empty) {
          setAllowSignUp(false);
          setIsLogin(true);
        } else {
          setAllowSignUp(true);
        }
      } catch (err) {
        console.error("AuthPage Debug: Error checking for super admin on load:", err);
        setAllowSignUp(false); // Default to safety
        // Removed setError("Error initializing page. Please try again or contact support.");
      }
    };
    checkSuperAdminExists();
  }, []);

  const toggleForm = () => {
    setIsLogin(!isLogin);
    setError(null);
    setSuccessMessage(null);
    setEmail('');
    setPassword('');
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setLoading(true);

    try {
      if (isLogin) {
        // --- Login Logic ---
        console.log('AuthPage Debug: Attempting to log in user with email:', email);
        await signInWithEmailAndPassword(auth, email, password);
        console.log('AuthPage Debug: User logged in successfully!');
        // App.js will now completely handle the role fetch and redirection for ALL logins/signups
      } else {
        // --- Sign Up Logic ---
        if (!allowSignUp) {
            setError("Sign up is currently disabled. Please contact an administrator.");
            setLoading(false);
            return;
        }

        console.log("AuthPage Debug: Starting user creation for email:", email);
        await createUserWithEmailAndPassword(auth, email, password); // This is the only Auth action here
        console.log("AuthPage Debug: Firebase Auth user created. App.js will now handle Firestore doc and email.");
        // Success message is now handled by App.js's redirect to Dashboard (which will show email not verified)
        // We might add a temporary "Please wait..." message here if needed.
        setSuccessMessage('Creating account...'); // Simple message
      }
    } catch (firebaseError) {
      console.error('AuthPage Debug: Authentication process failed in handleAuth catch block:', firebaseError.message, "Code:", firebaseError.code);
      setError(firebaseError.message);
    } finally {
      console.log("AuthPage Debug: Finalizing handleAuth - setting loading to false.");
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
          {successMessage && <p className="success-message">{successMessage}</p>}

          <button type="submit" disabled={loading}>
            {loading ? (isLogin ? 'Logging In...' : 'Signing Up...') : (isLogin ? 'Login' : 'Sign Up')}
          </button>
        </form>

        {allowSignUp && (
          <button onClick={toggleForm} disabled={loading}>
            {isLogin ? 'Need an account? Sign Up' : 'Already have an account? Login'}
          </button>
        )}
        {!allowSignUp && isLogin && (
            <p className="signup-disabled-hint">Sign up is currently disabled. Please log in or contact an administrator.</p>
        )}
      </div>
      {/* Copyright information added here */}
      <div className="copyright-footer">
        © 2025 SAMS Edu Solutions LLC. All Rights Reserved.
      </div>
    </div>
  );
}

export default AuthPage;
