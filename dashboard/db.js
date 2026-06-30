import { 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  limit, 
  getDocs, 
  where, 
  serverTimestamp, 
  doc, 
  setDoc, 
  getDoc, 
  runTransaction 
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { db } from "../firebase-config.js";

export const dbApi = {
  async submitScore(testId, uid, username, points, topicScores = {}) {
    if (!testId || !uid) throw new Error("missing testId or uid");
    const finalScore = Math.floor(Number(points) || 0);
    
    // 1. Save to Global Leaderboard
    const lbCol = collection(db, "leaderboards", testId, "scores");
    
    // Prevent duplicates: use a deterministic ID (uid + testId)
    const lbDocId = `${uid}_${testId}`;
    const lbRef = doc(lbCol, lbDocId);
    
    await setDoc(lbRef, {
      uid,
      username: username || "Anonymous",
      score: finalScore,
      timestamp: serverTimestamp(),
    }, { merge: true });

    // 2. Save to User's private history
    const userScoreCol = collection(db, "users", uid, "scores");
    const analytics = topicScores?.scores ? topicScores : null;
    const normalizedTopicScores = topicScores?.scores?.topics || topicScores?.topics || topicScores || {};

    await addDoc(userScoreCol, {
      testId,
      points: finalScore,
      timestamp: serverTimestamp(),
      topicScores: normalizedTopicScores,
      analytics,
    });

    return lbRef;
  },

  async fetchTopScores(testId, limitNum = 15) {
    if (!testId) throw new Error("missing testId");
    const col = collection(db, "leaderboards", testId, "scores");
    const q = query(col, orderBy("score", "desc"), limit(limitNum));
    const snap = await getDocs(q);
    const out = [];
    snap.forEach((d) => out.push({ id: d.id, ...d.data() }));
    return out;
  },

  async fetchUserScores(uid) {
    if (!uid) throw new Error("missing uid");
    const col = collection(db, "users", uid, "scores");
    const q = query(col, orderBy("timestamp", "desc"));
    const snap = await getDocs(q);
    const out = [];
    snap.forEach((d) => out.push({ id: d.id, ...d.data() }));
    return out;
  },

  async fetchTestAverages(testId) {
    if (!testId) throw new Error("missing testId");
    const scores = await this.fetchTopScores(testId, 100);
    if (!scores?.length) return null;
    const sum = scores.reduce((s, e) => s + (Number(e.score) || 0), 0);
    return { averagePoints: Math.round(sum / scores.length), topicAverages: null };
  },

  async sendIssue({ message, email, page }) {
    if (!message) throw new Error("missing message");
    const col = collection(db, "reports");
    return await addDoc(col, {
      message: String(message).slice(0, 2000),
      email: email ? String(email).slice(0, 256) : null,
      page: page || "unknown",
      userAgent: navigator.userAgent,
      createdAt: serverTimestamp(),
    });
  },

  async writeLog(action, context) {
    if (!action) throw new Error("missing action");
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    await setDoc(doc(db, "logs", id), {
      action,
      context: context || {},
      timestamp: serverTimestamp(),
    });
    return true;
  },

  async getUserProfile(uid) {
    if (!uid) throw new Error("missing uid");
    const snap = await getDoc(doc(db, "users", uid));
    return snap?.exists() ? snap.data() : null;
  },

  async updateUserProfile(uid, data) {
    if (!uid) throw new Error("missing uid");
    await setDoc(doc(db, "users", uid), data, { merge: true });
    return true;
  },
 
  async deleteUserProfile(uid) {
    if (!uid) throw new Error("missing uid");
    await setDoc(doc(db, "users", uid), { deleted: true, deletedAt: serverTimestamp() }, { merge: true });
    // Full recursive deletion of sub-collections would require a backend function.
    // For now, we mark the profile as deleted.
    return true;
  },
 
  async saveChatSession(uid, sessionData) {
    if (!uid) throw new Error("missing uid");
    console.log(`dbApi: Saving new chat session for user ${uid}...`);
    const col = collection(db, "users", uid, "ai_chats");
    const docRef = await addDoc(col, {
      ...sessionData,
      timestamp: serverTimestamp(),
    });
    console.log(`dbApi: Saved new session with ID: ${docRef.id}`);
    return docRef.id;
  },

  async saveGeneratedQuestions(uid, topic, questions) {
    if (!uid || !topic) throw new Error("missing uid or topic");
    const col = collection(db, "users", uid, "generated_questions");
    for (const q of questions) {
      await addDoc(col, {
        topic,
        ...q,
        timestamp: serverTimestamp(),
      });
    }
    return true;
  },

  async fetchGeneratedQuestions(uid, topic, limitNum = 50) {
    if (!uid || !topic) throw new Error("missing uid or topic");
    const col = collection(db, "users", uid, "generated_questions");
    const q = query(col, where("topic", "==", topic), limit(limitNum));
    const snap = await getDocs(q);
    const out = [];
    snap.forEach((d) => out.push(d.data()));
    return out;
  },

  async updateChatSession(uid, sessionId, sessionData) {
    if (!uid || !sessionId) throw new Error("missing uid or sessionId");
    console.log(`dbApi: Updating chat session ${sessionId} for user ${uid}...`);
    const docRef = doc(db, "users", uid, "ai_chats", sessionId);
    await setDoc(docRef, {
      ...sessionData,
      timestamp: serverTimestamp(),
    }, { merge: true });
    console.log(`dbApi: Successfully updated session ${sessionId}`);
    return true;
  },

  async getStudySetProgress(uid, setId) {
    if (!uid || !setId) throw new Error("missing uid or setId");
    const snap = await getDoc(doc(db, "users", uid, "study_sets", setId));
    return snap?.exists() ? snap.data() : null;
  },

  async updateStudySetProgress(uid, setId, data) {
    if (!uid || !setId) throw new Error("missing uid or setId");
    const ref = doc(db, "users", uid, "study_sets", setId);
    await setDoc(ref, {
      ...data,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    return true;
  },

  async updateConceptProgress(uid, setId, conceptId, data) {
    if (!uid || !setId || !conceptId) throw new Error("missing uid, setId, or conceptId");
    const ref = doc(db, "users", uid, "study_sets", setId, "concepts", conceptId);
    await setDoc(ref, {
      ...data,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    return true;
  },

  async getConceptProgress(uid, setId, conceptId) {
    if (!uid || !setId || !conceptId) throw new Error("missing uid, setId, or conceptId");
    const snap = await getDoc(doc(db, "users", uid, "study_sets", setId, "concepts", conceptId));
    return snap?.exists() ? snap.data() : null;
  },

  async fetchAllConceptProgress(uid, setId) {
    if (!uid || !setId) throw new Error("missing uid or setId");
    const col = collection(db, "users", uid, "study_sets", setId, "concepts");
    const snap = await getDocs(col);
    const out = {};
    snap.forEach(d => {
      out[d.id] = d.data();
    });
    return out;
  },

  async getStudySetMetrics(setId) {
    const snap = await getDoc(doc(db, "study_sets", setId));
    return snap?.exists() ? snap.data() : { likes: 0, saves: 0, learners: 0, rating: 0, ratingCount: 0 };
  },

  async submitRating(uid, setId, rating) {
    if (!uid || !setId || rating < 1 || rating > 5) throw new Error("Invalid rating data");
    const setRef = doc(db, "study_sets", setId);
    const ratingRef = doc(db, "study_sets", setId, "ratings", uid);

    await this.__runTransaction(async (transaction) => {
      const setDoc = await transaction.get(setRef);
      const userRatingDoc = await transaction.get(ratingRef);

      const currentRating = setDoc.exists() ? (setDoc.data().rating || 0) : 0;
      const currentCount = setDoc.exists() ? (setDoc.data().ratingCount || 0) : 0;
      
      let newCount = currentCount;
      let newRating = currentRating;

      if (userRatingDoc.exists()) {
        // User is updating their rating
        const oldRating = userRatingDoc.data().rating;
        newRating = ((currentRating * currentCount) - oldRating + rating) / currentCount;
      } else {
        // New rating
        newCount = currentCount + 1;
        newRating = ((currentRating * currentCount) + rating) / newCount;
      }

      transaction.set(setRef, { 
        rating: parseFloat(newRating.toFixed(1)), 
        ratingCount: newCount 
      }, { merge: true });
      transaction.set(ratingRef, { rating, timestamp: serverTimestamp() });
    });
    return true;
  },

  async isSetRated(uid, setId) {
    const snap = await getDoc(doc(db, "study_sets", setId, "ratings", uid));
    return snap.exists();
  },

  async toggleStudySetAction(uid, setId, action) {
    // action: 'like', 'save'
    const userRef = doc(db, "users", uid, action + "s", setId);
    const setRef = doc(db, "study_sets", setId);
    
    await this.__runTransaction(async (transaction) => {
      const userDoc = await transaction.get(userRef);
      const setDoc = await transaction.get(setRef);
      
      const isActive = userDoc.exists();
      const currentCount = setDoc.exists() ? (setDoc.data()[action + 's'] || 0) : 0;
      
      if (isActive) {
        transaction.delete(userRef);
        transaction.set(setRef, { [action + 's']: Math.max(0, currentCount - 1) }, { merge: true });
      } else {
        transaction.set(userRef, { timestamp: serverTimestamp() });
        transaction.set(setRef, { [action + 's']: currentCount + 1 }, { merge: true });
      }
    });
    return true;
  },

  async markSetUsed(uid, setId) {
    const userRef = doc(db, "users", uid, "used_sets", setId);
    const setRef = doc(db, "study_sets", setId);
    
    await this.__runTransaction(async (transaction) => {
      const userDoc = await transaction.get(userRef);
      const setDoc = await transaction.get(setRef); // READ FIRST
      
      if (!userDoc.exists()) {
        transaction.set(userRef, { timestamp: serverTimestamp() });
        const currentLearners = setDoc.exists() ? (setDoc.data().learners || 0) : 0;
        transaction.set(setRef, { learners: currentLearners + 1 }, { merge: true });
      }
    });
    return true;
  },

  async getUserSavedSets(uid) {
    const col = collection(db, "users", uid, "saves");
    const snap = await getDocs(col);
    return snap.docs.map(d => d.id);
  },

  async isSetLiked(uid, setId) {
    const snap = await getDoc(doc(db, "users", uid, "likes", setId));
    return snap.exists();
  },

  async isSetSaved(uid, setId) {
    const snap = await getDoc(doc(db, "users", uid, "saves", setId));
    return snap.exists();
  },

  async fetchChatSessions(uid) {

    if (!uid) throw new Error("missing uid");
    const col = collection(db, "users", uid, "ai_chats");
    const q = query(col, orderBy("timestamp", "desc"));
    const snap = await getDocs(q);
    const out = [];
    snap.forEach((d) => out.push({ id: d.id, ...d.data() }));
    return out;
  },

  async __runTransaction(callback) {
    return await runTransaction(db, callback);
  }
};
