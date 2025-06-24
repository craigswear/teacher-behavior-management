// client/src/TeacherDashboard.js
import React from 'react';
import { auth } from './firebaseConfig';
import { signOut } from 'firebase/auth';
import './Dashboard.css'; // Reusing general dashboard styling

function TeacherDashboard() {
  const handleLogout = async () => {
    try {
      await signOut(auth);
      console.log("Teacher logged out.");
    } catch (error) {
      console.error("Error logging out:", error.message);
      alert("Error logging out: " + error.message);
    }
  };

  const userEmail = auth.currentUser ? auth.currentUser.email : 'Guest';

  return (
    <div className="dashboard-container">
      <div className="dashboard-card">
        <h2>Teacher Dashboard, {userEmail}!</h2>
        <p>View your classes, track student progress, and input daily point sheets.</p>
        <p>Future features: View Classes, Student Point Sheets, Student Progress Charts.</p>
        <button onClick={handleLogout}>Log Out</button>
      </div>
    </div>
  );
}

export default TeacherDashboard;