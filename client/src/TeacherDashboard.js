// client/src/TeacherDashboard.js
// Summary of Changes:
// - Fetches and displays the teacher's assigned school details.
// - Fetches and displays a list of students in that school.
// - Includes error/loading states for data fetching.

import React, { useState, useEffect } from 'react';
import { auth, db, app } from './firebaseConfig';
import { signOut } from 'firebase/auth';
import { doc, getDoc, collection, getDocs, query, where, orderBy } from 'firebase/firestore'; // Import Firestore functions
import { getFunctions } from 'firebase/functions'; // getFunctions is here for consistency, though not used yet
import './Dashboard.css'; // Reusing general dashboard styling

function TeacherDashboard() {
  const [currentSchool, setCurrentSchool] = useState(null);
  const [fetchSchoolLoading, setFetchSchoolLoading] = useState(true);
  const [fetchSchoolError, setFetchSchoolError] = useState(null);

  // State for displaying students in this school
  const [students, setStudents] = useState([]);
  const [fetchStudentsLoading, setFetchStudentsLoading] = useState(true);
  const [fetchStudentsError, setFetchStudentsError] = useState(null);

  const userEmail = auth.currentUser ? auth.currentUser.email : 'Guest';
  const userUid = auth.currentUser ? auth.currentUser.uid : null; // Get current teacher's UID
  const functions = getFunctions(app); // Initialize Firebase Functions with the app instance (not used yet, but good to have)


  // Function to fetch the current teacher's assigned school data and students
  useEffect(() => {
    const fetchTeacherData = async () => {
      setFetchSchoolLoading(true);
      setFetchSchoolError(null);
      setFetchStudentsLoading(true); // Set loading for students
      setFetchStudentsError(null);  // Clear errors for students

      if (!auth.currentUser || !userUid) { // Defensive check
        setFetchSchoolError("User not logged in or UID missing.");
        setFetchStudentsError("User not logged in or UID missing.");
        setFetchSchoolLoading(false);
        setFetchStudentsLoading(false);
        return;
      }

      try {
        // 1. Get the current Teacher's user document to find their schoolId
        const teacherUserDocRef = doc(db, 'users', userUid);
        const teacherUserDocSnap = await getDoc(teacherUserDocRef);

        if (teacherUserDocSnap.exists() && teacherUserDocSnap.data().role === 'teacher') {
          const schoolId = teacherUserDocSnap.data().schoolId;
          if (schoolId) {
            // 2. Fetch the school details using the schoolId
            const schoolDocRef = doc(db, 'schools', schoolId);
            const schoolDocSnap = await getDoc(schoolDocRef);
            if (schoolDocSnap.exists()) {
              setCurrentSchool({ id: schoolDocSnap.id, ...schoolDocSnap.data() });
              console.log("TeacherDashboard: Fetched current school:", { id: schoolDocSnap.id, ...schoolDocSnap.data() });

              // 3. Fetch students assigned to this specific school
              const studentsCollectionRef = collection(db, 'students');
              const qStudents = query(
                studentsCollectionRef,
                where('schoolId', '==', schoolId),
                orderBy('name', 'asc')
              );
              const querySnapshotStudents = await getDocs(qStudents);
              const studentsList = querySnapshotStudents.docs.map(doc => ({ id: doc.id, ...doc.data() }));
              setStudents(studentsList);
              console.log("TeacherDashboard: Fetched students:", studentsList);

            } else {
              setFetchSchoolError("Assigned school not found.");
            }
          } else {
            setFetchSchoolError("Teacher account has no school assigned.");
          }
        } else {
          setFetchSchoolError("User is not a Teacher or user data not found.");
        }
      } catch (error) {
        console.error("TeacherDashboard: Error fetching teacher data:", error.message);
        setFetchSchoolError("Failed to load school data: " + error.message);
        setFetchStudentsError("Failed to load students: " + error.message);
      } finally {
        setFetchSchoolLoading(false);
        setFetchStudentsLoading(false);
      }
    };

    fetchTeacherData(); // Call the async function
  }, [userUid, db]); // Re-run if userUid or db changes

  const handleLogout = async () => {
    try {
      await signOut(auth);
      console.log("Teacher logged out.");
    } catch (error) {
      console.error("Error logging out:", error.message);
      alert("Error logging out: " + error.message);
    }
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-card">
        <h2>Teacher Dashboard, {userEmail}!</h2>
        <p>View your classes, track student progress, and input daily point sheets.</p>

        {/* Your School Details Section (similar to School Admin) */}
        <div className="admin-section"> {/* Reusing admin-section styling for consistency */}
          <h3>Your School Details</h3>
          {fetchSchoolLoading ? (
            <p>Loading school details...</p>
          ) : fetchSchoolError ? (
            <p className="error-message">{fetchSchoolError}</p>
          ) : currentSchool ? (
            <div>
              <p><strong>Name:</strong> {currentSchool.name}</p>
              <p><strong>Address:</strong> {currentSchool.address}</p>
              <p><strong>Contact:</strong> {currentSchool.contactEmail}</p>
            </div>
          ) : (
            <p>No school assigned to your account. Please contact a Super Admin.</p>
          )}
        </div>

        {/* Students in Your School Section */}
        <div className="admin-section"> {/* Reusing admin-section styling */}
          <h3>Students in Your School:</h3>
          {currentSchool ? ( /* Only show if school data is loaded */
            <div className="users-list"> {/* Reusing users-list styling for consistent look */}
              {fetchStudentsLoading ? (
                <p>Loading students...</p>
              ) : fetchStudentsError ? (
                <p className="error-message">{fetchStudentsError}</p>
              ) : students.length === 0 ? (
                <p>No students enrolled in this school yet.</p>
              ) : (
                <ul>
                  {students.map(student => (
                    <li key={student.id}>
                      <strong>{student.name}</strong> - <span>ID: {student.studentId}</span> - <span>Level {student.currentLevel}</span>
                      {/* Future: Button to click student and view point sheet */}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <p className="error-message">Cannot view students: School details not loaded or assigned.</p>
          )}
        </div>

        <button onClick={handleLogout} className="logout-button">Log Out</button>
      </div>
    </div>
  );
}

export default TeacherDashboard;