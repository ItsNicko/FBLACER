# Learn FBLACER: a simple guide for beginners

_aka “so you wanna poke the code?”_

This is a **simple**, guide to how FBLACER works and how you can improve it, break it, or duct-tape new stuff into it.

---

## Who is this for?

- If you're like me and enjoy making little interactive apps and experiences
- If you want to understand the brain (JavaScript) behind this thing
- By the end you should know the _ins and outs_ of the app and how to tweak stuff without crying

---

## What you'll learn (short + painless)

- How HTML, CSS, and JavaScript all tag-team to make the page work
- How the app loads questions, checks answers, and counts points
- How Firebase can save scores + power leaderboards (optional but cool)

---

## Friendly glossary (non-boring edition)

- **Fetch** -> basically “yo browser, grab that file.”
- **DOM** -> the live Lego version of your webpage. JS rearranges the bricks.
- **Event listener** -> code that waits for you to _do something_ and then reacts.
- **LocalStorage** -> tiny browser memory so the app remembers stuff like your username and if your logged in.
- **Firebase** -> Cloud database that saves your scores, logs, profiles, etc.
- **HTML** -> the skeleton for the rest of the app.
- **CSS** -> the drip / outfit. (_Remove it and the site looks like its straight out of 2004._)
- **JavaScript** -> the nervous system controlling everything.

---

## What happens when you open the app?

1. Browser loads `index.html`. (the skeleton)
2. Loads `style.css`. (the fit)
3. Loads `script.js`. (the brain)
4. JS reads `tests.json` to see what quizzes exist
5. You pick a test -> the app fetches that quiz’s file from `questions/`
6. It shows you one flashcard at a time.
7. You click an answer (or press **1–4** because you’re fast like that)
8. Score updates -> streak changes -> dopamine increases
9. End of test -> you get a summary + chart + bragging rights

---

## Files you should know

- **`index.html`** -> main page structure
- **`style.css`** -> themes + vibe
- **`script.js`** -> everything that makes the app actually _work_
- **`tests.json`** -> list of available tests
- **`questions/*.json`** -> actual test content
- **`firebase.rules`** -> rules that stop you from hacking me (go ahead anyway)

---

## Important parts of `script.js` (quick tour)

### 1. Global state

_The app’s temporary memory._  
Variables like `questions`, `progress`, `streak`, `scores`, etc. Changing these = changing how the game behaves.

### 2. Username checks

- `isCleanUsername()` -> blocks bad words
- `isValidFormat()` -> makes sure the name isn’t “xX\_{malicious-code}\_Xx”
- `isUsernameTaken()` -> optional Firebase check

### 3. Auth UI helpers

UI updates when you sign in / out.  
Want to spy on it? Add this in `setAuthStatus()`:

```javascript
console.log("auth updated", msg);
```

### 4. Logging + profile lookup

Stores logs in Firestore and console.
When you click someone in the leaderboard, it tries to find their profile.

### 5. DOM wiring + settings

Handles dark mode, settings menu, report button, etc.
Dark mode is just a .dark class toggled on <html> you can change the colors.

### 6. Test list system

Loads tests.json -> builds dropdown -> creates a custom searchable selector.

### 7. The Test Lifecycle (the good stuff)

This is where the magic happens:

`startTest()` -> loads questions + resets everything

`shuffleArray()` -> randomizes stuff

`generateFlashcard()` -> builds the card UI

Shows answers

Handles clicks

Gives points, fixes your streak

Moves on to the next card

Very dopamine

### 8. Scoring

`handleCorrect()` and `handleWrong()` do all the logic.

### 9. Keyboard shortcuts

1–4 = answer the corresponding option. Faster than clicking.

### 10. Ending tests

endTest() -> summary page
saveScoreToFirestore() -> leaderboard + analytics saving.

### 11. Leaderboard UI

Modal overlay that shows top scores and lets you submit your name.

### 12. Analytics + charts

Draws a radial chart using canvas.
Looks fancy. Feels legit.

Simple edits (starter hacks)

#### 1. Change the title

Open index.html -> edit:

```html
<h1>FBLACER</h1>
```

Make it “I hate math” or whatever.

#### 2. Change button colors

In `style.css`, find:

```css
--accent: #ff5722;
```

Replace with your favorite color don't pick neon green unless you hate your eyes.

#### 3. Add a question

Open any quiz file in `questions/`.
Add:

```json
{
  "question": "Why is JavaScript like this?",
  "options": ["Because", "It just is", "Ask Brendan Eich", "Yes"],
  "correctAnswer": "Yes"
}
```

#### 4. Keyboard answers

Already built in. Just flex with 1–4.

### Mini Project Challenge

Make your first quiz.

1. Copy any quiz file

2. Name it my-first-quiz.json

3. Add it to tests.json

4. Fill with 5 questions

5. Profit

Extra ideas (easy -> hard)

Add images to questions

Add timers

Add local-only leaderboards

Tiny code example: add image support

```javascript
if (q.image) {
  const img = document.createElement("img");
  img.src = q.image;
  img.style.maxWidth = "100%";
  img.style.marginTop = "10px";
  card.insertBefore(img, optionsList);
}
```

Final tips
Use `console.log()` feels like a flashlight when you’re lost

Make one small change -> refresh -> repeat

If something breaks, check DevTools
