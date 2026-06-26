# How BloomCycle Was Built: Coding Guide

## 1. Project Overview

BloomCycle is a mobile-first React web app for tracking periods, estimated ovulation, fertility windows, symptoms, mood, flow, notes, and body signals.

The app is designed to be calm, private, beginner-friendly, and educational. It does not diagnose medical conditions. This disclaimer is displayed in the app:

> This app is for tracking and educational purposes only. It should not replace medical advice.

## 2. Technology Used

- React 19 builds the user interface.
- Vite 7 runs the development server and creates the production build.
- CSS provides the responsive layout and visual design.
- localStorage saves app data in the user's browser.
- The Web Crypto API hashes the local account password.
- No backend or external database is used in this version.

## 3. Project Location and Files

The Windows project is stored at:

```text
C:\Users\Agatha nweze\Documents\MY_CODING_WORK\BloomCycle
```

The main project files are:

```text
BloomCycle
|-- index.html
|-- package.json
|-- package-lock.json
|-- HOW_BLOOMCYCLE_WAS_BUILT.md
|-- src
|   |-- main.jsx
|   `-- styles.css
`-- dist
```

`src/main.jsx` contains the React components, state, calculations, authentication, and report generation. `src/styles.css` contains the mobile-first design and responsive rules.

## 4. Creating the React Project

The app uses these package scripts:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

React is mounted into the `root` element in `index.html`:

```jsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

createRoot(document.getElementById('root')).render(<Root />);
```

`Root` controls authentication. After a successful login, it renders the main `App` component.

## 5. Designing the Data Model

The application begins with a default data object. Keeping related values grouped makes state updates and localStorage loading easier.

```jsx
const defaultData = {
  profile: {
    lastPeriodStart: '',
    periodLength: 5,
    cycleLength: 28,
    privateMode: false
  },
  todayLog: {
    symptoms: [],
    mood: 'Calm',
    flow: 'None',
    notes: ''
  },
  journal: [],
  settings: {
    reminderEnabled: true,
    privacyName: 'Bloom',
    patientName: '',
    clinician: {
      patientName: '',
      phone: '',
      email: '',
      visitReason: ''
    },
    phaseNotes: {
      Period: '',
      Follicular: '',
      Ovulation: '',
      Luteal: ''
    }
  }
};
```

The gynecologist section stores patient information, not the doctor's information. Age is not requested.

## 6. Saving Data With localStorage

Three storage keys separate tracking data, login credentials, and the current session:

```jsx
const STORAGE_KEY = 'bloomcycle-data-v1';
const AUTH_KEY = 'bloomcycle-auth-v1';
const SESSION_KEY = 'bloomcycle-session-v1';
```

The initial React state is loaded from the browser:

```jsx
const [data, setData] = useState(loadStoredData);
```

Whenever `data` changes, `useEffect` saves it:

```jsx
useEffect(() => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}, [data]);
```

The loader merges saved values with the default structure. This is important because a newer app version may add fields that do not exist in older saved data.

```jsx
function loadStoredData() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return defaultData;

    const parsed = JSON.parse(stored);
    return {
      ...defaultData,
      ...parsed,
      profile: { ...defaultData.profile, ...parsed.profile },
      todayLog: { ...defaultData.todayLog, ...parsed.todayLog }
    };
  } catch {
    return defaultData;
  }
}
```

Because there is no backend, data stays in the same browser. Clearing browser data can delete it, and it does not automatically sync to another device.

## 7. Updating React State

Nested state is updated immutably. This creates a new object so React knows that the screen needs to update.

```jsx
const updateProfile = (field, value) => {
  setData((current) => ({
    ...current,
    profile: { ...current.profile, [field]: value }
  }));
};
```

Symptoms use toggle logic. Selecting an existing symptom removes it; selecting a new one adds it.

```jsx
const toggleSymptom = (symptom) => {
  setData((current) => {
    const exists = current.todayLog.symptoms.includes(symptom);

    return {
      ...current,
      todayLog: {
        ...current.todayLog,
        symptoms: exists
          ? current.todayLog.symptoms.filter((item) => item !== symptom)
          : [...current.todayLog.symptoms, symptom]
      }
    };
  });
};
```

## 8. Cycle Prediction Calculations

The cycle calculator uses the last period start date, average cycle length, and period length.

```jsx
function getCycleStats(profile) {
  const start = parseLocalDate(profile.lastPeriodStart);
  const today = stripTime(new Date());
  const cycleLength = Number(profile.cycleLength) || 28;
  const periodLength = Number(profile.periodLength) || 5;

  if (!start) {
    return { ready: false, cycleDay: 0, phase: 'Setup' };
  }

  const elapsed = Math.max(0, daysBetween(start, today));
  const completedCycles = Math.floor(elapsed / cycleLength);
  const currentCycleStart = addDays(start, completedCycles * cycleLength);
  const cycleDay = daysBetween(currentCycleStart, today) + 1;
  const nextPeriod = addDays(currentCycleStart, cycleLength);
  const ovulation = addDays(nextPeriod, -14);
  const fertileStart = addDays(ovulation, -5);
  const fertileEnd = addDays(ovulation, 1);

  return {
    ready: true,
    cycleDay,
    nextPeriod,
    ovulation,
    fertileStart,
    fertileEnd,
    phase: getPhase(cycleDay, periodLength, cycleLength, ovulation, today)
  };
}
```

The formulas are:

```text
Next expected period = current cycle start + average cycle length
Estimated ovulation = next expected period - 14 days
Fertile window start = estimated ovulation - 5 days
Fertile window end = estimated ovulation + 1 day
Cycle day = days since current cycle start + 1
```

These values are estimates. Real cycles can vary, so the results are not medical advice or birth-control guidance.

## 9. Detecting the Cycle Phase

The app assigns a simple phase so it can show a relevant body insight.

```jsx
function getPhase(cycleDay, periodLength, cycleLength, ovulation, today) {
  if (cycleDay <= periodLength) return 'Period';
  if (Math.abs(daysBetween(today, ovulation)) <= 2) return 'Ovulation';
  if (cycleDay < Math.max(10, cycleLength - 16)) return 'Follicular';
  return 'Luteal';
}
```

`getInsight(phase)` and `getRitual(phase)` use the returned phase to select gentle educational text. They do not make a diagnosis.

## 10. Building the Calendar

The calendar creates one cell for every day of the current month. Each date is checked against estimated period, fertile, and ovulation dates.

```jsx
if (dayInCycle >= 1 && dayInCycle <= periodLength) type = 'period';
if (date >= cycleFertileStart && date <= cycleFertileEnd) type = 'fertile';
if (isoDate(date) === isoDate(cycleOvulation)) type = 'ovulation';
```

CSS classes use `type` to apply distinct colors. The current date also receives a `today` class.

## 11. Body Signal Journal

The journal records cramps, cravings, sleep, energy, acne, headache, mood, and stress. Each entry receives the current date.

```jsx
const saveJournalEntry = (entry) => {
  const stampedEntry = { ...entry, date: isoDate(new Date()) };

  setData((current) => ({
    ...current,
    journal: [
      stampedEntry,
      ...current.journal.filter((item) => item.date !== stampedEntry.date)
    ].slice(0, 30)
  }));
};
```

Only one entry per date is kept, and the journal is limited to the 30 most recent entries.

## 12. Cycle Confidence Score

The score communicates how much information is available for personalization.

```jsx
function getConfidenceScore(data) {
  let score = 0;
  if (data.profile.lastPeriodStart) score += 25;
  if (Number(data.profile.periodLength) > 0) score += 15;
  if (Number(data.profile.cycleLength) > 0) score += 15;
  score += Math.min(data.journal.length * 7, 35);

  if (
    data.todayLog.symptoms.length ||
    data.todayLog.notes ||
    data.todayLog.flow !== 'None'
  ) {
    score += 10;
  }

  return Math.min(score, 100);
}
```

This is a data-completeness score, not a medical accuracy percentage.

## 13. Registration and Password Security

The authentication screen supports registration, login, sign-out, and local account reset. Usernames must contain at least three characters, and passwords must contain at least eight characters.

The password is salted and hashed with PBKDF2 before being stored:

```jsx
async function createCredentials(username, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await hashPassword(password, salt);

  return {
    username,
    salt: arrayBufferToBase64(salt),
    hash
  };
}

async function hashPassword(password, salt) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: 150000,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );

  return arrayBufferToBase64(bits);
}
```

During login, the entered password is hashed with the stored salt and compared with the saved hash.

This protects the plain-text password from being stored, but it is local browser protection only. Production security requires a backend, HTTPS, server-side sessions, account recovery, database encryption, rate limiting, and security review.

## 14. Private Mode

Private Mode replaces sensitive words before displaying them on screen:

```jsx
const display = (text) => (
  data.profile.privateMode ? maskSensitive(text) : text
);

function maskSensitive(text) {
  return String(text)
    .replace(/period/gi, 'cycle')
    .replace(/ovulation/gi, 'signal')
    .replace(/fertile/gi, 'window')
    .replace(/symptoms/gi, 'signals')
    .replace(/doctor/gi, 'care');
}
```

This makes on-screen wording less obvious. It does not encrypt saved tracking data.

## 15. Gynecologist Summary

The contact section asks for:

- Patient name
- Patient phone
- Patient email
- Reason for visit

The app combines those fields with cycle information:

```jsx
function buildClinicianMessage(data, stats, currentUser = '') {
  const patientName =
    data.settings.clinician.patientName?.trim() ||
    data.settings.patientName?.trim() ||
    currentUser ||
    'Patient';

  return [
    'Hello,',
    '',
    'I am sharing a BloomCycle tracking summary for an appointment or care discussion.',
    `Patient name: ${patientName}`,
    `Patient phone: ${data.settings.clinician.phone || 'Not specified'}`,
    `Patient email: ${data.settings.clinician.email || 'Not specified'}`,
    `Reason for visit: ${data.settings.clinician.visitReason || 'Not specified'}`,
    '',
    buildSummary(data, stats, getConfidenceScore(data))
  ].join('\n');
}
```

The user can copy the report or open an email draft. No information is automatically sent to a gynecologist.

## 16. Navigation and Page Components

The app uses one active-page state instead of a routing library:

```jsx
const [activePage, setActivePage] = useState('dashboard');
```

The bottom navigation changes this value. React conditionally displays one of these components:

- `Dashboard`
- `CalendarPage`
- `LogPage`
- `InsightsPage`
- `SettingsPage`

This is suitable for the current small app. A larger production version could use React Router.

## 17. Mobile-First Styling

The CSS starts with narrow-screen rules and adds wider layouts through media queries. The main design choices are:

- Fixed bottom navigation for quick thumb access
- Responsive dashboard grids
- Large input controls and touch targets
- Blush, lavender, cream, sage, and deep-purple colors
- Rounded panels with restrained shadows
- Clear focus states and readable contrast

The custom BloomCycle logo is rendered by the reusable `BloomLogo` React component, so the same branding appears on the login screen and inside the app.

## 18. Running the App

Open PowerShell or Command Prompt and run:

```powershell
cd "C:\Users\Agatha nweze\Documents\MY_CODING_WORK\BloomCycle"
npm install
npm run dev
```

Then open:

```text
http://localhost:5173/
```

## 19. Creating a Production Build

Run:

```powershell
npm run build
```

Vite creates the production files in the `dist` folder. To test that build locally, run:

```powershell
npm run preview
```

## 20. Recommended Production Improvements

Before using BloomCycle as a real multi-device product, add:

1. A secure backend and encrypted database.
2. Proper account registration, password recovery, and session expiration.
3. HTTPS and server-side authorization.
4. Optional encrypted export and backup.
5. Accessibility and browser testing.
6. Unit tests for date calculations and authentication helpers.
7. Clear privacy policy and consent controls.
8. Clinical review of health-related educational wording.

## 21. Final Verification

The project is checked with:

```powershell
npm run build
```

A successful build confirms that the React code compiles and that Vite can create the deployable app files.
