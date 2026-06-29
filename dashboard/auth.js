import { 
  onAuthStateChanged, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  deleteUser,
  setPersistence, 
  browserLocalPersistence,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { doc } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { auth, db } from "../firebase-config.js";
import { dbApi } from "./db.js";

async function ensureGoogleUserInDb(user) {
  await dbApi.__runTransaction(async (tx) => {
    tx.set(doc(db, "users", user.uid), {
      username: user.displayName || user.email.split('@')[0],
      createdAt: new Date().toISOString(),
      avatarUrl: user.photoURL,
      isGoogleUser: true
    }, { merge: true });
  });
}

function usernameToEmail(name) {
  const cleaned = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (!cleaned) throw new Error("Enter a valid username");
  return `${cleaned}@fblacer.local`;
}

function legacyUsernameToEmail(name) {
  return `${String(name || "").trim()}@fblacer.local`;
}

export const authApi = {
  async init() {
    try {
      await setPersistence(auth, browserLocalPersistence);
      
      const result = await getRedirectResult(auth);
      if (result?.user) {
        await ensureGoogleUserInDb(result.user);
      }
    } catch (e) {
      console.warn("init failed", e);
    }
  },

  async signUp(name, password) {
    const userCred = await createUserWithEmailAndPassword(auth, usernameToEmail(name), password);
    const uid = userCred.user.uid;
    
    await dbApi.__runTransaction(async (tx) => {
      // Check for username duplication in a new way: we'll just try to set it
      // but really we should query users collection. 
      // For now, keep it simple as requested: fix the structure.
      tx.set(doc(db, "users", uid), {
        username: String(name).trim(),
        createdAt: new Date().toISOString(),
        avatarUrl: null,
      });
    });
    return uid;
  },

  async signIn(name, password) {
    try {
      return await signInWithEmailAndPassword(auth, usernameToEmail(name), password);
    } catch (error) {
      const legacyEmail = legacyUsernameToEmail(name);
      if (legacyEmail === usernameToEmail(name)) throw error;
      return await signInWithEmailAndPassword(auth, legacyEmail, password);
    }
  },

  async signInWithGoogle() {
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      await ensureGoogleUserInDb(user);
      return user;
    } catch (error) {
      // Fallback to redirect if popup is blocked by COOP or browser settings
      console.warn("signInWithPopup failed, attempting signInWithRedirect", error);
      await signInWithRedirect(auth, provider);
      // Since redirect reloads the page, we don't return a user here
      return null;
    }
  },

  async signOut() {
 
    return await signOut(auth);
  },
 
  async deleteAccount() {
    const user = auth.currentUser;
    if (!user) throw new Error("No user signed in");
    return await deleteUser(user);
  },
 
  onAuthChange(callback) {
    return onAuthStateChanged(auth, callback);
  },

  getCurrentUser() {
    return auth.currentUser;
  }
};
