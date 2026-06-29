export const testEngine = {
  tests: [],
  aiTests: [],
  currentTest: null,
  questions: [],
  userAnswers: {}, // index: selectedOption
  progress: { done: 0, total: 0 },
  scores: { topics: {} },
  totalPoints: 0,
  streak: 0,
  loseStreak: 0,
  firstAttempt: true,
  testRunning: false,
  endedEarly: false,
  currentIndex: 0,
  isFetchingAiQuestions: false,
  
  analytics: {
    startTime: null,
    endTime: null,
    questionTimings: [], // { topic, timeMs, correct }
  },
  
  async loadTests() {
    const res = await fetch("tests.json");
    const data = await res.json();
    this.tests = data.tests || [];
    return this.tests;
  },
  
  async loadAiTests() {
    const res = await fetch("ai-tests.json");
    const data = await res.json();
    this.aiTests = data.tests || [];
    return this.aiTests;
  },
  
  shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  },
  
  async startTest(selectedIndex, useAiTests = false, limit = null) {
    if (useAiTests) {
      const testMeta = this.aiTests[selectedIndex];
      if (!testMeta) return null;
      
      this.currentTest = { 
        testName: testMeta.testName,
        topics: [{ topic: testMeta.testName, questions: [] }] 
      };
      
      this.questions = [];
      this.userAnswers = {};
      this.currentIndex = 0;
      this.progress = { done: 0, total: limit || 10 };
      this.scores = { topics: {} };
      this.totalPoints = 0;
      this.streak = 0;
      this.loseStreak = 0;
      this.firstAttempt = true;
      this.endedEarly = false;
      this.testRunning = true;
      
      this.analytics = {
        startTime: Date.now(),
        endTime: null,
        questionTimings: [],
      };

      // Initial batch fetch
      await this.fetchAiQuestions();
      return this.currentTest;
    }

    const tests = this.tests;
    const selected = tests[selectedIndex];
    if (!selected?.path) return null;

    const res = await fetch(selected.path);
    if (!res.ok) return null;
    const fullTest = await res.json();
    this.currentTest = fullTest.testName ? fullTest : (fullTest.tests && fullTest.tests[0]) || null;
    
    if (!this.currentTest) return null;

    let allQuestions = this.currentTest.topics.flatMap((t) =>
      t.questions.map((q) => ({ ...q, topic: t.topic })),
    );
    this.shuffleArray(allQuestions);

    if (limit && limit < allQuestions.length) {
      allQuestions = allQuestions.slice(0, limit);
    }

    this.questions = allQuestions;
    this.userAnswers = {};
    this.currentIndex = 0;
    this.progress = { done: 0, total: this.questions.length };
    this.scores = { topics: {} };
    this.totalPoints = 0;
    this.streak = 0;
    this.loseStreak = 0;
    this.firstAttempt = true;
    this.endedEarly = false;
    this.testRunning = true;
    
    this.analytics = {
      startTime: Date.now(),
      endTime: null,
      questionTimings: [],
    };

    return this.currentTest;
  },

  async fetchAiQuestions() {
    if (!window.aiTutor || this.isFetchingAiQuestions) return;
    
    const currentCount = this.questions.length;
    const totalNeeded = this.progress.total;
    
    const bufferTarget = this.currentIndex + 5;
    const amountToFetch = Math.min(
      5, 
      Math.max(0, bufferTarget - currentCount)
    );

    if (amountToFetch <= 0) return;

    this.isFetchingAiQuestions = true;
    try {
      const questions = await window.aiTutor.generateQuestions({
        topic: this.currentTest.testName,
        difficulty: "balanced",
        count: amountToFetch,
        existingQuestions: this.questions
      });

      this.questions.push(...questions);
      console.log(`AI Tutor: Fetched ${questions.length} questions. Buffer now ${this.questions.length}.`);
    } finally {
      this.isFetchingAiQuestions = false;
    }
  },
  
  recordAnswer(index, option) {
    this.userAnswers[index] = option;
  },

  recordQuestionTime(topic, timeMs, correct) {
    this.analytics.questionTimings.push({ topic, timeMs, correct });
  },

  handleCorrect(topic) {
    if (!this.scores.topics[topic]) {
      this.scores.topics[topic] = { correct: 0, total: 0, firstAttemptCorrect: 0 };
    }
    this.scores.topics[topic].total++;
    this.scores.topics[topic].correct++;
    if (this.firstAttempt) {
      this.scores.topics[topic].firstAttemptCorrect++;
      this.streak++;
      this.loseStreak = 0;
      const pts = Math.round(100 + 100 * this.streak * 0.15);
      this.totalPoints += pts;
      return { pts, positive: true };
    } else {
      this.streak = 0;
      this.loseStreak = 0;
      return null;
    }
  },
  
  handleWrong(topic) {
    if (!this.scores.topics[topic]) {
      this.scores.topics[topic] = { correct: 0, total: 0, firstAttemptCorrect: 0 };
    }
    this.scores.topics[topic].total++;
    this.streak = 0;
    this.loseStreak++;
    const lost = Math.round(50 + 50 * this.loseStreak * 0.15);
    this.totalPoints = Math.max(0, this.totalPoints - lost);
    return { pts: lost, positive: false };
  },
  
  calculateFinalScore() {
    let points = 0;
    let streak = 0;
    let loseStreak = 0;
    const topicScores = {};

    this.questions.forEach((q, idx) => {
      const ans = this.userAnswers[idx];
      const isCorrect = ans === q.correctAnswer;
      const topic = q.topic;

      if (!topicScores[topic]) {
        topicScores[topic] = { correct: 0, total: 0, firstAttemptCorrect: 0 };
      }
      topicScores[topic].total++;

      if (isCorrect) {
        topicScores[topic].correct++;
        streak++;
        loseStreak = 0;
        points += Math.round(100 + 100 * streak * 0.15);
        topicScores[topic].firstAttemptCorrect++;
      } else {
        streak = 0;
        loseStreak++;
        points -= Math.round(50 + 50 * loseStreak * 0.15);
      }
    });

    this.totalPoints = Math.max(0, points);
    this.scores = { topics: topicScores };
    return this.totalPoints;
  },

  finalizeTest() {
    this.analytics.endTime = Date.now();
    if (Object.keys(this.userAnswers).length > 0) {
        this.calculateFinalScore();
    }
    return {
      totalTime: this.analytics.endTime - this.analytics.startTime,
      questionTimings: this.analytics.questionTimings,
      scores: this.scores,
      totalPoints: this.totalPoints
    };
  }
};
