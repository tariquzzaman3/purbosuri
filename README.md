# Purbosuri (পূর্বসূরি)

**প্রজন্মের স্মৃতি** — a free, Bengali-first family tree and family memories platform for Bangladesh and Bengali-speaking families worldwide.

- **Web:** https://purbosuri.web.app (not deployed yet)
- **Android package:** `app.purbosuri`
- **Firebase project ID:** `purbosuri`

## Status

Milestone 1 (foundation) is in progress. Nothing is deployed yet.

| Area | State |
| --- | --- |
| Firebase project settings | Done |
| Data model ([docs/DATA_MODEL.md](docs/DATA_MODEL.md)) | Written |
| Firestore security rules | Written, test results pending (see Actions tab) |
| Rules tests | Written, run automatically by GitHub Actions |
| Photo and media storage | Undecided. Firebase Storage needs a paid plan |
| Web app | Not started |
| Android app | Not started |

## Principles

- Every family tree is private by default.
- Sharing the app never shares a family tree.
- Free for families. No ads, no selling of family data.
- Families can export their data at any time.

## Security note

This repository is public. Never commit passwords, service-account keys or private
credentials. Secrets belong in GitHub Actions secrets or the Firebase console.
