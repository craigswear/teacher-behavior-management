// client/src/App.js
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth'; // Import Firebase Auth listener
import { auth } from './firebaseConfig'; // Import our auth instance

import AuthPage from './AuthPage';
import Dashboard from './Dashboard'; // Import the new Dashboard component
import './App.css';

function App() {
  const [currentUser, setCurrentUser] = useState(null); // State to hold the authenticated user
  const [loading, setLoading] = useState(true); // State to indicate auth state is being checked

  useEffect(() => {
    // This listener observes authentication state changes (login, logout, initial load)
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user); // Set the current user object (null if logged out)
      setLoading(false); // Auth state check is complete
    });

    // Cleanup the listener when the component unmounts
    return unsubscribe;
  }, []); // Empty dependency array means this effect runs once on mount

  if (loading) {
    // Show a loading spinner or message while checking auth state
    return (
      <div className="App">
        <header className="App-header">
          <h1>Loading application...</h1>
        </header>
      </div>
    );
  }

  return (
    <Router>
      <div className="App">
        <Routes>
          {/* If a user is logged in, redirect from the root to the dashboard.
              If not, show the AuthPage. */}
          <Route
            path="/"
            element={currentUser ? <Navigate to="/dashboard" /> : <AuthPage />}
          />

          {/* If a user is logged in, show the Dashboard.
              If not, redirect them to the login page. */}
          <Route
            path="/dashboard"
            element={currentUser ? <Dashboard /> : <Navigate to="/" />}
          />

          {/* Add other routes here as your app grows (e.g., /admin, /teacher, /student) */}

          {/* Catch-all for undefined routes - redirects to home or login */}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;