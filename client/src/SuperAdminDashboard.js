// client/src/SuperAdminDashboard.js
import React, { useState, useEffect } from 'react';
import { auth, db } from './firebaseConfig';
import { signOut } from 'firebase/auth';
import { collection, addDoc, getDocs, query, orderBy, setDoc, doc } from 'firebase/firestore'; // Import setDoc, doc for user docs
import { getFunctions, httpsCallable } from 'firebase/functions'; // Import httpsCallable
import './Dashboard.css'; // Reusing general dashboard styling

function SuperAdminDashboard() {
  // State for the new school form
  const [newSchoolName, setNewSchoolName] = useState('');
  const [newSchoolAddress, setNewSchoolAddress] = useState('');
  const [newSchoolContactEmail, setNewSchoolContactEmail] = useState(''); // Correct state setter
  const [addSchoolLoading, setAddSchoolLoading] = useState(false);
  const [addSchoolError, setAddSchoolError] = useState(null);
  const [addSchoolSuccess, setAddSchoolSuccess] = useState(null);

  // State for displaying existing schools
  const [schools, setSchools] = useState([]);
  const [fetchSchoolsLoading, setFetchSchoolsLoading] = useState(true);
  const [fetchSchoolsError, setFetchSchoolsError] = useState(null);

  // State for new user form
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState('teacher'); // Default to teacher
  const [newUserSchoolId, setNewUserSchoolId] = useState('');
  const [addUserLoading, setAddUserLoading] = useState(false);
  const [addUserError, setAddUserError] = useState(null);
  const [addUserSuccess, setAddUserSuccess] = useState(null);

  // State for displaying existing users (simple list for now)
  const [users, setUsers] = useState([]);
  const [fetchUsersLoading, setFetchUsersLoading] = useState(true);
  const [fetchUsersError, setFetchUsersError] = useState(null);


  const userEmail = auth.currentUser ? auth.currentUser.email : 'Guest';
  const functions = getFunctions(); // Initialize Firebase Functions

  // Function to fetch schools from Firestore
  const fetchSchools = async () => {
    setFetchSchoolsLoading(true);
    setFetchSchoolsError(null);
    try {
      const schoolsCollectionRef = collection(db, 'schools');
      const q = query(schoolsCollectionRef, orderBy('name', 'asc')); // Order by school name
      const querySnapshot = await getDocs(q);
      const schoolsList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSchools(schoolsList);
      console.log("SuperAdminDashboard: Fetched schools:", schoolsList);
      // Set the default school for new users if schools exist
      if (schoolsList.length > 0) {
        setNewUserSchoolId(schoolsList[0].id);
      }
    } catch (error) {
      console.error("SuperAdminDashboard: Error fetching schools:", error.message);
      setFetchSchoolsError("Failed to load schools: " + error.message);
    } finally {
      setFetchSchoolsLoading(false);
    }
  };

  // Function to fetch users from Firestore
  const fetchUsers = async () => {
    setFetchUsersLoading(true);
    setFetchUsersError(null);
    try {
      const usersCollectionRef = collection(db, 'users');
      const q = query(usersCollectionRef, orderBy('email', 'asc')); // Order by email
      const querySnapshot = await getDocs(q);
      const usersList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Filter out the current superAdmin from this list if desired, or display all
      setUsers(usersList.filter(user => user.role !== 'superAdmin')); // Show all users except the superAdmin
      console.log("SuperAdminDashboard: Fetched users:", usersList);
    } catch (error) {
      console.error("SuperAdminDashboard: Error fetching users:", error.message);
      setFetchUsersError("Failed to load users: " + error.message);
    } finally {
      setFetchUsersLoading(false);
    }
  };


  // useEffect to fetch schools and users when the component mounts
  useEffect(() => {
    fetchSchools();
    fetchUsers();
  }, []); // Empty dependency array means this runs once on mount

  const handleLogout = async () => {
    try {
      await signOut(auth);
      console.log("Super Admin logged out.");
    } catch (error) {
      console.error("Error logging out:", error.message);
      alert("Error logging out: " + error.message);
    }
  };

  const handleAddSchool = async (e) => {
    e.preventDefault();
    setAddSchoolLoading(true);
    setAddSchoolError(null);
    setAddSchoolSuccess(null);

    if (!newSchoolName.trim() || !newSchoolAddress.trim() || !newSchoolContactEmail.trim()) {
      setAddSchoolError("All school fields (Name, Address, Contact Email) are required.");
      setAddSchoolLoading(false);
      return;
    }

    try {
      const docRef = await addDoc(collection(db, 'schools'), {
        name: newSchoolName.trim(),
        address: newSchoolAddress.trim(),
        contactEmail: newSchoolContactEmail.trim(),
        createdAt: new Date(),
      });
      console.log("SuperAdminDashboard: New school added with ID:", docRef.id);
      setAddSchoolSuccess("School added successfully!");
      setNewSchoolName('');
      setNewSchoolAddress('');
      setNewSchoolContactEmail(''); // FIX: Changed from setNewUserContactEmail
      fetchSchools(); // Re-fetch schools to update the list and default selection
    } catch (error) {
      console.error("SuperAdminDashboard: Error adding school:", error.message);
      setAddSchoolError("Failed to add school: " + error.message);
    } finally {
      setAddSchoolLoading(false);
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    setAddUserLoading(true);
    setAddUserError(null);
    setAddUserSuccess(null);

    if (!newUserEmail.trim() || !newUserRole || !newUserSchoolId) {
      setAddUserError("All user fields (Email, Role, School) are required.");
      setAddUserLoading(false);
      return;
    }
    // No password validation here, as password is set by user via email link

    try {
      // Call the Cloud Function to create the user
      const createUserByAdmin = httpsCallable(functions, 'createUserByAdmin'); // Get the function reference
      const result = await createUserByAdmin({ // Call the function with data
        email: newUserEmail,
        role: newUserRole,
        schoolId: newUserSchoolId,
      });

      console.log("SuperAdminDashboard: Cloud Function result:", result.data); // Log the result data from the function

      setAddUserSuccess(result.data.message); // Display the message returned by the Cloud Function
      setNewUserEmail(''); // Clear form fields
      setNewUserRole('teacher'); // Reset role to default
      // newUserSchoolId will remain selected on the current school, or default to first if none.
      fetchUsers(); // Re-fetch users to update the list

    } catch (error) {
      console.error("SuperAdminDashboard: Error calling createUserByAdmin:", error);
      // Display the error message from the Cloud Function (if it's an HttpsError)
      setAddUserError("Failed to add user: " + (error.message || "An unknown error occurred."));
    } finally {
      setAddUserLoading(false);
    }
  };


  return (
    <div className="dashboard-container">
      <div className="dashboard-card">
        <h2>Super Admin Dashboard, {userEmail}!</h2>
        <p>Manage all schools and user accounts across the entire system.</p>

        {/* School Management Section */}
        <div className="admin-section">
          <h3>Manage Schools</h3>
          <form onSubmit={handleAddSchool} className="admin-form">
            <div className="form-group">
              <label htmlFor="newSchoolName">School Name:</label>
              <input
                type="text"
                id="newSchoolName"
                value={newSchoolName}
                onChange={(e) => setNewSchoolName(e.target.value)}
                placeholder="e.g., Springfield Elementary"
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="newSchoolAddress">Address:</label>
              <input
                type="text"
                id="newSchoolAddress"
                value={newSchoolAddress}
                onChange={(e) => setNewSchoolAddress(e.target.value)}
                placeholder="e.g., 123 Main St, Anytown"
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="newSchoolContactEmail">Contact Email:</label>
              <input
                type="email"
                id="newSchoolContactEmail"
                value={newSchoolContactEmail}
                onChange={(e) => setNewSchoolContactEmail(e.target.value)}
                placeholder="e.g., principal@school.com"
                required
              />
            </div>
            {addSchoolError && <p className="error-message">{addSchoolError}</p>}
            {addSchoolSuccess && <p className="success-message">{addSchoolSuccess}</p>}
            <button type="submit" disabled={addSchoolLoading}>
              {addSchoolLoading ? 'Adding School...' : 'Add New School'}
            </button>
          </form>

          <div className="schools-list">
            <h4>Existing Schools:</h4>
            {fetchSchoolsLoading ? (
              <p>Loading schools...</p>
            ) : fetchSchoolsError ? (
              <p className="error-message">{fetchSchoolsError}</p>
            ) : schools.length === 0 ? (
              <p>No schools added yet.</p>
            ) : (
              <ul>
                {schools.map(school => (
                  <li key={school.id}>
                    <strong>{school.name}</strong> - <span>{school.contactEmail}</span> <br/> <span>({school.address})</span>
                    {/* Add edit/delete school buttons here later */}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* User Management Section */}
        <div className="admin-section">
          <h3>Manage Users</h3>
          <form onSubmit={handleAddUser} className="admin-form">
            <div className="form-group">
              <label htmlFor="newUserEmail">User Email:</label>
              <input
                type="email"
                id="newUserEmail"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                placeholder="e.g., new.user@school.com"
                required
              />
            </div>
            {/* Removed password input field as passwords are now set by the user */}
            <div className="form-group">
              <label htmlFor="newUserRole">Role:</label>
              <select
                id="newUserRole"
                value={newUserRole}
                onChange={(e) => setNewUserRole(e.target.value)}
                required
              >
                <option value="teacher">Teacher</option>
                <option value="schoolAdmin">School Administrator</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="newUserSchoolId">Assign to School:</label>
              {fetchSchoolsLoading ? (
                <p>Loading schools...</p>
              ) : schools.length === 0 ? (
                <p className="error-message">No schools available. Please add a school first.</p>
              ) : (
                <select
                  id="newUserSchoolId"
                  value={newUserSchoolId}
                  onChange={(e) => setNewUserSchoolId(e.target.value)}
                  required
                >
                  {schools.map(school => (
                    <option key={school.id} value={school.id}>
                      {school.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {addUserError && <p className="error-message">{addUserError}</p>}
            {addUserSuccess && <p className="success-message">{addUserSuccess}</p>}
            <button type="submit" disabled={addUserLoading || schools.length === 0}>
              {addUserLoading ? 'Adding User...' : 'Add New User'}
            </button>
          </form>

          <div className="users-list">
            <h4>Existing Users (School Admins & Teachers):</h4>
            {fetchUsersLoading ? (
              <p>Loading users...</p>
            ) : fetchUsersError ? (
              <p className="error-message">{fetchUsersError}</p>
            ) : users.length === 0 ? (
              <p>No school admins or teachers added yet.</p>
            ) : (
              <ul>
                {users.map(user => (
                  <li key={user.id}>
                    <strong>{user.email}</strong> - <span>{user.role}</span> (<span>{schools.find(s => s.id === user.schoolId)?.name || 'Unknown School'}</span>)
                    {/* Add edit/delete user buttons here later */}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <button onClick={handleLogout} className="logout-button">Log Out</button>
      </div>
    </div>
  );
}

export default SuperAdminDashboard;