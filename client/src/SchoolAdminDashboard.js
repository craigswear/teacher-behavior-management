// client/src/SchoolAdminDashboard.js
// Summary of Changes:
// - All helper functions (fetchAdminData, handleLogout, handleAddTeacher, fetchStudentsForSchool, handleAddStudent) are explicitly defined.
// - fetchAdminData and fetchStudentsForSchool are called correctly within the useEffect.
// - All state variables are correctly declared and used.
// - New sections for "Manage Students" (form and list) are included.
// - Correct import for addDoc for student creation.

import React, { useState, useEffect } from 'react';
import { auth, db, app } from './firebaseConfig'; // Import 'app' for getFunctions(app)
import { signOut } from 'firebase/auth';
// Ensure all necessary Firestore functions are imported, including addDoc
import { doc, getDoc, collection, getDocs, query, where, orderBy, addDoc } from 'firebase/firestore'; 
import { getFunctions, httpsCallable } from 'firebase/functions';
import './Dashboard.css'; // Reusing general dashboard styling

function SchoolAdminDashboard() {
  // --- State Variables ---
  const [currentSchool, setCurrentSchool] = useState(null);
  const [fetchSchoolLoading, setFetchSchoolLoading] = useState(true);
  const [fetchSchoolError, setFetchSchoolError] = useState(null);

  const [newTeacherEmail, setNewTeacherEmail] = useState('');
  const [addTeacherLoading, setAddTeacherLoading] = useState(false);
  const [addTeacherError, setAddTeacherError] = useState(null);
  const [addTeacherSuccess, setAddTeacherSuccess] = useState(null);

  const [teachers, setTeachers] = useState([]);
  const [fetchTeachersLoading, setFetchTeachersLoading] = useState(true);
  const [fetchTeachersError, setFetchTeachersError] = useState(null);

  // New state for new student form
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentId, setNewStudentId] = useState(''); // School's internal ID for student
  const [addStudentLoading, setAddStudentLoading] = useState(false);
  const [addStudentError, setAddStudentError] = useState(null);
  const [addStudentSuccess, setAddStudentSuccess] = useState(null);

  // New state for displaying existing students
  const [students, setStudents] = useState([]);
  const [fetchStudentsLoading, setFetchStudentsLoading] = useState(true);
  const [fetchStudentsError, setFetchStudentsError] = useState(null);

  const userEmail = auth.currentUser ? auth.currentUser.email : 'Guest';
  const userUid = auth.currentUser ? auth.currentUser.uid : null; 
  const functions = getFunctions(app); // Initialize Firebase Functions with the app instance


  // --- Helper Functions Definitions (Defined before useEffect where they are called) ---

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
  const fetchAdminData = async () => {
    setFetchSchoolLoading(true);
    setFetchSchoolError(null);
    setFetchTeachersLoading(true);
    setFetchTeachersError(null);
    setFetchStudentsLoading(true); 
    setFetchStudentsError(null);

    if (!auth.currentUser || !userUid) { 
      setFetchSchoolError("User not logged in or UID missing.");
      setFetchTeachersError("User not logged in or UID missing.");
      setFetchStudentsError("User not logged in or UID missing.");
      setFetchSchoolLoading(false);
      setFetchTeachersLoading(false);
      setFetchStudentsLoading(false);
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
          } else {
            setFetchSchoolError("Assigned school not found.");
          }

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

          await fetchStudentsForSchool(schoolId); // Await fetch students
          
        } else {
          setFetchSchoolError("School Administrator account has no school assigned.");
        }
      } else {
        setFetchSchoolError("User is not a School Administrator or user data not found.");
      }
    } catch (error) {
      console.error("SchoolAdminDashboard: Error fetching initial admin data:", error.message);
      setFetchSchoolError("Failed to load school data: " + error.message);
      setFetchTeachersError("Failed to load teachers: " + error.message);
      setFetchStudentsError("Failed to load students: " + error.message);
    } finally {
      setFetchSchoolLoading(false);
      setFetchTeachersLoading(false);
      setFetchStudentsLoading(false);
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
      fetchAdminData(); 
    } catch (error) {
      console.error("SchoolAdminDashboard: Error adding teacher:", error.message);
      setAddTeacherError("Failed to add teacher: " + (error.message || "An unknown error occurred."));
    } finally {
      setAddTeacherLoading(false);
    }
  };

  // Function to fetch students for the assigned school
  const fetchStudentsForSchool = async (schoolId) => {
    if (!schoolId) return;

    setFetchStudentsLoading(true);
    setFetchStudentsError(null);
    try {
      const studentsCollectionRef = collection(db, 'students');
      const qStudents = query(
        studentsCollectionRef,
        where('schoolId', '==', schoolId),
        orderBy('name', 'asc') 
      );
      const querySnapshotStudents = await getDocs(qStudents);
      const studentsList = querySnapshotStudents.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setStudents(studentsList);
      console.log("SchoolAdminDashboard: Fetched students for school:", schoolId, studentsList);
    } catch (error) {
      console.error("SchoolAdminDashboard: Error fetching students:", error.message);
      setFetchStudentsError("Failed to load students: " + error.message);
    } finally {
      setFetchStudentsLoading(false);
    }
  };

  // Function to add a new student
  const handleAddStudent = async (e) => {
    e.preventDefault();
    setAddStudentLoading(true);
    setAddStudentError(null);
    setAddStudentSuccess(null);

    if (!newStudentName.trim() || !newStudentId.trim()) {
      setAddStudentError("Student Name and ID are required.");
      setAddStudentLoading(false);
      return;
    }
    if (!currentSchool || !currentSchool.id) {
      setAddStudentError("Cannot add student: School data not loaded for admin.");
      setAddStudentLoading(false);
      return;
    }

    try {
      const studentsCollectionRef = collection(db, 'students');
      const docRef = await addDoc(studentsCollectionRef, { // Using addDoc from Firestore
        schoolId: currentSchool.id, // Assign to the current admin's school
        name: newStudentName.trim(),
        studentId: newStudentId.trim(), // School's internal ID for the student
        programStartDate: new Date(), // Set current date as program start
        currentLevel: 1, // All new students start at Level 1
        daysInCurrentLevel: 0, // Days completed in current level
        totalDisciplineDaysLost: 0, // Track days lost due to admin discipline
        lastUpdated: new Date(),
        createdBy: userUid, // Admin's UID who created the student
      });
      console.log("SchoolAdminDashboard: New student added with ID:", docRef.id);
      setAddStudentSuccess(`Student ${newStudentName} added successfully!`);
      setNewStudentName(''); // Clear form
      setNewStudentId('');
      fetchStudentsForSchool(currentSchool.id); // Re-fetch students to update the list
    } catch (error) {
      console.error("SchoolAdminDashboard: Error adding student:", error.message);
      setAddStudentError("Failed to add student: " + error.message);
    } finally {
      setAddStudentLoading(false);
    }
  };

  // --- useEffect to run initial data fetch ---
  // This effect calls fetchAdminData when the component mounts or userUid/db change.
  useEffect(() => {
    fetchAdminData();
  }, [userUid, db]); 


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
          {currentSchool ? ( 
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

          <div className="users-list"> 
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

        {/* Manage Students Section */}
        <div className="admin-section">
          <h3>Manage Students</h3>
          {currentSchool ? ( 
            <>
              <form onSubmit={handleAddStudent} className="admin-form">
                <div className="form-group">
                  <label htmlFor="newStudentName">Student Name:</label>
                  <input
                    type="text"
                    id="newStudentName"
                    value={newStudentName}
                    onChange={(e) => setNewStudentName(e.target.value)}
                    placeholder="e.g., Jane Doe"
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="newStudentId">Student Internal ID:</label>
                  <input
                    type="text"
                    id="newStudentId"
                    value={newStudentId}
                    onChange={(e) => setNewStudentId(e.target.value)}
                    placeholder="e.g., S12345"
                    required
                  />
                </div>
                {addStudentError && <p className="error-message">{addStudentError}</p>}
                {addStudentSuccess && <p className="success-message">{addStudentSuccess}</p>}
                <button type="submit" disabled={addStudentLoading}>
                  {addStudentLoading ? 'Adding Student...' : 'Add New Student'}
                </button>
              </form>

              <div className="users-list"> 
                <h4>Students in {currentSchool.name}:</h4>
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
                      </li>
                    ))}
                  </ul>
                )}
              </div>
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