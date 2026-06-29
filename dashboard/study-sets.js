import { dbApi } from "./db.js";
import { authApi } from "./auth.js";
import { uiApi } from "./ui.js";

export class StudySetManager {
  constructor() {
    this.studySets = [];
    this.activeSet = null;
    this.userProgress = null;
    this.currentSession = {
      mode: null,
      questions: [],
      currentIndex: 0,
      correctCount: 0,
      totalCount: 0,
      conceptId: null,
    };
  }

  async init() {
    await this.loadStudySets();
    this.setupEventListeners();
  }

  async loadStudySets() {
    try {
      const res = await fetch("../AI-Context/context.json");
      const contextData = await res.json();

       this.studySets = Object.entries(contextData).map(([testName, data]) => ({
         testName: testName,
         path: data.test.startsWith("/") ? data.test : `../${data.test}`,
         tag: data.tag || "General",
         isVerified: true,
       }));

      this.renderStudySetsList();
    } catch (e) {
      console.error("Failed to load study sets from context:", e);
    }
  }

  renderStudySetsList() {
    const list = document.getElementById("study-sets-list");
    if (!list) return;

    list.innerHTML = this.studySets
      .map(
        (set, idx) => `
      <div class="stat-box" style="cursor: pointer; transition: all 0.2s; border: 1px solid var(--border-color);" onclick="window.studySetManager.openStudySet(${idx})">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <span class="stat-label">${set.tag || "General"}</span>
          <span class="mastery-tag ${set.isVerified ? "strong" : "weak"}">${set.isVerified ? "Verified" : "Community"}</span>
        </div>
        <div style="font-weight: 700; font-size: 18px; margin-bottom: 8px;">${set.testName}</div>
        <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 16px;">
          Mastery: <span id="set-mastery-${idx}">--</span> | Learners: <span id="set-learners-${idx}">--</span>
        </div>
        <button class="btn-primary" style="width: 100%; font-size: 13px; height: 32px;">Open Set</button>
      </div>
    `,
      )
      .join("");

    const uid = authApi.getCurrentUser()?.uid;
    this.studySets.forEach(async (set, idx) => {
      const metrics = await dbApi.getStudySetMetrics(set.testName);
      const learnersEl = document.getElementById(`set-learners-${idx}`);
      if (learnersEl) learnersEl.textContent = metrics.learners;

      if (uid) {
        const progress = await dbApi.getStudySetProgress(uid, set.testName);
        const masteryEl = document.getElementById(`set-mastery-${idx}`);
        if (masteryEl && progress)
          masteryEl.textContent = `${progress.mastery}%`;
      }
    });
  }

  async openStudySet(idx) {
    const setMeta = this.studySets[idx];
    try {
      const res = await fetch(setMeta.path);
      if (!res.ok) throw new Error(`Test file not found (${res.status})`);
      const setContent = await res.json();

      this.activeSet = {
        meta: setMeta,
        content: setContent,
        id: setContent.testName || setMeta.testName,
      };
    } catch (e) {
      uiApi.showPopup(`Error loading test: ${e.message}`);
      return;
    }

    const uid = authApi.getCurrentUser()?.uid;
    if (uid) {
      this.userProgress = (await dbApi.getStudySetProgress(
        uid,
        this.activeSet.id,
      )) || {
        mastery: 0,
        retention: 0,
        weakConcepts: [],
        reviewsDue: 0,
        concepts: {},
      };
    }

    this.renderDashboard();
    this.switchView("study-set-dashboard-view");
  }

  renderDashboard() {
    const { activeSet, userProgress } = this;
    if (!activeSet) return;

    const titleEl = document.getElementById("study-set-title");
    if (titleEl) titleEl.textContent = activeSet.id;

    const mastery = userProgress?.mastery || 0;
    const retention = userProgress?.retention || 0;
    const weakCount = userProgress?.weakConcepts?.length || 0;
    const reviews = userProgress?.reviewsDue || 0;

    const masteryEl = document.getElementById("study-set-mastery");
    if (masteryEl) masteryEl.textContent = `${mastery}%`;
    const retentionEl = document.getElementById("study-set-retention");
    if (retentionEl) retentionEl.textContent = `${retention}%`;
    const weakEl = document.getElementById("study-set-weak");
    if (weakEl) weakEl.textContent = weakCount;
    const reviewsEl = document.getElementById("study-set-reviews");
    if (reviewsEl) reviewsEl.textContent = reviews;

    this.updateRecommendedAction();
    this.setupDashboardListeners();
    this.updateSocialMetrics();
  }

  async updateSocialMetrics() {
    const { activeSet } = this;
    const uid = authApi.getCurrentUser()?.uid;
    if (!activeSet) return;

    const metrics = await dbApi.getStudySetMetrics(activeSet.id);
    const likesEl = document.getElementById("study-set-likes");
    const learnersEl = document.getElementById("study-set-learners");
    const ratingEl = document.getElementById("study-set-rating");

    if (likesEl) likesEl.textContent = metrics.likes;
    if (learnersEl) learnersEl.textContent = metrics.learners;
    if (ratingEl) ratingEl.textContent = metrics.rating || "4.8";

    if (uid) {
      const liked = await dbApi.isSetLiked(uid, activeSet.id);
      const saved = await dbApi.isSetSaved(uid, activeSet.id);

      const likeBtn = document.getElementById("like-set-btn");
      const saveBtn = document.getElementById("save-set-btn");

      const likeIcon = document.getElementById("like-icon-svg");
      const saveIcon = document.getElementById("save-icon-svg");
      const likeText = document.getElementById("like-text");
      const saveText = document.getElementById("save-text");

      if (likeText) likeText.textContent = liked ? "Liked" : "Like";
      likeBtn?.classList.toggle("active", liked);
      if (liked && likeIcon) {
        likeIcon.setAttribute("fill", "currentColor");
      } else if (likeIcon) {
        likeIcon.setAttribute("fill", "none");
      }

      if (saveText) saveText.textContent = saved ? "Saved" : "Save";
      saveBtn?.classList.toggle("active", saved);
      if (saved && saveIcon) {
        saveIcon.setAttribute("fill", "currentColor");
      } else if (saveIcon) {
        saveIcon.setAttribute("fill", "none");
      }
    }
  }

  setupDashboardListeners() {
    const bindClick = (id, fn) => {
      const el = document.getElementById(id);
      if (el) el.onclick = fn;
    };

    bindClick("backToStudySetsBtn", () => this.switchView("study-view"));
    bindClick("action-start-learning", () => this.startSession("learn"));
    bindClick("action-quick-review", () => this.startSession("review"));
    bindClick("action-study-weak", () => this.startSession("weak"));
    bindClick("action-practice-questions", () => this.startSession("practice"));
    bindClick("action-take-assessment", () => this.startSession("assessment"));
    bindClick("action-concept-explorer", () => this.openExplorer());
    bindClick("like-set-btn", () => this.handleSocialAction("like"));
    bindClick("save-set-btn", () => this.handleSocialAction("save"));
    bindClick("share-set-btn", () => this.handleShare());
    bindClick("rate-set-btn", () => this.handleRate());
  }

  async handleRate() {
    const uid = authApi.getCurrentUser()?.uid;
    if (!uid) {
      uiApi.showPopup("Please sign in to rate this set.");
      return;
    }

    const modal = document.getElementById("rating-modal");
    const stars = document.querySelectorAll(".star");
    const submitBtn = document.getElementById("submit-rating-btn");
    const closeBtn = document.getElementById("close-rating-modal");

    let selectedRating = 0;

    const updateStars = (rating) => {
      stars.forEach((s, i) => {
        s.classList.toggle("active", i < rating);
      });
    };

    stars.forEach((star) => {
      star.onclick = () => {
        selectedRating = parseInt(star.dataset.value);
        updateStars(selectedRating);
      };
    });

    submitBtn.onclick = async () => {
      if (selectedRating === 0) {
        uiApi.showPopup("Please select a rating.");
        return;
      }

      try {
        await dbApi.submitRating(uid, this.activeSet.id, selectedRating);
        uiApi.showPopup("Rating submitted successfully!");
        this.updateSocialMetrics();
        modal.style.display = "none";
      } catch (e) {
        console.error("Error submitting rating:", e);
        uiApi.showPopup("Failed to submit rating.");
      }
    };

    closeBtn.onclick = () => {
      modal.style.display = "none";
    };

    modal.style.display = "flex";
    updateStars(0);
  }

  updateRecommendedAction() {
    const { userProgress } = this;
    const actionText = document.getElementById("recommended-action-text");
    const actionBtn = document.getElementById("recommended-action-btn");

    if (!actionText || !actionBtn) return;

    if (!userProgress || userProgress.mastery === 0) {
      actionText.textContent = "Start your first learning session";
      actionBtn.onclick = () => this.startSession("learn");
      return;
    }

    if (userProgress.reviewsDue > 0) {
      actionText.textContent = `You have ${userProgress.reviewsDue} concepts due for review`;
      actionBtn.onclick = () => this.startSession("review");
    } else if (userProgress.weakConcepts?.length > 0) {
      const weak = userProgress.weakConcepts[0];
      actionText.textContent = `Fix misunderstanding in ${weak}`;
      actionBtn.onclick = () => this.startSession("weak", weak);
    } else {
      actionText.textContent = "Take an assessment to verify mastery";
      actionBtn.onclick = () => this.startSession("assessment");
    }
  }

  async handleSocialAction(action) {
    const uid = authApi.getCurrentUser()?.uid;
    if (!uid) {
      uiApi.showPopup("Please sign in to " + action + " this set.");
      return;
    }

    try {
      await dbApi.toggleStudySetAction(uid, this.activeSet.id, action);
      uiApi.showPopup(`${action === "like" ? "Liked" : "Saved"} successfully!`);
      this.updateSocialMetrics();
    } catch (e) {
      console.error(`Error toggling ${action}:`, e);
      uiApi.showPopup(`Failed to ${action} set.`);
    }
  }

  handleShare() {
    const url =
      window.location.href.split("?")[0] +
      `?view=study&set=${encodeURIComponent(this.activeSet.id)}`;

    if (navigator.share) {
      navigator
        .share({
          title: `Check out the ${this.activeSet.id} Study Set!`,
          text: `I'm studying ${this.activeSet.id} on MINOT ACER. Join me!`,
          url: url,
        })
        .catch((error) => {
          console.error("Error sharing:", error);
          this.copyToClipboard(url);
        });
    } else {
      this.copyToClipboard(url);
    }
  }

  copyToClipboard(url) {
    navigator.clipboard.writeText(url).then(() => {
      uiApi.showPopup("Link copied to clipboard!");
    });
  }

  async openExplorer() {
    this.switchView("study-set-explorer-view");
    const { activeSet } = this;

    const explorerTitle = document.getElementById("explorer-title");
    if (explorerTitle) explorerTitle.textContent = activeSet.id;
    
    const treeContainer = document.getElementById("concept-tree-container");
    if (!treeContainer) return;

    const concepts = [...new Set(activeSet.content.topics.map((t) => t.topic))];

    treeContainer.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <div style="font-weight: 700; font-size: 16px; margin-bottom: 8px;">${activeSet.id}</div>
        ${concepts
          .map(
            (c) => `
          <div class="concept-node" style="cursor: pointer; padding: 10px; border: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; transition: all 0.2s;" onclick="window.studySetManager.showConceptDetail('${c}')">
            <span>${c}</span>
            <span class="mastery-tag ${this.getMasteryClass(c)}">${this.getConceptMastery(c)}%</span>
          </div>
        `,
          )
          .join("")}
      </div>
    `;
  }

  getConceptMastery(conceptId) {
    return this.userProgress?.concepts?.[conceptId]?.mastery || 0;
  }

  getMasteryClass(conceptId) {
    const m = this.getConceptMastery(conceptId);
    return m > 70 ? "strong" : "weak";
  }

  async showConceptDetail(conceptId) {
    const panel = document.getElementById("concept-detail-panel");
    if (!panel) return;
    panel.style.display = "block";

    const nameEl = document.getElementById("detail-concept-name");
    if (nameEl) nameEl.textContent = conceptId;

    const masteryEl = document.getElementById("detail-mastery");
    if (masteryEl) masteryEl.textContent = `${this.getConceptMastery(conceptId)}%`;

    const lastReviewed =
      this.userProgress?.concepts?.[conceptId]?.lastReviewed || "Never";
    const lastReviewedEl = document.getElementById("detail-last-reviewed");
    if (lastReviewedEl) lastReviewedEl.textContent = lastReviewed;

    const mistakes = this.userProgress?.concepts?.[conceptId]
      ?.commonMistakes || ["No common mistakes recorded yet."];
    const mistakesEl = document.getElementById("detail-mistakes");
    if (mistakesEl) {
      mistakesEl.innerHTML = mistakes
        .map((m) => `<li>• ${m}</li>`)
        .join("");
    }

    const practiceBtn = document.getElementById("detail-practice-btn");
    if (practiceBtn) practiceBtn.onclick = () =>
      this.startSession("practice", conceptId);

    const learnBtn = document.getElementById("detail-learn-btn");
    if (learnBtn) learnBtn.onclick = () =>
      this.startSession("learn", conceptId);

    const reviewBtn = document.getElementById("detail-review-btn");
    if (reviewBtn) reviewBtn.onclick = () =>
      this.startSession("review", conceptId);
  }

  async startSession(mode, conceptId = null) {
    this.switchView("study-session-view");
    const title = document.getElementById("session-title");

    const modeNames = {
      learn: "Guided Learning",
      review: "Quick Review",
      weak: "Weak Area Focus",
      practice: "Practice Questions",
      assessment: "Mastery Assessment",
    };

    title.textContent = modeNames[mode];

    // Mark as used to increment learners
    const uid = authApi.getCurrentUser()?.uid;
    if (uid && this.activeSet) {
      // Use a non-blocking call or handle error gracefully
      dbApi.markSetUsed(uid, this.activeSet.id).catch((e) => {
        console.warn("Failed to mark set as used:", e);
      });
    }

    // 1. Prepare Questions
    let questions = [];

    const allQuestions = this.activeSet.content.topics.flatMap((t) =>
      t.questions.map((q) => ({ ...q, topic: t.topic })),
    );

    if (conceptId) {
      questions = allQuestions.filter((q) => q.topic === conceptId);
    } else {
      if (mode === "learn") {
        const topic =
          this.activeSet.content.topics[
            Math.floor(Math.random() * this.activeSet.content.topics.length)
          ];
        questions = topic.questions.map((q) => ({ ...q, topic: topic.topic }));
      } else if (mode === "review" || mode === "weak") {
        const weakTopics = this.userProgress?.weakConcepts || [];
        if (weakTopics.length > 0) {
          const topic =
            weakTopics[Math.floor(Math.random() * weakTopics.length)];
          questions = allQuestions.filter((q) => q.topic === topic);
        } else {
          questions = allQuestions.slice(0, 10);
        }
      } else if (mode === "practice") {
        questions = this.shuffleArray([...allQuestions]).slice(0, 10);
      } else if (mode === "assessment") {
        questions = this.shuffleArray([...allQuestions]).slice(0, 20);
      }
    }

    this.currentSession = {
      mode,
      questions: this.shuffleArray(questions),
      currentIndex: 0,
      correctCount: 0,
      totalCount: questions.length,
      conceptId,
    };

    this.renderCurrentQuestion();
  }

  shuffleArray(arr) {
    const newArr = [...arr];
    for (let i = newArr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
    }
    return newArr;
  }

  renderCurrentQuestion() {
    const { questions, currentIndex, totalCount } = this.currentSession;
    const container = document.getElementById("session-container");

    const progress = Math.round((currentIndex / totalCount) * 100);
    document.getElementById("session-progress-text").textContent =
      `${progress}%`;
    document.getElementById("session-progress-bar").style.width =
      `${progress}%`;

    if (currentIndex >= totalCount) {
      this.completeSession();
      return;
    }

    const q = questions[currentIndex];

    container.innerHTML = `
      <div class="study-session-card" style="width: 100%; max-width: 600px; text-align: center;">
        <div class="question" style="font-size: 20px; margin-bottom: 24px;">${q.question}</div>
        <div class="options" style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px;">
          ${q.options
            .map(
              (opt) => `
            <button class="btn-secondary" style="width: 100%; text-align: left; padding: 15px; font-size: 15px;" 
              onclick="window.studySetManager.handleAnswer('${opt.replace(/'/g, "\\'")}', '${q.correctAnswer.replace(/'/g, "\\'")}')">
              ${opt}
            </button>
          `,
            )
            .join("")}
        </div>
        <div id="session-feedback" style="display: none; margin-top: 20px; padding: 15px; border-radius: 8px; background: var(--accent-soft); font-size: 14px; line-height: 1.6; text-align: left; border-left: 4px solid var(--accent-primary);">
          <div id="feedback-status" style="font-weight: 700; margin-bottom: 8px;"></div>
          <div id="feedback-text"></div>
          <button class="btn-primary" style="margin-top: 15px; width: 100%;" onclick="window.studySetManager.nextQuestion()">Next Question →</button>
        </div>
      </div>
    `;
  }

  handleAnswer(selected, correct) {
    const isCorrect = selected === correct;
    const q = this.currentSession.questions[this.currentSession.currentIndex];

    if (isCorrect) {
      this.currentSession.correctCount++;
    }

    const feedback = document.getElementById("session-feedback");
    const status = document.getElementById("feedback-status");
    const text = document.getElementById("feedback-text");

    feedback.style.display = "block";
    status.textContent = isCorrect ? "✅ Correct!" : "❌ Not quite...";
    status.style.color = isCorrect
      ? "var(--color-correct)"
      : "var(--color-wrong)";
    text.textContent = q.Help;

    document.querySelectorAll(".options button").forEach((btn) => {
      btn.disabled = true;
      if (btn.textContent.trim() === correct) {
        btn.classList.add("correct");
      } else if (btn.textContent.trim() === selected && !isCorrect) {
        btn.classList.add("incorrect");
      }
    });
  }

  nextQuestion() {
    this.currentSession.currentIndex++;
    this.renderCurrentQuestion();
  }

  async completeSession() {
    const { correctCount, totalCount, mode, conceptId } = this.currentSession;
    const accuracy = totalCount > 0 ? correctCount / totalCount : 0;

    const uid = authApi.getCurrentUser()?.uid;
    if (uid && this.activeSet) {
      const currentMastery = this.userProgress?.mastery || 0;
      const masteryGain = accuracy * 5;
      const newMastery = Math.min(100, currentMastery + masteryGain);

      const currentRetention = this.userProgress?.retention || 0;
      const retentionGain = accuracy > 0.8 ? 2 : -1;
      const newRetention = Math.max(
        0,
        Math.min(100, currentRetention + retentionGain),
      );

      const conceptUpdates = {};
      if (conceptId) {
        const cMastery = this.getConceptMastery(conceptId);
        conceptUpdates[conceptId] = {
          mastery: Math.min(100, cMastery + accuracy * 10),
          lastReviewed: new Date().toISOString(),
        };
      } else {
        this.currentSession.questions.forEach((q) => {
          const cMastery = this.getConceptMastery(q.topic);
          conceptUpdates[q.topic] = {
            mastery: Math.min(100, cMastery + accuracy * 5),
            lastReviewed: new Date().toISOString(),
          };
        });
      }

      await dbApi.updateStudySetProgress(uid, this.activeSet.id, {
        mastery: Math.round(newMastery),
        retention: Math.round(newRetention),
        concepts: { ...this.userProgress?.concepts, ...conceptUpdates },
      });

      const allConcepts = this.activeSet.content.topics.map((t) => t.topic);
      const weakConcepts = allConcepts
        .filter((c) => (this.userProgress?.concepts?.[c]?.mastery || 0) < 60)
        .slice(0, 5);

      await dbApi.updateStudySetProgress(uid, this.activeSet.id, {
        weakConcepts: weakConcepts,
      });

      this.userProgress = await dbApi.getStudySetProgress(
        uid,
        this.activeSet.id,
      );
    }

    this.renderDashboard();
    this.switchView("study-set-dashboard-view");
  }

  switchView(viewId) {
    document
      .querySelectorAll(".view")
      .forEach((v) => (v.style.display = "none"));
    const target = document.getElementById(viewId);
    if (target) target.style.display = "block";

    document.querySelectorAll(".nav-item").forEach((item) => {
      item.classList.toggle(
        "active",
        item.getAttribute("data-view") === viewId,
      );
    });
  }

  setupEventListeners() {
    document
      .getElementById("backToDashboardBtn")
      ?.addEventListener("click", () => {
        this.switchView("study-set-dashboard-view");
      });
    document.getElementById("exitSessionBtn")?.addEventListener("click", () => {
      this.switchView("study-set-dashboard-view");
    });
    this.setupRatingModalListeners();
  }

  setupRatingModalListeners() {
    const modal = document.getElementById("rating-modal");
    if (!modal) return;

    const stars = document.querySelectorAll(".star");
    const submitBtn = document.getElementById("submit-rating-btn");
    const closeBtn = document.getElementById("close-rating-modal");

    let selectedRating = 0;

    const updateStars = (rating) => {
      stars.forEach((s, i) => {
        s.classList.toggle("active", i < rating);
      });
    };

    stars.forEach((star) => {
      star.onclick = () => {
        selectedRating = parseInt(star.dataset.value);
        updateStars(selectedRating);
      };
    });

    submitBtn.onclick = async () => {
      const uid = authApi.getCurrentUser()?.uid;
      if (!uid) {
        uiApi.showPopup("Please sign in to rate this set.");
        return;
      }

      if (selectedRating === 0) {
        uiApi.showPopup("Please select a rating.");
        return;
      }

      try {
        await dbApi.submitRating(uid, this.activeSet.id, selectedRating);
        uiApi.showPopup("Rating submitted successfully!");
        this.updateSocialMetrics();
        modal.style.display = "none";
      } catch (e) {
        console.error("Error submitting rating:", e);
        uiApi.showPopup("Failed to submit rating.");
      }
    };

    closeBtn.onclick = () => {
      modal.style.display = "none";
    };
  }

  async handleRate() {
    const uid = authApi.getCurrentUser()?.uid;
    if (!uid) {
      uiApi.showPopup("Please sign in to rate this set.");
      return;
    }

    const modal = document.getElementById("rating-modal");
    if (modal) {
      modal.style.display = "flex";
      // Reset stars to 0 when opening
      const stars = document.querySelectorAll(".star");
      stars.forEach((s) => s.classList.remove("active"));
    }
  }
}
