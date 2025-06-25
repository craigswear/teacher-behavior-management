// client/src/App.js
// Summary of Changes:
// - Added 'getDocs' to the firebase/firestore import list to resolve 'no-undef' error.

import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged, sendEmailVerification } from 'firebase/auth'; 
import { auth, db } from './firebaseConfig';
// Ensure all necessary Firestore functions are imported if used in this file
// CRITICAL FIX: Added getDocs to the import list
import { doc, getDoc, collection, query, limit, setDoc, getDocs } from 'firebase/firestore'; 

import AuthPage from './AuthPage';
import SuperAdminDashboard from './SuperAdminDashboard';
import SchoolAdminDashboard from './SchoolAdminDashboard';
import TeacherDashboard from './TeacherDashboard';
import StudentDetailPage from './StudentDetailPage'; 
import './App.css';

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [initError, setInitError] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setLoading(true);
      setInitError(null);

      if (user) {
        console.log("App.js Debug: User detected by onAuthStateChanged. UID:", user.uid);
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
          const userData = userDocSnap.data();
          setCurrentUser(user);
          setUserRole(userData.role);
          console.log("App.js Debug: User document found. Role:", userData.role);
        } else {
          // --- Handle first user signup / user document creation in Firestore ---
          console.error("App.js Debug: User document NOT found in Firestore for UID:", user.uid, ". Attempting to create.");
          let assignedRole = 'unassigned';
          try {
            const usersCollectionRef = collection(db, 'users');
            const usersQuery = query(usersCollectionRef, limit(1));
            const existingUsersSnapshot = await getDocs(usersQuery); // This line needed getDocs import

            if (existingUsersSnapshot.empty) {
              assignedRole = 'superAdmin';
              console.log('App.js Debug: Assigning superAdmin role to first user.');
            } else {
              console.log('App.js Debug: Assigning "unassigned" role to new user (not first).');
            }

            await setDoc(userDocRef, { // Create user document in Firestore
              email: user.email,
              role: assignedRole,
              createdAt: new Date(),
            });
            console.log("App.js Debug: Firestore user document created successfully for UID:", user.uid);

            // Send email verification for initial signup (Firebase's default sender)
            if (!user.emailVerified) {
                console.log("App.js Debug: Sending initial email verification for new user:", user.email);
                try {
                    await sendEmailVerification(user); 
                } catch (emailVerError) {
                    console.error("App.js Debug: Error sending initial email verification:", emailVerError);
                }
            }
            console.log("App.js Debug: Email verification check complete.");

            setCurrentUser(user);
            setUserRole(assignedRole);
            console.log("App.js Debug: User state updated with role:", assignedRole);

          } catch (firestoreError) {
            console.error("App.js Debug: Error creating user document or sending email verification:", firestoreError.message, "Code:", firestoreError.code);
            setInitError("Error during account setup. Please try logging in again or contact support.");
            setCurrentUser(null);
            setUserRole(null);
            await auth.signOut();
          }
        }
      } else {
        console.log("App.js Debug: User logged out.");
        setCurrentUser(null);
        setUserRole(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, [db, auth]); // Dependencies

  if (loading) {
    return (
      <div className="App">
        <header className="App-header">
          <h1>Loading application...</h1>
          {initError && <p className="error-message">{initError}</p>}
        </header>
      </div>
    );
  }

  const renderDashboard = () => {
    if (!currentUser || !userRole) {
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
          {/* Main route: if authenticated, render the specific dashboard; otherwise, show AuthPage */}
          <Route
            path="/"
            element={currentUser ? renderDashboard() : <AuthPage />}
          />

          {/* Specific routes for each dashboard type */}
          <Route path="/superadmin-dashboard" element={userRole === 'superAdmin' ? <SuperAdminDashboard /> : <Navigate to="/" />} />
          <Route path="/schooladmin-dashboard" element={userRole === 'schoolAdmin' ? <SchoolAdminDashboard /> : <Navigate to="/" />} />
          <Route path="/teacher-dashboard" element={userRole === 'teacher' ? <TeacherDashboard /> : <Navigate to="/" />} />
          
          {/* Route for Student Detail Page. StudentId is a URL parameter. */}
          <Route path="/student/:studentId" element={currentUser ? <StudentDetailPage /> : <Navigate to="/" />} /> 

          {/* Fallback for authenticated users without a specific role dashboard access */}
          <Route path="/dashboard" element={currentUser ? renderDashboard() : <Navigate to="/" />} />

          {/* Catch-all route for any undefined paths */}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;