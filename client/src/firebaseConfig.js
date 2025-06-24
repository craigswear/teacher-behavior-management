// client/src/firebaseConfig.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth"; // Import Firebase Authentication
import { getFirestore } from "firebase/firestore"; // Import Firebase Firestore

// Your web app's Firebase configuration (replace with your actual config)
const firebaseConfig = {
  apiKey: "AIzaSyBrp9HslKnyJxy4UehOet8xhXx8oiTYCgI",
  authDomain: "teacher-behavior-mgmt.firebaseapp.com",
  projectId: "teacher-behavior-mgmt",
  storageBucket: "teacher-behavior-mgmt.firebasestorage.app",
  messagingSenderId: "829143299196",
  appId: "1:829143299196:web:f2bcd8d2b646a947d145f9"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
const auth = getAuth(app); // Get the Auth service instance
const db = getFirestore(app); // Get the Firestore service instance

export { app, auth, db }; // Export them for use in other parts of your app