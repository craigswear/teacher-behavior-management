// client/src/App.js
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged, sendEmailVerification } from 'firebase/auth'; // Import sendEmailVerification
import { auth, db } from './firebaseConfig';
import { doc, getDoc, setDoc, collection, getDocs, query, limit } from 'firebase/firestore'; // Import necessary Firestore functions

import AuthPage from './AuthPage';
import SuperAdminDashboard from './SuperAdminDashboard';
import SchoolAdminDashboard from './SchoolAdminDashboard';
import TeacherDashboard from './TeacherDashboard';
import './App.css';

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [initError, setInitError] = useState(null); // New state for initialization errors

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setLoading(true); // Always set loading true when auth state changes
      setInitError(null); // Clear previous errors

      if (user) {
        // --- User is logged in ---
        console.log("App.js Debug: User detected by onAuthStateChanged. UID:", user.uid); // DEBUG LOG
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
          // --- User document found, retrieve role ---
          const userData = userDocSnap.data();
          setCurrentUser(user);
          setUserRole(userData.role);
          console.log("App.js Debug: User document found. Role:", userData.role); // DEBUG LOG

        } else {
          // --- User exists in Auth but NOT in Firestore. This means a new signup or first login. ---
          console.log("App.js Debug: User document NOT found in Firestore for UID:", user.uid, ". Attempting to create."); // DEBUG LOG

          let assignedRole = 'unassigned'; // Default for new users

          try {
            // Check if this is the very first user in the system (for superAdmin assignment)
            const usersCollectionRef = collection(db, 'users');
            const usersQuery = query(usersCollectionRef, limit(1));
            const existingUsersSnapshot = await getDocs(usersQuery);

            if (existingUsersSnapshot.empty) {
              assignedRole = 'superAdmin';
              console.log('App.js Debug: Assigning superAdmin role to first user.'); // DEBUG LOG
            } else {
              console.log('App.js Debug: Assigning "unassigned" role to new user (not first).'); // DEBUG LOG
            }

            // Create the user document in Firestore
            await setDoc(userDocRef, { // Use userDocRef directly
              email: user.email,
              role: assignedRole,
              createdAt: new Date(),
              // You might add initial schoolId: null here for superAdmin/unassigned or other defaults
            });
            console.log("App.js Debug: Firestore user document created successfully for UID:", user.uid); // DEBUG LOG

            // Send email verification if not already verified (important for new signups)
            if (!user.emailVerified) {
                console.log("App.js Debug: Sending email verification for new user:", user.email); // DEBUG LOG
                await sendEmailVerification(user);
            }
            console.log("App.js Debug: Email verification check complete."); // DEBUG LOG

            // Update state after successful creation
            setCurrentUser(user);
            setUserRole(assignedRole);
            console.log("App.js Debug: User state updated with role:", assignedRole); // DEBUG LOG

          } catch (firestoreError) {
            console.error("App.js Debug: Error creating user document or sending email verification:", firestoreError.message, "Code:", firestoreError.code); // DEBUG LOG error
            setInitError("Error during account setup. Please try logging in again or contact support.");
            setCurrentUser(null);
            setUserRole(null);
            await auth.signOut(); // Force logout if initialization fails
          }
        }
      } else {
        // --- User is logged out ---
        console.log("App.js Debug: User logged out."); // DEBUG LOG
        setCurrentUser(null);
        setUserRole(null);
      }
      setLoading(false); // All checks complete
    });

    return unsubscribe;
  }, []); // Empty dependency array means this effect runs once on initial mount

  if (loading) {
    return (
      <div className="App">
        <header className="App-header">
          <h1>Loading application...</h1>
          {initError && <p className="error-message">{initError}</p>} {/* Display init errors */}
        </header>
      </div>
    );
  }

  const renderDashboard = () => {
    if (!currentUser || !userRole) {
      // This case should primarily be hit if loading is false, but currentUser or role are null,
      // which would mean they are logged out, or there was an initError.
      return <Navigate to="/" />;
    }

    switch (userRole) {
      case 'superAdmin':
        return <SuperAdminDashboard />;
      case 'schoolAdmin':
        return <SchoolAdminDashboard />;
      case 'teacher':
        return <TeacherDashboard />;
      default:
        return (
          <div className="App">
            <header className="App-header">
              <h1>Access Denied / Role Not Assigned</h1>
              <p>Your account is not yet assigned a valid role. Please contact an administrator.</p>
              <button onClick={() => auth.signOut()}>Log Out</button>
            </header>
          </div>
        );
    }
  };

  return (
    <Router>
      <div className="App">
        <Routes>
          <Route
            path="/"
            element={currentUser ? renderDashboard() : <AuthPage />}
          />

          <Route path="/superadmin-dashboard" element={userRole === 'superAdmin' ? <SuperAdminDashboard /> : <Navigate to="/" />} />
          <Route path="/schooladmin-dashboard" element={userRole === 'schoolAdmin' ? <SchoolAdminDashboard /> : <Navigate to="/" />} />
          <Route path="/teacher-dashboard" element={userRole === 'teacher' ? <TeacherDashboard /> : <Navigate to="/" />} />

          <Route path="/dashboard" element={currentUser ? renderDashboard() : <Navigate to="/" />} />

          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;