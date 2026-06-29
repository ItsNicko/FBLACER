import OpenAI from "https://cdn.jsdelivr.net/npm/openai@4.28.0/+esm";
import { authApi } from "./auth.js";

const client = new OpenAI({
  apiKey: "proxy-active",
  baseURL: "https://geminiapi.itsnickofranco.workers.dev",
  dangerouslyAllowBrowser: true,
  defaultHeaders: {
    "X-App-Key": "4f9f3f0f9dfaf4e5d7e6b7d4e0f1a8c2c7e9b4d8f5a1e3c6b2d9f8a7c4e1b6d3"
  }
});

export class DoomscrollManager {
  constructor() {
    this.state = {
      scrollLocked: true,
      unlockTimer: null,
      selectedTopic: null,
      currentQuestion: null,
      currentAnswer: null,
      isGenerating: false,
      currentVideoIdx: 0,
      questionBuffer: [],
      usedQuestions: [],
    };
    this.shortsIds = [
      "dQw4w9WgXcQ", "jfKfPfyCZyY", "y6120kxSBO8", "h_pAnp_FpDI",
      "uP_2zO_8U30", "S2E_atfHwao", "zEAgU8zSpx0", "SmdByT_7YIo",
      "X-Nf8K3MiwE", "6Tox-fU7V_A", "TfHlbXbE0C8", "V_L_mYgUfVw",
      "p7KojYpT_7U", "qXyI0oYhKqY", "w_S5jS6mRGo", "S-O6pXJ1X1Y"
    ];
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.populateFeed();
    this.setupScrollInterception();
  }

  setupEventListeners() {
    document.getElementById("start-doomscroll-btn")?.addEventListener("click", () => this.startDoomscroll());
    document.getElementById("gate-submit-btn")?.addEventListener("click", () => this.handleSubmitAnswer());
    document.getElementById("gate-answer")?.addEventListener("keypress", (e) => {
      if (e.key === "Enter") this.handleSubmitAnswer();
    });
    
    document.querySelectorAll(".topic-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".topic-btn").forEach(b => b.classList.remove("btn-primary"));
        btn.classList.add("btn-primary");
        this.state.selectedTopic = btn.dataset.topic;
      });
    });
  }

  parseAIResponse(content) {
    try {
      const cleaned = content
        .replace(/<thought>[\s\S]*?<\/thought>/gi, "")
        .replace(/```json\s*([\s\S]*?)\s*```/g, "$1")
        .replace(/```\s*([\s\S]*?)\s*```/g, "$1")
        .trim();
      return JSON.parse(cleaned);
    } catch (e) {
      console.error("Failed to parse AI response:", content);
      throw e;
    }
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
      console.error("Doomscroll: Failed to fetch topic context:", e);
      return "";
    }
  }

  async generateQuestions() {
    if (this.state.isGenerating) return;
    this.state.isGenerating = true;
    
    try {
      const context = await this.getTopicContext(this.state.selectedTopic);
      const prompt = `
Generate 5 short, clear, and unique questions for a student based on the topic: ${this.state.selectedTopic}.
${context ? `Use the following provided context for the questions:\n${context}` : "Use your internal knowledge of the topic."}
Avoid these previous questions: ${JSON.stringify(this.state.usedQuestions)}.
The questions must be solvable without external tools and are intended for a fast-paced "gate" mechanism.

Return the response ONLY as a JSON object with a "questions" key containing an array of objects:
{
  "questions": [
    {"question": "...", "answer": "..."},
    ...
  ]
}
`;
      const response = await client.chat.completions.create({
        model: "gemma-4-31b-it",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" }
      });
      
      const data = this.parseAIResponse(response.choices[0].message.content);
      const questions = data.questions || (Array.isArray(data) ? data : []);
      this.state.questionBuffer.push(...questions);
    } catch (e) {
      console.error("Question batch generation failed:", e);
    } finally {
      this.state.isGenerating = false;
    }
  }

  startDoomscroll() {
    const topicSelector = document.getElementById("doomscroll-topic-selector");
    const selectedTopic = topicSelector?.dataset.value;
    const customTopic = document.getElementById("custom-topic-input").value.trim();
    
    // Custom topic takes precedence over dropdown selection
    this.state.selectedTopic = customTopic || selectedTopic;
  
    if (!this.state.selectedTopic) {
      alert("Please select or enter a topic first!");
      return;
    }
  
    document.getElementById("topic-selector-overlay").style.display = "none";
    this.triggerQuestion();
  }

  populateFeed() {
    const feed = document.querySelector("#doomscroll-container .scroll-demo");
    if (!feed) return;
    
    feed.innerHTML = `
      <div id="doomscroll-video-wrapper" style="height: 100vh; width: 100%; display: flex; align-items: center; justify-content: center; background: black;">
        <iframe 
          id="doomscroll-iframe"
          width="100%" 
          height="100%" 
          src="https://www.youtube-nocookie.com/embed/${this.shortsIds[0]}?autoplay=0&controls=0&loop=1&playlist=${this.shortsIds[0]}&modestbranding=1&rel=0" 
          frameborder="0" 
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
          allowfullscreen
          style="pointer-events: none; height: 100vh; width: 100vw; max-width: 56.25vh; margin: 0 auto; box-shadow: 0 0 50px rgba(0,0,0,0.5);"
        ></iframe>
      </div>
    `;
  }

  updateVideo() {
    const iframe = document.getElementById("doomscroll-iframe");
    if (!iframe) return;
    
    const id = this.shortsIds[this.state.currentVideoIdx % this.shortsIds.length];
    iframe.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&controls=0&loop=1&playlist=${id}&modestbranding=1&rel=0`;
  }

  setupScrollInterception() {
    const container = document.getElementById("doomscroll-container");
    if (!container) return;

    const blockEvent = (e) => {
      if (this.state.scrollLocked) {
        e.preventDefault();
        this.triggerQuestion();
        return false;
      }
      return true;
    };

    container.addEventListener("wheel", blockEvent, { passive: false });
    container.addEventListener("touchmove", blockEvent, { passive: false });
    
    window.addEventListener("keydown", (e) => {
      if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", " "].includes(e.key)) {
        if (this.state.scrollLocked && document.getElementById("doomscroll-view").style.display !== "none") {
          e.preventDefault();
          this.triggerQuestion();
        }
      }
    });
  }

  async triggerQuestion() {
    if (this.state.isGenerating) return;
    
    const overlay = document.getElementById("learning-gate-overlay");
    if (!overlay) return;

    // Replenish buffer if low (1 or 0 questions left)
    if (this.state.questionBuffer.length <= 1) {
      await this.generateQuestions();
    }

    if (this.state.questionBuffer.length === 0) {
      document.getElementById("gate-question").textContent = "Generating a challenge... Please wait.";
      await this.generateQuestions();
      if (this.state.questionBuffer.length === 0) {
        document.getElementById("gate-question").textContent = "Error loading questions. Try again.";
        return;
      }
    }

    const qData = this.state.questionBuffer.shift();
    this.state.currentQuestion = qData.question;
    this.state.currentAnswer = qData.answer;
    this.state.usedQuestions.push(qData.question);

    overlay.style.display = "flex";
    document.getElementById("gate-question").textContent = this.state.currentQuestion;
    document.getElementById("gate-answer").value = "";
    document.getElementById("gate-feedback").textContent = "";
  }

  async handleSubmitAnswer() {
    const userAnswer = document.getElementById("gate-answer").value.trim();
    const feedback = document.getElementById("gate-feedback");
    if (!userAnswer) return;

    feedback.textContent = "Validating...";

    try {
      const prompt = `
You are an answer validator. 
Question: ${this.state.currentQuestion}
Correct Answer: ${this.state.currentAnswer}
Student Answer: ${userAnswer}

Is the student's answer correct? Respond ONLY with a JSON object: {"correct": true/false}
`;
      const response = await client.chat.completions.create({
        model: "gemma-4-31b-it",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" }
      });
  
      const data = this.parseAIResponse(response.choices[0].message.content);
  
      if (data.correct) {
        feedback.textContent = "✅ Correct! Next video unlocked.";
        feedback.style.color = "var(--color-correct)";
        
        // Change video and unlock
        this.state.currentVideoIdx++;
        this.updateVideo();
        
        setTimeout(() => this.unlockScrollTemporarily(), 1000);
      } else {
        feedback.textContent = "❌ Not quite. Try again to unlock the feed.";
        feedback.style.color = "var(--color-wrong)";
      }
    } catch (e) {
      console.error("Validation failed, attempting fallback:", e);
      if (this.state.currentAnswer && userAnswer.toLowerCase() === this.state.currentAnswer.toLowerCase()) {
        feedback.textContent = "✅ Correct (Fallback)! Next video unlocked.";
        feedback.style.color = "var(--color-correct)";
        this.state.currentVideoIdx++;
        this.updateVideo();
        setTimeout(() => this.unlockScrollTemporarily(), 1000);
      } else {
        feedback.textContent = "❌ Not quite. Try again to unlock the feed.";
        feedback.style.color = "var(--color-wrong)";
      }
    }
  }

  unlockScrollTemporarily() {
    this.state.scrollLocked = false;
    document.getElementById("learning-gate-overlay").style.display = "none";

    if (this.state.unlockTimer) clearTimeout(this.state.unlockTimer);
    
    this.state.unlockTimer = setTimeout(() => {
      this.state.scrollLocked = true;
      this.triggerQuestion();
    }, 15000);
  }
}

