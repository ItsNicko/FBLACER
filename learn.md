# Learn FBLACER: a simple guide for beginners

_aka “so you wanna poke the code?”_

This is a **simple** guide to how FBLACER works and how you can improve it, break it, or duct-tape new stuff into it.

---

## Who is this for?

- If you're like me and enjoy making little interactive apps and experiences
- If you want to understand the brain (JavaScript) behind this thing
- By the end you should know the _ins and outs_ of the app and how to tweak stuff without crying

---

## What you'll learn (short + painless)

- How HTML, CSS, and JavaScript tag-team to make the app work
- How the app handles authentication and the user dashboard
- How the test engine loads questions, checks answers, and counts points
- How Firebase powers leaderboards and user progress
- How the AI Tutor uses subject-specific context to help you learn

---

## Friendly glossary (non-boring edition)

- **Fetch** -> basically “yo browser, grab that file.”
- **DOM** -> the live Lego version of your webpage. JS rearranges the bricks.
- **Event listener** -> code that waits for you to _do something_ and then reacts.
- **LocalStorage** -> tiny browser memory so the app remembers you.
- **Firebase** -> Cloud database that saves your scores, profiles, and logs.
- **HTML** -> the skeleton.
- **CSS** -> the drip / outfit. (_Remove it and the site looks like it's straight out of 2004._)
- **JavaScript** -> the nervous system controlling everything.
- **AI Context** -> "Cheat sheets" in text format that tell the AI how to act for a specific subject.

---

## What happens when you open the app?

1. **Landing**: Browser loads `index.html`.
2. **Entry**: You head to `auth.html` to sign in or create a profile.
3. **The Hub**: You land on `dashboard/index.html`. This is where the magic happens.
4. **Loading**: The dashboard pulls in several JS modules (UI, DB, Auth, Main) to set everything up.
5. **Studying**: You pick a test -> `dashboard/test-engine.js` fetches the JSON file from `questions/`.
6. **Testing**: You answer questions (or press **1–4** because you’re fast) and the engine tracks your streak.
7. **Victory**: End of test -> your score is sent to Firebase -> you get bragging rights on the leaderboard.

---

## Files you should know

- **`index.html` / `auth.html` / `exam.html`** -> The different "views" of the app.
- **`style.css`** -> themes + vibe.
- **`firebase-config.js`** -> The keys to the kingdom (Firebase connection).
- **`dashboard/`** -> The heart of the app.
    - `main.js` -> The conductor; wires everything together.
    - `ui.js` -> Manages the visuals and buttons of the dashboard.
    - `db.js` -> The bridge to Firestore (saving/loading data).
    - `auth.js` -> Handles login, logout, and session checks.
    - `test-engine.js` -> The logic for running quizzes and calculating scores.
- **`questions/*.json`** -> The actual test content.
- **`AI-Context/*.txt`** -> Knowledge bases for the AI Tutor.
- **`firebase.rules`** -> Rules that stop you from hacking me (go ahead anyway).

---

## The Modular Brain (The Dashboard)

Unlike the old version, FBLACER is now modular. Instead of one giant `script.js`, the work is split up:

### 1. The UI Manager (`ui.js`)
Handles all the DOM manipulation. Want to change how a button looks when clicked? Look here.

### 2. The Data Bridge (`db.js`)
Everything that touches Firebase (writing scores, reading profiles) happens here. It uses `async/await` because the internet is slower than your brain.

### 3. The Test Engine (`test-engine.js`)
This is where the game logic lives:
- `startTest()` -> Resets the state and loads questions.
- `generateFlashcard()` -> Builds the card UI.
- `handleAnswer()` -> Checks if you're right, updates streaks, and gives dopamine.

### 4. AI Tutor & Context
The AI doesn't just "know" everything—it's fed context from the `AI-Context/` folder. When you study "Accounting," the app sends the contents of `Accounting.txt` to the AI so it doesn't start talking about baking cakes.

---

## Simple edits (starter hacks)

### 1. Change the "Vibe"
In `style.css`, find the CSS variables (like `--accent`). Change the hex code to your favorite color. Just don't pick neon green unless you hate your eyes.

### 2. Add a new Quiz
1. Create a JSON file in `questions/` (e.g., `my-quiz.json`).
2. Follow the format: `question`, `options` (array), and `correctAnswer`.
3. Add it to `dashboard/tests.json` so the app knows it exists.

### 3. Teach the AI something new
Open any file in `AI-Context/`. Add new facts, common pitfalls, or a specific way of explaining things. The AI Tutor will pick it up immediately.

### 4. Create a "Secure Exam"
Check out `exam.html` and `dashboard/secure-exam.js`. This is a stripped-down version of the engine meant for focused testing without the dashboard distractions.

---

## Mini Project Challenge: Build a Subject

1. **The Content**: Create `questions/your-subject.json` with 10 questions.
2. **The Brain**: Create `AI-Context/your-subject.txt` with a summary of the key concepts.
3. **The Registration**: Add your subject to `dashboard/tests.json`.
4. **The Test**: Open the app, find your subject, and see if the AI Tutor can help you pass your own test.

---

## Final tips
- Use `console.log()`—it's like a flashlight when you're lost in the code.
- Make one small change -> refresh -> repeat.
- If something breaks, **Right Click -> Inspect -> Console** is your best friend.
