import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-analytics.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCG32qVhboeAYBGYcq9QniwBeiAVMHFvo4",
  authDomain: "fblacer.firebaseapp.com",
  projectId: "fblacer",
  storageBucket: "fblacer.firebasestorage.app",
  messagingSenderId: "410096026599",
  appId: "1:410096026599:web:3d484f1d2d961180e7b342",
  measurementId: "G-C79TMGDW0Q",
};

const app = initializeApp(firebaseConfig);
export const analytics = getAnalytics(app);
export const auth = getAuth(app);
export const db = getFirestore(app);
