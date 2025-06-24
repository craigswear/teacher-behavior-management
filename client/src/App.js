// client/src/App.js
import React from 'react';
import './App.css';
import AuthPage from './AuthPage'; // Import the AuthPage component

function App() {
  // For now, we'll just render the AuthPage directly.
  // Later, we'll add logic to show different components based on authentication state.
  return (
    <div className="App">
      <AuthPage />
    </div>
  );
}

export default App;
