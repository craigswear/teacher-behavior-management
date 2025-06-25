// client/src/StudentDetailPage.js
// Summary of Changes:
// - New component for displaying a single student's details.
// - Uses useParams to get the student ID from the URL.
// - Fetches student data from Firestore based on the ID.
// - Includes a basic structure for a point sheet UI (RISE categories, periods).
// - Handles "Student Absent" toggle and real-time point calculations.
// - Prepares for point sheet submission to a Cloud Function.
// - Provides navigation back to the teacher dashboard and logout functionality.

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom'; // Import useParams to read URL, useNavigate for navigation
import { auth, db, app } from './firebaseConfig'; // Import auth, db, app
import { doc, getDoc, collection, query, where, orderBy, getDocs } from 'firebase/firestore'; // Import Firestore functions
import { signOut } from 'firebase/auth'; // For logout functionality
import { getFunctions, httpsCallable } from 'firebase/functions'; // For Cloud Function calls

import './Dashboard.css'; // Reusing general dashboard styling
import './StudentDetailPage.css'; // NEW: Specific styling for student detail page (will create next)
import './DailyPointSheet.css'; // NEW: Specific styling for point sheet table (will create next)

// Predefined options for RISE categories and their numerical values
const RISE_OPTIONS = [
  { label: "Met Expectations", value: 2 },
  { label: "Partial Effort/Needs Improvement", value: 1 },
  { label: "Did Not Meet Expectations", value: 0 },
  { label: "Not Applicable", value: -1 } // Use -1 to indicate not scored for total possible points
];
const NUM_PERIODS = 6; // Total periods in a day for point sheet
const POINTS_PER_CATEGORY_MAX = 2; // Max points a student can earn per category per period
const CATEGORIES = ["respect", "integrity", "self", "excellence"]; // The four RISE categories

function StudentDetailPage() {
  const { studentId } = useParams(); // Hook to get studentId from URL parameter (e.g., /student/123)
  const navigate = useNavigate(); // Hook for programmatic navigation

  // --- State Variables ---
  const [studentData, setStudentData] = useState(null); // Stores the fetched student's data
  const [fetchStudentLoading, setFetchStudentLoading] = useState(true); // Loading state for student data
  const [fetchStudentError, setFetchStudentError] = useState(null); // Error state for student data fetching

  // State for the daily point sheet input
  const [pointSheetData, setPointSheetData] = useState([]); // Array to store scores for each period
  const [isAbsent, setIsAbsent] = useState(false); // State for student's absence today
  const [dailyTotalPoints, setDailyTotalPoints] = useState(0); // Calculated total points earned for the day
  const [dailyPossiblePoints, setDailyPossiblePoints] = useState(0); // Calculated total possible points for the day
  const [dailyPercentage, setDailyPercentage] = useState(0); // Calculated daily percentage
  const [submitLoading, setSubmitLoading] = useState(false); // Loading state for point sheet submission
  const [submitError, setSubmitError] = useState(null); // Error message for submission
  const [submitSuccess, setSubmitSuccess] = useState(null); // Success message for submission

  const userEmail = auth.currentUser ? auth.currentUser.email : 'Guest'; // Display current user's email
  const userUid = auth.currentUser ? auth.currentUser.uid : null; // Get current authenticated user's UID
  const functions = getFunctions(app); // Initialize Firebase Functions instance


  // --- Helper Functions for Point Sheet Logic ---

  // Initializes the point sheet with default "Met Expectations" scores
  const initializePointSheet = () => {
    const initialData = Array.from({ length: NUM_PERIODS }, (_, periodIndex) => ({
      period: periodIndex + 1,
      respect: 2, // Default to "Met Expectations" for each category
      integrity: 2,
      self: 2,
      excellence: 2,
      notes: '' // Empty notes field
    }));
    setPointSheetData(initialData);
    calculateDailyPoints(initialData, false); // Calculate initial points based on defaults
  };

  // Calculates total earned points, total possible points, and daily percentage
  const calculateDailyPoints = (currentPointSheetData, currentIsAbsent) => {
    if (currentIsAbsent) { // If student is absent, all points are 0
      setDailyTotalPoints(0);
      setDailyPossiblePoints(0);
      setDailyPercentage(0);
      return;
    }

    let totalEarned = 0;
    let totalPossible = 0;

    currentPointSheetData.forEach(period => {
      CATEGORIES.forEach(category => {
        const score = period[category];
        if (score !== -1) { // Only count if not "Not Applicable" for scoring
          totalEarned += score;
          totalPossible += POINTS_PER_CATEGORY_MAX;
        }
      });
    });

    setDailyTotalPoints(totalEarned);
    setDailyPossiblePoints(totalPossible);
    // Calculate percentage, avoid division by zero
    setDailyPercentage(totalPossible > 0 ? (totalEarned / totalPossible * 100) : 0);
  };

  // Determines if the day was successful based on daily percentage and student's current level
  const isDaySuccessful = (percentage, level) => {
    const requiredPercentage = { // Minimum percentage required per level
      1: 85,
      2: 90,
      3: 95,
      4: 100
    };
    return percentage >= requiredPercentage[level];
  };


  // --- Handlers for Point Sheet UI ---

  // Handles score changes in the dropdowns for a specific period and category
  const handleScoreChange = (periodIndex, category, value) => {
    const newValue = parseInt(value, 10); // Convert value to integer
    const updatedPointSheetData = pointSheetData.map((period, idx) =>
      idx === periodIndex ? { ...period, [category]: newValue } : period
    );
    setPointSheetData(updatedPointSheetData);
    calculateDailyPoints(updatedPointSheetData, isAbsent); // Recalculate immediately after change
  };

  // Handles changes in the notes field for a specific period
  const handleNotesChange = (periodIndex, notes) => {
    const updatedPointSheetData = pointSheetData.map((period, idx) =>
      idx === periodIndex ? { ...period, notes: notes } : period
    );
    setPointSheetData(updatedPointSheetData);
  };

  // Handles the "Student Absent Today" checkbox toggle
  const handleAbsentToggle = (e) => {
    const checked = e.target.checked;
    setIsAbsent(checked); // Update absence status
    calculateDailyPoints(pointSheetData, checked); // Recalculate based on new absence state
    if (checked) { // Clear any previous success/error messages if toggling absent
        setSubmitSuccess(null);
        setSubmitError(null);
    }
  };


  // --- Function to fetch student details (existing from previous step) ---
  useEffect(() => {
    const fetchStudentDetails = async () => {
      setFetchStudentLoading(true);
      setFetchStudentError(null);

      if (!userUid) { 
        setFetchStudentError("User not logged in.");
        setFetchStudentLoading(false);
        return;
      }
      if (!studentId) { 
        setFetchStudentError("Student ID missing from URL.");
        setFetchStudentLoading(false);
        return;
      }

      try {
        const currentUserDocRef = doc(db, 'users', userUid);
        const currentUserDocSnap = await getDoc(currentUserDocRef);
        // Verify user exists and is a teacher
        if (!currentUserDocSnap.exists() || currentUserDocSnap.data().role !== 'teacher') {
            setFetchStudentError("Access Denied: Not a valid Teacher account or user data not found.");
            navigate('/teacher-dashboard'); // Redirect back if not a teacher
            return;
        }
        const teacherSchoolId = currentUserDocSnap.data().schoolId; // Get the teacher's assigned schoolId
        if (!teacherSchoolId) { // Check if teacher has an assigned school
            setFetchStudentError("Teacher account has no assigned school.");
            navigate('/teacher-dashboard'); // Redirect if no school assigned
            return;
        }

        const studentDocRef = doc(db, 'students', studentId);
        const studentDocSnap = await getDoc(studentDocRef);

        if (studentDocSnap.exists()) {
          const student = { id: studentDocSnap.id, ...studentDocSnap.data() };

          if (student.schoolId !== teacherSchoolId) { // Security Check: Student belongs to teacher's school
            setFetchStudentError("Access Denied: Student does not belong to your school.");
            navigate('/teacher-dashboard'); // Redirect back if unauthorized access to student
            return;
          }
          setStudentData(student); // Set student data if all checks pass
          initializePointSheet(); // Initialize point sheet data when student data loads
          // Initial calculation is done within initializePointSheet
        } else {
          setFetchStudentError("Student not found."); 
        }
      } catch (error) {
        console.error("StudentDetailPage: Error fetching student details:", error.message);
        setFetchStudentError("Failed to load student data: " + error.message);
      } finally {
        setFetchStudentLoading(false);
      }
    };

    fetchStudentDetails();
  }, [studentId, userUid, db, navigate]);


  const handleLogout = async () => {
    try {
      await signOut(auth);
      console.log("Teacher logged out.");
      navigate('/'); // Navigate to login page after logout
    } catch (error) {
      console.error("Error logging out:", error.message);
      alert("Error logging out: " + error.message);
    }
  };

  const handleBackToStudents = () => {
    navigate('/teacher-dashboard'); // Navigate back to the teacher dashboard
  };


  // --- Handle Point Sheet Submission ---
  const handleSubmitPointSheet = async (e) => {
    e.preventDefault();
    setSubmitLoading(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    if (!studentData || !studentData.id) {
      setSubmitError("Student data not loaded. Cannot submit.");
      setSubmitLoading(false);
      return;
    }

    // Prepare data for Cloud Function
    const reportData = {
      studentId: studentData.id,
      schoolId: studentData.schoolId,
      date: new Date(), // Current date of report
      teacherUid: userUid, // UID of teacher submitting
      teacherEmail: userEmail, // Email of teacher submitting
      periodScores: pointSheetData, // The detailed scores for each period
      isAbsent: isAbsent, // Was student absent today?
      totalEarnedPoints: dailyTotalPoints,
      totalPossiblePoints: dailyPossiblePoints,
      dailyPercentage: dailyPercentage,
      isSuccessfulDay: isDaySuccessful(dailyPercentage, studentData.currentLevel), // Calculated success based on percentage and level
      levelAtTimeOfReport: studentData.currentLevel // Student's level when this report was submitted
    };

    try {
      // Call a Cloud Function to process and save the point sheet
      const processDailyPointSheet = httpsCallable(functions, 'processDailyPointSheet'); // NEW Cloud Function (will define next)
      // Get ID token for authentication in Cloud Function (Teacher is calling)
      const idToken = await auth.currentUser.getIdToken(true); 

      const result = await processDailyPointSheet({
        idToken: idToken,
        reportData: reportData
      });

      console.log("StudentDetailPage: Point sheet submission result:", result.data);
      setSubmitSuccess("Point sheet submitted! " + result.data.message);
      // After successful submission, re-initialize point sheet for next day's entry
      initializePointSheet(); 
      setIsAbsent(false); // Reset absent status
      // Re-fetch student details to update level/days if progression occurred
      fetchStudentDetails(); 

    } catch (error) {
      console.error("StudentDetailPage: Error submitting point sheet:", error);
      setSubmitError("Failed to submit point sheet: " + (error.message || "An unknown error occurred."));
    } finally {
      setSubmitLoading(false);
    }
  };


  // --- Component Render (JSX) ---
  return (
    <div className="dashboard-container">
      <div className="dashboard-card student-detail-card">
        <h2>Student Profile</h2>

        {fetchStudentLoading ? ( // Show loading message while fetching student data
          <p>Loading student details...</p>
        ) : fetchStudentError ? ( // Show error message if fetching failed
          <p className="error-message">{fetchStudentError}</p>
        ) : studentData ? ( // If student data is successfully loaded, render content
          <>
            <button onClick={handleBackToStudents} className="back-button">← Back to Students</button>
            <div className="student-info-section">
              <h3>{studentData.name} (ID: {studentData.studentId})</h3>
              <p><strong>Current Level:</strong> {studentData.currentLevel}</p>
              <p><strong>Days in Current Level:</strong> {studentData.daysInCurrentLevel}</p>
              <p><strong>Program Start Date:</strong> {new Date(studentData.programStartDate.toDate()).toLocaleDateString()}</p>
              <p><strong>Total Discipline Days Lost:</strong> {studentData.totalDisciplineDaysLost}</p>
            </div>

            <div className="point-sheet-section">
              <h3>Daily Point Sheet</h3>

              {/* Absent Checkbox */}
              <div className="form-group">
                <label htmlFor="isAbsentCheckbox">
                  <input
                    type="checkbox"
                    id="isAbsentCheckbox"
                    checked={isAbsent}
                    onChange={handleAbsentToggle}
                  />
                  Student Absent Today
                </label>
              </div>

              {/* Point Sheet Form (only visible if student is NOT absent) */}
              {!isAbsent && (
                <form onSubmit={handleSubmitPointSheet}>
                  <table>
                    <thead>
                      <tr>
                        <th>Period</th>
                        {CATEGORIES.map(cat => <th key={cat}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</th>)} {/* Capitalize categories for headers */}
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pointSheetData.map((period, index) => (
                        <tr key={period.period}>
                          <td>{period.period}</td>
                          {CATEGORIES.map(category => (
                            <td key={category}>
                              <select
                                value={period[category]} // Bind value to state
                                onChange={(e) => handleScoreChange(index, category, e.target.value)}
                              >
                                {RISE_OPTIONS.map(option => (
                                  <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                              </select>
                            </td>
                          ))}
                          <td>
                            <input
                              type="text"
                              value={period.notes}
                              onChange={(e) => handleNotesChange(index, e.target.value)}
                              placeholder="Optional notes"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="daily-summary">
                    <p><strong>Total Earned:</strong> {dailyTotalPoints} / {dailyPossiblePoints} (Points)</p>
                    <p><strong>Daily Percentage:</strong> {dailyPercentage.toFixed(2)}%</p>
                    <p>
                      <strong>Day Status:</strong>
                      {isDaySuccessful(dailyPercentage, studentData.currentLevel) ? (
                        <span style={{ color: 'lightgreen', fontWeight: 'bold' }}> SUCCESSFUL!</span>
                      ) : (
                        <span style={{ color: 'red', fontWeight: 'bold' }}> NOT Successful.</span>
                      )}
                    </p>
                  </div>

                  {submitError && <p className="error-message">{submitError}</p>}
                  {submitSuccess && <p className="success-message">{submitSuccess}</p>}
                  <button type="submit" disabled={submitLoading}>
                    {submitLoading ? 'Submitting...' : 'Submit Daily Points'}
                  </button>
                </form>
              )} {/* End of !isAbsent conditional rendering */}

            </div> {/* End of point-sheet-section */}
          </>
        ) : null} {/* End of studentData ? (...) : null */}

        <button onClick={handleLogout} className="logout-button">Log Out</button>
      </div>
    </div>
  );
}

export default StudentDetailPage;