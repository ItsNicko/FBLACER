# FBLACER

Lightweight client-side flashcards / quiz app with Firebase for leaderboards.

## Features

- Instant quizzes from local JSON
- Clean UI with light/dark mode
- Firebase auth (username-style)
- Leaderboards and public profiles
- Saved scores, topics, analytics
- Anonymous reports and logs

## Structure

- `index.html` — start up
- `script.js` — logic + UI
- `style.css` — styles + themes
- `tests.json` — test index file
- `questions/` — test question files
- `legal/` — privacy + terms (not formated)
- `firebase.rules` — Firestore rules (hack me)

## Firebase

- Auth
- `leaderboards/{testId}` — public scores
- `users/{uid}` — private data
- `usernames/{username}` — profile lookup
- `reports/` & `logs/` — anonymous feedback + telemetry
- Config lives in `index.html` (demo project)

## Editing Tests

- Add a JSON file in `questions/`
- Add it to `tests.json`
- The app pulls it automatically

## Notes

- Use HTTPS or localhost
- Review Firestore rules before production
- PRs welcome

## Want to learn more?

[here you go](./learn.md)
