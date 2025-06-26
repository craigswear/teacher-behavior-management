// client/src/StudentDetailPage.js
// Summary of Changes:
// - Moved 'fetchStudentDetails' function definition to the top-level of the component,
//   making it accessible by other handlers like handleSubmitPointSheet.
// - Ensures all helper functions are correctly defined and scoped.

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { auth, db, app } from './firebaseConfig';
import { doc, getDoc, collection, query, where, orderBy, getDocs } from 'firebase/firestore'; 
import { signOut } from 'firebase/auth'; 
import { getFunctions, httpsCallable } from 'firebase/functions';

import './Dashboard.css'; 
import './StudentDetailPage.css'; 
import './DailyPointSheet.css'; 

// Predefined options for RISE categories and their numerical values
const RISE_OPTIONS = [
  { label: "Met Expectations", value: 2 },
  { label: "Partial Effort/Needs Improvement", value: 1 },
  { label: "Did Not Meet Expectations", value: 0 },
  { label: "Not Applicable", value: -1 } 
];
const NUM_PERIODS = 6; 
const POINTS_PER_CATEGORY_MAX = 2; 
const CATEGORIES = ["respect", "integrity", "self", "excellence"]; 

function StudentDetailPage() {
  const { studentId } = useParams();
  const navigate = useNavigate();

  // --- State Variables ---
  const [studentData, setStudentData] = useState(null);
  const [fetchStudentLoading, setFetchStudentLoading] = useState(true);
  const [fetchStudentError, setFetchStudentError] = useState(null);

  const [pointSheetData, setPointSheetData] = useState([]);
  const [isAbsent, setIsAbsent] = useState(false);
  const [dailyTotalPoints, setDailyTotalPoints] = useState(0);
  const [dailyPossiblePoints, setDailyPossiblePoints] = useState(0);
  const [dailyPercentage, setDailyPercentage] = useState(0);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitSuccess, setSubmitSuccess] = useState(null);

  const userEmail = auth.currentUser ? auth.currentUser.email : 'Guest';
  const userUid = auth.currentUser ? auth.currentUser.uid : null;
  const functions = getFunctions(app);


  // --- Helper Functions for Point Sheet Logic (Defined at top-level of component) ---
  // These functions are defined here so they are accessible by all handlers and effects.

  const initializePointSheet = () => {
    const initialData = Array.from({ length: NUM_PERIODS }, (_, periodIndex) => ({
      period: periodIndex + 1,
      respect: 2, 
      integrity: 2,
      self: 2,
      excellence: 2,
      notes: ''
    }));
    setPointSheetData(initialData);
  };

  const calculateDailyPoints = (currentPointSheetData, currentIsAbsent) => {
    if (currentIsAbsent) {
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
        if (score !== -1) {
          totalEarned += score;
          totalPossible += POINTS_PER_CATEGORY_MAX;
        }
      });
    });

    setDailyTotalPoints(totalEarned);
    setDailyPossiblePoints(totalPossible);
    setDailyPercentage(totalPossible > 0 ? (totalEarned / totalPossible * 100) : 0);
  };

  const isDaySuccessful = (percentage, level) => {
    const requiredPercentage = {
      1: 85,
      2: 90,
      3: 95,
      4: 100
    };
    return percentage >= requiredPercentage[level];
  };


  // --- Handlers for Point Sheet UI ---

  const handleScoreChange = (periodIndex, category, value) => {
    const newValue = parseInt(value, 10);
    const updatedPointSheetData = pointSheetData.map((period, idx) =>
      idx === periodIndex ? { ...period, [category]: newValue } : period
    );
    setPointSheetData(updatedPointSheetData);
    calculateDailyPoints(updatedPointSheetData, isAbsent);
  };

  const handleNotesChange = (periodIndex, notes) => {
    const updatedPointSheetData = pointSheetData.map((period, idx) =>
      idx === periodIndex ? { ...period, notes: notes } : period
    );
    setPointSheetData(updatedPointSheetData);
  };

  const handleAbsentToggle = (e) => {
    const checked = e.target.checked;
    setIsAbsent(checked);
    calculateDailyPoints(pointSheetData, checked);
    if (checked) {
        setSubmitSuccess(null);
        setSubmitError(null);
    }
  };


  // Function to fetch student details (Defined at top-level of component)
  const fetchStudentDetails = async () => { // MOVED THIS DEFINITION OUTSIDE useEffect
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
      if (!currentUserDocSnap.exists() || currentUserDocSnap.data().role !== 'teacher') {
          setFetchStudentError("Access Denied: Not a valid Teacher account or user data not found.");
          navigate('/teacher-dashboard');
          return;
      }
      const teacherSchoolId = currentUserDocSnap.data().schoolId;
      if (!teacherSchoolId) {
          setFetchStudentError("Teacher account has no assigned school.");
          navigate('/teacher-dashboard');
          return;
      }

      const studentDocRef = doc(db, 'students', studentId);
      const studentDocSnap = await getDoc(studentDocRef);

      if (studentDocSnap.exists()) {
        const student = { id: studentDocSnap.id, ...studentDocSnap.data() };

        if (student.schoolId !== teacherSchoolId) {
          setFetchStudentError("Access Denied: Student does not belong to your school.");
          navigate('/teacher-dashboard');
          return;
        }
        setStudentData(student);
        initializePointSheet(); // Initialize point sheet data when student data loads
        calculateDailyPoints(pointSheetData, isAbsent); // Initial calculation on load
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

  const handleLogout = async () => {
    try {
      await signOut(auth);
      console.log("Teacher logged out.");
      navigate('/');
    } catch (error) {
      console.error("Error logging out:", error.message);
      alert("Error logging out: " + error.message);
    }
  };

  const handleBackToStudents = () => {
    navigate('/teacher-dashboard');
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

    // Prepare data for Cloud Function payload
    const reportData = {
      studentId: studentData.id, 
      schoolId: studentData.schoolId,
      date: new Date(),
      teacherUid: userUid,
      teacherEmail: userEmail,
      periodScores: pointSheetData,
      isAbsent: isAbsent,
      totalEarnedPoints: dailyTotalPoints,
      totalPossiblePoints: dailyPossiblePoints,
      dailyPercentage: dailyPercentage,
      isSuccessfulDay: isDaySuccessful(dailyPercentage, studentData.currentLevel),
      levelAtTimeOfReport: studentData.currentLevel
    };

    try {
      const processDailyPointSheet = httpsCallable(functions, 'processDailyPointSheet');
      const idToken = await auth.currentUser.getIdToken(true); 

      const result = await processDailyPointSheet({
        idToken: idToken,
        reportData: reportData
      });

      console.log("StudentDetailPage: Point sheet submission result:", result.data);
      setSubmitSuccess("Point sheet submitted! " + result.data.message);
      initializePointSheet(); 
      setIsAbsent(false); 
      fetchStudentDetails(); 
      
    } catch (error) {
      console.error("StudentDetailPage: Error submitting point sheet:", error);
      setSubmitError("Failed to submit point sheet: " + (error.message || "An unknown error occurred."));
    } finally {
      setSubmitLoading(false);
    }
  };


  // --- useEffect to run initial data fetch (calls fetchStudentDetails) ---
  useEffect(() => {
    fetchStudentDetails(); // Call fetchStudentDetails on component mount
  }, [studentId, userUid, db, navigate]); // Dependencies: ensure stable references


  return (
    <div className="dashboard-container">
      <div className="dashboard-card student-detail-card">
        <h2>Student Profile</h2>
        
        {fetchStudentLoading ? (
          <p>Loading student details...</p>
        ) : fetchStudentError ? (
          <p className="error-message">{fetchStudentError}</p>
        ) : studentData ? ( 
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
                        {CATEGORIES.map(cat => <th key={cat}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</th>)}
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
                                value={period[category]}
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
              )}
              
            </div>
          </>
        ) : null}

        <button onClick={handleLogout} className="logout-button">Log Out</button>
      </div>
    </div>
  );
}

export default StudentDetailPage;