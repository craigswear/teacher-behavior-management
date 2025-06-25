// client/src/SchoolAdminDashboard.js
import React, { useState, useEffect } from 'react';
import { auth, db, app } from './firebaseConfig'; // Import 'app' for getFunctions(app)
import { signOut } from 'firebase/auth';
import { doc, getDoc, collection, getDocs, query, where, orderBy } from 'firebase/firestore'; // Import Firestore functions
import { getFunctions, httpsCallable } from 'firebase/functions'; // Import for Cloud Function call
import './Dashboard.css'; // Reusing general dashboard styling

function SchoolAdminDashboard() {
  const [currentSchool, setCurrentSchool] = useState(null);
  const [fetchSchoolLoading, setFetchSchoolLoading] = useState(true);
  const [fetchSchoolError, setFetchSchoolError] = useState(null);

  // State for new teacher form
  const [newTeacherEmail, setNewTeacherEmail] = useState('');
  const [addTeacherLoading, setAddTeacherLoading] = useState(false);
  const [addTeacherError, setAddTeacherError] = useState(null);
  const [addTeacherSuccess, setAddTeacherSuccess] = useState(null);

  // State for displaying existing teachers in this school
  const [teachers, setTeachers] = useState([]);
  const [fetchTeachersLoading, setFetchTeachersLoading] = useState(true);
  const [fetchTeachersError, setFetchTeachersError] = useState(null);

  const userEmail = auth.currentUser ? auth.currentUser.email : 'Guest';
  const userUid = auth.currentUser ? auth.currentUser.uid : null; // Get current admin's UID
  const functions = getFunctions(app); // Initialize Firebase Functions with the app instance


  // Function to fetch the current admin's school details and teachers
  // This useEffect relies on userUid being available, which it should be after App.js processes auth.
  useEffect(() => {
    const fetchAdminData = async () => {
      setFetchSchoolLoading(true);
      setFetchSchoolError(null);
      setFetchTeachersLoading(true);
      setFetchTeachersError(null);

      // Defensive check, though App.js should prevent this state
      if (!auth.currentUser || !userUid) { 
        setFetchSchoolError("User not logged in or UID missing.");
        setFetchTeachersError("User not logged in or UID missing.");
        setFetchSchoolLoading(false);
        setFetchTeachersLoading(false);
        return;
      }

      try {
        // 1. Get the current School Admin's user document to find their schoolId
        const adminUserDocRef = doc(db, 'users', userUid);
        const adminUserDocSnap = await getDoc(adminUserDocRef);

        if (adminUserDocSnap.exists() && adminUserDocSnap.data().role === 'schoolAdmin') {
          const schoolId = adminUserDocSnap.data().schoolId;
          if (schoolId) {
            // 2. Fetch the school details using the schoolId
            const schoolDocRef = doc(db, 'schools', schoolId);
            const schoolDocSnap = await getDoc(schoolDocRef);
            if (schoolDocSnap.exists()) {
              setCurrentSchool({ id: schoolDocSnap.id, ...schoolDocSnap.data() });
              console.log("SchoolAdminDashboard: Fetched current school:", { id: schoolDocSnap.id, ...schoolDocSnap.data() });

              // 3. Fetch teachers assigned to this specific school
              const usersCollectionRef = collection(db, 'users');
              const qTeachers = query(
                usersCollectionRef,
                where('schoolId', '==', schoolId),
                where('role', '==', 'teacher'), // Only fetch teachers
                orderBy('email', 'asc')
              );
              const querySnapshotTeachers = await getDocs(qTeachers);
              const teachersList = querySnapshotTeachers.docs.map(doc => ({ id: doc.id, ...doc.data() }));
              setTeachers(teachersList);
              console.log("SchoolAdminDashboard: Fetched teachers:", teachersList);

            } else {
              setFetchSchoolError("Assigned school not found.");
            }
          } else {
            setFetchSchoolError("School Administrator account has no school assigned.");
          }
        } else {
          setFetchSchoolError("User is not a School Administrator or user data not found.");
        }
      } catch (error) {
        console.error("SchoolAdminDashboard: Error fetching admin data:", error.message);
        setFetchSchoolError("Failed to load school data: " + error.message);
        setFetchTeachersError("Failed to load teachers: " + error.message);
      } finally {
        setFetchSchoolLoading(false);
        setFetchTeachersLoading(false);
      }
    };

    fetchAdminData();
  }, [userUid]); // Re-run if userUid changes (e.g., if App.js loads it later)


  const handleLogout = async () => {
    try {
      await signOut(auth);
      console.log("School Admin logged out.");
    } catch (error) {
      console.error("Error logging out:", error.message);
      alert("Error logging out: " + error.message);
    }
  };

  const handleAddTeacher = async (e) => {
    e.preventDefault();
    setAddTeacherLoading(true);
    setAddTeacherError(null);
    setAddTeacherSuccess(null);

    if (!newTeacherEmail.trim()) {
      setAddTeacherError("Teacher email is required.");
      setAddTeacherLoading(false);
      return;
    }
    if (!currentSchool || !currentSchool.id) {
        setAddTeacherError("No school assigned to this administrator. Cannot add teacher.");
        setAddTeacherLoading(false);
        return;
    }

    try {
      const createUserByAdmin = httpsCallable(functions, 'createUserByAdmin'); // Reuse the Cloud Function
      // Ensure auth.currentUser exists before trying to get token
      const idToken = await auth.currentUser.getIdToken(true); // Get fresh token
      
      const result = await createUserByAdmin({
        idToken: idToken, // Pass token for authentication in Cloud Function
        email: newTeacherEmail,
        role: 'teacher', // Fixed role for teacher creation
        schoolId: currentSchool.id, // Assign to the current admin's school
      });

      console.log("SchoolAdminDashboard: Cloud Function result for adding teacher:", result.data);

      setAddTeacherSuccess(`Teacher ${newTeacherEmail} added successfully! Email sent to set password.`);
      setNewTeacherEmail(''); // Clear form
      // Re-fetch teachers to update the list after a successful add
      fetchAdminData(); // Call this to refresh school data AND teachers list
    } catch (error) {
      console.error("SchoolAdminDashboard: Error adding teacher:", error.message);
      setAddTeacherError("Failed to add teacher: " + (error.message || "An unknown error occurred."));
    } finally {
      setAddTeacherLoading(false);
    }
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-card">
        <h2>School Admin Dashboard, {userEmail}!</h2>
        <p>Manage teachers and students within your specific school.</p>

        {/* School Details Section */}
        <div className="admin-section">
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

        {/* Manage Teachers Section */}
        <div className="admin-section">
          <h3>Manage Teachers</h3>
          {currentSchool ? ( /* Only show form if school data is loaded */
            <form onSubmit={handleAddTeacher} className="admin-form">
              <div className="form-group">
                <label htmlFor="newTeacherEmail">Teacher Email:</label>
                <input
                  type="email"
                  id="newTeacherEmail"
                  value={newTeacherEmail}
                  onChange={(e) => setNewTeacherEmail(e.target.value)}
                  placeholder="e.g., teacher@your-school.com"
                  required
                />
              </div>
              {addTeacherError && <p className="error-message">{addTeacherError}</p>}
              {addTeacherSuccess && <p className="success-message">{addTeacherSuccess}</p>}
              <button type="submit" disabled={addTeacherLoading}>
                {addTeacherLoading ? 'Adding Teacher...' : 'Add New Teacher'}
              </button>
            </form>
          ) : (
            <p className="error-message">Cannot add teachers: School details not loaded or assigned.</p>
          )}

          <div className="users-list"> {/* Reusing users-list styling */}
            <h4>Teachers in Your School:</h4>
            {fetchTeachersLoading ? (
              <p>Loading teachers...</p>
            ) : fetchTeachersError ? (
              <p className="error-message">{fetchTeachersError}</p>
            ) : teachers.length === 0 ? (
              <p>No teachers assigned to this school yet.</p>
            ) : (
              <ul>
                {teachers.map(teacher => (
                  <li key={teacher.id}>
                    <strong>{teacher.email}</strong> - <span>{teacher.role}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Manage Students Section (Placeholder) */}
        <div className="admin-section"> {/* NEW SECTION */}
          <h3>Manage Students</h3>
          {currentSchool ? ( // Only show if school data is loaded
            <>
              <p>Student management functionality will go here for {currentSchool.name}.</p>
              <p>Future features: Add/Edit Students, View Point Sheets, Adjust Levels/Days.</p>
            </>
          ) : (
            <p className="error-message">Cannot manage students: School details not loaded or assigned.</p>
          )}
        </div>

        <button onClick={handleLogout} className="logout-button">Log Out</button>
      </div>
    </div>
  );
}

export default SchoolAdminDashboard;