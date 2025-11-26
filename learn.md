# Learn FBLACER: a simple guide for beginners

This is a simple guide to how FBLACER works and how you can minrove it or add on to it

Who is this for

- If your like me and like to make interactive apps and experinces
- By the end you will learn the ins and outs of this web app mainly the JavaScript and how to make minor tweaks

What you'll learn (short)

- How HTML, CSS, and JavaScript work together.
- How this shows questions, checks answers, and keeps score.
- How it can connect to Firebase (a backend) to save scores and show leaderboards.

Friendly glossary

- Fetch: a way to load files (like reading a text file) from the web folder.
- DOM: the Document Object Model - the browser's representation of the page. JavaScript changes the DOM to show questions.
- Event listener: code that waits for something (like a click) and then runs.
- Local storage: a small place in your browser where the app can save settings like your username.
- Firebase: a service that can store data on the internet. This app can use it to save scores and profiles.

- HTML - the structure. Think of it like the bones of a page. `index.html` holds the buttons, the place where questions show up, and links to the code and styles.
- CSS - the looks. `style.css` decides colors, fonts, spacing, and how things look on phones and computers lots like clothes the website look obsean with out it (you can test it by removing it from <head> in `index.html`).
- JavaScript - the behavior. `script.js` makes the app interactive: it chooses questions, listens for clicks, checks answers, updates scores, and shows charts more like a nervous sytyem dictacts where eveything goes and how it does it.

What happens when you open the app?

1. Your browser loads `index.html`.
2. `index.html` loads `style.css` (so everything looks nice) and `script.js` (so it works).
3. `script.js` reads `tests.json` to find the available quizzes.
4. When you pick a quiz and press Start, the app fetches that quiz file from the `questions/` folder.
5. The app shows one flashcard (question) at a time with multiple choices. Click an answer or press number keys 1–4.
6. The app checks your answer, updates points and streaks, and moves to the next question.
7. At the end, the app shows your score and a chart of topic performance. You can submit your score to a leaderboard if configured.

Files you should know

- `index.html` - main page. Look here to see where the quiz area and buttons live.
- `style.css` - all the styles. Change colors here to customize the look.
- `script.js` - the app logic. This is the brain: loading tests, handling clicks, scoring.
- `tests.json` - tells the app which tests exist and where to find them.
- `questions/*.json` - the actual tests. Each file contains topics, questions, options, and the correct answer.
- `firebase.rules` - rules if you'd like to try and hack me.

Important parts of `script.js`

- Loading tests: the script calls `fetch('tests.json')` to learn which quizzes exist.
- Starting a test: `startTest()` fetches the selected quiz file and builds a `questions` list.
- Showing a card: `generateFlashcard()` creates the HTML for the current question and its answers.
- Answering: when you click an option, the code checks `if (option === q.correctAnswer)` and marks it correct or incorrect.
- Scoring: `handleCorrect()` and `handleWrong()` update points and streaks. Points increase more if you are on a streak.
- End of test: `endTest()` shows a summary, draws a topic chart, and offers to send the score to the leaderboard.

Simple edits

1. Change the title shown on the page

- Open `index.html` and find `<h1>FBLACER</h1>`.
- Change `FBLACER` to your name or to something fun like `i dont like math`.
- Save and refresh the page. You should see the new title.

2. Change button colors

- Open `style.css` and search for `--accent` near the top inside `:root`.
- Change the hex color (for example, `--accent: #ff5722;`) and refresh the page.

3. Add a new question to a test

- Open `questions/<some-test>.json` (pick a file listed in `tests.json`).
- Add a new question in the `topics` area with these fields:
  - `question`: the question text
  - `options`: 3–5 answers
  - `correctAnswer`: exactly the answer that is correct
  - `explanation`: (optional) text shown after a wrong answer
- Save, reload the app, pick the test, and start.

4. Make the app read keyboard presses for answers

- Tip: pressing keys `1`, `2`, `3`, `4` will choose that option while a card is visible. Try it out.

Build a tiny challenge (project)

Goal: Create a mini test with 5 questions about anything you like (movies, math facts, animals).

Steps:

1. Create a copy of an existing file inside `questions/` and name it `my-first-quiz.json`.
2. Edit `tests.json` to add your quiz so it appears in the menu. Example:

```json
{
  "testName": "My First Quiz",
  "path": "questions/my-first-quiz.json"
}
```

3. Fill `my-first-quiz.json` with topics and 5 questions (look at other question files for structure).
4. Open the app, pick "My First Quiz" and try it

Extra ideas (easy to super hard)

- Add images to questions: modify `generateFlashcard()` to create an `<img>` element if the question object has an `image` field.
- Add a timer to questions: let the player see a countdown for each card. You'll need to add a little `setInterval()` in `generateFlashcard()`.
- Save high scores to a local file: for offline fun, store top scores in `localStorage` and show a local leaderboard.
  Safety and sharing tips

- If you add your own FireBase, be careful sharing API keys publicly. For this app the Firebase config is in `index.html` for convenience; on a real project you'd keep secrets out of source files.

What I recommend doing first

1. Open the app in your browser and try a test.
2. Follow exercise #1 and change the title.
3. Follow exercise #3 and add one new question to a test.

Congratulations - you're on your way to building interactive web apps!

## Deep dive: read and understand `script.js`

This section walks through the important parts of `script.js` so you can follow the code while you look at it.

Overview (one-sentence): script.js is the brain of the app - it loads quizzes, shows flashcards, handles clicks and keyboard answers, keeps scores and stats, and talks to Firebase when available.

1. Global state (top of the file)

- Variables like `tests`, `currentTest`, `questions`, `progress` and `scores` hold the app's current data while you take a test.
- `totalPoints`, `streak`, `loseStreak`, `firstAttempt` track scoring and player state.
- `testMetrics` collects timing and per-question data used for analytics.

Why this matters: Think of these as the app's memory while a test runs. If you change them, you change the game's behavior.

2. Username checks and helpers

- `isCleanUsername(name)` - checks a name against a `bannedWords` list (if present). It blocks obvious bad words and simple obfuscations.
- `isValidFormat(name)` - enforces that usernames are 3–20 chars long and only letters/numbers/underscore.
- `isUsernameTaken(name)` - optionally checks Firestore to see if a name is already used (only works when Firebase helpers are available).

Why this matters: These functions make name submission safe and polite. You can change the regex in `isValidFormat` to allow different characters.

3. Authentication UI helpers

- `setAuthStatus(msg, showLogout)` updates the small status text and hides or shows login/signup controls.
- `applyAuthUsername(username)` writes the username into input boxes and makes them read-only when signed in.
- `refreshAuthUi()` reads cached username and Firebase user data to keep the UI in sync.

Try it: find `setAuthStatus` in the file and add a console.log at the top (for learning): `console.log('setAuthStatus called', msg, showLogout);` - save and refresh to see logs when signing in/out.

4. Logging and profile resolution

- `writeLog(action, context)` attempts to write simple logs into Firestore `logs/` or falls back to console.debug.
- `resolveProfileUid(clickedName)` tries several methods to turn a public name into a user id (uid). It checks a `usernames` document, looks like-a-uid heuristics, and queries users/accounts if necessary.

Why this matters: When someone clicks a name on the leaderboard, the app uses these helpers to try to open a public profile.

5. DOM wiring and settings modal

- Early `DOMContentLoaded` handlers wire up signup/login/logout buttons, settings modal, dark-mode toggle, and the report submission button.
- `setDarkMode(on)` toggles the `.dark` CSS class on `<html>` and saves the preference to `localStorage` so it remembers your choice.

Tip: Search the file for `settingsBtn` to see how the settings overlay opens.

6. Test list and custom select

- `fetch('tests.json')` reads the tests list and calls `populateTestDropdown()`.
- `populateTestDropdown()` creates a native `<select>` and calls `initCustomSelect()` to replace it with a nicer searchable dropdown.
- `initCustomSelect()` builds the custom menu, search box, and keyboard/ARIA behaviors.

Why this matters: If you want to add a new quiz so people can pick it, edit `tests.json` (the UI reads that file).

7. Test lifecycle (most important for learners)

- `startTest()` is called when the user hits Start. It:
  - Reads the selected test's JSON file (via `fetch`)
  - Builds the `questions` array by flattening topics
  - Resets scores and UI state
  - Hides the selector and starts the test by calling `generateFlashcard()`
- `shuffleArray(arr)` is a small helper that randomizes the question order (Fisher–Yates shuffle).
- `generateFlashcard()` shows the next question on screen. It:
  - Removes previous card UI and picks `q = questions.shift()` (the next question)
  - Shuffles the options and updates `q.correctAnswer` to the shuffled value
  - Increments progress and records a start timestamp
  - Builds DOM nodes for the question, options, and explanation
  - Attaches `onclick` handlers to each option that:
    - record timings into `testMetrics`
    - call `handleCorrect(topic)` or `handleWrong(topic)`
    - show feedback (coloring, explanation)
    - schedule the next flashcard with a short delay when correct

Why this matters: `generateFlashcard()` is the core of the interactive experience. If you change how options are rendered or how clicks are handled, you control the whole test UX.

8. Scoring functions

- `handleCorrect(topic)` updates `scores.topics[topic]`, increments `streak`, awards points (more points for longer streaks), and shows a floating points animation.
- `handleWrong(topic)` increments totals, resets the streak, subtracts points (with an increasing penalty for repeated wrong answers), and shows negative floating points.
- `updateStats()` writes the live points/streak/progress values back into the small UI elements.

Exercise: try increasing the base points by changing `const pts = Math.round(100 + 100 * streak * 0.15);` to a larger number. See how it changes game feel.

9. Keyboard shortcuts

- There's a document-level `keydown` handler that listens for keys `1`–`4` and simulates clicking the corresponding option. This makes faster answering possible.

10. Ending and saving

- `endTest()` builds the results page, computes per-topic percentages and weights, shows a chart with `createTopicChart()` and offers buttons to start a new test or send to the leaderboard.
- `confirmEndTest()` shows a confirmation modal and will call `saveScoreToFirestore()` if the user is signed in.
- `saveScoreToFirestore()` does several things when a user is logged in:
  - saves `users/{uid}/scores/{testId}` with total points
  - saves `users/{uid}/topics/{testId}` with per-topic counts and average times
  - attempts to persist full analytics and mirror summary data to `accounts/{uid}`

Note: `saveScoreToFirestore()` returns `true` on success and `false` on critical failures. The UI uses this to prevent ending the test if saving failed for signed-in users.

11. Leaderboard UI

- `showLeaderboardOverlay(testId)` creates a modal UI to display the leaderboard and lets the user submit a name and score.
- The leaderboard uses `window.leaderboardApi` helpers provided by `index.html` to `submitScore` or `fetchTopScores`. Those helpers are thin wrappers around Firestore `addDoc`/`getDocs` when Firebase is configured.

12. Analytics and charts

- `createTopicChart()` prepares a `scoresObj` and calls `renderAleksChart()` (a custom canvas renderer included in `script.js`) to draw a radial topic chart.
- `showAnalyticsOverlay(testId)` shows saved analytics for a signed-in user, including topic bars, sample question timings, and a line chart comparing user vs global averages.

13. Utilities and UI niceties

- `showToast(message, kind)` shows small growl notifications.
- `showProfileOverlay(uid)` and `showUserScoresOverlay(uid)` create profile and saved-score modals.
- `escapeHtml()` is used when rendering user-supplied text to avoid breaking the page.

Where to make simple changes (practical pointers)

- To change scoring: edit `handleCorrect` and `handleWrong`.
- To change how many options are allowed: edit `generateFlashcard()` (the code assumes options are in `q.options`).
- To add images to questions: add an `image` field to question objects and modify `generateFlashcard()` to create an `<img>` if present (look for where `questionDiv` is created).
- To change the delay between questions: edit the `setTimeout` value near the end of the correct-answer branch in `generateFlashcard()` (currently 800 ms).

Beginner-friendly small projects you can try (concrete)

1. Add a per-question timer: in `generateFlashcard()` create a countdown shown on the card and end the question when it reaches 0. Use `setInterval()` and `clearInterval()`.
2. Save a local-history of top 5 scores using `localStorage` (without Firebase). Do this in `endTest()` before showing the chart.
3. Make questions show an image: add `"image": "questions/cats.jpg"` to a question and modify the flashcard DOM to include an `<img src="...">` under the question text.

One tiny code example - add image support (copy/paste into `generateFlashcard()` after `questionDiv` is created):

```javascript
if (q.image) {
  const img = document.createElement("img");
  img.src = q.image; // path relative to project root
  img.alt = "";
  img.style.maxWidth = "100%";
  img.style.borderRadius = "8px";
  img.style.marginTop = "10px";
  card.insertBefore(img, optionsList); // show before the options
}
```

Final tips

- Use console.log() a lot while you learn - it helps you see what's happening. For example, add `console.log('questions length', questions.length)` inside `startTest()` to check how many questions loaded.
- Make small edits and refresh often. If something breaks, use your browser DevTools (Console tab) to read errors and ask me about them.
