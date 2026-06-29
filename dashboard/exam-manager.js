import { AITutor } from "./ai-tutor.js";
import { SecureExamManager } from "./secure-exam.js";

class ExamManager {
  constructor() {
    this.security = new SecureExamManager();
    this.tutor = new AITutor();
    
    this.state = {
      config: {
        topic: "",
        difficulty: "balanced",
        totalQuestions: 10,
        strictLockdown: false,
        contextPath: null
      },
      questions: [],
      userAnswers: {},
      currentIndex: 0,
      isSubmitted: false,
      isLoading: false
    };

    this.init();
  }

  async init() {
    this.setupEventListeners();
    await this.loadTopics();
    this.loadState();
    
    if (this.state.questions.length > 0 && !this.state.isSubmitted) {
      this.resumeExam();
    } else {
      this.showSetup();
    }
  }

  async loadTopics() {
    try {
      const res = await fetch("../AI-Context/context.json");
      const contextData = await res.json();
      const topics = Object.keys(contextData);
      
      const menu = document.querySelector("#exam-topic-selector .dropdown-menu");
      const customItem = menu.querySelector('[data-value="custom"]');
      
      const topicItems = topics.map(topic => `
        <div class="dropdown-item" data-value="${topic}">${topic}</div>
      `).join("");
      
      menu.insertAdjacentHTML("beforeend", topicItems);
      // Move custom item to the end
      menu.appendChild(customItem);
      
    } catch (e) {
      console.error("Failed to load topics:", e);
    }
  }

  setupEventListeners() {
    // Setup Screen
    document.getElementById("begin-exam-btn").onclick = () => this.startExam();
    
    const topicHeader = document.querySelector("#exam-topic-selector .dropdown-header");
    const topicMenu = document.querySelector("#exam-topic-selector .dropdown-menu");
    const customInput = document.getElementById("exam-custom-topic");
    const diffHeader = document.querySelector("#exam-diff-selector .dropdown-header");
    const diffMenu = document.querySelector("#exam-diff-selector .dropdown-menu");

    // Toggle Topic Menu
    topicHeader.onclick = (e) => {
      e.stopPropagation();
      topicMenu.classList.toggle("show");
      if (topicMenu.classList.contains("show")) {
        diffMenu.classList.remove("show");
      }
    };

    // Toggle Difficulty Menu
    diffHeader.onclick = (e) => {
      e.stopPropagation();
      diffMenu.classList.toggle("show");
      if (diffMenu.classList.contains("show")) {
        topicMenu.classList.remove("show");
      }
    };

    // Combined Global Click Handler
    document.addEventListener("click", (e) => {
      const item = e.target.closest(".dropdown-item");
      const isTopicClick = e.target.closest("#exam-topic-selector");
      const isDiffClick = e.target.closest("#exam-diff-selector");

      // 1. Handle Item Selection
      if (item) {
        const menu = item.closest(".dropdown-menu");
        if (menu.closest("#exam-topic-selector")) {
          const value = item.dataset.value;
          this.state.config.topic = value;
          topicHeader.textContent = item.textContent;
          topicMenu.classList.remove("show");
          customInput.style.display = (value === "custom") ? "block" : "none";
          if (value === "custom") customInput.focus();
        } else if (menu.closest("#exam-diff-selector")) {
          const value = item.dataset.value;
          this.state.config.difficulty = value;
          diffHeader.textContent = item.textContent;
          diffMenu.classList.remove("show");
        }
        return; // Stop here if an item was clicked
      }

      // 2. Close menus if clicking outside
      if (!isTopicClick) {
        topicMenu.classList.remove("show");
      }
      if (!isDiffClick) {
        diffMenu.classList.remove("show");
      }
    });

    // Exam Controls
    document.getElementById("prev-question-btn").onclick = () => this.prevQuestion();
    document.getElementById("next-question-btn").onclick = () => this.nextQuestion();
    document.getElementById("submit-exam-btn").onclick = () => this.submitExam();
    
    // Report Controls
    document.getElementById("exit-exam-btn").onclick = () => {
      localStorage.removeItem("fblacer_exam_state");
      window.location.href = "dashboard/index.html";
    };
  }

  showSetup() {
    document.getElementById("exam-setup").style.display = "flex";
    document.getElementById("exam-interface").style.display = "none";
    document.getElementById("exam-report").style.display = "none";
  }

  async startExam() {
    let topic = this.state.config.topic;
    if (topic === "custom") {
      topic = document.getElementById("exam-custom-topic").value.trim();
    }
    
    const count = parseInt(document.getElementById("exam-count").value);
    const strict = document.getElementById("exam-strict").checked;

    if (!topic) return alert("Please enter a topic.");
    if (isNaN(count) || count < 1) return alert("Please enter a valid number of questions.");

    this.state.config = {
      topic,
      difficulty: this.state.config.difficulty,
      totalQuestions: count,
      strictLockdown: strict,
      contextPath: null
    };

    // Check if the selected topic has a context file
    try {
      const res = await fetch("../AI-Context/context.json");
      const contextData = await res.json();
      if (contextData[topic]) {
        this.state.config.contextPath = contextData[topic].context;
      }
    } catch (e) {}

    this.security.options.strictLockdown = strict;

    try {
      this.setLoading(true);
      
      // 1. Start Pre-Exam (Fullscreen + Agreement)
      await this.security.startPreExam(() => {
        this.launchExamInterface();
      });

      // 2. Initialize questions (First batch)
      await this.fetchQuestionBatch();
      
      // 3. Enable restrictions
      this.security.enableRestrictions();
      
    } catch (e) {
      console.error("Exam start failed:", e);
      alert("Failed to start exam. Please try again.");
    } finally {
      this.setLoading(false);
    }
  }

  launchExamInterface() {
    document.getElementById("exam-setup").style.display = "none";
    document.getElementById("exam-interface").style.display = "flex";
    document.getElementById("exam-report").style.display = "none";
    this.renderQuestion();
    this.updateProgress();
  }

  async fetchQuestionBatch() {
    const { topic, difficulty, totalQuestions, contextPath } = this.state.config;
    const currentCount = this.state.questions.length;
    
    if (currentCount >= totalQuestions) return;

    // Generate in multiples of 5, but not exceeding total
    let batchSize = 5;
    if (currentCount + batchSize > totalQuestions) {
      batchSize = totalQuestions - currentCount;
    }

    // Fetch context text if available
    let contextText = "";
    if (contextPath) {
      try {
        const res = await fetch(contextPath);
        contextText = await res.text();
      } catch (e) {
        console.error("Failed to fetch context file:", e);
      }
    }

    const existingQuestions = this.state.questions;
    const newQuestions = await this.tutor.generateQuestions({
      topic,
      difficulty,
      count: batchSize,
      existingQuestions,
      context: contextText
    });

    if (newQuestions && newQuestions.length > 0) {
      this.state.questions.push(...newQuestions);
      this.saveState();
    }
  }

  async renderQuestion() {
    const idx = this.state.currentIndex;
    const questions = this.state.questions;

    if (idx >= questions.length) {
      // Need more questions to reach the current index (should not happen with proper batching)
      await this.fetchQuestionBatch();
      if (idx >= this.state.questions.length) return;
    }

    // Proactively fetch next batch if we are nearing the end of current available questions
    if (idx + 2 >= questions.length && questions.length < this.state.config.totalQuestions) {
      this.fetchQuestionBatch();
    }

    const q = questions[idx];
    const container = document.getElementById("question-container");
    
    container.innerHTML = `
      <div class="exam-question-text">${q.question}</div>
      <div class="exam-options-list">
        ${q.options.map((opt, i) => `
          <button class="exam-option-btn ${this.state.userAnswers[idx] === opt ? 'selected' : ''}" 
                  data-index="${idx}" data-value="${opt}">
            ${opt}
          </button>
        `).join("")}
      </div>
    `;

    container.querySelectorAll(".exam-option-btn").forEach(btn => {
      btn.onclick = () => this.selectOption(idx, btn.dataset.value);
    });
  }

  selectOption(qIdx, value) {
    this.state.userAnswers[qIdx] = value;
    this.saveState();
    this.renderQuestion();
  }

  prevQuestion() {
    if (this.state.currentIndex > 0) {
      this.state.currentIndex--;
      this.renderQuestion();
      this.updateProgress();
      this.saveState();
    }
  }

  nextQuestion() {
    if (this.state.currentIndex < this.state.config.totalQuestions - 1) {
      this.state.currentIndex++;
      this.renderQuestion();
      this.updateProgress();
      this.saveState();
    }
  }

  updateProgress() {
    document.getElementById("exam-progress-text").textContent = 
      `Question ${this.state.currentIndex + 1}/${this.state.config.totalQuestions}`;
  }

  async submitExam() {
    if (!confirm("Are you sure you want to submit the exam?")) return;

    this.state.isSubmitted = true;
    this.security.submitExam();
    this.saveState();
    this.showReport();
  }

  showReport() {
    document.getElementById("exam-interface").style.display = "none";
    document.getElementById("exam-report").style.display = "flex";
    
    const report = this.security.getIntegrityReport();
    
    // Calculate Exam Score
    let correct = 0;
    this.state.questions.forEach((q, i) => {
      if (this.state.userAnswers[i] === q.correctAnswer) {
        correct++;
      }
    });
    const examScorePercent = Math.round((correct / this.state.questions.length) * 100) || 0;

    document.getElementById("final-score").textContent = `${examScorePercent}%`;
    
    const list = document.getElementById("integrity-list");
    list.innerHTML = `
      <li>Exam Score <span>${correct}/${this.state.questions.length}</span></li>
      <li style="border-bottom: 2px solid var(--border-color); margin-bottom: 8px; padding-bottom: 8px;">Integrity Score <span>${report.score}%</span></li>
    ` + Object.entries(report.details).map(([label, val]) => `
      <li>${label} <span>${val}</span></li>
    `).join("");
  }

  setLoading(loading) {
    this.state.isLoading = loading;
    const btn = document.getElementById("begin-exam-btn");
    if (btn) {
      btn.disabled = loading;
      btn.textContent = loading ? "Preparing Exam..." : "Start Exam";
    }
  }

  saveState() {
    localStorage.setItem("fblacer_exam_state", JSON.stringify(this.state));
  }

  loadState() {
    const saved = localStorage.getItem("fblacer_exam_state");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        this.state = { ...this.state, ...parsed };
      } catch (e) {
        console.error("Failed to load exam state:", e);
      }
    }
  }

  resumeExam() {
    this.security.options.strictLockdown = this.state.config.strictLockdown;
    
    // We need to enter fullscreen to resume
    this.security.startPreExam(() => {
      this.launchExamInterface();
      this.security.enableRestrictions();
      this.renderQuestion();
      this.updateProgress();
    });
  }
}

new ExamManager();
