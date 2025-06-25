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
  const userUid = auth.currentUser ? auth.currentUser.uid : null; 
  const functions = getFunctions(app); // Initialize Firebase Functions with the app instance


  // --- Helper Functions Definitions (Defined before they are used in useEffect or JSX) ---

  const handleLogout = async () => {
    try {
      await signOut(auth);
      console.log("School Admin logged out.");
    } catch (error) {
      console.error("Error logging out:", error.message);
      alert("Error logging out: " + error.message);
    }
  };

  // Function to fetch the current admin's school details and teachers
  // Defined here so it can be called from handleAddTeacher
  const fetchAdminData = async () => {
    setFetchSchoolLoading(true);
    setFetchSchoolError(null);
    setFetchTeachersLoading(true);
    setFetchTeachersError(null);

    if (!auth.currentUser || !userUid) { 
      setFetchSchoolError("User not logged in or UID missing.");
      setFetchTeachersError("User not logged in or UID missing.");
      setFetchSchoolLoading(false);
      setFetchTeachersLoading(false);
      return;
    }

    try {
      const adminUserDocRef = doc(db, 'users', userUid);
      const adminUserDocSnap = await getDoc(adminUserDocRef);

      if (adminUserDocSnap.exists() && adminUserDocSnap.data().role === 'schoolAdmin') {
        const schoolId = adminUserDocSnap.data().schoolId;
        if (schoolId) {
          const schoolDocRef = doc(db, 'schools', schoolId);
          const schoolDocSnap = await getDoc(schoolDocRef);
          if (schoolDocSnap.exists()) {
            setCurrentSchool({ id: schoolDocSnap.id, ...schoolDocSnap.data() });
            console.log("SchoolAdminDashboard: Fetched current school:", { id: schoolDocSnap.id, ...schoolDocSnap.data() });

            const usersCollectionRef = collection(db, 'users');
            const qTeachers = query(
              usersCollectionRef,
              where('schoolId', '==', schoolId),
              where('role', '==', 'teacher'),
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
      const createUserByAdmin = httpsCallable(functions, 'createUserByAdmin');
      const idToken = await auth.currentUser.getIdToken(true);
      
      const result = await createUserByAdmin({
        idToken: idToken,
        email: newTeacherEmail,
        role: 'teacher',
        schoolId: currentSchool.id,
      });

      console.log("SchoolAdminDashboard: Cloud Function result for adding teacher:", result.data);

      setAddTeacherSuccess(`Teacher ${newTeacherEmail} added successfully! Email sent to set password.`);
      setNewTeacherEmail('');
      fetchAdminData(); // Call this to refresh school data AND teachers list
    } catch (error) {
      console.error("SchoolAdminDashboard: Error adding teacher:", error.message);
      setAddTeacherError("Failed to add teacher: " + (error.message || "An unknown error occurred."));
    } finally {
      setAddTeacherLoading(false);
    }
  };

  // --- useEffect to run initial data fetch (calls fetchAdminData) ---
  useEffect(() => {
    fetchAdminData();
  }, [userUid, db]); // Add db to dependencies as it's used in fetchAdminData

  // handleAddSchool function is NOT part of SchoolAdminDashboard. It's in SuperAdminDashboard.

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
        <div className="admin-section">
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