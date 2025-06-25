// functions/index.js

// Firebase Cloud Functions core modules
const functions = require("firebase-functions");
const admin = require("firebase-admin"); // Firebase Admin SDK
admin.initializeApp(); // Initialize Firebase Admin SDK

// Import SendGrid
const sgMail = require('@sendgrid/mail');

// Logger for Cloud Functions (useful for debugging)
const logger = require("firebase-functions/logger");

// Global options for Cloud Functions (e.g., maxInstances for cost control)
functions.setGlobalOptions({ maxInstances: 10 });

// Configure SendGrid with your API Key from Environment Variables
// CRUCIAL CHANGE: Use process.env for 2nd Gen Functions
const sendGridApiKey = process.env.SENDGRID_API_KEY; // This variable name will be defined in firebase.json
sgMail.setApiKey(sendGridApiKey);

// Get the app name from Environment Variables
// CRUCIAL CHANGE: Use process.env for 2nd Gen Functions
const appName = process.env.APP_NAME || 'Behavior Management System'; // This variable name will be defined in firebase.json

/**
 * Callable Cloud Function to create a new user by an administrator.
 */
exports.createUserByAdmin = functions.https.onCall(async (data, context) => {
  logger.info("createUserByAdmin function called.", { auth: context.auth, data: data });

  // --- Security Check 1: Caller Authentication ---
  if (!context.auth) {
    logger.warn("createUserByAdmin: Unauthenticated call attempt.");
    throw new functions.https.HttpsError(
      'unauthenticated',
      'The function must be called while authenticated.'
    );
  }

  // --- Security Check 2: Caller Role (superAdmin) ---
  try {
    const callerUid = context.auth.uid;
    const callerDoc = await admin.firestore().collection('users').doc(callerUid).get();

    if (!callerDoc.exists || callerDoc.data().role !== 'superAdmin') {
      logger.warn(`createUserByAdmin: Permission denied for UID ${callerUid} with role ${callerDoc.data()?.role || 'none'}.`);
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only super admins can create users.'
      );
    }
  } catch (error) {
    logger.error("createUserByAdmin: Error checking caller role:", error);
    throw new functions.https.HttpsError(
        'internal',
        'Failed to verify caller permissions.',
        error.message
    );
  }

  // --- Input Validation ---
  const { email, role, schoolId } = data;

  if (!email || !role || !schoolId) {
    logger.warn("createUserByAdmin: Invalid arguments.", { email, role, schoolId });
    throw new functions.https.HttpsError(
      'invalid-argument',
      'The function must be called with a valid email, role, and schoolId.'
    );
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    logger.warn(`createUserByAdmin: Invalid email format provided: ${email}`);
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Provided email is not valid.'
    );
  }

  const allowedRoles = ['teacher', 'schoolAdmin'];
  if (!allowedRoles.includes(role)) {
      logger.warn(`createUserByAdmin: Invalid role provided: ${role}`);
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Invalid role. Role must be "teacher" or "schoolAdmin".'
      );
  }

  try {
    const userRecord = await admin.auth().createUser({
      email: email,
      emailVerified: false,
      disabled: false,
    });
    logger.info(`Successfully created new user in Auth: ${userRecord.uid}`);

    const passwordResetLink = await admin.auth().generatePasswordResetLink(email);
    logger.info(`Generated password reset link for ${email}: ${passwordResetLink}`);

    await admin.firestore().collection('users').doc(userRecord.uid).set({
      email: userRecord.email,
      role: role,
      schoolId: schoolId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: context.auth.uid,
    });
    logger.info(`Successfully created user document in Firestore.`);

    // --- Send email using SendGrid ---
    const msg = {
      to: email,
      from: 'samsedusolutionsllc@gmail.com', // Use your exact verified single sender email
      subject: `Welcome to ${appName}! Set Your Password`, // Uses appName from environment
      html: `
        <p>Welcome to the ${appName}!</p>
        <p>Your account has been created by an administrator.</p>
        <p>To set your password and verify your email address, please click the link below:</p>
        <p><a href="${passwordResetLink}">Set Your Password and Verify Email</a></p>
        <p>This link is valid for a limited time.</p>
        <p>If you did not expect this email, please ignore it.</p>
        <p>Thank you,</p>
        <p>The ${appName} Team</p>
      `,
    };

    await sgMail.send(msg);
    logger.info(`Welcome email sent to: ${email} via SendGrid.`);

    return {
      message: `User ${email} (${role}) created successfully. Welcome email sent to set password.`,
      userId: userRecord.uid
    };

  } catch (error) {
    logger.error('Error in createUserByAdmin function:', error);
    let errorMessage = 'An unexpected error occurred.';
    if (error.code && error.message) {
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = `The email address ${email} is already in use by another account.`;
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = `The email address ${email} is not valid.`;
      } else {
        errorMessage = `Firebase Error: ${error.message}`;
      }
    } else if (error.response && error.response.body && error.response.body.errors) {
        // SendGrid specific error handling
        errorMessage = `SendGrid Error: ${error.response.body.errors.map(e => e.message).join(', ')}`;
    } else {
        errorMessage = error.message || errorMessage;
    }

    throw new functions.https.HttpsError('internal', errorMessage, error);
  }
});