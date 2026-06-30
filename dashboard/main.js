import { DoomscrollManager } from "./doomscroll.js";
import { StudySetManager } from "./study-sets.js";
import { GamesManager } from "./games.js";
import { AITutor } from "./ai-tutor.js";
import { initAuthUI } from "./auth-ui.js";
import { authApi } from "./auth.js";
import { uiApi } from "./ui.js";
import { dbApi } from "./db.js";
import { SecureExamManager } from "./secure-exam.js";
import { testEngine } from "./test-engine.js";

const studySetManager = new StudySetManager();
window.studySetManager = studySetManager;

let secureExamManager = null;

// Simple view manager to handle navigation
document.addEventListener("DOMContentLoaded", async () => {
  // Register auth listener first so we don't miss the initial state
  authApi.onAuthChange(async (user) => {
    console.log(
      "Auth state changed:",
      user ? `User ${user.uid} logged in` : "User logged out",
    );
    await handleAuthStateChange(user);
  });

  try {
    await authApi.init();
    console.log("Auth initialized successfully");
  } catch (e) {
    console.error("Auth initialization failed:", e);
  }

  initDropdowns();
  loadExamTopics();
  populateHierarchicalDropdowns();
  initTheme();
  initAuthUI();
  await studySetManager.init();

  const doomscrollManager = new DoomscrollManager();
  window.doomscrollManager = doomscrollManager;

  const gamesManager = new GamesManager();
  window.gamesManager = gamesManager;
  await gamesManager.init();

  const aiTutor = new AITutor();
  window.aiTutor = aiTutor;

  document
    .getElementById("exam-start-btn")
    ?.addEventListener("click", startSecureExam);
  document.getElementById("exam-prev-btn")?.addEventListener("click", () => {
    if (!secureExamManager) return;
    secureExamManager.examState.currentIndex--;
    renderSecureQuestion();
  });
  document.getElementById("exam-next-btn")?.addEventListener("click", () => {
    if (!secureExamManager) return;
    secureExamManager.examState.currentIndex++;
    renderSecureQuestion();
  });
  document.getElementById("exam-submit-btn")?.addEventListener("click", () => {
    if (!secureExamManager) return;
    if (confirm("Are you sure you want to submit the exam?")) {
      secureExamManager.submitExam();
    }
  });
  document.getElementById("exam-restart-btn")?.addEventListener("click", () => {
    secureExamManager = null;
    switchView("dashboard-view");
  });
  window.addEventListener("exam-submitted", showSecureReport);
  document
    .getElementById("startBtn")
    ?.addEventListener("click", startPracticeTest);
  document.getElementById("logoutBtn")?.addEventListener("click", async () => {
    await authApi.signOut();
    window.location.reload();
  });

  document
    .getElementById("deleteAccountBtn")
    ?.addEventListener("click", async () => {
      if (
        confirm(
          "Are you absolutely sure you want to delete your account? This action is permanent and all your progress will be lost.",
        )
      ) {
        try {
          const user = authApi.getCurrentUser();
          if (!user) return;
          await dbApi.deleteUserProfile(user.uid);
          await authApi.deleteAccount();
          uiApi.showPopup("Account deleted successfully.");
          window.location.reload();
        } catch (e) {
          console.error("Delete account failed:", e);
          uiApi.showPopup("Error deleting account: " + e.message);
        }
      }
    });

  document.getElementById("accountBtn")?.addEventListener("click", () => {
    switchView("account-view");
  });

  document
    .getElementById("viewProfileBtn")
    ?.addEventListener("click", async () => {
      const user = authApi.getCurrentUser();
      if (!user) return uiApi.showPopup("Please log in to view your profile.");

      try {
        const profile = await dbApi.getUserProfile(user.uid);
        const scores = await dbApi.fetchUserScores(user.uid);

        const totalPoints = scores.reduce((sum, s) => sum + (s.points || 0), 0);
        const testsCount = new Set(scores.map((s) => s.testId)).size;

        document.getElementById("profileAvatar").src =
          profile?.avatarUrl || "https://www.gravatar.com/avatar/?d=mp&s=120";
        document.getElementById("profileName").textContent =
          profile?.username || user.displayName || "User";
        document.getElementById("profileUid").textContent = `UID: ${user.uid}`;
        document.getElementById("profileTotalPoints").textContent = totalPoints;
        document.getElementById("profileTestsCount").textContent = testsCount;

        switchView("profile-view");
      } catch (e) {
        console.error("Failed to load public profile:", e);
        uiApi.showPopup("Error loading profile.");
      }
    });

  document.getElementById("backToAccountBtn")?.addEventListener("click", () => {
    switchView("account-view");
  });

  document.getElementById("openPrivacyBtn")?.addEventListener("click", () => {
    window.location.href = "../privacy.html";
  });

  document.getElementById("openTosBtn")?.addEventListener("click", () => {
    window.location.href = "../terms.html";
  });

  document
    .getElementById("saveUsernameBtn")
    ?.addEventListener("click", async () => {
      const user = authApi.getCurrentUser();
      if (!user) return;
      const newUsername = document
        .getElementById("updateUsername")
        .value.trim();
      if (!newUsername) return uiApi.showPopup("Please enter a username.");
      try {
        await dbApi.updateUserProfile(user.uid, { username: newUsername });
        uiApi.showPopup("Username updated!");
        handleAuthStateChange(user);
      } catch (e) {
        uiApi.showPopup("Error updating username.");
      }
    });

  document.getElementById("uploadAvatarBtn")?.addEventListener("click", () => {
    document.getElementById("avatarUpload").click();
  });

  document
    .getElementById("avatarUpload")
    ?.addEventListener("change", async (e) => {
      const user = authApi.getCurrentUser();
      if (!user) return;
      const file = e.target.files?.[0];
      if (!file) return;

      // Simple simulation of avatar upload as Storage is not initialized in dbApi
      uiApi.showPopup(
        "Avatar upload is currently simulated. Please use a URL in the database.",
      );
      document.getElementById("avatarStatus").textContent =
        "Upload failed (Storage not configured)";
    });

  document.addEventListener("click", (e) => {
    const item = e.target.closest(".dropdown-item");
    if (item) {
      const dropdown = item.closest(".custom-dropdown");
      if (dropdown?.id === "analysisTestDropdown") {
        updateAnalytics(item.dataset.value);
      }
    }
  });

  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      const viewId = item.getAttribute("data-view");
      if (!viewId) return;
      switchView(viewId);
    });
  });

  document.addEventListener("click", (e) => {
    const target = e.target.closest("button, .nav-item");
    if (!target) return;

    const rect = target.getBoundingClientRect();
    const blip = document.createElement("div");
    blip.className = "click-blip";
    blip.style.left = `${e.clientX - rect.left - 10}px`;
    blip.style.top = `${e.clientY - rect.top - 10}px`;

    target.style.position = "relative";
    target.style.overflow = "hidden";
    target.appendChild(blip);

    blip.addEventListener("animationend", () => {
      blip.remove();
    });
  });

  // Sidebar toggle logic
  const sidebar = document.getElementById("sidebar");
  const mainContent = document.querySelector(".main-content");
  const sidebarCollapse = document.getElementById("sidebarCollapse");
  const sidebarExpand = document.getElementById("sidebarExpand");

  sidebarCollapse?.addEventListener("click", () => {
    sidebar?.classList.add("collapsed");
    mainContent?.classList.add("expanded");
  });

  sidebarExpand?.addEventListener("click", () => {
    sidebar?.classList.remove("collapsed");
    mainContent?.classList.remove("expanded");
  });
});

function switchView(viewId) {
  document.querySelectorAll(".view").forEach((v) => (v.style.display = "none"));
  const target = document.getElementById(viewId);
  if (target) target.style.display = "block";

  document.querySelectorAll(".nav-item").forEach((nav) => {
    nav.classList.toggle("active", nav.getAttribute("data-view") === viewId);
  });
}

async function populateAnalysisDropdown(uid) {
  try {
    const scores = await dbApi.fetchUserScores(uid);
    const completedTests = [...new Set(scores.map((s) => s.testId))];

    const menu = document.querySelector("#analysisTestDropdown .dropdown-menu");
    if (!menu) return;

    if (completedTests.length === 0) {
      menu.innerHTML = `<div class="dropdown-item" style="color: var(--text-muted); cursor: default;" data-value="">No tests completed yet</div>`;
      return;
    }

    const items = completedTests
      .map(
        (testId) => `
      <div class="dropdown-item" data-value="${testId}">${testId}</div>
    `,
      )
      .join("");

    menu.innerHTML = items;
  } catch (e) {
    console.error("Failed to populate analysis dropdown:", e);
  }
}

async function handleAuthStateChange(user) {
  const accountNameEl = document.getElementById("accountName");
  const userAvatarEl = document.getElementById("userAvatar");
  const statAccountEl = document.getElementById("stat-account");
  const logoutBtn = document.getElementById("logoutBtn");
  const userAccountFields = document.getElementById("userAccountFields");
  const authForm = document.getElementById("authForm");
  const updateUsernameInput = document.getElementById("updateUsername");

  if (user) {
    try {
      const profile = await dbApi.getUserProfile(user.uid);
      if (profile) {
        const username = profile.username || user.displayName || "User";
        if (accountNameEl) accountNameEl.textContent = username;
        if (updateUsernameInput) updateUsernameInput.value = username;
        if (profile.avatarUrl && userAvatarEl) {
          userAvatarEl.src = profile.avatarUrl;
        }
      } else {
        if (accountNameEl)
          accountNameEl.textContent = user.displayName || "User";
        if (updateUsernameInput)
          updateUsernameInput.value = user.displayName || "";
      }
      if (statAccountEl) statAccountEl.textContent = "Member";
      if (logoutBtn) logoutBtn.style.display = "block";
      if (document.getElementById("deleteAccountBtn"))
        document.getElementById("deleteAccountBtn").style.display = "block";
      if (userAccountFields) userAccountFields.style.display = "flex";
      if (authForm) authForm.style.display = "none";
    } catch (e) {
      console.error("Failed to load user profile:", e);
    }
    await populateAnalysisDropdown(user.uid);
    if (window.aiTutor) {
      await window.aiTutor.loadRecentLog();
    }
  } else {
    if (accountNameEl) accountNameEl.textContent = "Guest User";
    if (userAvatarEl)
      userAvatarEl.src = "https://www.gravatar.com/avatar/?d=mp&s=32";
    if (statAccountEl) statAccountEl.textContent = "Guest";
    if (logoutBtn) logoutBtn.style.display = "none";
    if (document.getElementById("deleteAccountBtn"))
      document.getElementById("deleteAccountBtn").style.display = "none";
    if (userAccountFields) userAccountFields.style.display = "none";
    if (authForm) authForm.style.display = "flex";
  }
}

function promptForAccount(message) {
  uiApi.showPopup(message);
  document.querySelectorAll(".view").forEach((v) => (v.style.display = "none"));
  const accountView = document.getElementById("account-view");
  if (accountView) accountView.style.display = "block";
  document.querySelectorAll(".nav-item").forEach((nav) => {
    nav.classList.toggle(
      "active",
      nav.getAttribute("data-view") === "account-view",
    );
  });
}

async function loadExamTopics() {
  // This is now handled by populateHierarchicalDropdowns
}

function initDropdowns() {
  document.addEventListener("click", (e) => {
    const header = e.target.closest(".dropdown-header");
    const item = e.target.closest(".dropdown-item");
    const dropdown = e.target.closest(".custom-dropdown");

    if (header) {
      e.stopPropagation();
      const menu = header.nextElementSibling;
      const isOpen = menu.classList.contains("show");

      document
        .querySelectorAll(".dropdown-menu")
        .forEach((m) => m.classList.remove("show"));

      if (!isOpen) {
        menu.classList.add("show");
      }
      return;
    }

    if (item) {
      const parentDropdown = item.closest(".custom-dropdown");
      if (!parentDropdown) return;

      const header = parentDropdown.querySelector(".dropdown-header");
      const menu = parentDropdown.querySelector(".dropdown-menu");

      if (item.classList.contains("has-submenu")) {
        // Do nothing, let CSS handle hover for submenus
        return;
      }

      e.stopPropagation();
      header.textContent = item.textContent;
      parentDropdown.dataset.value = item.dataset.value;
      menu.classList.remove("show");

      if (parentDropdown.id === "exam-topic-selector") {
        const customInput = document.getElementById("exam-custom-topic");
        if (customInput) {
          customInput.style.display =
            item.dataset.value === "custom" ? "block" : "none";
          if (item.dataset.value === "custom") customInput.focus();
        }
      }
      if (parentDropdown.id === "game-topic-selector") {
        const customInput = document.getElementById("game-custom-topic");
        if (customInput) {
          customInput.style.display =
            item.dataset.value === "custom" ? "block" : "none";
          if (item.dataset.value === "custom") customInput.focus();
        }
      }
      return;
    }

    if (!dropdown && !e.target.closest(".sidebar")) {
      document
        .querySelectorAll(".dropdown-menu")
        .forEach((m) => m.classList.remove("show"));
    }
  });
}

async function startSecureExam() {
  const topicSelector = document.getElementById("exam-topic-selector");
  let topic = topicSelector?.dataset.value || "";

  if (topic === "custom") {
    topic = document.getElementById("exam-custom-topic").value.trim();
  }

  const count = parseInt(document.getElementById("exam-count").value);
  const diffSelector = document.getElementById("exam-diff-selector");
  const difficulty = diffSelector?.dataset.value || "balanced";

  if (!topic) return uiApi.showPopup("Please enter a study topic.");
  if (isNaN(count) || count < 1)
    return uiApi.showPopup("Please enter a valid number of questions.");

  const user = authApi.getCurrentUser();
  if (!user)
    return promptForAccount("You must be signed in to take a locked exam.");

  try {
    let contextContent = "";
    try {
      const res = await fetch("../AI-Context/context.json");
      const contextData = await res.json();
      if (contextData[topic] && contextData[topic].context) {
        const ctxRes = await fetch(contextData[topic].context);
        contextContent = await ctxRes.text();
      }
    } catch (e) {
      console.error("Context fetch error:", e);
    }

    secureExamManager = new SecureExamManager({ strictLockdown: true });

    // Start generating questions and requesting agreement in parallel
    const initPromise = secureExamManager.initializeExam(
      topic,
      difficulty,
      count,
      contextContent,
    );
    const agreementPromise = secureExamManager.startPreExam(() => {});

    // Wait for agreement first
    const agreed = await agreementPromise;
    if (!agreed) return;

    // After agreement, check if questions are ready. If not, show loading overlay.
    let loadingOverlay = null;
    try {
      // We use a wrapper to show overlay only if we actually have to wait
      await Promise.race([
        initPromise,
        new Promise((resolve) =>
          setTimeout(() => {
            if (!secureExamManager.examState.questions.length) {
              loadingOverlay = uiApi.createOverlay("exam-loading-overlay");
              loadingOverlay.innerHTML = `
              <div class="panel-base" style="text-align: center;">
                <h2 style="margin-bottom: 12px;">Finalizing Your Exam</h2>
                <p style="color: var(--text-secondary); margin-bottom: 20px;">Just grabbing the last few questions...</p>
                <div style="display: flex; justify-content: center; gap: 8px;">
                  <div class="dot" style="width: 8px; height: 8px; background: var(--accent-primary); border-radius: 50%; animation: bounce 0.6s infinite alternate;"></div>
                  <div class="dot" style="width: 8px; height: 8px; background: var(--accent-primary); border-radius: 50%; animation: bounce 0.6s infinite alternate 0.2s;"></div>
                  <div class="dot" style="width: 8px; height: 8px; background: var(--accent-primary); border-radius: 50%; animation: bounce 0.6s infinite alternate 0.4s;"></div>
                </div>
                <style>
                  @keyframes bounce { from { transform: translateY(0); } to { transform: translateY(-10px); } }
                </style>
              </div>
            `;
              resolve();
            } else {
              resolve();
            }
          }, 100),
        ),
      ]);

      await initPromise;
    } finally {
      if (loadingOverlay) loadingOverlay.remove();
    }

    secureExamManager.enableRestrictions();

    document.getElementById("exam-setup").style.display = "none";
    document.getElementById("exam-interface").style.display = "block";
    document.getElementById("exam-active-topic").textContent = topic;

    renderSecureQuestion();
  } catch (e) {
    console.error("Secure Exam Error:", e);
    uiApi.showPopup(`Error: ${e.message}`);
  }
}

function renderSecureQuestion() {
  if (!secureExamManager) return;
  const state = secureExamManager.examState;
  const q = state.questions[state.currentIndex];

  document.getElementById("exam-progress-text").textContent =
    `Question ${state.currentIndex + 1} of ${state.questions.length}`;
  document.getElementById("exam-question-text").textContent = q.question;

  const optionsContainer = document.getElementById("exam-options-container");
  optionsContainer.innerHTML = "";

  q.options.forEach((opt) => {
    const btn = document.createElement("button");
    btn.className = "exam-option-btn";
    if (state.userAnswers[state.currentIndex] === opt)
      btn.classList.add("selected");
    btn.textContent = opt;
    btn.onclick = () => {
      state.userAnswers[state.currentIndex] = opt;
      renderSecureQuestion();
    };
    optionsContainer.appendChild(btn);
  });

  document.getElementById("exam-prev-btn").disabled = state.currentIndex === 0;
  document.getElementById("exam-next-btn").disabled =
    state.currentIndex === state.questions.length - 1;
}

function showSecureReport() {
  if (!secureExamManager) return;

  document.getElementById("exam-interface").style.display = "none";
  document.getElementById("exam-report").style.display = "block";

  const state = secureExamManager.examState;
  let score = 0;
  state.questions.forEach((q, idx) => {
    if (state.userAnswers[idx] === q.correctAnswer) score++;
  });

  document.getElementById("exam-final-score").textContent =
    `${score} / ${state.questions.length}`;

  const report = secureExamManager.getIntegrityReport();
  const summaryContainer = document.getElementById("exam-integrity-summary");
  summaryContainer.innerHTML = Object.entries(report.details)
    .map(
      ([key, value]) => `
    <div class="integrity-report-row">
      <span>${key}</span>
      <strong>${value}</strong>
    </div>
  `,
    )
    .join("");

  document.getElementById("exam-integrity-score").textContent =
    `${report.score}%`;
}

function initTheme() {
  const toggle = document.getElementById("settingsDarkToggle");
  const currentTheme = localStorage.getItem("theme") || "light";

  if (currentTheme === "dark") {
    document.documentElement.classList.add("dark");
    if (toggle) toggle.checked = true;
  }

  toggle?.addEventListener("change", (e) => {
    if (e.target.checked) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  });
}

async function populateHierarchicalDropdowns() {
  try {
    const res = await fetch("./tests.json");
    const data = await res.json();
    const tests = data.tests;

    const tags = {};
    tests.forEach((t) => {
      const tag = t.tag || "Other";
      if (!tags[tag]) tags[tag] = [];
      tags[tag].push(t);
    });

    const dropdowns = [
      { selector: "#testDropdown", includeCustom: false },
      { selector: "#analysisTestDropdown", includeCustom: false },
      { selector: "#ai-topic-selector", includeCustom: false },
      { selector: "#doomscroll-topic-selector", includeCustom: false },
      { selector: "#exam-topic-selector", includeCustom: true },
      { selector: "#game-topic-selector", includeCustom: true },
    ];

    dropdowns.forEach((config) => {
      const menu = document.querySelector(`${config.selector} .dropdown-menu`);
      if (!menu) return;

      let html = "";
      Object.entries(tags).forEach(([tag, testsList]) => {
        html += `
          <div class="dropdown-item has-submenu">
            ${tag}
            <div class="dropdown-submenu">
              ${testsList
                .map(
                  (t) => `
                <div class="dropdown-item" data-value="${t.testName}">${t.testName}</div>
              `,
                )
                .join("")}
            </div>
          </div>
        `;
      });

      if (config.includeCustom) {
        html += `
          <div class="dropdown-item" data-value="custom">Custom Topic...</div>
        `;
      }

      menu.innerHTML = html;
    });
  } catch (e) {
    console.error("Failed to populate hierarchical dropdowns:", e);
  }
}

async function startPracticeTest() {
  const dropdown = document.getElementById("testDropdown");
  const topic = dropdown?.dataset.value;

  if (!topic) return uiApi.showPopup("Please select a test.");

  try {
    await testEngine.loadTests();
    const testIdx = testEngine.tests.findIndex((t) => t.testName === topic);
    if (testIdx === -1) return uiApi.showPopup("Test not found in tests.json.");

    const test = await testEngine.startTest(testIdx);
    if (!test) return uiApi.showPopup("Failed to start test.");

    switchView("study-session-view");
    const titleEl = document.getElementById("session-title");
    if (titleEl) titleEl.textContent = `Practice: ${test.testName}`;
    renderPracticeQuestion();
  } catch (e) {
    console.error("Practice Test Error:", e);
    uiApi.showPopup("Error starting practice test.");
  }
}

function renderPracticeQuestion() {
  const { questions, currentIndex, progress } = testEngine;
  const container = document.getElementById("session-container");
  if (!container) return;

  const progressPercent = Math.round((progress.done / progress.total) * 100);
  const progressText = document.getElementById("session-progress-text");
  const progressBar = document.getElementById("session-progress-bar");
  
  if (progressText) progressText.textContent = `${progressPercent}%`;
  if (progressBar) progressBar.style.width = `${progressPercent}%`;

  if (currentIndex >= questions.length) {
    completePracticeTest();
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
            onclick="window.handlePracticeAnswer('${opt.replace(/'/g, "\\'")}', '${q.correctAnswer.replace(/'/g, "\\'")}')">
            ${opt}
          </button>
        `,
          )
          .join("")}
      </div>
      <div id="session-feedback" style="display: none; margin-top: 20px; padding: 15px; border-radius: 8px; background: var(--accent-soft); font-size: 14px; line-height: 1.6; text-align: left; border-left: 4px solid var(--accent-primary);">
        <div id="feedback-status" style="font-weight: 700; margin-bottom: 8px;"></div>
        <div id="feedback-text"></div>
        <button class="btn-primary" style="margin-top: 15px; width: 100%;" onclick="window.nextPracticeQuestion()">Next Question →</button>
      </div>
    </div>
  `;
}

window.handlePracticeAnswer = (selected, correct) => {
  const isCorrect = selected === correct;
  const q = testEngine.questions[testEngine.currentIndex];
  if (!q) return;
  const topic = q.topic;

  if (isCorrect) {
    testEngine.handleCorrect(topic);
  } else {
    testEngine.handleWrong(topic);
  }

  testEngine.recordAnswer(testEngine.currentIndex, selected);

  const feedback = document.getElementById("session-feedback");
  const status = document.getElementById("feedback-status");
  const text = document.getElementById("feedback-text");

  if (feedback) feedback.style.display = "block";
  if (status) {
    status.textContent = isCorrect ? "✅ Correct!" : "❌ Not quite...";
    status.style.color = isCorrect
      ? "var(--color-correct)"
      : "var(--color-wrong)";
  }
  if (text) text.textContent = q.Help || "Keep going!";

  document.querySelectorAll(".options button").forEach((btn) => {
    btn.disabled = true;
    if (btn.textContent.trim() === correct) btn.classList.add("correct");
    else if (btn.textContent.trim() === selected && !isCorrect)
      btn.classList.add("incorrect");
  });
};

window.nextPracticeQuestion = () => {
  testEngine.currentIndex++;
  testEngine.progress.done++;
  renderPracticeQuestion();
};

async function completePracticeTest() {
  const result = testEngine.finalizeTest();
  const user = authApi.getCurrentUser();

  if (user) {
    try {
      const profile = await dbApi.getUserProfile(user.uid);
      const username = profile?.username || user.displayName || "Anonymous";

      await dbApi.submitScore(
        testEngine.currentTest.testName,
        user.uid,
        username,
        result.totalPoints,
        result,
      );
      uiApi.showPopup(
        `Test Complete! Score: ${result.totalPoints}. Submitted to leaderboard!`,
      );
    } catch (e) {
      console.error("Failed to submit score:", e);
      uiApi.showPopup(
        `Test Complete! Score: ${result.totalPoints}. (Failed to submit to leaderboard)`,
      );
    }
  } else {
    uiApi.showPopup(
      `Test Complete! Score: ${result.totalPoints}. Login to save to leaderboard!`,
    );
  }

  switchView("dashboard-view");
}

async function updateAnalytics(testId) {
  const user = authApi.getCurrentUser();
  if (!user) {
    document.getElementById("analysisGate").style.display = "block";
    document.getElementById("analysisContent").style.display = "none";
    return;
  }

  document.getElementById("analysisGate").style.display = "none";
  document.getElementById("analysisContent").style.display = "block";

  try {
    const scores = await dbApi.fetchUserScores(user.uid);
    const testScores = scores.filter((s) => s.testId === testId);

    if (testScores.length === 0) {
      uiApi.showPopup("No data available for this test.");
      return;
    }

    let totalPointsSum = 0;
    let totalCorrect = 0;
    let totalQuestions = 0;
    let totalTimeSum = 0;

    testScores.forEach((s) => {
      totalPointsSum += s.points || 0;

      const topics = s.topicScores || {};
      Object.values(topics).forEach((t) => {
        totalCorrect += t.correct || 0;
        totalQuestions += t.total || 0;
      });

      totalTimeSum += s.analytics?.totalTime || 0;
    });

    const avgScore = Math.round(totalPointsSum / testScores.length);
    const bestScore = Math.max(...testScores.map((s) => s.points || 0));
    const accuracy =
      totalQuestions > 0
        ? Math.round((totalCorrect / totalQuestions) * 100)
        : 0;
    const avgResponseTime =
      totalQuestions > 0 ? Math.round(totalTimeSum / totalQuestions / 1000) : 0;
    const mastered = totalCorrect;

    document.getElementById("stat-accuracy").textContent = `${accuracy}%`;
    document.getElementById("stat-user-avg").textContent = avgScore;
    document.getElementById("stat-user-best").textContent = bestScore;
    document.getElementById("stat-time").textContent = `${avgResponseTime}s`;
    document.getElementById("stat-mastered").textContent = mastered;

    const globalAvg = await dbApi.fetchTestAverages(testId);
    document.getElementById("stat-global-avg").textContent =
      globalAvg?.averagePoints || 0;
  } catch (e) {
    console.error("Failed to update analytics:", e);
  }
}
