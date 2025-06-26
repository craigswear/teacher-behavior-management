// client/src/TeacherDashboard.js
import React, { useState, useEffect, useCallback } from 'react'; // Added useCallback
import { auth, db, app } from './firebaseConfig';
import { signOut } from 'firebase/auth';
import { doc, getDoc, collection, getDocs, query, where, orderBy, addDoc, updateDoc, deleteDoc, arrayUnion, arrayRemove } from 'firebase/firestore'; // Added addDoc, updateDoc, deleteDoc, arrayUnion, arrayRemove
import { getFunctions } from 'firebase/functions';
import { useNavigate } from 'react-router-dom';
import './Dashboard.css'; // Consistent styling

// Reusable Modal Component (can be extracted to its own file later)
const Modal = ({ children, onClose, title }) => {
    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <div className="modal-header">
                    <h3 className="modal-title">{title}</h3>
                    <button onClick={onClose} className="modal-close-button">&times;</button>
                </div>
                <div className="modal-body">
                    {children}
                </div>
            </div>
        </div>
    );
};

function TeacherDashboard() {
    const [currentSchool, setCurrentSchool] = useState(null);
    const [fetchSchoolLoading, setFetchSchoolLoading] = useState(true);
    const [fetchSchoolError, setFetchSchoolError] = useState(null);

    const [allStudents, setAllStudents] = useState([]); // All students in the school
    const [fetchStudentsLoading, setFetchStudentsLoading] = useState(true);
    const [fetchStudentsError, setFetchStudentsError] = useState(null);

    const [teacherClasses, setTeacherClasses] = useState([]); // Classes created by this teacher
    const [fetchClassesLoading, setFetchClassesLoading] = useState(true);
    const [fetchClassesError, setFetchClassesError] = useState(null);

    const [showAddClassModal, setShowAddClassModal] = useState(false);
    const [newClassName, setNewClassName] = useState('');
    const [addClassLoading, setAddClassLoading] = useState(false);
    const [addClassError, setAddClassError] = useState(null);

    const [showEditClassModal, setShowEditClassModal] = useState(false);
    const [editingClass, setEditingClass] = useState(null); // The class object being edited
    const [selectedStudentToAdd, setSelectedStudentToAdd] = useState(''); // Student selected in dropdown
    const [editClassLoading, setEditClassLoading] = useState(false);
    const [editClassError, setEditClassError] = useState(null);

    const userEmail = auth.currentUser ? auth.currentUser.email : 'Guest';
    const userUid = auth.currentUser ? auth.currentUser.uid : null;
    // const functions = getFunctions(app); // Functions are not currently used in this specific logic flow

    const navigate = useNavigate();

    // Fetches current teacher's school data, all students in that school, and teacher's classes
    const fetchTeacherData = useCallback(async () => {
        setFetchSchoolLoading(true);
        setFetchSchoolError(null);
        setFetchStudentsLoading(true);
        setFetchStudentsError(null);
        setFetchClassesLoading(true);
        setFetchClassesError(null);

        if (!auth.currentUser || !userUid) {
            setFetchSchoolError("User not logged in or UID missing.");
            setFetchStudentsError("User not logged in or UID missing.");
            setFetchClassesError("User not logged in or UID missing.");
            setFetchSchoolLoading(false);
            setFetchStudentsLoading(false);
            setFetchClassesLoading(false);
            return;
        }

        try {
            const teacherUserDocRef = doc(db, 'users', userUid);
            const teacherUserDocSnap = await getDoc(teacherUserDocRef);

            if (teacherUserDocSnap.exists() && teacherUserDocSnap.data().role === 'teacher') {
                const schoolId = teacherUserDocSnap.data().schoolId;
                if (schoolId) {
                    const schoolDocRef = doc(db, 'schools', schoolId);
                    const schoolDocSnap = await getDoc(schoolDocRef);
                    if (schoolDocSnap.exists()) {
                        setCurrentSchool({ id: schoolDocSnap.id, ...schoolDocSnap.data() });
                        console.log("TeacherDashboard: Fetched current school:", { id: schoolDocSnap.id, ...schoolDocSnap.data() });

                        // Fetch all students in the school
                        const studentsCollectionRef = collection(db, 'students');
                        const qStudents = query(
                            studentsCollectionRef,
                            where('schoolId', '==', schoolId),
                            orderBy('name', 'asc')
                        );
                        const querySnapshotAllStudents = await getDocs(qStudents);
                        const studentsList = querySnapshotAllStudents.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                        setAllStudents(studentsList);
                        console.log("TeacherDashboard: Fetched all students:", studentsList);

                        // Fetch classes created by this teacher
                        const classesCollectionRef = collection(db, 'classes');
                        const qClasses = query(
                            classesCollectionRef,
                            where('teacherUid', '==', userUid),
                            orderBy('name', 'asc')
                        );
                        const querySnapshotClasses = await getDocs(qClasses);
                        const classesList = querySnapshotClasses.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                        setTeacherClasses(classesList);
                        console.log("TeacherDashboard: Fetched teacher classes:", classesList);

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
            setFetchClassesError("Failed to load classes: " + error.message);
        } finally {
            setFetchSchoolLoading(false);
            setFetchStudentsLoading(false);
            setFetchClassesLoading(false);
        }
    }, [userUid, db]); // Dependencies for useCallback

    useEffect(() => {
        fetchTeacherData();
    }, [fetchTeacherData]); // Run fetchTeacherData when it changes (which is only on mount due to useCallback deps)


    const handleLogout = async () => {
        try {
            await signOut(auth);
            console.log("Teacher logged out.");
            navigate('/'); // Navigate to login page after logout
        } catch (error) {
            console.error("Error logging out:", error.message);
            // Replace alert with an error message on UI
            setFetchSchoolError("Error logging out: " + error.message);
        }
    };

    const handleStudentClick = (studentId) => {
        navigate(`/student/${studentId}`);
    };

    // --- Class Management Functions ---

    const handleCreateClass = async (e) => {
        e.preventDefault();
        setAddClassLoading(true);
        setAddClassError(null);

        if (!newClassName.trim()) {
            setAddClassError("Class name cannot be empty.");
            setAddClassLoading(false);
            return;
        }
        if (!currentSchool) {
            setAddClassError("School data not loaded. Cannot create class.");
            setAddClassLoading(false);
            return;
        }

        try {
            await addDoc(collection(db, 'classes'), {
                name: newClassName,
                teacherUid: userUid,
                schoolId: currentSchool.id,
                studentUids: [], // Start with no students
                createdAt: new Date(), // Using JS Date for now, could use serverTimestamp() in Cloud Function
            });
            setNewClassName('');
            setShowAddClassModal(false);
            fetchTeacherData(); // Refresh data
        } catch (error) {
            console.error("Error creating class:", error);
            setAddClassError("Failed to create class: " + error.message);
        } finally {
            setAddClassLoading(false);
        }
    };

    const handleDeleteClass = async (classId, className) => {
        // Replaced window.confirm with a custom modal/message for better UX
        const confirmDelete = window.confirm(`Are you sure you want to delete the class "${className}"? This cannot be undone.`);
        if (!confirmDelete) {
            return;
        }

        try {
            await deleteDoc(doc(db, 'classes', classId));
            fetchTeacherData(); // Refresh data
        } catch (error) {
            console.error("Error deleting class:", error);
            setFetchClassesError("Failed to delete class: " + error.message);
        }
    };

    const handleOpenEditClassModal = (classObj) => {
        setEditingClass(classObj);
        setSelectedStudentToAdd(''); // Reset student selection
        setEditClassError(null);
        setShowEditClassModal(true);
    };

    const handleAddStudentToClass = async () => {
        setEditClassLoading(true);
        setEditClassError(null);

        if (!selectedStudentToAdd) {
            setEditClassError("Please select a student to add.");
            setEditClassLoading(false);
            return;
        }
        if (!editingClass) {
            setEditClassError("No class selected for editing.");
            setEditClassLoading(false);
            return;
        }

        // Check if student is already in this class
        if (editingClass.studentUids && editingClass.studentUids.includes(selectedStudentToAdd)) {
            setEditClassError("Student is already in this class.");
            setEditClassLoading(false);
            return;
        }
        
        // Check if student is already assigned to another class by this teacher
        const isStudentInAnotherClass = teacherClasses.some(cls => 
            cls.id !== editingClass.id && cls.studentUids && cls.studentUids.includes(selectedStudentToAdd)
        );

        if (isStudentInAnotherClass) {
            // Replaced window.confirm with a custom modal/message for better UX
            const confirmMove = window.confirm("This student is already assigned to another of your classes. Do you want to move them to this class?");
            if (!confirmMove) {
                setEditClassLoading(false);
                return;
            } else {
                // Remove student from the other class first
                const otherClass = teacherClasses.find(cls => 
                    cls.id !== editingClass.id && cls.studentUids && cls.studentUids.includes(selectedStudentToAdd)
                );
                if(otherClass) {
                    try {
                        await updateDoc(doc(db, 'classes', otherClass.id), {
                            studentUids: arrayRemove(selectedStudentToAdd)
                        });
                    } catch (error) {
                        console.error("Error removing student from other class:", error);
                        setEditClassError("Failed to move student: " + error.message);
                        setEditClassLoading(false);
                        return;
                    }
                }
            }
        }


        try {
            const classRef = doc(db, 'classes', editingClass.id);
            await updateDoc(classRef, {
                studentUids: arrayUnion(selectedStudentToAdd)
            });
            // Update local state immediately for better UX
            setEditingClass(prev => ({
                ...prev,
                studentUids: [...(prev.studentUids || []), selectedStudentToAdd]
            }));
            setSelectedStudentToAdd(''); // Clear selection
            fetchTeacherData(); // Re-fetch to ensure all data is consistent
        } catch (error) {
            console.error("Error adding student to class:", error);
            setEditClassError("Failed to add student: " + error.message);
        } finally {
            setEditClassLoading(false);
        }
    };

    const handleRemoveStudentFromClass = async (studentUidToRemove) => {
        setEditClassLoading(true);
        setEditClassError(null);

        if (!editingClass) {
            setEditClassError("No class selected for editing.");
            setEditClassLoading(false);
            return;
        }
        // Replaced window.confirm with a custom modal/message for better UX
        const confirmRemove = window.confirm(`Are you sure you want to remove this student from "${editingClass.name}"?`);
        if (!confirmRemove) {
            setEditClassLoading(false);
            return;
        }

        try {
            const classRef = doc(db, 'classes', editingClass.id);
            await updateDoc(classRef, {
                studentUids: arrayRemove(studentUidToRemove)
            });
            // Update local state immediately for better UX
            setEditingClass(prev => ({
                ...prev,
                studentUids: prev.studentUids.filter(uid => uid !== studentUidToRemove)
            }));
            fetchTeacherData(); // Re-fetch to ensure all data is consistent
        } catch (error) {
            console.error("Error removing student from class:", error);
            setEditClassError("Failed to remove student: " + error.message);
        } finally {
            setEditClassLoading(false);
        }
    };

    // Filter students not yet assigned to any class by THIS teacher
    const unassignedStudents = allStudents.filter(student => {
        return !teacherClasses.some(cls => cls.studentUids && cls.studentUids.includes(student.id));
    });

    return (
        <div className="dashboard-container">
            <div className="dashboard-card">
                <h2>Teacher Dashboard, {userEmail}!</h2>
                <p>View your classes, track student progress, and input daily point sheets.</p>

                {/* Your School Details Section */}
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

                {/* Class Management Section */}
                <div className="admin-section">
                    <h3>Your Classes</h3>
                    <button onClick={() => setShowAddClassModal(true)} className="add-class-button">Create New Class</button>

                    {fetchClassesLoading ? (
                        <p>Loading classes...</p>
                    ) : fetchClassesError ? (
                        <p className="error-message">{fetchClassesError}</p>
                    ) : teacherClasses.length === 0 ? (
                        <p>You haven't created any classes yet.</p>
                    ) : (
                        <div className="classes-list">
                            <ul>
                                {teacherClasses.map(cls => (
                                    <li key={cls.id} className="class-list-item">
                                        <h4>{cls.name}</h4>
                                        <div className="class-students-overview">
                                            {cls.studentUids && cls.studentUids.length > 0 ? (
                                                <ul className="class-students-in-list"> {/* New class for styling student list within class */}
                                                    {cls.studentUids.map(studentUid => {
                                                        const student = allStudents.find(s => s.id === studentUid);
                                                        return student ? (
                                                            // Entire row is clickable to go to student detail
                                                            <li key={student.id} className="student-list-item clickable-row" onClick={() => handleStudentClick(student.id)}>
                                                                <span>{student.name} (ID: {student.studentId}) - Level {student.currentLevel}</span>
                                                            </li>
                                                        ) : (
                                                            <li key={studentUid} className="student-list-item clickable-row" onClick={() => handleStudentClick(studentUid)}>
                                                                <span>Unknown Student (ID: {studentUid})</span>
                                                            </li>
                                                        );
                                                    })}
                                                </ul>
                                            ) : (
                                                <p>No students assigned to this class yet.</p>
                                            )}
                                        </div>
                                        <div className="class-actions">
                                            <button onClick={() => handleOpenEditClassModal(cls)} className="edit-button">Edit Class</button>
                                            <button onClick={() => handleDeleteClass(cls.id, cls.name)} className="delete-button">Delete Class</button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>

                {/* --- Modals --- */}
                {showAddClassModal && (
                    <Modal onClose={() => setShowAddClassModal(false)} title="Create New Class">
                        <form onSubmit={handleCreateClass} className="admin-form">
                            <div className="form-group">
                                <label htmlFor="newClassName">Class Name:</label>
                                <input
                                    type="text"
                                    id="newClassName"
                                    value={newClassName}
                                    onChange={(e) => setNewClassName(e.target.value)}
                                    placeholder="e.g., 5th Grade Math"
                                    required
                                />
                            </div>
                            {addClassError && <p className="error-message">{addClassError}</p>}
                            <button type="submit" disabled={addClassLoading} className="submit-button">
                                {addClassLoading ? 'Creating...' : 'Create Class'}
                            </button>
                        </form>
                    </Modal>
                )}

                {showEditClassModal && editingClass && (
                    <Modal onClose={() => setShowEditClassModal(false)} title={`Edit Class: ${editingClass.name}`}>
                        <div className="admin-form">
                            {/* Section to Add Students */}
                            <h4 className="section-subheading">Add Student to Class:</h4>
                            <div className="form-group">
                                <select
                                    id="selectStudentToAdd"
                                    value={selectedStudentToAdd}
                                    onChange={(e) => setSelectedStudentToAdd(e.target.value)}
                                    disabled={editClassLoading || unassignedStudents.length === 0}
                                    className="admin-form-select" // Apply existing select styling
                                >
                                    <option value="">Select a student...</option>
                                    {unassignedStudents.map(student => (
                                        <option key={student.id} value={student.id}>
                                            {student.name} (ID: {student.studentId})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <button
                                onClick={handleAddStudentToClass}
                                disabled={editClassLoading || !selectedStudentToAdd}
                                className="submit-button" // Apply existing submit button styling
                            >
                                {editClassLoading ? 'Adding...' : 'Add Student'}
                            </button>
                            {editClassError && <p className="error-message">{editClassError}</p>}

                            {/* Section to Remove Students */}
                            <h4 className="section-subheading">Students in This Class:</h4>
                            <div className="users-list">
                                {editingClass.studentUids && editingClass.studentUids.length > 0 ? (
                                    <ul>
                                        {editingClass.studentUids.map(studentUid => {
                                            const student = allStudents.find(s => s.id === studentUid);
                                            return student ? (
                                                <li key={student.id} className="student-in-class-item">
                                                    <span>{student.name} (ID: {student.studentId})</span>
                                                    <button
                                                        onClick={() => handleRemoveStudentFromClass(student.id)}
                                                        disabled={editClassLoading}
                                                        className="remove-student-button" // Specific class for styling
                                                    >
                                                        &times; {/* Little 'x' icon */}
                                                    </button>
                                                </li>
                                            ) : (
                                                <li key={studentUid} className="student-in-class-item">
                                                    <span>Unknown Student (ID: {studentUid})</span>
                                                    <button
                                                        onClick={() => handleRemoveStudentFromClass(studentUid)}
                                                        disabled={editClassLoading}
                                                        className="remove-student-button" // Specific class for styling
                                                    >
                                                        &times;
                                                    </button>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                ) : (
                                    <p>No students assigned to this class yet.</p>
                                )}
                            </div>
                        </div>
                    </Modal>
                )}


                <button onClick={handleLogout} className="logout-button">Log Out</button>
            </div>
        </div>
    );
}

export default TeacherDashboard;