# BloomCycle

BloomCycle is a mobile-first React app for privately tracking periods, estimated ovulation, fertility windows, symptoms, mood, flow, notes, and body signals.

## Features

- Dashboard with cycle day, next expected period, estimated ovulation, and fertile window
- Calendar visualization for period and fertility estimates
- Symptom, mood, flow, and notes tracking
- Body Signal Journal for cramps, cravings, sleep, energy, acne, headache, mood, and stress
- Daily care check-in for water, sleep, medication completion, mood, symptoms, flow, and notes
- Today's Body Insight and phase-based self-care suggestions
- Cycle Confidence Score and Cycle Signature
- Cycle analytics for average length, regularity, mood, symptoms, sleep, and water
- Browser reminders for estimated periods and user-entered medication schedules
- PDF cycle and care reports
- Optional per-account cloud backup and restore
- Copyable partner or gynecologist summary using patient details
- Private Mode for less sensitive on-screen wording
- Email, username, and password registration
- Password reset links delivered by email
- Browser-only cycle data storage

## Technology

- React 19
- Vite 7
- CSS
- Browser localStorage for cycle records
- Firebase Authentication for accounts and password-reset email

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173/`.

## Configure Email Authentication

1. Create a project in the [Firebase console](https://console.firebase.google.com/).
2. Add a Web app to the Firebase project.
3. In **Authentication > Sign-in method**, enable **Email/Password**.
4. Create a Cloud Firestore database.
5. Copy `.env.example` to `.env`.
6. Replace the example values with the Web app configuration from Firebase.
7. Publish the included `firestore.rules` in the Firebase console, or deploy them with Firebase CLI.
8. Restart `npm run dev` after changing `.env`.

```env
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_APP_ID=your_firebase_app_id
```

The `.env` file is ignored by Git and must not be committed.

The included Firestore rules allow each authenticated user to access only documents below their own user ID. Do not enable open development rules for production.

## Production Build

```bash
npm run build
```

## Privacy and Security

Firebase Authentication manages account passwords, login sessions, and reset emails. Cycle records remain local unless the user enables or manually starts cloud backup. Cloud documents are stored beneath the authenticated user's Firebase UID and must be protected by the included Firestore rules.

Browser reminders work while BloomCycle is open. Reliable closed-app reminders require a deployed push-notification service and explicit user permission.

## Medical Disclaimer

This app is for tracking and educational purposes only. It should not replace medical advice. Cycle, ovulation, and fertile-window dates are estimates.

## Documentation

See [HOW_BLOOMCYCLE_WAS_BUILT.md](HOW_BLOOMCYCLE_WAS_BUILT.md) for the complete coding guide. A Microsoft Word version is also included.

## Acknowledgements

BloomCycle was designed and developed by **Agatha Nweze**.

Throughout the development process, **ChatGPT (OpenAI)** provided guidance on software architecture, debugging, Firebase integration, deployment with Vercel, troubleshooting, and general development best practices. The application design, implementation, testing, and final technical decisions were completed by the project author.

This project also reflects a personal learning journey in React, Firebase, GitHub, Vercel, and modern web application development.
