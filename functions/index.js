// functions/index.js

// Firebase Admin SDK imports
const {initializeApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");

// Firebase Functions v2 imports
const {https} = require("firebase-functions/v2");
const logger = require("firebase-functions/logger"); // Correct import for v2 logger

// Firebase Functions Parameters imports
const {defineSecret} = require("firebase-functions/params");

initializeApp(); // Initialize Firebase Admin SDK
const adminAuth = getAuth(); // Get Admin SDK Auth instance
const adminDb = getFirestore(); // Get Admin SDK Firestore instance

const sgMail = require('@sendgrid/mail');

// --- Define the secret parameters using defineSecret ---
const SENDGRID_API_KEY_SECRET = defineSecret("SENDGRID_API_KEY"); // Name of the secret in Secret Manager
const APP_NAME_SECRET = defineSecret("APP_NAME_SECRET"); // Name of the secret for app name

/**
 * Callable Cloud Function to create a new user by an administrator.
 * Uses Firebase Functions (2nd Gen) with Parameterized Configuration.
 */
exports.createUserByAdmin = https.onCall(
    // CRUCIAL: Bind the secrets to the function here. This makes them available at runtime via .value()
    { secrets: [SENDGRID_API_KEY_SECRET, APP_NAME_SECRET] },
    async (request) => {
        // --- CRITICAL: Access secret values via .value() inside the function ---
        const sendGridApiKey = SENDGRID_API_KEY_SECRET.value();
        const appName = APP_NAME_SECRET.value() || 'Behavior Management System'; // Access app name, with fallback

        // --- NEW CRITICAL DEBUG LOG (to confirm secret retrieval) ---
        // This log confirms if the API key is retrieved correctly from Secret Manager
        logger.info(`CF_DEBUG: SendGrid API Key retrieved by function (Param Config): ${sendGridApiKey ? sendGridApiKey.substring(0, 10) + '...' : 'MISSING'}`);
        logger.info(`CF_DEBUG: App Name retrieved by function (Param Config): ${appName || 'MISSING'}`);
        // --- END NEW CRITICAL DEBUG LOG ---

        // CRUCIAL CHECK: If API key is still missing for some reason, throw an error early
        if (!sendGridApiKey) {
            logger.error("CF_DEBUG: SendGrid API Key is MISSING after secret binding. Cannot send email.");
            throw new https.HttpsError(
                'internal',
                'Email service not configured. Please contact administrator.'
            );
        }
        sgMail.setApiKey(sendGridApiKey); // Set SendGrid API key here, after retrieval check

        logger.info("CF_DEBUG: createUserByAdmin function called.", { data: request.data, auth: request.auth });

        // --- Security Check 1: Caller Authentication (using request.auth from v2) ---
        if (!request.auth) {
            logger.warn("CF_DEBUG: Caller is NOT authenticated via request.auth (v2).");
            throw new https.HttpsError(
                'unauthenticated',
                'The function must be called while authenticated.'
            );
        }

        const callerUid = request.auth.uid; // Get UID from the verified authentication context
        
        let callerRole;
        try {
            // Retrieve caller's role from Firestore to enforce superAdmin permission
            const callerDoc = await adminDb.collection('users').doc(callerUid).get();
            if (!callerDoc.exists || callerDoc.data().role !== 'superAdmin') {
                logger.warn(`CF_DEBUG: Permission denied for UID ${callerUid} (Role: ${callerDoc.data()?.role || 'none'}). Not a superAdmin.`);
                throw new https.HttpsError(
                    'permission-denied',
                    'Only super admins can create users.'
                );
            }
            callerRole = callerDoc.data().role;

            logger.info(`CF_DEBUG: Authenticated caller UID: ${callerUid}, Role: ${callerRole} - Permission Granted.`);
        } catch (error) {
            logger.error("CF_DEBUG: Caller role check failed:", error.message, "Code:", error.code, "Stack:", error.stack);
            throw new https.HttpsError(
                'internal',
                'Failed to verify caller permissions.',
                error.message
            );
        }

        // --- Input Validation ---
        const { idToken, email, role, schoolId } = request.data; // Destructure payload from request.data

        if (!email || !role || !schoolId) {
            logger.warn("CF_DEBUG: Invalid arguments.", { email, role, schoolId });
            throw new https.HttpsError(
                'invalid-argument',
                'The function must be called with a valid email, role, and schoolId.'
            );
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            logger.warn(`CF_DEBUG: Invalid email format provided: ${email}`);
            throw new https.HttpsError(
                'invalid-argument',
                'Provided email is not valid.'
            );
        }
        
        const allowedRoles = ['teacher', 'schoolAdmin'];
        if (!allowedRoles.includes(role)) {
            logger.warn(`CF_DEBUG: Invalid role provided: ${role}`);
            throw new https.HttpsError(
                'invalid-argument',
                'Invalid role. Role must be "teacher" or "schoolAdmin".'
            );
        }

        try {
            const userRecord = await adminAuth.createUser({
                email: email,
                emailVerified: false,
                disabled: false,
            });
            logger.info(`CF_DEBUG: Successfully created new user in Auth: ${userRecord.uid}`);

            const passwordResetLink = await adminAuth.generatePasswordResetLink(email);
            logger.info(`CF_DEBUG: Generated password reset link for ${email}: ${passwordResetLink}`);

            await adminDb.collection('users').doc(userRecord.uid).set({
                email: userRecord.email,
                role: role,
                schoolId: schoolId,
                createdAt: FieldValue.serverTimestamp(),
                createdBy: callerUid, // Store UID of the creating admin
            });
            logger.info(`CF_DEBUG: Successfully created user document in Firestore.`);

            const msg = {
                to: email,
                from: 'samsedusolutionsllc@gmail.com', // Your SendGrid verified sender email
                subject: `Welcome to ${appName}! Set Your Password`,
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
            logger.info(`CF_DEBUG: Welcome email sent to: ${email} via SendGrid.`);

            return {
                message: `User ${email} (${role}) created successfully. Welcome email sent to set password.`,
                userId: userRecord.uid
            };

        } catch (error) {
            logger.error('CF_DEBUG: Error in createUserByAdmin function during creation/email phase:', error);
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
                errorMessage = `SendGrid Error: ${error.response.body.errors.map(e => e.message).join(', ')}`;
            } else {
                errorMessage = error.message || errorMessage;
            }

            throw new https.HttpsError('internal', errorMessage, error);
        }
    }
);