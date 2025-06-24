// client/src/Dashboard.js
import React, { useState, useEffect } from 'react';
import { auth } from './firebaseConfig';
import { signOut, sendEmailVerification, onAuthStateChanged } from 'firebase/auth'; // Import onAuthStateChanged
import './Dashboard.css';

function Dashboard() {
  const [user, setUser] = useState(auth.currentUser); // State to hold the current user
  const [emailVerified, setEmailVerified] = useState(user ? user.emailVerified : false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(null);
  const [resendError, setResendError] = useState(null);

  useEffect(() => {
    // Listen for auth state changes to update user and verification status dynamically
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setEmailVerified(currentUser.emailVerified);
      } else {
        setUser(null);
        setEmailVerified(false);
      }
    });

    return unsubscribe; // Cleanup listener on unmount
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      console.log("User logged out successfully!");
    } catch (error) {
      console.error("Error logging out:", error.message);
      alert("Error logging out: " + error.message);
    }
  };

  const handleResendVerification = async () => {
    if (user) {
      setResendLoading(true);
      setResendSuccess(null);
      setResendError(null);
      try {
        await sendEmailVerification(user);
        setResendSuccess('Verification email sent! Please check your inbox.');
        console.log('Verification email sent to:', user.email);
      } catch (error) {
        console.error('Error sending verification email:', error.message);
        setResendError('Failed to send verification email. Please try again later.');
      } finally {
        setResendLoading(false);
      }
    }
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-card">
        <h2>Welcome to your Dashboard, {user ? user.email : 'Guest'}!</h2>

        {!emailVerified && user && ( // Only show if user exists and email is NOT verified
          <div className="email-verification-warning">
            <p>Your email address is not verified. Please check your inbox for a verification link.</p>
            <button onClick={handleResendVerification} disabled={resendLoading}>
              {resendLoading ? 'Sending...' : 'Resend Verification Email'}
            </button>
            {resendSuccess && <p className="success-message">{resendSuccess}</p>}
            {resendError && <p className="error-message">{resendError}</p>}
            <p className="note">Note: You may need to log out and log back in after verifying your email to see the update.</p>
          </div>
        )}

        {emailVerified && ( // Show this if email IS verified
          <p>Your email is verified. You have full access to features.</p>
        )}

        <p>This is where your school's behavior management tools will be.</p>
        <p>More features coming soon...</p>
        <button onClick={handleLogout}>Log Out</button>
      </div>
    </div>
  );
}

export default Dashboard;