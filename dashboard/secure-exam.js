import { AITutor } from "./ai-tutor.js";
import { authApi } from "./auth.js";

export class SecureExamManager {
  constructor(options = {}) {
    this.options = {
      strictLockdown: options.strictLockdown || false,
      ...options,
    };

    this.suspicionScore = {
      fullscreenExits: 0,
      tabSwitches: 0,
      blurEvents: 0,
      inactiveTime: 0,
      copyAttempts: 0,
      reloadEvents: 0,
    };

    this.isActive = false;
    this.isPaused = false;
    this.startTime = null;
    this.totalInactiveTime = 0;
    this.lastBlurTime = null;

    this.examState = {
      topic: "",
      difficulty: "",
      questions: [],
      userAnswers: {},
      currentIndex: 0,
      timeLeft: 0,
      timerInterval: null,
      isSubmitted: false,
    };

    this.handlers = {
      fullscreenchange: this.handleFullscreenChange.bind(this),
      visibilitychange: this.handleVisibilityChange.bind(this),
      blur: this.handleBlur.bind(this),
      focus: this.handleFocus.bind(this),
      contextmenu: this.handleContextMenu.bind(this),
      selectstart: this.handleSelection.bind(this),
      copy: this.handleSelection.bind(this),
      dragstart: this.handleSelection.bind(this),
      keydown: this.handleKeyDown.bind(this),
      resize: this.handleResize.bind(this),
    };
  }

  async initializeExam(topic, difficulty, count, context = "") {
    this.examState.topic = topic;
    this.examState.difficulty = difficulty;

    const tutor = new AITutor();

    return new Promise(async (resolve, reject) => {
      try {
        await tutor.generateQuestions({
          topic,
          difficulty,
          count,
          context,
          uid: authApi.getCurrentUser()?.uid,
          onBatch: (batch) => {
            if (batch.length === 0) return;

            if (this.examState.questions.length === 0) {
              this.examState.questions.push(...batch);
              this.examState.userAnswers = {};
              this.examState.currentIndex = 0;
              this.examState.timeLeft = count * 60;
              this.examState.isSubmitted = false;
              resolve(true);
            } else {
              this.examState.questions.push(...batch);
            }
          },
        });

        if (this.examState.questions.length === 0) {
          reject(new Error("No questions could be generated for this topic."));
        }
      } catch (e) {
        reject(e);
      }
    });
  }

  async startPreExam(onAgreement) {
    if (document.querySelector(".exam-lock-overlay")) {
      return Promise.resolve(true);
    }

    try {
      await document.documentElement.requestFullscreen();
    } catch (e) {
      console.warn("Fullscreen request failed", e);
    }

    return new Promise((resolve) => {
      const overlay = this.createLockOverlay(
        "Exam Requirements",
        "This exam requires fullscreen mode and a commitment to integrity. Leaving fullscreen, switching tabs, or using external resources may be recorded.",
        "I agree and wish to begin",
      );

      const btn = overlay.querySelector("button");
      btn.onclick = () => {
        overlay.remove();
        onAgreement();
        resolve(true);
      };
    });
  }

  enableRestrictions() {
    this.isActive = true;
    document.body.classList.add("exam-focus-mode");

    Object.entries(this.handlers).forEach(([event, handler]) => {
      document.addEventListener(event, handler);
    });

    window.addEventListener("beforeunload", (e) => {
      if (this.isActive) {
        this.suspicionScore.reloadEvents++;
        e.preventDefault();
        e.returnValue = "";
      }
    });

    this.startTime = Date.now();
    this.startTimer();
  }

  disableRestrictions() {
    this.isActive = false;
    document.body.classList.remove("exam-focus-mode");

    Object.entries(this.handlers).forEach(([event, handler]) => {
      document.removeEventListener(event, handler);
    });

    this.stopTimer();
  }

  startTimer() {
    this.examState.timerInterval = setInterval(() => {
      this.examState.timeLeft--;
      this.updateTimerUI();
      if (this.examState.timeLeft <= 0) {
        this.submitExam();
      }
    }, 1000);
  }

  stopTimer() {
    clearInterval(this.examState.timerInterval);
  }

  updateTimerUI() {
    const timerEl = document.getElementById("exam-timer");
    if (!timerEl) return;

    const mins = Math.floor(this.examState.timeLeft / 60);
    const secs = this.examState.timeLeft % 60;
    timerEl.textContent = `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;

    if (this.examState.timeLeft < 300) {
      timerEl.style.color = "var(--color-wrong)";
    }
  }

  pauseExam(reason) {
    if (this.isPaused) return;
    this.isPaused = true;

    const overlay = this.createLockOverlay(
      "Exam Paused",
      `Reason: ${reason}. Please return to the exam environment to continue.`,
      "Resume Exam",
    );

    const btn = overlay.querySelector("button");
    btn.onclick = async () => {
      try {
        await document.documentElement.requestFullscreen();
      } catch (e) {}
      overlay.remove();
      this.isPaused = false;
    };
  }

  handleFullscreenChange() {
    if (!this.isActive) return;
    if (!document.fullscreenElement) {
      this.suspicionScore.fullscreenExits++;
      this.pauseExam("Fullscreen exited");
      if (
        this.options.strictLockdown &&
        this.suspicionScore.fullscreenExits >= 3
      ) {
        this.autoSubmit("Too many fullscreen exits");
      }
    }
  }

  handleVisibilityChange() {
    if (!this.isActive) return;
    if (document.visibilityState === "hidden") {
      this.suspicionScore.tabSwitches++;
      this.lastBlurTime = Date.now();
      if (this.options.strictLockdown && this.suspicionScore.tabSwitches >= 1) {
        this.pauseExam("Tab switch detected");
      }
    } else {
      if (this.lastBlurTime) {
        this.totalInactiveTime += Date.now() - this.lastBlurTime;
        this.lastBlurTime = null;
      }
    }
  }

  handleBlur() {
    if (!this.isActive) return;
    this.suspicionScore.blurEvents++;
    this.lastBlurTime = Date.now();
    this.pauseExam("Window lost focus");
  }

  handleFocus() {
    if (!this.isActive) return;
    if (this.lastBlurTime) {
      this.totalInactiveTime += Date.now() - this.lastBlurTime;
      this.lastBlurTime = null;
    }
  }

  handleContextMenu(e) {
    if (!this.isActive) return;
    e.preventDefault();
  }

  handleSelection(e) {
    if (!this.isActive) return;
    this.suspicionScore.copyAttempts++;
    e.preventDefault();
  }

  handleKeyDown(e) {
    if (!this.isActive) return;
    const forbidden = ["c", "v", "a", "f", "p", "s"];
    if (e.ctrlKey && forbidden.includes(e.key.toLowerCase())) {
      this.suspicionScore.copyAttempts++;
      e.preventDefault();
    }
  }

  handleResize() {
    if (!this.isActive) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    if (width < 1000 && height < 600) {
      this.suspicionScore.blurEvents++;
    }
  }

  autoSubmit(reason) {
    alert(`Exam auto-submitted: ${reason}`);
    this.submitExam();
  }

  submitExam() {
    this.examState.isSubmitted = true;
    this.stopTimer();
    this.disableRestrictions();
    window.dispatchEvent(new CustomEvent("exam-submitted"));
  }

  calculateIntegrityScore() {
    let penalty = 0;
    penalty += this.suspicionScore.fullscreenExits * 15;
    penalty += this.suspicionScore.tabSwitches * 10;
    penalty += this.suspicionScore.blurEvents * 5;
    penalty += Math.floor(this.totalInactiveTime / 1000) * 2;
    penalty += this.suspicionScore.copyAttempts * 10;

    return Math.max(0, 100 - penalty);
  }

  getIntegrityReport() {
    return {
      score: this.calculateIntegrityScore(),
      details: {
        "Fullscreen Exits": this.suspicionScore.fullscreenExits,
        "Tab Switches": this.suspicionScore.tabSwitches,
        "Blur Events": this.suspicionScore.blurEvents,
        "Inactive Time": `${Math.round(this.totalInactiveTime / 1000)} seconds`,
        "Copy Attempts": this.suspicionScore.copyAttempts,
        Reloads: this.suspicionScore.reloadEvents,
      },
    };
  }

  createLockOverlay(title, message, btnText) {
    const overlay = document.createElement("div");
    overlay.className = "exam-lock-overlay";
    overlay.innerHTML = `
      <div class="exam-lock-panel">
        <h2>${title}</h2>
        <p>${message}</p>
        <button class="btn-primary">${btnText}</button>
      </div>
    `;
    document.body.appendChild(overlay);
    return overlay;
  }
}
