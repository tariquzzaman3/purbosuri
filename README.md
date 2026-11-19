<div align="center">

<img src="web/public/icon-192.png" alt="Purbosuri logo" width="96" height="96" />

# Purbosuri · পূর্বসূরি

**প্রজন্মের স্মৃতি — a free, private, Bengali-first family tree and family memories app.**

For Bangladesh and Bengali-speaking families worldwide. No ads. No subscriptions. Your family data is never sold.

[![Web build](https://github.com/tariquzzaman3/purbosuri/actions/workflows/web-build.yml/badge.svg)](https://github.com/tariquzzaman3/purbosuri/actions/workflows/web-build.yml)
[![Rules tests](https://github.com/tariquzzaman3/purbosuri/actions/workflows/rules-tests.yml/badge.svg)](https://github.com/tariquzzaman3/purbosuri/actions/workflows/rules-tests.yml)

[**Open the app**](https://purbosuri.web.app) · [Data model](docs/DATA_MODEL.md) · [Report an issue](https://github.com/tariquzzaman3/purbosuri/issues)

</div>

> **Status:** early development. The web app is built; the hosted site and the Android app
> are not published yet. See [Project status](#project-status) for what works today.

## বাংলায় সংক্ষেপে

পূর্বসূরি একটি বিনামূল্যে, বিজ্ঞাপনহীন ও ব্যক্তিগত বাংলা বংশবৃক্ষ অ্যাপ। বংশধারা, ছবি, স্মৃতিচারণ আর
স্মরণীয় দিন এক জায়গায় সাজিয়ে রাখুন। প্রতিটি বংশবৃক্ষ ডিফল্টভাবে ব্যক্তিগত, আর অ্যাপ শেয়ার করলে আপনার
বংশবৃক্ষ শেয়ার হয় না।

## Features

- **Family tree and list.** See generations as a chart or an expandable list, with search.
- **Photos and stories.** Tag relatives in photos and link one story to several people.
- **Memorable days.** Birthdays, anniversaries and other dates, with reminders only for the ones you choose.
- **Corrections with family consent.** Members propose fixes, discuss them, and a reviewer decides. Every change is recorded.
- **Invitations with roles.** Invite relatives to one tree only, with expiring and revocable links.
- **Bengali first.** Bengali interface with an English option and Bengali-friendly fonts.
- **Installable.** Works in the browser and can be added to a phone's home screen.

## Principles

1. **Private by default.** Every family tree starts private.
2. **Sharing the app never shares a tree.** Inviting someone to a tree is a separate, explicit action.
3. **Free for families.** No ads, no paywalls, no selling of family data.
4. **You stay in control.** Export, correct and delete your information.
5. **Honest about limits.** Free hosting has storage limits, so exports exist from the start.

## Tech stack

| Area | Choice |
| --- | --- |
| Web app | React 18, TypeScript, Vite |
| Sign-in and database | Firebase Authentication, Cloud Firestore |
| Hosting | Firebase Hosting (free `*.web.app` address) |
| Security | Firestore security rules, tested against the Firebase emulator |
| Tests | Vitest |
| CI/CD | GitHub Actions |

## Project status

| Area | State |
| --- | --- |
| Data model ([docs/DATA_MODEL.md](docs/DATA_MODEL.md)) | Written |
| Firestore security rules and tests | Written, run by GitHub Actions |
| Web app | Built, not yet published |
| Search-engine basics (meta tags, sitemap, robots) | Done |
| Photo and media storage | Undecided. Firebase Storage needs a paid plan |
| Android app | Not started |

## Getting started

You need [Node.js](https://nodejs.org) 22 (the version used by CI).

```bash
git clone https://github.com/tariquzzaman3/purbosuri.git
cd purbosuri/web
npm install
npm run dev        # start the app locally
npm test           # run unit tests
npm run build      # type-check and build for production
```

To run the Firestore rules tests, from the repository root:

```bash
npm install
npm run test:rules
```

The app reads its Firebase settings from environment variables. Never commit credentials.

## Deployment

Pushing to `main` builds the web app and deploys it to Firebase Hosting through
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). The deploy step is skipped until the
`FIREBASE_SERVICE_ACCOUNT` secret is added in the repository's Actions settings.

## Search engines

The public landing page, privacy policy, terms and data-deletion page are indexable, with
`robots.txt`, `sitemap.xml`, structured data and social preview tags. Signed-in pages
(`/home`, `/join`) are sent with `X-Robots-Tag: noindex`, so private family pages never appear in
search results.

## Security

This repository is public. Never commit passwords, service-account keys or private credentials.
Keep secrets in GitHub Actions secrets or the Firebase console. To report a vulnerability, please
open a private security advisory on GitHub rather than a public issue.

## Contributing

Issues and pull requests are welcome, especially Bengali wording fixes and accessibility
improvements. Please keep changes small and include tests for access-control logic.

## License

No license has been chosen yet, so all rights are reserved by default. Add a `LICENSE` file to
allow others to reuse the code.
