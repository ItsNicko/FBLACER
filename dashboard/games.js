import { dbApi } from "./db.js";
import { authApi } from "./auth.js";
import { AITutor } from "./ai-tutor.js";

export class GamesManager {
  constructor() {
    this.container = document.getElementById("games-container");
    this.arena = document.getElementById("game-arena");
    this.content = document.getElementById("game-content");
    this.backBtn = document.getElementById("back-to-games");
    this.topicBtn = document.getElementById("set-game-topic-btn");

    this.currentGame = null;
    this.currentTopic = "General Knowledge";
    this.userStats = {
      xp: 0,
      streak: 0,
      maxStreak: 0,
      levels: {},
    };
    this.questionQueue = [];
    this.questionsAnsweredCount = 0;

    if (this.backBtn) {
      this.backBtn.addEventListener("click", () => this.showHub());
    }
    if (this.topicBtn) {
      this.topicBtn.addEventListener("click", () => this.updateTopic());
    }
  }

  async init() {
    const user = authApi.getCurrentUser();
    if (user) {
      try {
        const profile = await dbApi.getUserProfile(user.uid);
        if (profile?.gamesStats) {
          this.userStats = { ...this.userStats, ...profile.gamesStats };
        }
      } catch (e) {
        console.error("Failed to load game stats:", e);
      }
    }

    this.updateGlobalUI();
    this.renderHub();
  }

  updateTopic() {
    const selector = document.getElementById("game-topic-selector");
    let val = selector?.dataset.value;

    if (val === "custom") {
      val = document.getElementById("game-custom-topic")?.value.trim();
    }

    if (val) {
      this.currentTopic = val;
      const header = document.querySelector(
        "#game-topic-selector .dropdown-header",
      );
      if (header) header.textContent = val;
      this.renderHub();
    }
  }

  updateGlobalUI() {
    const xpEl = document.getElementById("global-game-xp");
    const streakEl = document.getElementById("global-game-streak");
    if (xpEl) xpEl.textContent = this.userStats.xp;
    if (streakEl) streakEl.textContent = this.userStats.maxStreak;
  }

  renderHub() {
    if (!this.container) return;
    this.container.innerHTML = "";

    const games = [
      {
        id: "knowledge_climb",
        name: "Knowledge Climb",
        description: `AI-generated challenges on ${this.currentTopic}. Climb the peak of mastery.`,
        icon: "🏔️",
        color: "var(--accent-primary)",
      },
      {
        id: "logic_link",
        name: "Logic Link",
        description: `Critical thinking puzzles about ${this.currentTopic}. Connect the dots.`,
        icon: "🔗",
        color: "#e74c3c",
      },
      {
        id: "equation_quest",
        name: "Equation Quest",
        description: `Quantitive reasoning for ${this.currentTopic}. Balance the truth.`,
        icon: "⚔️",
        color: "#2ecc71",
      },
    ];

    games.forEach((game) => {
      const level = this.userStats.levels[game.id] || 1;
      const card = document.createElement("div");
      card.className = "stat-box";
      card.style.cursor = "pointer";
      card.style.textAlign = "center";
      card.style.padding = "var(--spacing-4)";
      card.style.borderLeft = `4px solid ${game.color}`;

      card.innerHTML = `
        <div style="font-size: 40px; margin-bottom: 12px;">${game.icon}</div>
        <div style="font-weight: 700; font-size: 18px; margin-bottom: 8px;">${game.name}</div>
        <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 16px;">${game.description}</div>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 12px; font-weight: 600; color: var(--text-muted);">Level ${level}</span>
          <button class="btn-primary" style="padding: 6px 12px; font-size: 12px;">Start Quest</button>
        </div>
      `;

      card.onclick = () => this.startGame(game.id);
      this.container.appendChild(card);
    });
  }

  showHub() {
    this.arena.style.display = "none";
    this.container.style.display = "grid";
    this.currentGame = null;
  }

  async startGame(gameId) {
    this.container.style.display = "none";
    this.arena.style.display = "flex";
    this.currentGame = {
      id: gameId,
      level: this.userStats.levels[gameId] || 1,
    };

    if (this.questionQueue.length === 0) {
      await this.fetchNextBatch();
    }

    if (this.questionQueue.length === 0) {
      this.content.innerHTML = `<p style="color: var(--color-wrong);">Failed to load AI challenge. Please try again.</p>
                                <button class="btn-primary" onclick="window.gamesManager.startGame('${gameId}')">Retry</button>`;
      return;
    }

    this.currentPuzzle = this.questionQueue.shift();
    this.renderPuzzle();
  }

  async fetchNextBatch(silent = false) {
    if (!silent) {
      this.content.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; gap: 16px;">
          <div class="loading-spinner"></div>
          <p>AI is crafting your challenges...</p>
        </div>
      `;
    }

    try {
      const user = authApi.getCurrentUser();
      const tutor = new AITutor();

      // We generate in batches of 5
      const questions = await tutor.generateQuestions({
        topic: this.currentTopic,
        difficulty: this.currentGame.level < 5 ? "beginner" : "intermediate",
        count: 5,
        uid: user?.uid,
        context: `Create high-engagement educational puzzles for the game ${this.currentGame.id}. 
                  The user is at level ${this.currentGame.level}.`,
      });

      if (questions && questions.length > 0) {
        this.questionQueue.push(...questions);
      }
    } catch (e) {
      console.error("Failed to fetch question batch:", e);
      if (!silent) {
        this.content.innerHTML = `<p style="color: var(--color-wrong);">Failed to load AI challenges. Please try again.</p>
                                  <button class="btn-primary" onclick="window.gamesManager.startGame('${this.currentGame?.id}')">Retry</button>`;
      }
    }
  }

  renderPuzzle() {
    const p = this.currentPuzzle;
    this.content.innerHTML = `
      <div id="game-ui-wrapper" style="display: flex; flex-direction: column; align-items: center; gap: 24px;">
        <div style="display: flex; justify-content: space-between; width: 100%; margin-bottom: 12px;">
          <div id="game-streak-badge" class="streak-badge" style="display: ${this.userStats.streak > 1 ? "block" : "none"}">
            🔥 ${this.userStats.streak} STREAK
          </div>
          <div style="font-weight: 700; color: var(--text-secondary);">XP: ${this.userStats.xp}</div>
        </div>

        <div style="font-size: 18px; font-weight: 600; margin-bottom: 16px; line-height: 1.5;">${p.question}</div>
        
        <div id="options-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; width: 100%; max-width: 500px;">
          ${p.options
            .map(
              (opt) => `
            <button class="btn-secondary game-option-btn" style="padding: 15px; text-align: left;" data-val="${opt}">${opt}</button>
          `,
            )
            .join("")}
        </div>

        <div id="game-feedback" style="display: none; font-size: 20px; font-weight: 800; margin-top: 16px;"></div>
        
        <div style="width: 100%; max-width: 500px; background: var(--surface-2); height: 10px; border-radius: 5px; overflow: hidden; margin-top: 20px;">
          <div id="xp-fill" class="xp-bar-fill" style="width: ${this.calculateXPProgress()}%; height: 100%; background: var(--accent-primary);"></div>
        </div>
        <div style="font-size: 12px; color: var(--text-muted);">Progress to Level ${this.currentGame.level + 1}</div>
      </div>
    `;

    this.content.querySelectorAll(".game-option-btn").forEach((btn) => {
      btn.onclick = () => this.handleAnswer(btn.dataset.val);
    });
  }

  calculateXPProgress() {
    const xpPerLevel = 100;
    const currentLevelXP = this.userStats.xp % xpPerLevel;
    return (currentLevelXP / xpPerLevel) * 100;
  }

  async handleAnswer(selected) {
    const correct = this.currentPuzzle.correctAnswer;
    const isCorrect = selected === correct;
    const feedback = document.getElementById("game-feedback");
    const wrapper = document.getElementById("game-ui-wrapper");

    this.questionsAnsweredCount++;

    // Trigger batch generation every 4, 9, 14, 19...
    if ((this.questionsAnsweredCount - 4) % 5 === 0) {
      console.log(
        `Pre-fetching next batch at question ${this.questionsAnsweredCount}...`,
      );
      this.fetchNextBatch(true);
    }

    if (isCorrect) {
      // --- DOPAMINE LOOP ---
      this.userStats.streak++;
      this.userStats.maxStreak = Math.max(
        this.userStats.maxStreak,
        this.userStats.streak,
      );

      const xpGain = 20 * (1 + Math.floor(this.userStats.streak / 5)); // Combo bonus
      this.userStats.xp += xpGain;

      feedback.style.display = "block";
      feedback.className = "game-correct";
      feedback.innerHTML = `✨ CORRECT! +${xpGain} XP ✨`;

      wrapper.classList.add("game-correct");

      // Update progress bar immediately
      document.getElementById("xp-fill").style.width =
        `${this.calculateXPProgress()}%`;
      document.getElementById("game-streak-badge").style.display = "block";
      document.getElementById("game-streak-badge").textContent =
        `🔥 ${this.userStats.streak} STREAK`;

      // Advance level if XP threshold met
      const oldLevel = this.userStats.levels[this.currentGame.id] || 1;
      const newLevel = Math.floor(this.userStats.xp / 100) + 1;
      if (newLevel > oldLevel) {
        this.userStats.levels[this.currentGame.id] = newLevel;
        feedback.innerHTML = `🌟 LEVEL UP! Now Level ${newLevel} 🌟`;
      }

      await this.saveStats();
      this.updateGlobalUI();

      setTimeout(() => {
        wrapper.classList.remove("game-correct");

        if (this.questionQueue.length > 0) {
          this.currentPuzzle = this.questionQueue.shift();
          this.renderPuzzle();
        } else {
          this.startGame(this.currentGame.id);
        }
      }, 2000);
    } else {
      // --- FAILURE FEEDBACK ---
      this.userStats.streak = 0;
      feedback.style.display = "block";
      feedback.className = "game-wrong";
      feedback.innerHTML = `❌ Oops! Correct: ${correct}`;

      wrapper.classList.add("game-wrong");
      document.getElementById("game-streak-badge").style.display = "none";

      setTimeout(() => {
        wrapper.classList.remove("game-wrong");
        this.renderPuzzle(); // Retry
      }, 2000);
    }
  }

  async saveStats() {
    const user = authApi.getCurrentUser();
    if (user) {
      try {
        await dbApi.updateUserProfile(user.uid, { gamesStats: this.userStats });
      } catch (e) {
        console.error("Failed to save game stats:", e);
      }
    }
  }
}
