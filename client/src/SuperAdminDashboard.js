// client/src/SuperAdminDashboard.js
import React from 'react';
import { auth } from './firebaseConfig';
import { signOut } from 'firebase/auth';
import './Dashboard.css'; // Reusing general dashboard styling

function SuperAdminDashboard() {
  const handleLogout = async () => {
    try {
      await signOut(auth);
      console.log("Super Admin logged out.");
    } catch (error) {
      console.error("Error logging out:", error.message);
      alert("Error logging out: " + error.message);
    }
  };

  const userEmail = auth.currentUser ? auth.currentUser.email : 'Guest';

  return (
    <div className="dashboard-container">
      <div className="dashboard-card">
        <h2>Super Admin Dashboard, {userEmail}!</h2>
        <p>Here you will manage all schools, users, and system-wide settings.</p>
        <p>Future features: Manage Schools, Manage All Users, Global Reports, Licensing.</p>
        <button onClick={handleLogout}>Log Out</button>
      </div>
    </div>
  );
}

export default SuperAdminDashboard;