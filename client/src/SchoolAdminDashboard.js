// client/src/SchoolAdminDashboard.js
import React from 'react';
import { auth } from './firebaseConfig';
import { signOut } from 'firebase/auth';
import './Dashboard.css'; // Reusing general dashboard styling

function SchoolAdminDashboard() {
  const handleLogout = async () => {
    try {
      await signOut(auth);
      console.log("School Admin logged out.");
    } catch (error) {
      console.error("Error logging out:", error.message);
      alert("Error logging out: " + error.message);
    }
  };

  const userEmail = auth.currentUser ? auth.currentUser.email : 'Guest';

  return (
    <div className="dashboard-container">
      <div className="dashboard-card">
        <h2>School Admin Dashboard, {userEmail}!</h2>
        <p>Manage teachers and students within your specific school.</p>
        <p>Future features: Manage School Teachers, Manage School Students, Disciplinary Logs, School-specific Reports.</p>
        <button onClick={handleLogout}>Log Out</button>
      </div>
    </div>
  );
}

export default SchoolAdminDashboard;