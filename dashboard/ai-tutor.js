import OpenAI from "https://cdn.jsdelivr.net/npm/openai@4.28.0/+esm";
import { dbApi } from "./db.js";
import { authApi } from "./auth.js";

const client = new OpenAI({
  apiKey: "proxy-active",
  baseURL: "https://geminiapi.itsnickofranco.workers.dev",
  dangerouslyAllowBrowser: true,
  defaultHeaders: {
    "X-App-Key":
      "4f9f3f0f9dfaf4e5d7e6b7d4e0f1a8c2c7e9b4d8f5a1e3c6b2d9f8a7c4e1b6d3",
  },
});

export class AITutor {
  constructor() {
    this.state = {
      config: {
        topic: "",
        goal: "",
        level: "",
        preference: "",
        difficulty: "",
        sessionLength: "",
      },
      session: {
        sessionId: null,
        mode: "learn",
        history: [],
        progress: 0,
        questionsAnswered: 0,
        totalCorrect: 0,
        mastery: {
          strong: new Set(),
          weak: new Set(),
          scores: {}, // topic -> score
        },
        isWaitingForConfidence: false,
        lastAnswerCorrect: null,
      },
      recentLog: {
        sessions: [],
        sessionPage: 0,
        expandedSessionId: null,
        messagePage: {}, // sessionId -> pageIndex
      },
    };

    console.log("AI Tutor: Initializing...");
    this.initListeners();
  }

  initListeners() {
    // Setup form
    document
      .getElementById("ai-start-session-btn")
      ?.addEventListener("click", () => this.startSession());

    // Dropdowns in setup
    this.setupDropdown("ai-goal-selector");
    this.setupDropdown("ai-level-selector");
    this.setupDropdown("ai-pref-selector");
    this.setupDropdown("ai-diff-selector");
    this.setupDropdown("ai-session-selector");

    // Learning interface
    document
      .getElementById("ai-send-btn")
      ?.addEventListener("click", () => this.handleSendMessage());
    document
      .getElementById("ai-user-input")
      ?.addEventListener("keypress", (e) => {
        if (e.key === "Enter") this.handleSendMessage();
      });

    // Mode switching
    document.querySelectorAll(".mode-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        document
          .querySelectorAll(".mode-btn")
          .forEach((b) => b.classList.remove("active"));
        e.target.classList.add("active");
        this.state.session.mode = e.target.dataset.mode;
        this.addSystemMessage(
          `Mode switched to ${this.state.session.mode}. Adjusting tutoring style...`,
        );
      });
    });

    // Confidence buttons
    document.querySelectorAll(".conf-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const level = parseInt(e.target.dataset.level);
        this.handleConfidenceSubmit(level);
      });
    });

    // Reset session
    document
      .getElementById("ai-reset-session-btn")
      ?.addEventListener("click", () => this.resetSession());

    // History
    document
      .getElementById("ai-history-btn")
      ?.addEventListener("click", () => this.showHistory());
    document
      .getElementById("ai-history-close")
      ?.addEventListener("click", () => this.closeHistory());

    this.loadRecentLog();

    // Global click to close dropdowns
    document.addEventListener("click", (e) => {
      document.querySelectorAll(".custom-dropdown").forEach((dropdown) => {
        if (!dropdown.contains(e.target)) {
          dropdown.querySelector(".dropdown-menu")?.classList.remove("show");
        }
      });
    });
  }

  setupDropdown(id) {
    const container = document.getElementById(id);
    if (!container) {
      return;
    }

    const header = container.querySelector(".dropdown-header");
    const menu = container.querySelector(".dropdown-menu");

    if (!header || !menu) {
      return;
    }

    const handleHeaderClick = (e) => {
      e.preventDefault();
      e.stopPropagation();

      document.querySelectorAll(".dropdown-menu").forEach((m) => {
        if (m !== menu) m.classList.remove("show");
      });

      const isShowing = menu.classList.toggle("show");
    };

    header.removeEventListener("click", handleHeaderClick);
    header.addEventListener("click", handleHeaderClick);

    menu.querySelectorAll(".dropdown-item").forEach((item) => {
      item.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        const value = item.dataset.value;
        const text = item.textContent.trim();

        header.textContent = text;
        menu.classList.remove("show");
        container.dataset.value = value;
      });
    });
  }

  async startSession() {
    const topicSelector = document.getElementById("ai-topic-selector");
    const topic = topicSelector?.dataset.value || "";
    if (!topic) return alert("Please select a topic to study.");

    this.state.config = {
      topic,
      goal:
        document.getElementById("ai-goal-selector")?.dataset.value || "not-set",
      level:
        document.getElementById("ai-level-selector")?.dataset.value ||
        "not-set",
      preference:
        document.getElementById("ai-pref-selector")?.dataset.value || "not-set",
      difficulty:
        document.getElementById("ai-diff-selector")?.dataset.value || "not-set",
      sessionLength:
        document.getElementById("ai-session-selector")?.dataset.value ||
        "not-set",
    };

    document.getElementById("ai-setup-container").style.display = "none";
    document.getElementById("ai-learning-container").style.display = "grid";

    this.updateDashboard();

    const user = authApi.getCurrentUser();
    let userData = null;
    if (user) {
      try {
        const profile = await dbApi.getUserProfile(user.uid);
        const scores = await dbApi.fetchUserScores(user.uid);
        userData = {
          uid: user.uid,
          username: profile?.username || user.displayName || "Student",
          totalPoints: scores.reduce((sum, s) => sum + (s.points || 0), 0),
          history: scores,
        };

        console.log("AI Tutor: Initializing Firebase session...");
        const sessionId = await dbApi.saveChatSession(user.uid, {
          config: this.state.config,
          history: [],
          mode: this.state.session.mode,
        });
        this.state.session.sessionId = sessionId;
      } catch (e) {
        console.error("AI Tutor: Failed to load user data:", e);
      }
    }

    await this.initTutorConversation(userData);
  }

  async initTutorConversation(userData = null) {
    const systemPrompt = await this.generateSystemPrompt(userData);
    this.state.session.history.push({ role: "system", content: systemPrompt });

    this.addSystemMessage(
      `Session started: ${this.state.config.topic} (${this.state.session.mode} mode)`,
    );

    await this.getTutorResponse(
      "Hello! I'm your AI Tutor. Let's get started. Based on your goals, I've prepared a learning path. I'll start by gauging your current understanding. Ready?",
    );
  }

  async getSyncStructure() {
    const res = await fetch("/sync-structure.json");
    return await res.json();
  }

  async getTopicContext(topic) {
    try {
      const sync = await this.getSyncStructure();
      const config = sync[topic];
      if (!config?.context) return "";
      const res = await fetch(`/${config.context}`);
      return await res.text();
    } catch (e) {
      console.error("AI Tutor: Failed to fetch topic context:", e);
      return "";
    }
  }

  async generateSystemPrompt(userData = null) {
    const { topic, goal, level, preference, difficulty, sessionLength } =
      this.state.config;
    const context = await this.getTopicContext(topic);

    let userContext = "No user data available.";
    if (userData) {
      userContext = `
- Username: ${userData.username}
- Total Points: ${userData.totalPoints}
- Test History: ${userData.history.map((h) => `${h.testId}: ${h.points}pts`).join(", ")}
      `.trim();
    }

    return `You are a world-class AI Tutor and engaging mentor specialized in ${topic}. 
    Your primary objective is to ensure the student achieves deep, long-term retention and conceptual mastery using evidence-based learning science.
    
    STUDENT PROFILE:
    - ${userContext}
    - Topic: ${topic}
    - Goal: ${goal}
    - Current Level: ${level}
    - Learning Preference: ${preference}
    - Difficulty: ${difficulty}
    - Session Length: ${sessionLength} minutes
    
    TOPIC CONTEXT:
    ${context || "No specific context provided. Use your internal knowledge of " + topic + "."}
    
    CORE PEDAGOGY:
    1. SPECIFICITY: Always start by asking the student what specific aspect of ${topic} they want to learn about or where they are struggling. Avoid generic introductions.
    2. ACTIVE RECALL: Do not lecture. Instead, challenge the student to retrieve information from memory. Ask them to explain concepts in their own words.
    3. SOCRATIC QUESTIONING: Guide the student toward the correct answer through a sequence of targeted questions. Provide hints that nudge them in the right direction rather than giving the answer.
    4. INTERLEAVING: Occasionally mix in related concepts or previously learned material to strengthen the student's ability to differentiate between concepts.
    5. ELABORATIVE INTERROGATION: Ask "Why?" and "How does this relate to X?" to encourage the student to connect new information to existing knowledge.
    6. DESIRABLE DIFFICULTIES: Maintain a level of challenge that is just above the student's current ability (Zone of Proximal Development).
    7. SPACED REPETITION: Reinforce key concepts at increasing intervals.
    
    ENGAGEMENT & TONE:
    - Be an encouraging, supportive, and enthusiastic mentor.
    - Use a conversational but technical tone.
    - Validate correct answers with specific praise before moving on.
    - When the student is wrong, treat it as a learning opportunity.
    - Keep responses concise and focused.
    - End almost every response with an engaging, open-ended question.
    
    TOOL USAGE:
    - You have access to special tools to interact with the UI. Use them strategically:
      - trigger_confidence_check: Use this ONLY when the student has provided a significant answer and you want to verify their certainty (approx 30% of the time).
      - suggest_notebook: Use this when introducing a complex formula, diagram, or a long list of concepts that requires writing to remember.
      - summarize_progress: Use this after a successful learning milestone to reinforce what has been mastered.
      - adjust_difficulty: Use this to explicitly change the challenge level if the student is struggling or breezing through.
      - trigger_multiple_choice: Use this to test the student's knowledge with a quick MC question. Provide a clear question, 4 distinct options, and the correct answer.
    
    STRICT OUTPUT RULE:
    - DO NOT include your internal monologue, thinking process, or "Student's answer/Assessment" sections.
    - DO NOT wrap your response in <thought> tags or any other metadata wrappers.
    - Start your response immediately with the conversational message.
    - Your output should ONLY contain the final response intended for the student.
    
    OUTPUT FORMAT:
    - Use LaTeX for all mathematical symbols and equations. Use $$...$$ for block equations and $...$ for inline math (e.g., $\Delta G$ or $\tau = r F \sin(\theta)$).
    - Use Markdown for structure and clarity.
    - Use bullet points and bold text for key terms.
    - Suggest mental models or analogies where helpful.
    `;
  }

  async handleSendMessage() {
    const inputEl = document.getElementById("ai-user-input");
    const message = inputEl.value.trim();
    if (!message) return;

    if (this.state.session.isWaitingForConfidence) {
      this.addMessage("user", "Please rate your confidence first!");
      return;
    }

    inputEl.value = "";
    this.addMessage("user", message);
    this.state.session.history.push({ role: "user", content: message });

    // Save after user message
    await this.saveSession();

    await this.getTutorResponse();
  }

  async getTutorResponse(overrideText = null) {
    if (overrideText) {
      this.addMessage("tutor", overrideText);
      return;
    }

    const chatHistory = this.state.session.history;
    const thinkingDiv = this.addMessage(
      "tutor",
      '<span class="ai-thinking">Thinking...</span>',
    );

    const MAX_RETRIES = 3;
    let attempt = 0;
    let response;

    while (attempt < MAX_RETRIES) {
      try {
        response = await client.chat.completions.create({
          model: "gemma-4-31b-it",
          messages: chatHistory,
          stream: true,
          tools: [
            {
              type: "function",
              function: {
                name: "trigger_confidence_check",
                description:
                  "Triggers the confidence rating UI for the student. Use sparingly (approx 30% of the time) after a key answer.",
                parameters: { type: "object", properties: {} },
              },
            },
            {
              type: "function",
              function: {
                name: "suggest_notebook",
                description:
                  "Prompts the student to take out a notebook for complex concepts, formulas, or diagrams.",
                parameters: { type: "object", properties: {} },
              },
            },
            {
              type: "function",
              function: {
                name: "summarize_progress",
                description:
                  "Triggers a summary of the key concepts mastered so far in the session.",
                parameters: { type: "object", properties: {} },
              },
            },
            {
              type: "function",
              function: {
                name: "adjust_difficulty",
                description: "Changes the teaching difficulty level.",
                parameters: {
                  type: "object",
                  properties: {
                    level: {
                      type: "string",
                      enum: ["easy", "balanced", "hard", "exam"],
                      description: "The new difficulty level",
                    },
                  },
                  required: ["level"],
                },
              },
            },
            {
              type: "function",
              function: {
                name: "trigger_multiple_choice",
                description:
                  "Triggers a multiple-choice question UI to test knowledge.",
                parameters: {
                  type: "object",
                  properties: {
                    question: {
                      type: "string",
                      description: "The question to ask",
                    },
                    options: {
                      type: "array",
                      items: { type: "string" },
                      description: "4 possible options",
                    },
                    correctAnswer: {
                      type: "string",
                      description: "The correct option text",
                    },
                  },
                  required: ["question", "options", "correctAnswer"],
                },
              },
            },
          ],
        });
        break; // Success, exit retry loop
      } catch (e) {
        attempt++;
        const is503 = e.message?.includes("503") || e.status === 503;
        if (is503 && attempt < MAX_RETRIES) {
          const delay = Math.pow(2, attempt) * 1000;
          console.warn(
            `Tutor API 503 encountered. Retry attempt ${attempt}/${MAX_RETRIES} in ${delay}ms...`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          throw e; // Non-retryable error or max retries reached
        }
      }
    }

    try {
      let fullResponse = "";
      thinkingDiv.remove();

      const messageDiv = this.addMessage("tutor", "");

      for await (const chunk of response) {
        const delta = chunk.choices[0]?.delta;

        if (delta?.tool_calls) {
          for (const toolCall of delta.tool_calls) {
            const functionName = toolCall.function.name;
            const args = JSON.parse(toolCall.function.arguments || "{}");
            this.handleToolCall(functionName, args);
          }
        }

        const content = delta?.content || "";
        fullResponse += content;
        messageDiv.innerHTML = this.formatResponse(fullResponse);

        if (window.renderMathInElement) {
          renderMathInElement(messageDiv, {
            delimiters: [
              { left: "$$", right: "$$", display: true },
              { left: "$", right: "$", display: false },
            ],
            throwOnError: false,
          });
        }

        document.getElementById("ai-chat-history").scrollTop =
          document.getElementById("ai-chat-history").scrollHeight;
      }

      this.state.session.history.push({
        role: "assistant",
        content: fullResponse,
      });
      await this.saveSession();
    } catch (e) {
      if (thinkingDiv) thinkingDiv.remove();
      console.error("Tutor API Error:", e);
      this.addMessage(
        "tutor",
        "I'm having trouble connecting to my brain. Please try again in a moment.",
      );
    }
  }

  handleToolCall(name, args) {
    console.log(`AI Tutor Tool Call: ${name}`, args);
    switch (name) {
      case "trigger_confidence_check":
        this.triggerConfidenceCheck();
        break;
      case "suggest_notebook":
        this.addSystemMessage(
          "📝 Tutor suggests: Grab a notebook to sketch this out or take some notes!",
        );
        break;
      case "summarize_progress":
        this.addSystemMessage(
          "🎯 Milestone reached! You're mastering these concepts.",
        );
        break;
      case "adjust_difficulty":
        this.state.config.difficulty = args.level;
        this.addSystemMessage(`Difficulty adjusted to ${args.level}.`);
        break;
      case "trigger_multiple_choice":
        this.renderMCQuestion(args);
        break;
    }
  }

  renderMCQuestion({ question, options, correctAnswer }) {
    const history = document.getElementById("ai-chat-history");
    const container = document.createElement("div");
    container.className = "ai-message tutor";
    container.style.cssText =
      "border: 2px solid var(--accent-primary); padding: 15px; background: var(--surface-1);";

    container.innerHTML = `
      <div style="font-weight: 700; margin-bottom: 10px;">Quick Quiz!</div>
      <div style="margin-bottom: 12px;">${question}</div>
      <div class="mc-options" style="display: flex; flex-direction: column; gap: 8px;">
        ${options.map((opt) => `<button class="mc-opt-btn" style="text-align: left; padding: 8px; cursor: pointer; background: var(--surface-2); border: 1px solid var(--border-color); border-radius: 4px;">${opt}</button>`).join("")}
      </div>
    `;

    container.querySelectorAll(".mc-opt-btn").forEach((btn) => {
      btn.onclick = () => {
        const selected = btn.textContent.trim();
        if (selected === correctAnswer) {
          btn.style.backgroundColor = "rgba(16, 185, 129, 0.2)";
          btn.style.borderColor = "var(--color-correct)";
          this.addSystemMessage("✅ Correct!");
        } else {
          btn.style.backgroundColor = "rgba(239, 68, 68, 0.2)";
          btn.style.borderColor = "var(--color-wrong)";
          this.addSystemMessage(
            `❌ Not quite. The correct answer was: ${correctAnswer}`,
          );
        }
        container
          .querySelectorAll(".mc-opt-btn")
          .forEach((b) => (b.disabled = true));
      };
    });

    history.appendChild(container);
    history.scrollTop = history.scrollHeight;
  }

  addMessage(role, content) {
    const history = document.getElementById("ai-chat-history");
    const div = document.createElement("div");
    div.className = `ai-message ${role}`;
    div.innerHTML = this.formatResponse(content);
    history.appendChild(div);

    if (window.renderMathInElement) {
      renderMathInElement(div, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false },
        ],
        throwOnError: false,
      });
    }

    history.scrollTop = history.scrollHeight;
    return div;
  }

  addSystemMessage(content) {
    this.addMessage("system", content);
  }

  formatResponse(text) {
    if (!text) return "";
    let cleanedText = text.replace(/<thought>[\s\S]*?<\/thought>/gi, "");
    if (cleanedText.includes("<thought>")) {
      cleanedText = cleanedText.split("<thought>")[0];
    }
    const thinkingPattern =
      /^(\s*[\*\-]\s*(Student's answer|Assessment|Plan|Validate|Synthesis|Socratic|Interleaving|Praise|Challenge):.*(\r?\n|$))+/i;
    cleanedText = cleanedText.replace(thinkingPattern, "").trim();

    return cleanedText
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/^\s*[\*\-]\s+(.*)$/gm, "<li>$1</li>")
      .replace(/(<li>.*<\/li>)+/g, (match) => `<ul>${match}</ul>`)
      .replace(/\n/g, "<br>");
  }

  triggerConfidenceCheck() {
    const confidenceContainer = document.getElementById(
      "ai-confidence-container",
    );
    if (confidenceContainer) {
      confidenceContainer.style.display = "flex";
      this.state.session.isWaitingForConfidence = true;
    }
  }

  handleConfidenceSubmit(level) {
    this.state.session.isWaitingForConfidence = false;
    document.getElementById("ai-confidence-container").style.display = "none";
    document
      .querySelectorAll(".conf-btn")
      .forEach((b) => b.classList.remove("active"));
    this.addSystemMessage(`Student confidence: ${level}/5`);
    this.state.session.questionsAnswered++;
    this.updateMastery(level);
    this.updateDashboard();
  }

  updateMastery(confidence) {
    const topics = ["Concept A", "Concept B", "Concept C"];
    const randomTopic = topics[Math.floor(Math.random() * topics.length)];
    if (confidence >= 4) {
      this.state.session.mastery.strong.add(randomTopic);
      this.state.session.mastery.weak.delete(randomTopic);
    } else if (confidence <= 2) {
      this.state.session.mastery.weak.add(randomTopic);
      this.state.session.mastery.strong.delete(randomTopic);
    }
  }

  async generateQuestions({
    topic,
    difficulty,
    count = 5,
    existingQuestions = [],
    context = "",
    uid = null,
    onBatch = null,
  }) {
    const MAX_BATCH_SIZE = 5;
    let allQuestions = [];

    // Gather comprehensive context
    let finalContext = context;
    if (!finalContext) {
      finalContext = await this.getTopicContext(topic);
    }

    // 2. Fetch AI-generated questions from Firebase to avoid repeats
    let currentExisting = [...existingQuestions];
    if (uid) {
      try {
        const firebaseQuestions = await dbApi.fetchGeneratedQuestions(
          uid,
          topic,
        );
        currentExisting.push(...firebaseQuestions);
      } catch (e) {
        console.error("AI Tutor: Failed to fetch Firebase questions:", e);
      }
    }

    const numBatches = Math.ceil(count / MAX_BATCH_SIZE);
    const batchPromises = [];

    for (let i = 0; i < numBatches; i++) {
      const batchSize =
        i === numBatches - 1
          ? count % MAX_BATCH_SIZE || MAX_BATCH_SIZE
          : MAX_BATCH_SIZE;

      batchPromises.push(
        (async () => {
          const systemPrompt = `You are an expert exam generator. Your goal is to create high-quality multiple-choice questions that are unique and a a high-engagement.
        
        PRIMARY CONTEXT:
        ${finalContext ? finalContext : "Use your internal knowledge of " + topic + "."}
        
        STRICT OUTPUT FORMAT:
        You must return a JSON object with a single key "questions" containing an array of question objects.
        Do not include any markdown formatting, code blocks, or preamble.
        
        Each question object must have:
        - "question": The question text.
        - "options": An array of exactly 4 distinct options.
        - "correctAnswer": The exact string of the correct option.
        - "Help": A concise explanation.
        - "topic": The sub-topic name.
        
        Example:
        {"questions": [{"question": "What is 2+2?", "options": ["3", "4", "5", "6"], "correctAnswer": "4", "Help": "Basic addition", "topic": "Math"}]}
        
        CRITICAL: AVOID REPETITION.
        The following questions have already been generated or seen. DO NOT create any questions that are similar to these:
        ${currentExisting.map((q) => q.question).join("\n")}
        `;

          try {
            const response = await client.chat.completions.create({
              model: "gemma-4-31b-it",
              messages: [
                { role: "system", content: systemPrompt },
                {
                  role: "user",
                  content: `Generate ${batchSize} unique multiple-choice questions about ${topic} at a ${difficulty} level. Ensure they are different from the ones listed in the system prompt. Return as a JSON object with a "questions" key.`,
                },
              ],
              response_format: { type: "json_object" },
            });

            let content = response.choices[0].message.content;
            content = content
              .replace(/<thought>[\s\S]*?<\/thought>/gi, "")
              .trim();

            if (content.includes("```")) {
              content = content
                .replace(/```json\s*([\s\S]*?)\s*```/g, "$1")
                .replace(/```\s*([\s\S]*?)\s*```/g, "$1")
                .trim();
            }

            const parsed = JSON.parse(content);
            const questions =
              parsed.questions ||
              parsed.tests ||
              (Array.isArray(parsed) ? parsed : []);

            allQuestions.push(...questions);
            if (onBatch) {
              onBatch(questions);
            }
            return questions;
          } catch (e) {
            console.error(`AI Tutor: Failed to generate batch ${i + 1}:`, e);
            return [];
          }
        })(),
      );
    }

    await Promise.all(batchPromises);

    if (uid && allQuestions.length > 0) {
      await dbApi.saveGeneratedQuestions(uid, topic, allQuestions);
    }

    console.log(
      `AI Tutor: Successfully generated ${allQuestions.length} questions total.`,
    );
    return allQuestions;
  }

  updateDashboard() {
    const { config, session } = this.state;
    document.getElementById("ai-dash-topic").textContent = config.topic;
    document.getElementById("ai-dash-count").textContent =
      session.questionsAnswered;
    const masteryPercent = Math.min(100, session.questionsAnswered * 5);
    document.getElementById("ai-dash-mastery").textContent =
      `${masteryPercent}%`;
    document.getElementById("ai-dash-progress-bar").style.width =
      `${masteryPercent}%`;
    document.getElementById("ai-dash-progress-text").textContent =
      `${masteryPercent}%`;
    const strongContainer = document.getElementById("ai-dash-strong");
    strongContainer.innerHTML = Array.from(session.mastery.strong)
      .map((t) => `<span class="mastery-tag strong">${t}</span>`)
      .join("");
    const weakContainer = document.getElementById("ai-dash-weak");
    weakContainer.innerHTML = Array.from(session.mastery.weak)
      .map((t) => `<span class="mastery-tag weak">${t}</span>`)
      .join("");
  }

  async saveSession() {
    const user = authApi.getCurrentUser();
    if (!user) {
      console.warn(
        "AI Tutor: Save failed - No user logged in. current user:",
        user,
      );
      return;
    }

    try {
      console.log(
        `AI Tutor: Attempting to save session. User: ${user.uid}, SessionID: ${this.state.session.sessionId}`,
      );
      const sessionData = {
        config: this.state.config,
        history: this.state.session.history,
        mode: this.state.session.mode,
        progress: this.state.session.progress,
        questionsAnswered: this.state.session.questionsAnswered,
        mastery: {
          strong: Array.from(this.state.session.mastery.strong),
          weak: Array.from(this.state.session.mastery.weak),
        },
      };

      if (this.state.session.sessionId) {
        await dbApi.updateChatSession(
          user.uid,
          this.state.session.sessionId,
          sessionData,
        );
      } else {
        const id = await dbApi.saveChatSession(user.uid, sessionData);
        this.state.session.sessionId = id;
        console.log(`AI Tutor: Session created and ID assigned: ${id}`);
      }
    } catch (e) {
      console.error("AI Tutor: CRITICAL save error:", e);
    }
  }

  async loadSession(sessionId) {
    const user = authApi.getCurrentUser();
    if (!user) return;

    try {
      const sessions = await dbApi.fetchChatSessions(user.uid);
      const session = sessions.find((s) => s.id === sessionId);
      if (!session) return;

      this.state.session.sessionId = sessionId;
      this.state.config = session.config;
      this.state.session.mode = session.mode;
      this.state.session.history = session.history;
      this.state.session.progress = session.progress;
      this.state.session.questionsAnswered = session.questionsAnswered;
      this.state.session.mastery.strong = new Set(session.mastery.strong);
      this.state.session.mastery.weak = new Set(session.mastery.weak);

      document.getElementById("ai-setup-container").style.display = "none";
      document.getElementById("ai-learning-container").style.display = "grid";

      this.updateDashboard();

      // Re-populate chat history
      const chatHistory = document.getElementById("ai-chat-history");
      chatHistory.innerHTML = "";
      this.state.session.history.forEach((msg) => {
        if (msg.role !== "system") {
          this.addMessage(
            msg.role === "assistant" ? "tutor" : msg.role,
            msg.content,
          );
        }
      });

      this.closeHistory();
    } catch (e) {
      console.error("AI Tutor: Failed to load session:", e);
    }
  }

  async showHistory() {
    const user = authApi.getCurrentUser();
    if (!user) return alert("Please log in to view your chat history.");

    const modal = document.getElementById("ai-history-modal");
    const list = document.getElementById("ai-history-list");

    modal.style.display = "flex";
    list.innerHTML =
      '<div style="text-align:center; padding:20px;">Loading history...</div>';

    try {
      const sessions = await dbApi.fetchChatSessions(user.uid);
      if (sessions.length === 0) {
        list.innerHTML =
          '<div style="text-align:center; padding:20px; color:var(--text-muted);">No saved sessions found.</div>';
        return;
      }

      list.innerHTML = sessions
        .map(
          (s) => `
        <div class="history-item" style="padding:12px; background:var(--surface-2); border:1px solid var(--border-color); border-radius:8px; cursor:pointer; display:flex; justify-content:space-between; align-items:center;" data-id="${s.id}">
          <div>
            <div style="font-weight:600; color:var(--text-primary);">${s.config.topic}</div>
            <div style="font-size:11px; color:var(--text-muted);">${new Date(s.timestamp?.seconds * 1000).toLocaleDateString()}</div>
          </div>
          <span style="font-size:12px; color:var(--accent-primary);">Load $\rightarrow$</span>
        </div>
      `,
        )
        .join("");

      list.querySelectorAll(".history-item").forEach((item) => {
        item.onclick = () => this.loadSession(item.dataset.id);
      });
    } catch (e) {
      list.innerHTML =
        '<div style="text-align:center; padding:20px; color:var(--color-wrong);">Failed to load history.</div>';
    }
  }

  closeHistory() {
    document.getElementById("ai-history-modal").style.display = "none";
  }

  async loadRecentLog() {
    const user = authApi.getCurrentUser();
    if (!user) {
      const logContainer = document.getElementById("ai-recent-log");
      if (logContainer) {
        logContainer.innerHTML =
          '<div style="text-align: center; color: var(--text-muted); padding: 20px;">Please log in to see your recent sessions.</div>';
      }
      return;
    }

    const logContainer = document.getElementById("ai-recent-log");
    if (!logContainer) return;

    try {
      const sessions = await dbApi.fetchChatSessions(user.uid);
      this.state.recentLog.sessions = sessions || [];
      this.state.recentLog.sessionPage = 0;
      this.state.recentLog.expandedSessionId = null;
      this.state.recentLog.messagePage = {};

      this.renderRecentLogPreview();
    } catch (e) {
      console.error("AI Tutor: Failed to load recent log:", e);
    }
  }

  renderRecentLogPreview() {
    const logContainer = document.getElementById("ai-recent-log");
    if (!logContainer) return;

    const { sessions, sessionPage, expandedSessionId, messagePage } =
      this.state.recentLog;
    if (!sessions || sessions.length === 0) {
      logContainer.innerHTML =
        '<div style="text-align: center; color: var(--text-muted); padding: 20px;">No recent sessions to display.</div>';
      return;
    }

    const sessionPageSize = 3;
    const sessionStart = sessionPage * sessionPageSize;
    const sessionEnd = sessionStart + sessionPageSize;
    const pageSessions = sessions.slice(sessionStart, sessionEnd);
    const totalSessionPages = Math.ceil(sessions.length / sessionPageSize);

    logContainer.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 12px; width: 100%;">
        <div class="session-list" style="display: flex; flex-direction: column; gap: 8px;">
          ${pageSessions
            .map((s) => {
              const isExpanded = expandedSessionId === s.id;
              const history = (s.history || []).filter(
                (msg) => msg.role !== "system",
              );
              const msgPage = messagePage[s.id] || 0;
              const msgStart = msgPage * 3;
              const msgEnd = msgStart + 3;
              const pageMsgs = history.slice(msgStart, msgEnd);
              const totalMsgPages = Math.ceil(history.length / 3);

              return `
              <div class="session-item" style="background: var(--surface-1); border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden;">
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; cursor: pointer;" 
                     onclick="this.closest('.session-item').dataset.expanded = !this.closest('.session-item').dataset.expanded; window.aiTutor.toggleSession('${s.id}')">
                  <div>
                    <div style="font-weight: 600; color: var(--text-primary); font-size: 14px;">${s.config?.topic || "Unknown Topic"}</div>
                    <div style="font-size: 11px; color: var(--text-muted);">${s.timestamp ? new Date(s.timestamp.seconds * 1000).toLocaleDateString() : "Unknown date"}</div>
                  </div>
                  <div style="display: flex; gap: 8px; align-items: center;">
                    <button class="btn-primary" style="padding: 4px 8px; font-size: 11px;" onclick="event.stopPropagation(); window.aiTutor.loadSession('${s.id}')">Resume</button>
                    <span style="font-size: 12px; color: var(--accent-primary);">${isExpanded ? "▴" : "▾"}</span>
                  </div>
                </div>
                ${
                  isExpanded
                    ? `
                  <div style="padding: 10px; background: var(--surface-2); border-top: 1px solid var(--border-color); display: flex; flex-direction: column; gap: 8px;">
                    <div style="display: flex; flex-direction: column; gap: 6px;">
                      ${
                        pageMsgs.length > 0
                          ? pageMsgs
                              .map(
                                (msg) => `
                        <div style="font-size: 12px; padding: 6px 10px; border-radius: 6px; background: ${msg.role === "assistant" ? "var(--surface-1)" : "var(--accent-soft)"}; border: 1px solid var(--border-color);">
                          <strong style="font-size: 10px; color: var(--text-muted); display: block;">${msg.role === "assistant" ? "Tutor" : "You"}</strong>
                          <div style="line-height: 1.4;">${this.formatResponse(msg.content)}</div>
                        </div>
                      `,
                              )
                              .join("")
                          : '<div style="text-align:center; color:var(--text-muted); font-size:11px; padding:5px;">No messages.</div>'
                      }
                    </div>
                    <div style="display: flex; justify-content: center; align-items: center; gap: 12px; margin-top: 4px;">
                      <button class="msg-nav-btn" data-id="${s.id}" data-dir="prev" ${msgPage === 0 ? "disabled" : ""} style="background:none; border:none; cursor:pointer; color:var(--text-primary);">←</button>
                      <span style="font-size: 10px; color: var(--text-muted);">Page ${msgPage + 1} of ${totalMsgPages || 1}</span>
                      <button class="msg-nav-btn" data-id="${s.id}" data-dir="next" ${msgPage >= totalMsgPages - 1 ? "disabled" : ""} style="background:none; border:none; cursor:pointer; color:var(--text-primary);">→</button>
                    </div>
                  </div>
                `
                    : ""
                }
              </div>
            `;
            })
            .join("")}
        </div>
        <div style="display: flex; justify-content: center; align-items: center; gap: 16px; margin-top: 8px;">
          <button id="prev-session-page" ${sessionPage === 0 ? "disabled" : ""} style="background: none; border: none; cursor: pointer; color: var(--text-primary); font-size: 18px; padding: 0 8px;">←</button>
          <span style="font-size: 11px; color: var(--text-muted);">Sessions Page ${sessionPage + 1} of ${totalSessionPages || 1}</span>
          <button id="next-session-page" ${sessionPage >= totalSessionPages - 1 ? "disabled" : ""} style="background: none; border: none; cursor: pointer; color: var(--text-primary); font-size: 18px; padding: 0 8px;">→</button>
        </div>
      </div>
    `;

    document
      .getElementById("prev-session-page")
      ?.addEventListener("click", () => {
        this.state.recentLog.sessionPage--;
        this.renderRecentLogPreview();
      });

    document
      .getElementById("next-session-page")
      ?.addEventListener("click", () => {
        this.state.recentLog.sessionPage++;
        this.renderRecentLogPreview();
      });

    logContainer.querySelectorAll(".msg-nav-btn").forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const dir = btn.dataset.dir;
        const current = this.state.recentLog.messagePage[id] || 0;
        this.state.recentLog.messagePage[id] =
          dir === "prev" ? Math.max(0, current - 1) : current + 1;
        this.renderRecentLogPreview();
      };
    });

    if (window.renderMathInElement) {
      renderMathInElement(logContainer, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false },
        ],
        throwOnError: false,
      });
    }
  }

  toggleSession(sessionId) {
    this.state.recentLog.expandedSessionId =
      this.state.recentLog.expandedSessionId === sessionId ? null : sessionId;
    this.renderRecentLogPreview();
  }

  resetSession() {
    if (
      !confirm(
        "Reset current session? Your progress will be saved before resetting.",
      )
    )
      return;
    this.saveSession().then(() => location.reload());
  }
}
