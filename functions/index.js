// functions/index.js
// Summary of Changes:
// - CRITICAL FIX: Changed `studentDocSnap.exists()` to `studentDocSnap.exists` property in `processDailyPointSheet` function.
//   This resolves `TypeError: studentDocSnap.exists is not a function`.

// Firebase Admin SDK imports
const {initializeApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");

// Firebase Functions v2 imports
const {https} = require("firebase-functions/v2");
const logger = require("firebase-functions/logger"); 

// Firebase Functions Parameters imports
const {defineSecret} = require("firebase-functions/params");

// SendGrid (still used by createUserByAdmin)
const sgMail = require('@sendgrid/mail');

initializeApp();
const adminAuth = getAuth();
const adminDb = getFirestore();

const SENDGRID_API_KEY_SECRET = defineSecret("SENDGRID_API_KEY");
const APP_NAME_SECRET = defineSecret("APP_NAME_SECRET");

const APP_NAME_PARAM = defineSecret("APP_NAME_SECRET"); 

// --- Existing createUserByAdmin function --- (No changes from previous version)
exports.createUserByAdmin = https.onCall(
    { secrets: [SENDGRID_API_KEY_SECRET, APP_NAME_SECRET] },
    async (request) => {
        const sendGridApiKey = SENDGRID_API_KEY_SECRET.value();
        const appName = APP_NAME_PARAM.value() || 'Behavior Management System';

        logger.info(`CF_DEBUG: SendGrid API Key retrieved by function (Param Config): ${sendGridApiKey ? sendGridApiKey.substring(0, 10) + '...' : 'MISSING'}`);
        logger.info(`CF_DEBUG: App Name retrieved by function (Param Config): ${appName || 'MISSING'}`);

        if (!sendGridApiKey) {
            logger.error("CF_DEBUG: SendGrid API Key is MISSING after secret binding. Cannot send email.");
            throw new https.HttpsError(
                'internal',
                'Email service not configured. Please contact administrator.'
            );
        }
        sgMail.setApiKey(sendGridApiKey);

        logger.info("CF_DEBUG: createUserByAdmin function called.", { data: request.data, auth: request.auth });

        if (!request.auth) {
            logger.warn("CF_DEBUG: Caller is NOT authenticated via request.auth (v2).");
            throw new https.HttpsError(
                'unauthenticated',
                'The function must be called while authenticated.'
            );
        }

        const callerUid = request.auth.uid;
        let callerRole;
        try {
            const callerDoc = await adminDb.collection('users').doc(callerUid).get();
            if (!callerDoc.exists) {
                logger.warn(`CF_DEBUG: Caller UID ${callerUid} has no user document.`);
                throw new https.HttpsError('permission-denied', 'User data not found for authenticated caller.');
            }
            callerRole = callerDoc.data().role;
            const callerSchoolId = callerDoc.data().schoolId;

            const isSuperAdmin = callerRole === 'superAdmin';
            const isSchoolAdminCreatingTeacherInOwnSchool = 
                callerRole === 'schoolAdmin' && 
                request.data.role === 'teacher' && 
                request.data.schoolId === callerSchoolId;

            if (!isSuperAdmin && !isSchoolAdminCreatingTeacherInOwnSchool) {
                logger.warn(`CF_DEBUG: Permission denied for UID ${callerUid}. Role: ${callerRole}, Request Role: ${request.data.role}, Request SchoolId: ${request.data.schoolId}, Caller SchoolId: ${callerSchoolId}.`);
                throw new https.HttpsError(
                    'permission-denied',
                    'Insufficient permissions to create user with requested role/school. School Admins can only create Teachers for their own school.'
                );
            }

            logger.info(`CF_DEBUG: Authenticated caller UID: ${callerUid}, Role: ${callerRole} - Permission Granted.`);
        } catch (error) {
            logger.error("CF_DEBUG: Caller role/permission check failed:", error.message, "Code:", error.code, "Stack:", error.stack);
            throw new https.HttpsError(
                'internal',
                'Failed to verify caller permissions.',
                error.message
            );
        }

        const { idToken, email, role, schoolId } = request.data; 

        if (!email || !role || !schoolId) {
            logger.warn("CF_DEBUG: Invalid arguments.", { email, role, schoolId });
            throw new https.HttpsError('invalid-argument', 'The function must be called with a valid email, role, and schoolId.');
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            logger.warn(`CF_DEBUG: Invalid email format provided: ${email}`);
            throw new https.HttpsError('invalid-argument', 'Provided email is not valid.');
        }
        const allowedRoles = ['teacher', 'schoolAdmin'];
        if (!allowedRoles.includes(role)) {
            logger.warn(`CF_DEBUG: Invalid role provided: ${role}`);
            throw new https.HttpsError('invalid-argument', 'Invalid role. Role must be "teacher" or "schoolAdmin".');
        }

        try {
            const userRecord = await adminAuth.createUser({ email: email, emailVerified: false, disabled: false });
            logger.info(`CF_DEBUG: Successfully created new user in Auth: ${userRecord.uid}`);
            const passwordResetLink = await adminAuth.generatePasswordResetLink(email);
            logger.info(`CF_DEBUG: Generated password reset link for ${email}: ${passwordResetLink}`);

            await adminDb.collection('users').doc(userRecord.uid).set({
                email: userRecord.email,
                role: role,
                schoolId: schoolId,
                createdAt: FieldValue.serverTimestamp(),
                createdBy: callerUid,
            });
            logger.info(`CF_DEBUG: Successfully created user document in Firestore.`);

            const msg = {
                to: email, from: 'samsedusolutionsllc@gmail.com', subject: `Welcome to ${appName}! Set Your Password`,
                html: `<p>Welcome to the ${appName}!</p><p>Your account has been created by an administrator.</p><p>To set your password and verify your email address, please click the link below:</p><p><a href="${passwordResetLink}">Set Your Password and Verify Email</a></p><p>This link is valid for a limited time.</p><p>If you did not expect this email, please ignore it.</p><p>Thank you,</p><p>The ${appName} Team</p>`,
            };
            await sgMail.send(msg);
            logger.info(`CF_DEBUG: Welcome email sent to: ${email} via SendGrid.`);

            return { message: `User ${email} (${role}) created successfully. Welcome email sent to set password.`, userId: userRecord.uid };

        } catch (error) {
            logger.error('CF_DEBUG: Error in createUserByAdmin function during creation/email phase:', error);
            let errorMessage = 'An unexpected error occurred.';
            if (error.code && error.message) {
                if (error.code === 'auth/email-already-in-use') { errorMessage = `The email address ${email} is already in use by another account.`; }
                else if (error.code === 'auth/invalid-email') { errorMessage = `Provided email is not valid.`; }
                else { errorMessage = `Firebase Error: ${error.message}`; }
            } else if (error.response && error.response.body && error.response.body.errors) {
                errorMessage = `SendGrid Error: ${error.response.body.errors.map(e => e.message).join(', ')}`;
            } else { errorMessage = error.message || errorMessage; }
            throw new https.HttpsError('internal', errorMessage, error);
        }
    }
    );

    // --- NEW: processDailyPointSheet Cloud Function ---
    exports.processDailyPointSheet = https.onCall(
        { secrets: [SENDGRID_API_KEY_SECRET, APP_NAME_SECRET] }, // Bind secrets here
        async (request) => {
            logger.info("CF_DEBUG: processDailyPointSheet function called.", { data: request.data, auth: request.auth });

            // --- Security Check: Authenticate and authorize caller as a Teacher or School Admin ---
            if (!request.auth) {
                logger.warn("CF_DEBUG: processDailyPointSheet: Unauthenticated call attempt.");
                throw new https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
            }

            const callerUid = request.auth.uid;
            let callerRole;
            let callerSchoolId;

            try {
                const callerDoc = await adminDb.collection('users').doc(callerUid).get();
                if (!callerDoc.exists) { // Check if caller's user document exists
                    logger.warn(`CF_DEBUG: processDailyPointSheet: Caller UID ${callerUid} has no user document.`);
                    throw new https.HttpsError('permission-denied', 'User data not found for authenticated caller.');
                }
                callerRole = callerDoc.data().role;
                callerSchoolId = callerDoc.data().schoolId;

                // Only Teachers and School Admins (for students in their school) can submit point sheets
                if (callerRole !== 'teacher' && callerRole !== 'schoolAdmin') {
                    logger.warn(`CF_DEBUG: processDailyPointSheet: Permission denied for UID ${callerUid}. Role: ${callerRole}. Not a Teacher or School Admin.`);
                    throw new https.HttpsError('permission-denied', 'Only teachers or school administrators can submit point sheets.');
                }
                logger.info(`CF_DEBUG: processDailyPointSheet: Authenticated caller UID: ${callerUid}, Role: ${callerRole}, SchoolId: ${callerSchoolId}.`);
            } catch (error) {
                logger.error("CF_DEBUG: processDailyPointSheet: Caller role/permission check failed:", error.message, "Code:", error.code);
                throw new https.HttpsError('internal', 'Failed to verify caller permissions for point sheet.', error.message);
            }

            // Correctly destructure studentId from request.data.reportData
            const { reportData } = request.data; 
            const { studentId, ...reportDataRest } = reportData; 


            if (!studentId || Object.keys(reportDataRest).length === 0) { 
                logger.warn("CF_DEBUG: processDailyPointSheet: Invalid arguments (missing studentId or reportDataRest after destructure).");
                throw new https.HttpsError('invalid-argument', 'Missing student ID or report data.');
            }

            // --- Validate reportData against student's schoolId and perform updates ---
            try {
                const studentDocRef = adminDb.collection('students').doc(studentId);
                // CRITICAL FIX: Use .exists (property) instead of .exists() (method)
                // New debug log to see what studentDocSnap is before .exists check
                logger.info(`CF_DEBUG: processDailyPointSheet: Attempting to get student document for ID: ${studentId}`);
                const studentDocSnap = await studentDocRef.get(); 
                logger.info(`CF_DEBUG: processDailyPointSheet: Result of student document get: Type: ${typeof studentDocSnap}, IsNull: ${studentDocSnap === null}, IsUndefined: ${studentDocSnap === undefined}, HasExistsProp: ${'exists' in studentDocSnap}`);


                if (!studentDocSnap.exists) { // FIX: Changed studentDocSnap.exists() to studentDocSnap.exists
                    logger.warn(`CF_DEBUG: processDailyPointSheet: Student ${studentId} not found or does not exist.`); // Updated log message
                    throw new https.HttpsError('not-found', 'Student not found.');
                }
                const student = studentDocSnap.data();

                if (student.schoolId !== callerSchoolId) {
                    logger.warn(`CF_DEBUG: processDailyPointSheet: Caller from school ${callerSchoolId} attempting to modify student ${studentId} from school ${student.schoolId}.`);
                    throw new https.HttpsError('permission-denied', 'Student does not belong to your school.');
                }

                const { dailyPercentage, currentLevel, isSuccessfulDay } = reportDataRest; 

                let updatedDaysInCurrentLevel = student.daysInCurrentLevel;
                let updatedCurrentLevel = student.currentLevel;

                if (isSuccessfulDay) { 
                    updatedDaysInCurrentLevel++;

                    const levelRequirements = { 1: 10, 2: 10, 3: 15, 4: 10 };

                    if (updatedCurrentLevel <= 3 && updatedDaysInCurrentLevel >= levelRequirements[updatedCurrentLevel]) {
                        updatedCurrentLevel++;
                        updatedDaysInCurrentLevel = 0; 
                        logger.info(`CF_DEBUG: Student ${studentId} progressed to Level ${updatedCurrentLevel}!`);
                    } else if (updatedCurrentLevel === 4 && updatedDaysInCurrentLevel >= levelRequirements[4]) {
                        logger.info(`CF_DEBUG: Student ${studentId} completed Level 4. Program requirements met.`);
                    }
                }

                await studentDocRef.update({
                    currentLevel: updatedCurrentLevel,
                    daysInCurrentLevel: updatedDaysInCurrentLevel,
                    lastUpdated: FieldValue.serverTimestamp(),
                });
                logger.info(`CF_DEBUG: Student ${studentId} updated. New Level: ${updatedCurrentLevel}, Days: ${updatedDaysInCurrentLevel}`);

                await adminDb.collection('students').doc(studentId).collection('dailyPointSheets').add({
                    ...reportDataRest,
                    studentId: studentId, 
                    submittedAt: FieldValue.serverTimestamp(),
                    updatedStudentLevel: updatedCurrentLevel,
                    updatedStudentDaysInCurrentLevel: updatedDaysInCurrentLevel
                });
                logger.info(`CF_DEBUG: Daily point sheet recorded for student ${studentId}.`);

                return {
                    message: `Point sheet submitted for ${student.name}. Daily success: ${isSuccessfulDay ? 'YES' : 'NO'}. Level: ${updatedCurrentLevel}, Days: ${updatedDaysInCurrentLevel}.`,
                    newLevel: updatedCurrentLevel,
                    newDays: updatedDaysInCurrentLevel
                };

            } catch (error) {
                logger.error('CF_DEBUG: processDailyPointSheet: Error during processing:', error.message, "Code:", error.code, "Stack:", error.stack);
                let errorMessage = "Failed to process point sheet.";
                if (error.code) {
                    errorMessage = `Firebase Error: ${error.message}`;
                    if (error.code === 'permission-denied') { errorMessage = `Permission Denied: ${error.message}`; }
                    else if (error.code === 'not-found') { errorMessage = `Error: Student not found or accessible.`; }
                }
                throw new https.HttpsError('internal', errorMessage, error);
            }
        }
    );
//(something new)