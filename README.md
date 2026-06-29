# FBLACER

Lightweight client-side flashcards / quiz app with Firebase for leaderboards and a comprehensive study dashboard.

## Features

- **Instant Quizzes**: Run tests from local JSON banks.
- **Study Dashboard**: Analytics, study sets, and progress tracking.
- **AI-Powered Learning**: AI Tutor and specialized AI context for various business subjects.
- **Secure Exam Mode**: Dedicated environment for focused testing.
- **Competitive Edge**: Firebase-backed leaderboards and public profiles.
- **Theming**: Clean UI with light/dark mode support.
- **Backend Utilities**: Server-side scripts for content fetching.

## Structure

- `index.html` — Landing page
- `auth.html` — Authentication and login
- `exam.html` — Exam interface
- `dashboard/` — User dashboard (stats, study sets, AI tutor, games, etc.)
- `questions/` — JSON test question banks
- `AI-Context/` — Subject-specific context for AI features
- `server/` — Backend utility scripts (e.g., YouTube fetcher)
- `firebase-config.js` — Firebase configuration
- `style.css` — Global styles and themes
- `privacy.html` / `terms.html` — Legal documentation
- `learn.md` — Educational resources

## Firebase

- **Auth**: User authentication.
- **Firestore**:
  - `leaderboards/{testId}` — Public scores.
  - `users/{uid}` — Private user data and progress.
  - `usernames/{username}` — Profile lookups.
  - `reports/` & `logs/` — Feedback and telemetry.

## Editing Tests

- Add a JSON file in `questions/`.
- The app pulls available tests dynamically or via `dashboard/tests.json`.

## Notes

- Use HTTPS or localhost for Firebase Auth to work.
- Review Firestore rules in `firebase.rules` before production.
- PRs welcome.

## Want to learn more?

[here you go](./learn.md)
