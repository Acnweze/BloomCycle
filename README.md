# BloomCycle

BloomCycle is a mobile-first React app for privately tracking periods, estimated ovulation, fertility windows, symptoms, mood, flow, notes, and body signals.

## Features

- Dashboard with cycle day, next expected period, estimated ovulation, and fertile window
- Calendar visualization for period and fertility estimates
- Symptom, mood, flow, and notes tracking
- Body Signal Journal for cramps, cravings, sleep, energy, acne, headache, mood, and stress
- Today's Body Insight and phase-based self-care suggestions
- Cycle Confidence Score and Cycle Signature
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
4. Copy `.env.example` to `.env`.
5. Replace the example values with the Web app configuration from Firebase.
6. Restart `npm run dev` after changing `.env`.

```env
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_APP_ID=your_firebase_app_id
```

The `.env` file is ignored by Git and must not be committed.

## Production Build

```bash
npm run build
```

## Privacy and Security

Firebase Authentication manages account passwords, login sessions, and reset emails. BloomCycle cycle records remain in the current browser and are not synchronized across devices. Firebase Web configuration identifies the Firebase project; access must still be protected with Firebase Authentication settings and security rules.

## Medical Disclaimer

This app is for tracking and educational purposes only. It should not replace medical advice. Cycle, ovulation, and fertile-window dates are estimates.

## Documentation

See [HOW_BLOOMCYCLE_WAS_BUILT.md](HOW_BLOOMCYCLE_WAS_BUILT.md) for the complete coding guide. A Microsoft Word version is also included.
