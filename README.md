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
- Local username and password access
- Browser-only data storage with no backend

## Technology

- React 19
- Vite 7
- CSS
- Browser localStorage
- Web Crypto API with PBKDF2 password hashing

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173/`.

## Production Build

```bash
npm run build
```

## Privacy and Security

BloomCycle stores account and tracking information in the current browser. The password is salted and hashed, but this local-only version does not provide production-grade account security, encrypted cloud backup, password recovery, or cross-device synchronization.

## Medical Disclaimer

This app is for tracking and educational purposes only. It should not replace medical advice. Cycle, ovulation, and fertile-window dates are estimates.

## Documentation

See [HOW_BLOOMCYCLE_WAS_BUILT.md](HOW_BLOOMCYCLE_WAS_BUILT.md) for the complete coding guide. A Microsoft Word version is also included.
