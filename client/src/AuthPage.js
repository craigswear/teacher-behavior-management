// client/src/AuthPage.js
import React, { useState } from 'react';
import './AuthPage.css'; // We'll create this file shortly

function AuthPage() {
  const [isLogin, setIsLogin] = useState(true); // State to switch between Login and Signup

  const toggleForm = () => {
    setIsLogin(!isLogin);
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>{isLogin ? 'Login' : 'Sign Up'}</h2>
        {isLogin ? (
          // Login Form (will be added here)
          <div>
            <p>Login form goes here.</p>
            <button onClick={toggleForm}>Switch to Sign Up</button>
          </div>
        ) : (
          // Sign Up Form (will be added here)
          <div>
            <p>Sign Up form goes here.</p>
            <button onClick={toggleForm}>Switch to Login</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default AuthPage;