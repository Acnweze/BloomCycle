import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  firebaseConfigured,
  getAuthMessage,
  loadCloudBackup,
  observeAuth,
  registerAccount,
  saveCloudBackup,
  sendResetEmail,
  signInAccount,
  signOutAccount
} from './firebase';
import { getCycleAnalytics } from './analytics';
import { checkDueReminders, getReminderPermission, requestReminderPermission } from './reminders';
import { exportCyclePdf } from './report';
import './styles.css';

const STORAGE_KEY = 'bloomcycle-data-v1';

const signalOptions = {
  cramps: ['None', 'Mild', 'Moderate', 'Strong'],
  cravings: ['None', 'Sweet', 'Salty', 'Carbs', 'Fresh foods'],
  sleep: ['Rested', 'Okay', 'Restless', 'Low sleep'],
  energy: ['High', 'Steady', 'Low', 'Drained'],
  acne: ['None', 'A little', 'Noticeable', 'Flare-up'],
  headache: ['None', 'Mild', 'Moderate', 'Strong'],
  mood: ['Calm', 'Tender', 'Focused', 'Irritable', 'Anxious', 'Bright'],
  stress: ['Low', 'Medium', 'High']
};

const defaultData = {
  profile: {
    lastPeriodStart: '',
    periodStarts: [],
    periodLength: 5,
    cycleLength: 28,
    privateMode: false
  },
  todayLog: {
    date: isoDate(new Date()),
    symptoms: [],
    mood: 'Calm',
    flow: 'None',
    notes: '',
    waterGlasses: 0,
    sleepHours: '',
    medicationTaken: []
  },
  journal: [],
  dailyLogs: [],
  pregnancy: {
    inputMethod: 'lmp',
    lmp: '',
    dueDate: '',
    weeklyNotes: []
  },
  settings: {
    reminderEnabled: true,
    periodReminderDays: 2,
    medications: [],
    cloudBackupEnabled: false,
    privacyName: 'Bloom',
    patientName: '',
    clinician: {
      name: '',
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

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: 'home' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'log', label: 'Log', icon: 'edit' },
  { id: 'pregnancy', label: 'Pregnancy', icon: 'baby' },
  { id: 'insights', label: 'Insights', icon: 'spark' },
  { id: 'settings', label: 'Settings', icon: 'settings' }
];

const symptoms = ['Cramps', 'Bloating', 'Tenderness', 'Headache', 'Acne', 'Backache', 'Cravings', 'Fatigue'];
const flowLevels = ['None', 'Spotting', 'Light', 'Medium', 'Heavy'];
const moods = ['Calm', 'Happy', 'Sensitive', 'Focused', 'Anxious', 'Irritable', 'Low energy'];

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function daysBetween(start, end) {
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.floor((stripTime(end) - stripTime(start)) / dayMs);
}

function stripTime(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatDate(date) {
  if (!date || Number.isNaN(date.getTime())) return 'Add start date';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function parseLocalDate(value) {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function getCycleStats(profile) {
  const start = parseLocalDate(profile.lastPeriodStart);
  const today = stripTime(new Date());
  const cycleLength = Number(profile.cycleLength) || 28;
  const periodLength = Number(profile.periodLength) || 5;

  if (!start) {
    return {
      ready: false,
      today,
      cycleDay: 0,
      phase: 'Setup',
      nextPeriod: null,
      ovulation: null,
      fertileStart: null,
      fertileEnd: null
    };
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
    today,
    currentCycleStart,
    cycleDay,
    nextPeriod,
    ovulation,
    fertileStart,
    fertileEnd,
    phase: getPhase(cycleDay, periodLength, cycleLength, ovulation, today)
  };
}

function getPhase(cycleDay, periodLength, cycleLength, ovulation, today) {
  if (cycleDay <= periodLength) return 'Period';
  if (Math.abs(daysBetween(today, ovulation)) <= 2) return 'Ovulation';
  if (cycleDay < Math.max(10, cycleLength - 16)) return 'Follicular';
  return 'Luteal';
}

function getInsight(phase) {
  const insights = {
    Setup: 'Add your recent cycle details to unlock gentle daily insights.',
    Period: 'Your body may appreciate warmth, hydration, lighter movement, and extra rest today.',
    Follicular: 'Energy often rises in this part of the cycle. It can be a good time for planning and steady movement.',
    Ovulation: 'You may notice more cervical fluid, energy, or social ease. Track signals without pressure.',
    Luteal: 'Consider steadier meals, sleep consistency, and a calmer task list as your body prepares for a new cycle.'
  };
  return insights[phase] || insights.Setup;
}

function getRitual(phase) {
  const rituals = {
    Setup: ['Set your baseline', 'Add your last start date and begin with one short body signal log.'],
    Period: ['Soft Landing', 'Heat, water, slower movement, and a simpler task list can support this phase.'],
    Follicular: ['Fresh Start', 'Use rising energy for planning, light strength work, or a creative reset.'],
    Ovulation: ['Clear Signal', 'Notice energy, skin, sleep, and connection patterns without treating estimates as exact.'],
    Luteal: ['Steady Rhythm', 'Prioritize steady meals, earlier rest, and reducing avoidable pressure.']
  };
  return rituals[phase] || rituals.Setup;
}

function getCycleSignature(data, stats) {
  const recent = data.journal.slice(0, 8);
  if (!stats.ready) {
    return {
      title: 'Baseline Builder',
      detail: 'BloomCycle will name your pattern after a few local logs.'
    };
  }

  const lowEnergy = recent.filter((entry) => ['Low', 'Drained'].includes(entry.energy)).length;
  const highStress = recent.filter((entry) => entry.stress === 'High').length;
  const restless = recent.filter((entry) => ['Restless', 'Low sleep'].includes(entry.sleep)).length;
  const strongBody = recent.filter((entry) =>
    ['Moderate', 'Strong'].includes(entry.cramps) || ['Moderate', 'Strong'].includes(entry.headache)
  ).length;

  if (recent.length < 3) {
    return {
      title: `${stats.phase} Explorer`,
      detail: 'A few more Body Signal Journal entries will make this signature more personal.'
    };
  }
  if (lowEnergy + restless >= 4) {
    return {
      title: 'Rest-Sensitive Rhythm',
      detail: 'Your recent logs suggest sleep and energy deserve extra attention this cycle.'
    };
  }
  if (highStress >= 3) {
    return {
      title: 'Stress-Aware Cycle',
      detail: 'Your pattern points toward protecting calm blocks and lighter expectations.'
    };
  }
  if (strongBody >= 3) {
    return {
      title: 'Body-First Pattern',
      detail: 'Cramps or headaches are showing up enough to track closely and discuss if needed.'
    };
  }
  return {
    title: 'Steady Signal Cycle',
    detail: 'Your recent entries look fairly balanced. Keep logging to confirm the pattern.'
  };
}

function getConfidenceScore(data) {
  let score = 0;
  if (data.profile.lastPeriodStart) score += 25;
  if (Number(data.profile.periodLength) > 0) score += 15;
  if (Number(data.profile.cycleLength) > 0) score += 15;
  score += Math.min(data.journal.length * 7, 35);
  if (data.todayLog.symptoms.length || data.todayLog.notes || data.todayLog.flow !== 'None') score += 10;
  return Math.min(score, 100);
}

function getUserStorageKey(userId) {
  return `${STORAGE_KEY}:${userId}`;
}

function normalizeData(parsed) {
  const savedTodayLog = { ...defaultData.todayLog, ...parsed?.todayLog };
  const todayLog = savedTodayLog.date === isoDate(new Date())
    ? savedTodayLog
    : { ...defaultData.todayLog, date: isoDate(new Date()) };

  return {
    ...defaultData,
    ...parsed,
    profile: {
      ...defaultData.profile,
      ...parsed?.profile,
      periodStarts: parsed?.profile?.periodStarts || []
    },
    todayLog,
    journal: parsed?.journal || [],
    dailyLogs: parsed?.dailyLogs || [],
    pregnancy: {
      ...defaultData.pregnancy,
      ...parsed?.pregnancy,
      weeklyNotes: parsed?.pregnancy?.weeklyNotes || []
    },
    settings: {
      ...defaultData.settings,
      ...parsed?.settings,
      medications: parsed?.settings?.medications || [],
      clinician: { ...defaultData.settings.clinician, ...parsed?.settings?.clinician },
      phaseNotes: { ...defaultData.settings.phaseNotes, ...parsed?.settings?.phaseNotes }
    }
  };
}

function loadStoredData(storageKey = STORAGE_KEY) {
  try {
    let stored = localStorage.getItem(storageKey);
    if (!stored && storageKey !== STORAGE_KEY) {
      stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        localStorage.setItem(storageKey, stored);
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    if (!stored) return defaultData;
    return normalizeData(JSON.parse(stored));
  } catch {
    return defaultData;
  }
}

function Root() {
  const [authChecked, setAuthChecked] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    return observeAuth((user) => {
      setCurrentUser(user ? {
        uid: user.uid,
        name: user.displayName || user.email?.split('@')[0] || 'Bloom user'
      } : null);
      setAuthChecked(true);
    });
  }, []);

  const handleAuthenticated = (user) => {
    setCurrentUser({
      uid: user.uid,
      name: user.displayName || user.email?.split('@')[0] || 'Bloom user'
    });
  };

  const handleSignOut = async () => signOutAccount();

  if (!authChecked) {
    return <div className="auth-shell"><div className="auth-card">Opening BloomCycle...</div></div>;
  }

  if (!currentUser) {
    return <AuthGate onAuthenticated={handleAuthenticated} />;
  }

  return <App key={currentUser.uid} currentUser={currentUser} onSignOut={handleSignOut} />;
}

function App({ currentUser, onSignOut }) {
  const [activePage, setActivePage] = useState('dashboard');
  const storageKey = getUserStorageKey(currentUser.uid);
  const [data, setData] = useState(() => loadStoredData(storageKey));
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [cloudStatus, setCloudStatus] = useState('Local only');
  const [notificationPermission, setNotificationPermission] = useState(getReminderPermission);
  const stats = useMemo(() => getCycleStats(data.profile), [data.profile]);
  const confidence = useMemo(() => getConfidenceScore(data), [data]);
  const signature = useMemo(() => getCycleSignature(data, stats), [data, stats]);
  const analytics = useMemo(() => getCycleAnalytics(data), [data]);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(data));
  }, [data, storageKey]);

  useEffect(() => {
    checkDueReminders(data, stats);
    const reminderTimer = setInterval(() => checkDueReminders(data, stats), 30000);
    return () => clearInterval(reminderTimer);
  }, [data, stats]);

  useEffect(() => {
    if (!data.settings.cloudBackupEnabled) return undefined;
    setCloudStatus('Saving...');
    const cloudTimer = setTimeout(async () => {
      try {
        await saveCloudBackup(currentUser.uid, data);
        setCloudStatus(`Synced ${new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(new Date())}`);
      } catch {
        setCloudStatus('Cloud unavailable');
      }
    }, 1200);
    return () => clearTimeout(cloudTimer);
  }, [currentUser.uid, data]);

  const updateProfile = (field, value) => {
    setData((current) => ({
      ...current,
      profile: { ...current.profile, [field]: value }
    }));
  };

  const recordPeriodStart = (value) => {
    setData((current) => {
      const previous = current.profile.lastPeriodStart;
      let periodStarts = current.profile.periodStarts || [];
      if (previous && value && Math.abs(daysBetween(parseLocalDate(previous), parseLocalDate(value))) < 14) {
        periodStarts = periodStarts.filter((date) => date !== previous);
      }
      return {
        ...current,
        profile: {
          ...current.profile,
          lastPeriodStart: value,
          periodStarts: [...new Set([...periodStarts, value].filter(Boolean))].sort()
        }
      };
    });
  };

  const updateTodayLog = (field, value) => {
    setData((current) => ({
      ...current,
      todayLog: { ...current.todayLog, [field]: value }
    }));
  };

  const updatePregnancy = (updates) => {
    setData((current) => ({
      ...current,
      pregnancy: { ...current.pregnancy, ...updates }
    }));
  };

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

  const saveJournalEntry = (entry) => {
    const stampedEntry = { ...entry, ...data.todayLog, date: isoDate(new Date()) };
    setData((current) => ({
      ...current,
      journal: [stampedEntry, ...current.journal.filter((item) => item.date !== stampedEntry.date)].slice(0, 90),
      dailyLogs: [stampedEntry, ...(current.dailyLogs || []).filter((item) => item.date !== stampedEntry.date)].slice(0, 365)
    }));
  };

  const toggleMedicationTaken = (medicationId) => {
    setData((current) => {
      const taken = current.todayLog.medicationTaken || [];
      return {
        ...current,
        todayLog: {
          ...current.todayLog,
          medicationTaken: taken.includes(medicationId)
            ? taken.filter((id) => id !== medicationId)
            : [...taken, medicationId]
        }
      };
    });
  };

  const copySummary = async () => {
    const summary = buildSummary(data, stats, confidence);
    await navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const downloadPdf = async () => {
    setExporting(true);
    try {
      await exportCyclePdf(buildSummary(data, stats, confidence), analytics);
    } finally {
      setExporting(false);
    }
  };

  const backUpNow = async () => {
    setCloudStatus('Saving...');
    try {
      await saveCloudBackup(currentUser.uid, data);
      setCloudStatus('Backup complete');
    } catch {
      setCloudStatus('Cloud unavailable');
    }
  };

  const restoreBackup = async () => {
    setCloudStatus('Checking backup...');
    try {
      const restored = await loadCloudBackup(currentUser.uid);
      if (!restored) {
        setCloudStatus('No backup found');
        return;
      }
      setData(normalizeData(restored));
      setCloudStatus('Backup restored');
    } catch {
      setCloudStatus('Cloud unavailable');
    }
  };

  const enableNotifications = async () => {
    const permission = await requestReminderPermission();
    setNotificationPermission(permission);
  };

  const display = (text) => (data.profile.privateMode ? maskSensitive(text) : text);

  return (
    <div className={data.profile.privateMode ? 'app private-mode' : 'app'}>
      <header className="topbar">
        <div className="brand-lockup">
          <BloomLogo />
          <div>
            <p className="eyebrow">{display('Private cycle care')}</p>
            <h1>BloomCycle</h1>
          </div>
        </div>
        <button
          className="icon-toggle"
          type="button"
          aria-label="Toggle private mode"
          onClick={() => updateProfile('privateMode', !data.profile.privateMode)}
        >
          <Icon name={data.profile.privateMode ? 'lock' : 'unlock'} />
        </button>
      </header>

      <main>
        {activePage === 'dashboard' && (
          <Dashboard
            data={data}
            stats={stats}
            confidence={confidence}
            signature={signature}
            updateProfile={updateProfile}
            recordPeriodStart={recordPeriodStart}
            display={display}
          />
        )}
        {activePage === 'calendar' && <CalendarPage stats={stats} data={data} display={display} />}
        {activePage === 'pregnancy' && (
          <PregnancyPage
            pregnancy={data.pregnancy}
            updatePregnancy={updatePregnancy}
            display={display}
          />
        )}
        {activePage === 'log' && (
          <LogPage
            data={data}
            updateTodayLog={updateTodayLog}
            toggleSymptom={toggleSymptom}
            toggleMedicationTaken={toggleMedicationTaken}
            saveJournalEntry={saveJournalEntry}
            display={display}
          />
        )}
        {activePage === 'insights' && (
          <InsightsPage
            data={data}
            stats={stats}
            confidence={confidence}
            signature={signature}
            analytics={analytics}
            copySummary={copySummary}
            copied={copied}
            downloadPdf={downloadPdf}
            exporting={exporting}
            display={display}
          />
        )}
        {activePage === 'settings' && (
          <SettingsPage
            data={data}
            setData={setData}
            updateProfile={updateProfile}
            stats={stats}
            currentUser={currentUser.name}
            storageKey={storageKey}
            cloudStatus={cloudStatus}
            notificationPermission={notificationPermission}
            enableNotifications={enableNotifications}
            backUpNow={backUpNow}
            restoreBackup={restoreBackup}
            onSignOut={onSignOut}
          />
        )}
      </main>

      <p className="disclaimer">
        This app is for tracking and educational purposes only. It should not replace medical advice.
      </p>

      <nav className="bottom-nav" aria-label="Main navigation">
        {navItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className={activePage === item.id ? 'active' : ''}
            onClick={() => setActivePage(item.id)}
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

function AuthGate({ onAuthenticated }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('error');
  const [busy, setBusy] = useState(false);

  const submitAuth = async (event) => {
    event.preventDefault();
    setMessage('');
    setMessageType('error');

    const cleanEmail = email.trim().toLowerCase();
    const cleanUsername = username.trim();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      setMessage('Enter a valid email address.');
      return;
    }
    if (mode === 'reset') {
      setBusy(true);
      try {
        await sendResetEmail(cleanEmail);
        setMessageType('success');
        setMessage('If an account uses this email, a password reset link has been sent. Check your inbox and spam folder.');
      } catch (error) {
        setMessage(getAuthMessage(error));
      } finally {
        setBusy(false);
      }
      return;
    }
    if (mode === 'register' && cleanUsername.length < 3) {
      setMessage('Username must be at least 3 characters.');
      return;
    }
    if (password.length < 8) {
      setMessage('Password must be at least 8 characters.');
      return;
    }
    if (mode === 'register' && password !== confirmPassword) {
      setMessage('Passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      if (mode === 'register') {
        const user = await registerAccount(cleanEmail, cleanUsername, password);
        onAuthenticated(user);
        return;
      }
      const user = await signInAccount(cleanEmail, password);
      onAuthenticated(user);
    } catch (error) {
      setMessage(getAuthMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const changeMode = (nextMode) => {
    setMode(nextMode);
    setMessage('');
    setPassword('');
    setConfirmPassword('');
  };

  const primaryLabel = busy
    ? 'Please wait...'
    : mode === 'register'
      ? 'Create secure account'
      : mode === 'reset'
        ? 'Send reset email'
        : 'Sign in';

  return (
    <div className="auth-shell">
      <section className="auth-card">
        <div className="auth-brand">
          <BloomLogo />
          <div>
            <p className="eyebrow">Private access</p>
            <h1>BloomCycle</h1>
          </div>
        </div>
        <p className="auth-copy">
          {mode === 'register' && 'Register with your email, username, and password.'}
          {mode === 'login' && 'Sign in with your email and password to open your tracker.'}
          {mode === 'reset' && 'Enter your registered email to receive a secure password reset link.'}
        </p>

        {!firebaseConfigured && (
          <p className="auth-note auth-setup-note">
            Demo mode is active. Accounts are stored in this browser only, so you can register, sign in, and reset passwords without Firebase.
          </p>
        )}

        <form className="auth-form" onSubmit={submitAuth}>
          <label>
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </label>
          {mode === 'register' && (
            <label>
              <span>Username</span>
              <input
                type="text"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Choose a private username"
              />
            </label>
          )}
          {mode !== 'reset' && (
            <label>
              <span>Password</span>
              <input
                type="password"
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 8 characters"
              />
            </label>
          )}
          {mode === 'register' && (
            <label>
              <span>Confirm password</span>
              <input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Repeat password"
              />
            </label>
          )}
          {message && <p className={`auth-message ${messageType}`}>{message}</p>}
          <button className="primary-btn" type="submit" disabled={busy}>
            <Icon name={mode === 'reset' ? 'mail' : 'lock'} />
            {primaryLabel}
          </button>
        </form>

        <div className="auth-actions">
          {mode !== 'login' && <button type="button" onClick={() => changeMode('login')}>Back to sign in</button>}
          {mode === 'login' && <button type="button" onClick={() => changeMode('register')}>Create an account</button>}
          {mode === 'login' && <button type="button" onClick={() => changeMode('reset')}>Forgot password?</button>}
        </div>

        <p className="auth-note">
          Firebase securely manages account passwords and reset emails. Your cycle logs remain stored only in this browser.
        </p>
      </section>
    </div>
  );
}

function Dashboard({ data, stats, confidence, signature, updateProfile, recordPeriodStart, display }) {
  const ritual = getRitual(stats.phase);
  const phaseNote = data.settings.phaseNotes[stats.phase];

  return (
    <section className="page dashboard">
      <div className="hero-panel">
        <div>
          <p>{display('Cycle Signature')}</p>
          <h2>{display(signature.title)}</h2>
          <span>{display(signature.detail)}</span>
        </div>
        <div className="phase-orbit" aria-hidden="true">
          <span>{stats.ready ? stats.cycleDay : '--'}</span>
        </div>
      </div>

      <div className="ritual-card">
        <Icon name="spark" />
        <div>
          <p>{display("Today's Body Insight")}</p>
          <h2>{stats.phase}</h2>
          <span>{display(getInsight(stats.phase))}</span>
        </div>
      </div>

      <div className="ritual-card quiet">
        <Icon name="leaf" />
        <div>
          <p>{display('Phase ritual')}</p>
          <h2>{display(ritual[0])}</h2>
          <span>{display(phaseNote || ritual[1])}</span>
        </div>
      </div>

      <div className="setup-panel">
        <label>
          <span>{display('Last period start')}</span>
          <input
            type="date"
            max={isoDate(new Date())}
            value={data.profile.lastPeriodStart}
            onChange={(event) => recordPeriodStart(event.target.value)}
          />
        </label>
        <div className="two-col">
          <label>
            <span>{display('Period length')}</span>
            <input
              type="number"
              min="1"
              max="14"
              value={data.profile.periodLength}
              onChange={(event) => updateProfile('periodLength', event.target.value)}
            />
          </label>
          <label>
            <span>{display('Cycle length')}</span>
            <input
              type="number"
              min="18"
              max="45"
              value={data.profile.cycleLength}
              onChange={(event) => updateProfile('cycleLength', event.target.value)}
            />
          </label>
        </div>
      </div>

      <div className="metric-grid">
        <Metric title={display('Next expected period')} value={formatDate(stats.nextPeriod)} icon="drop" />
        <Metric title={display('Estimated ovulation')} value={formatDate(stats.ovulation)} icon="spark" />
        <Metric
          title={display('Fertile window')}
          value={stats.ready ? `${formatDate(stats.fertileStart)} - ${formatDate(stats.fertileEnd)}` : 'Add start date'}
          icon="calendar"
        />
        <Metric title={display('Cycle day')} value={stats.ready ? `Day ${stats.cycleDay}` : '--'} icon="cycle" />
      </div>

      <ConfidenceCard confidence={confidence} />
      <SignalTimeline data={data} display={display} />
    </section>
  );
}

function CalendarPage({ stats, data, display }) {
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const monthDays = useMemo(
    () => buildMonth(selectedMonth, stats, data),
    [selectedMonth, stats, data]
  );
  const monthLabel = new Intl.DateTimeFormat('en', {
    month: 'long',
    year: 'numeric'
  }).format(selectedMonth);

  const moveMonth = (offset) => {
    setSelectedMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  };

  return (
    <section className="page">
      <SectionHeader title={display('Calendar')} subtitle={display('Estimated cycle markers and logged symptoms')} />
      <div className="calendar-card">
        <div className="calendar-toolbar">
          <button type="button" className="month-nav-button" onClick={() => moveMonth(-1)}>
            <span aria-hidden="true">&#8249;</span>
            <span>Previous Month</span>
          </button>
          <h3 aria-live="polite">{monthLabel}</h3>
          <button type="button" className="month-nav-button" onClick={() => moveMonth(1)}>
            <span>Next Month</span>
            <span aria-hidden="true">&#8250;</span>
          </button>
        </div>
        <div className="weekday-row">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
            <span key={`${day}-${index}`}>{day}</span>
          ))}
        </div>
        <div className="calendar-grid">
          {monthDays.map((day) => (
            <div
              key={day.key}
              className={`day-cell ${day.type}`}
              aria-label={day.ariaLabel}
              title={day.symptoms?.join(', ')}
            >
              {day.date ? <time dateTime={day.date}>{day.label}</time> : <span>{day.label}</span>}
              {day.hasSymptoms && <i className="symptom-marker" aria-hidden="true" />}
            </div>
          ))}
        </div>
      </div>
      <div className="legend">
        <span><i className="period-dot" /> {display('Period')}</span>
        <span><i className="fertile-dot" /> {display('Fertile')}</span>
        <span><i className="ovulation-dot" /> {display('Ovulation')}</span>
        <span><i className="symptom-dot" /> {display('Symptoms logged')}</span>
        <span><i className="today-dot" /> Today</span>
      </div>
    </section>
  );
}

function PregnancyPage({ pregnancy, updatePregnancy, display }) {
  const pregnancyStats = useMemo(() => getPregnancyStats(pregnancy), [pregnancy]);
  const noteWeek = pregnancyStats.ready ? pregnancyStats.developmentWeek : 1;
  const savedNote = pregnancy.weeklyNotes.find((entry) => entry.week === noteWeek);
  const [weeklyNote, setWeeklyNote] = useState(savedNote?.text || '');
  const [noteSaved, setNoteSaved] = useState(false);

  useEffect(() => {
    const matchingNote = pregnancy.weeklyNotes.find((entry) => entry.week === noteWeek);
    setWeeklyNote(matchingNote?.text || '');
  }, [noteWeek, pregnancy.weeklyNotes]);

  const chooseInputMethod = (inputMethod) => {
    updatePregnancy({ inputMethod });
  };

  const saveWeeklyNote = () => {
    if (!pregnancyStats.ready) return;
    const text = weeklyNote.trim();
    const otherNotes = pregnancy.weeklyNotes.filter((entry) => entry.week !== noteWeek);
    const weeklyNotes = text
      ? [{ week: noteWeek, text, savedAt: new Date().toISOString() }, ...otherNotes]
      : otherNotes;
    updatePregnancy({ weeklyNotes });
    setNoteSaved(true);
    setTimeout(() => setNoteSaved(false), 1800);
  };

  const weeklyContent = pregnancyStats.ready
    ? getWeeklyPregnancyContent(pregnancyStats.developmentWeek)
    : null;

  return (
    <section className="page pregnancy-page">
      <SectionHeader
        title={display('Pregnancy Tracker')}
        subtitle={display('A private weekly view based on your LMP or estimated due date')}
      />

      <div className="pregnancy-setup-panel">
        <fieldset className="pregnancy-methods">
          <legend>Calculate pregnancy from</legend>
          <button
            type="button"
            className={pregnancy.inputMethod === 'lmp' ? 'active' : ''}
            aria-pressed={pregnancy.inputMethod === 'lmp'}
            onClick={() => chooseInputMethod('lmp')}
          >
            Last Menstrual Period (LMP)
          </button>
          <button
            type="button"
            className={pregnancy.inputMethod === 'dueDate' ? 'active' : ''}
            aria-pressed={pregnancy.inputMethod === 'dueDate'}
            onClick={() => chooseInputMethod('dueDate')}
          >
            Due Date
          </button>
        </fieldset>

        {pregnancy.inputMethod === 'lmp' ? (
          <label>
            <span>First day of your last menstrual period</span>
            <input
              type="date"
              max={isoDate(new Date())}
              value={pregnancy.lmp}
              onChange={(event) => updatePregnancy({ lmp: event.target.value })}
            />
          </label>
        ) : (
          <label>
            <span>Estimated due date</span>
            <input
              type="date"
              value={pregnancy.dueDate}
              onChange={(event) => updatePregnancy({ dueDate: event.target.value })}
            />
          </label>
        )}
        <small className="pregnancy-date-note">
          LMP dating estimates 40 weeks from the first day of the last period. A care professional may revise the date.
        </small>
        {pregnancyStats.error && <p className="pregnancy-error" role="alert">{pregnancyStats.error}</p>}
      </div>

      {pregnancyStats.ready ? (
        <>
          <div className="metric-grid pregnancy-metrics">
            <Metric title="Current pregnancy week" value={pregnancyStats.weekLabel} icon="baby" />
            <Metric title="Trimester" value={pregnancyStats.trimester} icon="spark" />
            <Metric title="Estimated due date" value={formatDate(pregnancyStats.dueDate)} icon="calendar" />
            <Metric title="Days remaining" value={`${pregnancyStats.daysRemaining} days`} icon="cycle" />
          </div>

          <article className="pregnancy-progress-card">
            <div>
              <span>Pregnancy progress</span>
              <strong>{Math.round(pregnancyStats.progress)}%</strong>
            </div>
            <div
              className="progress-track"
              role="progressbar"
              aria-label="Pregnancy progress"
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow={Math.round(pregnancyStats.progress)}
            >
              <span style={{ width: `${pregnancyStats.progress}%` }} />
            </div>
            <small>Based on an estimated 40-week pregnancy.</small>
          </article>

          <div className="pregnancy-weekly-grid">
            <article className="pregnancy-info-card">
              <Icon name="baby" />
              <div>
                <p>Week {pregnancyStats.developmentWeek} development</p>
                <h2>{weeklyContent.title}</h2>
                <span>{weeklyContent.summary}</span>
              </div>
            </article>
            <article className="pregnancy-info-card self-care">
              <Icon name="leaf" />
              <div>
                <p>Self-care idea</p>
                <h2>A gentle check-in</h2>
                <span>{weeklyContent.tip}</span>
              </div>
            </article>
          </div>

          <div className="pregnancy-notes-panel">
            <div className="section-header compact">
              <h2>Week {noteWeek} notes</h2>
              <p>Save questions, milestones, appointment details, or anything you want to remember.</p>
            </div>
            <label>
              <span>Weekly note</span>
              <textarea
                rows="5"
                value={weeklyNote}
                placeholder={`What would you like to remember about week ${noteWeek}?`}
                onChange={(event) => setWeeklyNote(event.target.value)}
              />
            </label>
            <button className="primary-btn" type="button" onClick={saveWeeklyNote}>
              <Icon name="save" /> {noteSaved ? 'Weekly note saved' : 'Save weekly note'}
            </button>
          </div>
        </>
      ) : !pregnancyStats.error && (
        <div className="pregnancy-empty-state">
          <Icon name="baby" />
          <h2>Add a date to begin</h2>
          <p>Enter your LMP or due date to see an estimated week, trimester, progress, and weekly information.</p>
        </div>
      )}

      <div className="pregnancy-disclaimer">
        <Icon name="lock" />
        <p>
          The Pregnancy Tracker is for educational purposes only and is not medical advice. Dates and development
          summaries are estimates. Contact a qualified healthcare professional for prenatal care and personal guidance.
        </p>
      </div>
    </section>
  );
}

function LogPage({ data, updateTodayLog, toggleSymptom, toggleMedicationTaken, saveJournalEntry, display }) {
  const [saved, setSaved] = useState(false);
  const [signals, setSignals] = useState({
    cramps: 'None',
    cravings: 'None',
    sleep: 'Okay',
    energy: 'Steady',
    acne: 'None',
    headache: 'None',
    mood: data.todayLog.mood,
    stress: 'Low'
  });

  const updateSignal = (field, value) => {
    setSignals((current) => ({ ...current, [field]: value }));
  };

  const saveCheckIn = () => {
    saveJournalEntry(signals);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  const updateWater = (amount) => {
    updateTodayLog('waterGlasses', Math.min(20, Math.max(0, Number(data.todayLog.waterGlasses) + amount)));
  };

  return (
    <section className="page">
      <SectionHeader title={display('Daily Check-In')} subtitle={display('A quick picture of how your body feels today')} />

      <div className="form-panel">
        <div className="care-checkin-grid">
          <div className="care-control">
            <div className="care-control-heading">
              <Icon name="water" />
              <span>{display('Water')}</span>
            </div>
            <div className="stepper" aria-label="Water glasses">
              <button type="button" aria-label="Remove one glass" onClick={() => updateWater(-1)}><Icon name="minus" /></button>
              <strong>{data.todayLog.waterGlasses}<small> glasses</small></strong>
              <button type="button" aria-label="Add one glass" onClick={() => updateWater(1)}><Icon name="plus" /></button>
            </div>
            <div className="mini-progress"><span style={{ width: `${Math.min(100, (data.todayLog.waterGlasses / 8) * 100)}%` }} /></div>
          </div>
          <label className="care-control">
            <span className="care-control-heading"><Icon name="moon" /> {display('Sleep')}</span>
            <input
              type="number"
              min="0"
              max="16"
              step="0.5"
              value={data.todayLog.sleepHours}
              placeholder="Hours slept"
              onChange={(event) => updateTodayLog('sleepHours', event.target.value)}
            />
          </label>
        </div>
        {(data.settings.medications || []).length > 0 && (
          <div>
            <span className="field-title">{display('Medication check')}</span>
            <div className="medication-checks">
              {data.settings.medications.filter((item) => item.enabled).map((medication) => (
                <label key={medication.id}>
                  <input
                    type="checkbox"
                    checked={(data.todayLog.medicationTaken || []).includes(medication.id)}
                    onChange={() => toggleMedicationTaken(medication.id)}
                  />
                  <span>{medication.name} <small>{medication.time}</small></span>
                </label>
              ))}
            </div>
          </div>
        )}
        <label>
          <span>{display('Mood')}</span>
          <select value={data.todayLog.mood} onChange={(event) => updateTodayLog('mood', event.target.value)}>
            {moods.map((mood) => <option key={mood}>{mood}</option>)}
          </select>
        </label>
        <label>
          <span>{display('Flow level')}</span>
          <select value={data.todayLog.flow} onChange={(event) => updateTodayLog('flow', event.target.value)}>
            {flowLevels.map((flow) => <option key={flow}>{flow}</option>)}
          </select>
        </label>
        <div>
          <span className="field-title">{display('Symptoms')}</span>
          <div className="chip-grid">
            {symptoms.map((symptom) => (
              <button
                key={symptom}
                type="button"
                className={data.todayLog.symptoms.includes(symptom) ? 'chip selected' : 'chip'}
                onClick={() => toggleSymptom(symptom)}
              >
                {display(symptom)}
              </button>
            ))}
          </div>
        </div>
        <label>
          <span>{display('Notes')}</span>
          <textarea
            rows="4"
            value={data.todayLog.notes}
            placeholder="Anything you want to remember?"
            onChange={(event) => updateTodayLog('notes', event.target.value)}
          />
        </label>
      </div>

      <div className="journal-panel">
        <SectionHeader title={display('Body Signal Journal')} subtitle={display('Track patterns beyond dates')} />
        <div className="signal-grid">
          {Object.entries(signalOptions).map(([field, options]) => (
            <label key={field}>
              <span>{display(toTitle(field))}</span>
              <select value={signals[field]} onChange={(event) => updateSignal(field, event.target.value)}>
                {options.map((option) => <option key={option}>{option}</option>)}
              </select>
            </label>
          ))}
        </div>
        <button className="primary-btn" type="button" onClick={saveCheckIn}>
          <Icon name="save" /> {saved ? 'Check-in saved' : "Save today's check-in"}
        </button>
      </div>
    </section>
  );
}

function InsightsPage({ data, stats, confidence, signature, analytics, copySummary, copied, downloadPdf, exporting, display }) {
  const recent = data.journal.slice(0, 5);
  const topSignals = getTopSignals(data);
  const ritual = getRitual(stats.phase);

  return (
    <section className="page">
      <SectionHeader title={display('Insights')} subtitle={display('Gentle patterns from your saved logs')} />
      <div className="signature-card">
        <p>{display('Your Cycle Signature')}</p>
        <h2>{display(signature.title)}</h2>
        <span>{display(signature.detail)}</span>
      </div>
      <div className="insight-card">
        <p>{display("Today's Body Insight")}</p>
        <h2>{stats.phase}</h2>
        <span>{display(getInsight(stats.phase))}</span>
      </div>
      <div className="pattern-grid">
        <article>
          <Icon name="leaf" />
          <strong>{display(ritual[0])}</strong>
          <span>{display(ritual[1])}</span>
        </article>
        <article>
          <Icon name="spark" />
          <strong>{display('Signal Pattern')}</strong>
          <span>{display(topSignals.length ? topSignals.join(', ') : 'Log a few days to reveal your top body signals.')}</span>
        </article>
      </div>
      <SignalTimeline data={data} display={display} />
      <AnalyticsPanel analytics={analytics} display={display} />
      <ConfidenceCard confidence={confidence} />
      <div className="report-actions">
        <button className="summary-btn" type="button" onClick={copySummary}>
          <Icon name="copy" /> {copied ? 'Summary copied' : display('Copy care summary')}
        </button>
        <button className="summary-btn secondary" type="button" onClick={downloadPdf} disabled={exporting}>
          <Icon name="download" /> {exporting ? 'Preparing PDF...' : 'Export PDF report'}
        </button>
      </div>
      <div className="history-list">
        <h3>{display('Recent body signals')}</h3>
        {recent.length === 0 && <p className="muted">No journal entries yet.</p>}
        {recent.map((entry) => (
          <article key={entry.date}>
            <strong>{formatDate(parseLocalDate(entry.date))}</strong>
            <span>
              {display(`Mood: ${entry.mood}, Energy: ${entry.energy}, Stress: ${entry.stress}, Sleep: ${entry.sleep}`)}
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}

function SettingsPage({
  data,
  setData,
  updateProfile,
  stats,
  currentUser,
  storageKey,
  cloudStatus,
  notificationPermission,
  enableNotifications,
  backUpNow,
  restoreBackup,
  onSignOut
}) {
  const clearData = () => {
    setData(defaultData);
    localStorage.removeItem(storageKey);
  };

  const updatePhaseNote = (phase, value) => {
    setData((current) => ({
      ...current,
      settings: {
        ...current.settings,
        phaseNotes: { ...current.settings.phaseNotes, [phase]: value }
      }
    }));
  };

  return (
    <section className="page">
      <SectionHeader title="Settings" subtitle="Privacy and local app preferences" />
      <div className="settings-panel">
        <div className="account-card">
          <Icon name="lock" />
          <div>
            <strong>{currentUser}</strong>
            <small>Signed in on this browser</small>
          </div>
          <button type="button" onClick={onSignOut}>Sign out</button>
        </div>
        <label className="switch-row">
          <span>
            <strong>Private Mode</strong>
            <small>Hide sensitive cycle words on screen.</small>
          </span>
          <input
            type="checkbox"
            checked={data.profile.privateMode}
            onChange={(event) => updateProfile('privateMode', event.target.checked)}
          />
        </label>
        <label className="switch-row">
          <span>
            <strong>Period and medication reminders</strong>
            <small>Show reminders while BloomCycle is running.</small>
          </span>
          <input
            type="checkbox"
            checked={data.settings.reminderEnabled}
            onChange={(event) =>
              setData((current) => ({
                ...current,
                settings: { ...current.settings, reminderEnabled: event.target.checked }
              }))
            }
          />
        </label>
        {data.settings.reminderEnabled && (
          <section className="settings-section">
            <div className="section-header compact">
              <h2>Reminder schedule</h2>
              <p>Notifications contain discreet wording and no dosage advice.</p>
            </div>
            <label>
              <span>Period reminder</span>
              <select
                value={data.settings.periodReminderDays}
                onChange={(event) => setData((current) => ({
                  ...current,
                  settings: { ...current.settings, periodReminderDays: Number(event.target.value) }
                }))}
              >
                <option value="1">1 day before</option>
                <option value="2">2 days before</option>
                <option value="3">3 days before</option>
                <option value="5">5 days before</option>
              </select>
            </label>
            <button
              className="outline-btn"
              type="button"
              onClick={enableNotifications}
              disabled={notificationPermission === 'denied' || notificationPermission === 'unsupported'}
            >
              <Icon name="bell" />
              {notificationPermission === 'granted' && 'Notifications enabled'}
              {notificationPermission === 'default' && 'Enable browser notifications'}
              {notificationPermission === 'denied' && 'Notifications blocked in browser'}
              {notificationPermission === 'unsupported' && 'Notifications unavailable'}
            </button>
            <MedicationReminders data={data} setData={setData} />
          </section>
        )}
        <section className="settings-section">
          <div className="section-header compact status-heading">
            <div>
              <h2>Secure cloud backup</h2>
              <p>Keep an optional copy connected to your account.</p>
            </div>
            <span className="status-badge">{cloudStatus}</span>
          </div>
          <label className="switch-row compact-switch">
            <span>
              <strong>Automatic backup</strong>
              <small>Sync changes after you update a check-in.</small>
            </span>
            <input
              type="checkbox"
              checked={data.settings.cloudBackupEnabled}
              onChange={(event) => setData((current) => ({
                ...current,
                settings: { ...current.settings, cloudBackupEnabled: event.target.checked }
              }))}
            />
          </label>
          <div className="settings-actions">
            <button className="outline-btn" type="button" onClick={backUpNow}><Icon name="cloud" /> Back up now</button>
            <button className="outline-btn" type="button" onClick={restoreBackup}><Icon name="cycle" /> Restore backup</button>
          </div>
        </section>
        <label>
          <span>Personal note for {stats.phase}</span>
          <textarea
            rows="3"
            value={data.settings.phaseNotes[stats.phase] || ''}
            placeholder="Example: I usually need quieter mornings in this phase."
            onChange={(event) => updatePhaseNote(stats.phase, event.target.value)}
          />
        </label>
        <GynecologistContact data={data} setData={setData} stats={stats} currentUser={currentUser} />
        <button className="danger-btn" type="button" onClick={clearData}>
          Clear local data
        </button>
      </div>
      <div className="privacy-note">
        <Icon name="lock" />
        <p>Cycle entries stay on this device unless you choose cloud backup. You can disable backup at any time.</p>
      </div>
    </section>
  );
}

function MedicationReminders({ data, setData }) {
  const [name, setName] = useState('');
  const [time, setTime] = useState('08:00');

  const updateMedications = (medications) => {
    setData((current) => ({
      ...current,
      settings: { ...current.settings, medications }
    }));
  };

  const addMedication = () => {
    const cleanName = name.trim();
    if (!cleanName) return;
    const medication = {
      id: globalThis.crypto?.randomUUID?.() || `${Date.now()}`,
      name: cleanName,
      time,
      enabled: true
    };
    updateMedications([...(data.settings.medications || []), medication]);
    setName('');
  };

  const toggleMedication = (id) => {
    updateMedications(data.settings.medications.map((item) => (
      item.id === id ? { ...item, enabled: !item.enabled } : item
    )));
  };

  const removeMedication = (id) => {
    updateMedications(data.settings.medications.filter((item) => item.id !== id));
  };

  return (
    <div className="medication-manager">
      <div className="section-header compact">
        <h2>Medication reminders</h2>
        <p>Add only medicines already recommended for you.</p>
      </div>
      <div className="medication-form">
        <label>
          <span>Medication name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Example: Iron tablet" />
        </label>
        <label>
          <span>Time</span>
          <input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
        </label>
        <button className="icon-action" type="button" aria-label="Add medication reminder" onClick={addMedication}>
          <Icon name="plus" />
        </button>
      </div>
      <div className="medication-list">
        {(data.settings.medications || []).map((medication) => (
          <div key={medication.id}>
            <button
              className={`medication-toggle ${medication.enabled ? 'active' : ''}`}
              type="button"
              onClick={() => toggleMedication(medication.id)}
            >
              <Icon name="pill" />
              <span><strong>{medication.name}</strong><small>{medication.time}</small></span>
            </button>
            <button className="remove-btn" type="button" aria-label={`Remove ${medication.name}`} onClick={() => removeMedication(medication.id)}>
              <Icon name="close" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function GynecologistContact({ data, setData, stats, currentUser }) {
  const [copied, setCopied] = useState(false);
  const [detailsSaved, setDetailsSaved] = useState(false);
  const clinician = data.settings.clinician;
  const emailBody = encodeURIComponent(buildClinicianMessage(data, stats, currentUser));

  const updateClinician = (field, value) => {
    setDetailsSaved(false);
    setData((current) => ({
      ...current,
      settings: {
        ...current.settings,
        clinician: { ...current.settings.clinician, [field]: value }
      }
    }));
  };

  const submitPatientDetails = (event) => {
    event.preventDefault();
    setDetailsSaved(true);
    setTimeout(() => setDetailsSaved(false), 1800);
  };

  const copyMessage = async () => {
    await navigator.clipboard.writeText(buildClinicianMessage(data, stats, currentUser));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <section className="clinician-card">
      <div className="section-header compact">
        <h2>Contact Gynecologist</h2>
        <p>Enter patient details and prepare a simple cycle summary before an appointment.</p>
      </div>
      <form className="patient-details-form" onSubmit={submitPatientDetails}>
        <div className="signal-grid">
          <label>
            <span>Patient name</span>
            <input
              type="text"
              required
              value={clinician.patientName || data.settings.patientName || clinician.name}
              placeholder={currentUser || 'Patient name'}
              onChange={(event) => updateClinician('patientName', event.target.value)}
            />
          </label>
          <label>
            <span>Patient phone</span>
            <input
              type="tel"
              required
              value={clinician.phone}
              placeholder="Your phone number"
              onChange={(event) => updateClinician('phone', event.target.value)}
            />
          </label>
          <label>
            <span>Patient email</span>
            <input
              type="email"
              required
              value={clinician.email}
              placeholder="your.email@example.com"
              onChange={(event) => updateClinician('email', event.target.value)}
            />
          </label>
        </div>
        <label>
          <span>Reason for visit</span>
          <textarea
            rows="3"
            value={clinician.visitReason}
            placeholder="Example: I want to discuss cycle changes, pain, heavy bleeding, or irregular timing."
            onChange={(event) => updateClinician('visitReason', event.target.value)}
          />
        </label>
        <button className="primary-btn patient-submit-btn" type="submit">
          <Icon name="save" /> {detailsSaved ? 'Patient details saved' : 'Submit patient details'}
        </button>
      </form>
      <div className="clinician-actions">
        <a href={`mailto:?subject=BloomCycle%20Patient%20Summary&body=${emailBody}`}>
          <Icon name="mail" /> Open email draft
        </a>
        <button type="button" onClick={copyMessage}>
          <Icon name="copy" /> {copied ? 'Copied' : 'Copy for gynecologist'}
        </button>
      </div>
      <p className="care-note">
        If symptoms feel severe, sudden, or urgent, contact local emergency services or urgent care.
      </p>
    </section>
  );
}

function BloomLogo() {
  return (
    <div className="bloom-logo" aria-label="BloomCycle logo">
      <svg viewBox="0 0 64 64" role="img">
        <circle className="logo-ring" cx="32" cy="32" r="25" />
        <path className="logo-petal petal-one" d="M32 12c7 8 7 15 0 22-7-7-7-14 0-22Z" />
        <path className="logo-petal petal-two" d="M50 29c-5 9-12 11-21 7 4-9 11-12 21-7Z" />
        <path className="logo-petal petal-three" d="M14 29c10-5 17-2 21 7-9 4-16 2-21-7Z" />
        <path className="logo-leaf" d="M32 35c6 5 8 10 6 17-7-2-11-7-11-14 1-1 3-2 5-3Z" />
        <circle className="logo-center" cx="32" cy="33" r="5" />
      </svg>
    </div>
  );
}

function SignalTimeline({ data, display }) {
  const entries = data.journal.slice(0, 7).reverse();

  return (
    <article className="timeline-card">
      <div className="section-header compact">
        <h2>{display('Body Signal Timeline')}</h2>
        <p>{display('A quick view of energy, sleep, stress, and mood across recent logs')}</p>
      </div>
      {entries.length === 0 ? (
        <p className="muted">Save Body Signal Journal entries to build a visual pattern.</p>
      ) : (
        <div className="timeline-bars">
          {entries.map((entry) => (
            <div className="timeline-day" key={entry.date}>
              <span>{new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(parseLocalDate(entry.date))}</span>
              <i style={{ height: `${signalHeight(entry.energy)}%` }} title={`Energy: ${entry.energy}`} />
              <i style={{ height: `${signalHeight(entry.sleep)}%` }} title={`Sleep: ${entry.sleep}`} />
              <i style={{ height: `${signalHeight(entry.stress)}%` }} title={`Stress: ${entry.stress}`} />
              <strong>{display(entry.mood.slice(0, 3))}</strong>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function AnalyticsPanel({ analytics, display }) {
  return (
    <section className="analytics-panel">
      <SectionHeader title={display('Cycle Analytics')} subtitle={display('Patterns from saved cycle dates and daily check-ins')} />
      <div className="analytics-metrics">
        <Metric title="Average cycle" value={`${analytics.averageCycle} days`} icon="cycle" />
        <Metric title="Period regularity" value={analytics.regularity} icon="chart" />
        <Metric title="Average sleep" value={analytics.averageSleep === '--' ? '--' : `${analytics.averageSleep} hrs`} icon="moon" />
        <Metric title="Average water" value={analytics.averageWater === '--' ? '--' : `${analytics.averageWater} glasses`} icon="water" />
      </div>
      <div className="trend-grid">
        <TrendList title="Mood trend" items={analytics.moodCounts} fallback="Save daily check-ins to see mood trends." />
        <TrendList title="Symptom trend" items={analytics.symptomCounts} fallback="Save symptoms to see recurring patterns." />
      </div>
      <p className="analytics-note">Patterns show what appeared together in your logs. They do not establish a medical cause.</p>
    </section>
  );
}

function TrendList({ title, items, fallback }) {
  const largest = Math.max(...items.map((item) => item.count), 1);
  return (
    <article className="trend-card">
      <h3>{title}</h3>
      {items.length === 0 && <p className="muted">{fallback}</p>}
      {items.map((item) => (
        <div className="trend-row" key={item.label}>
          <div><span>{item.label}</span><strong>{item.count}</strong></div>
          <div className="trend-track"><span style={{ width: `${(item.count / largest) * 100}%` }} /></div>
        </div>
      ))}
    </article>
  );
}

function Metric({ title, value, icon }) {
  return (
    <article className="metric-card">
      <Icon name={icon} />
      <span>{title}</span>
      <strong>{value}</strong>
    </article>
  );
}

function ConfidenceCard({ confidence }) {
  return (
    <article className="confidence-card">
      <div>
        <p>Cycle Confidence Score</p>
        <strong>{confidence}%</strong>
      </div>
      <div className="progress-track" aria-label={`Cycle confidence ${confidence}%`}>
        <span style={{ width: `${confidence}%` }} />
      </div>
      <small>More saved dates and body signal logs can improve estimate consistency.</small>
    </article>
  );
}

function SectionHeader({ title, subtitle }) {
  return (
    <div className="section-header">
      <h2>{title}</h2>
      <p>{subtitle}</p>
    </div>
  );
}

function Icon({ name }) {
  const icons = {
    home: 'M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1v-8.5Z',
    calendar: 'M7 3v3M17 3v3M4 9h16M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z',
    edit: 'M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3ZM13.5 7.5l3 3',
    spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3ZM5 15l.8 2.2L8 18l-2.2.8L5 21l-.8-2.2L2 18l2.2-.8L5 15Z',
    settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM4 13l-1-1 2-3 1.5.5a7.8 7.8 0 0 1 1.2-.7L8 6h4l.3 1.8c.4.2.8.4 1.2.7L15 8l2 3-1 1c.1.6.1 1.1 0 1.7l1 1-2 3-1.5-.5c-.4.3-.8.5-1.2.7L12 20H8l-.3-1.8a7.8 7.8 0 0 1-1.2-.7L5 18l-2-3 1-1a7 7 0 0 1 0-1Z',
    drop: 'M12 3s6 6.2 6 11a6 6 0 0 1-12 0c0-4.8 6-11 6-11Z',
    cycle: 'M19 8a7 7 0 0 0-12-2l-2 2M5 4v4h4M5 16a7 7 0 0 0 12 2l2-2M19 20v-4h-4',
    save: 'M5 4h12l2 2v14H5V4ZM8 4v6h8V4M8 20v-6h8v6',
    copy: 'M8 8h10v12H8V8ZM5 16H4V4h12v1',
    phone: 'M6 5h4l2 5-2.5 1.5a12 12 0 0 0 5 5L16 14l5 2v4c0 .6-.4 1-1 1A17 17 0 0 1 3 6c0-.6.4-1 1-1h2Z',
    mail: 'M4 6h16v12H4V6ZM4 7l8 6 8-6',
    lock: 'M7 10V8a5 5 0 0 1 10 0v2M6 10h12v10H6V10ZM12 14v3',
    unlock: 'M7 10V8a5 5 0 0 1 9.5-2.2M6 10h12v10H6V10ZM12 14v3',
    leaf: 'M5 19c8 0 14-6 14-14-8 0-14 6-14 14ZM5 19c0-5 3-9 8-11',
    water: 'M12 3s6 6.2 6 11a6 6 0 0 1-12 0c0-4.8 6-11 6-11Z M9 15c.5 1.2 1.5 2 3 2',
    moon: 'M20 15.5A8 8 0 0 1 8.5 4 8 8 0 1 0 20 15.5Z',
    pill: 'M8.5 4.5a4 4 0 0 1 5.7 0l5.3 5.3a4 4 0 0 1-5.7 5.7l-5.3-5.3a4 4 0 0 1 0-5.7ZM11 13l5-5',
    bell: 'M6 17h12l-1.5-2v-4a4.5 4.5 0 0 0-9 0v4L6 17ZM10 20h4',
    cloud: 'M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 11a3.5 3.5 0 0 0 1 7Z',
    download: 'M12 4v11M8 11l4 4 4-4M5 20h14',
    chart: 'M5 20V10M12 20V4M19 20v-7M3 20h18',
    baby: 'M9 5a3 3 0 1 1 4.8 2.4A6.5 6.5 0 1 1 9 5ZM9 13h.01M15 13h.01M9.5 17c1.5 1 3.5 1 5 0',
    plus: 'M12 5v14M5 12h14',
    minus: 'M5 12h14',
    close: 'm7 7 10 10M17 7 7 17'
  };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={icons[name]} />
    </svg>
  );
}

function getPregnancyStats(pregnancy) {
  const inputValue = pregnancy.inputMethod === 'dueDate' ? pregnancy.dueDate : pregnancy.lmp;
  if (!inputValue) return { ready: false, error: '' };

  const enteredDate = parseLocalDate(inputValue);
  if (!enteredDate || Number.isNaN(enteredDate.getTime())) {
    return { ready: false, error: 'Enter a valid date.' };
  }

  const today = stripTime(new Date());
  const lmp = pregnancy.inputMethod === 'dueDate' ? addDays(enteredDate, -280) : enteredDate;
  const dueDate = pregnancy.inputMethod === 'dueDate' ? enteredDate : addDays(enteredDate, 280);
  const elapsedDays = pregnancyDaysBetween(lmp, today);

  if (elapsedDays < 0) {
    return {
      ready: false,
      error: pregnancy.inputMethod === 'dueDate'
        ? 'This due date is more than 40 weeks away. Check the date and try again.'
        : 'The LMP date cannot be in the future.'
    };
  }

  const completedWeeks = Math.floor(elapsedDays / 7);
  const extraDays = elapsedDays % 7;
  const developmentWeek = Math.min(40, Math.max(1, completedWeeks));
  const trimester = completedWeeks < 13
    ? 'First trimester'
    : completedWeeks < 28
      ? 'Second trimester'
      : 'Third trimester';

  return {
    ready: true,
    lmp,
    dueDate,
    completedWeeks,
    developmentWeek,
    trimester,
    weekLabel: `${completedWeeks} weeks, ${extraDays} ${extraDays === 1 ? 'day' : 'days'}`,
    daysRemaining: Math.max(0, pregnancyDaysBetween(today, dueDate)),
    progress: Math.min(100, Math.max(0, (elapsedDays / 280) * 100))
  };
}

function pregnancyDaysBetween(start, end) {
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.floor((endUtc - startUtc) / (24 * 60 * 60 * 1000));
}

function getWeeklyPregnancyContent(week) {
  const stages = [
    {
      through: 4,
      title: 'Early foundations',
      summary: 'The earliest foundations of pregnancy are forming as implantation and placental development begin.',
      tip: 'Consider arranging prenatal care and writing down questions you want to discuss with your care team.'
    },
    {
      through: 8,
      title: 'Core structures begin',
      summary: 'The brain, spinal cord, facial features, and small limb buds are developing quickly during this stage.',
      tip: 'Make space for rest, regular fluids, and foods you can tolerate. Ask your clinician about prenatal vitamins.'
    },
    {
      through: 12,
      title: 'Growing and moving',
      summary: 'Major body structures are present and continue maturing, while small movements are beginning.',
      tip: 'Keep prenatal appointments and share any symptoms or medication questions with your healthcare professional.'
    },
    {
      through: 16,
      title: 'Muscles and bones strengthen',
      summary: 'The skeleton and muscles continue developing, and facial movements are becoming more coordinated.',
      tip: 'Choose gentle activity that feels comfortable if your care professional has said it is appropriate for you.'
    },
    {
      through: 20,
      title: 'Senses develop',
      summary: 'Hearing and other senses are developing, and movements may gradually become easier to notice.',
      tip: 'Note new symptoms and movements so you can bring useful details to your prenatal visits.'
    },
    {
      through: 24,
      title: 'Responding to the world',
      summary: 'The lungs continue developing and the baby may respond to sounds and changes in movement.',
      tip: 'Support your energy with rest, balanced meals, and hydration according to your care plan.'
    },
    {
      through: 28,
      title: 'Brain and lungs mature',
      summary: 'Brain development is active, the lungs are maturing, and the eyelids may begin opening.',
      tip: 'Review upcoming appointments and ask your care team which changes should prompt a call.'
    },
    {
      through: 32,
      title: 'Steady growth',
      summary: 'The baby is gaining body fat, practicing breathing movements, and continuing rapid brain development.',
      tip: 'Use pillows or position changes for comfort and discuss sleep concerns with your care professional.'
    },
    {
      through: 36,
      title: 'Preparing for birth',
      summary: 'Growth continues as the lungs and nervous system mature and the baby may settle into a birth position.',
      tip: 'Consider reviewing your birth preferences, support contacts, and practical plans with your care team.'
    },
    {
      through: 40,
      title: 'Final weeks of growth',
      summary: 'The organs continue their final maturation while the baby gains weight and prepares for birth.',
      tip: 'Keep your care team’s contact details handy and follow their guidance about signs of labor or urgent concerns.'
    }
  ];

  return stages.find((stage) => week <= stage.through) || stages[stages.length - 1];
}

function buildMonth(selectedMonth, stats, data) {
  const today = stripTime(new Date());
  const profile = data.profile;
  const lastPeriodStart = parseLocalDate(profile.lastPeriodStart);
  const cycleLength = Number(profile.cycleLength) || 28;
  const periodLength = Number(profile.periodLength) || 5;
  const year = selectedMonth.getFullYear();
  const month = selectedMonth.getMonth();
  const startOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leading = startOfMonth.getDay();
  const cells = [];
  const logs = [...(data.journal || []), ...(data.dailyLogs || []), data.todayLog]
    .filter((log) => log?.date && log.symptoms?.length)
    .reduce((byDate, log) => {
      byDate.set(log.date, log.symptoms);
      return byDate;
    }, new Map());

  for (let i = 0; i < leading; i += 1) {
    cells.push({ key: `blank-${year}-${month}-${i}`, label: '', type: 'blank' });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day);
    const dateKey = isoDate(date);
    const daySymptoms = logs.get(dateKey) || [];
    let type = '';
    if (stats.ready && lastPeriodStart) {
      const elapsed = daysBetween(lastPeriodStart, date);
      const cycleIndex = Math.floor(elapsed / cycleLength);
      const cycleStart = addDays(lastPeriodStart, cycleIndex * cycleLength);
      const dayInCycle = daysBetween(cycleStart, date) + 1;
      const cycleOvulation = addDays(cycleStart, cycleLength - 14);
      const cycleFertileStart = addDays(cycleOvulation, -5);
      const cycleFertileEnd = addDays(cycleOvulation, 1);

      if (dayInCycle >= 1 && dayInCycle <= periodLength) type = 'period';
      if (date >= cycleFertileStart && date <= cycleFertileEnd) type = 'fertile';
      if (dateKey === isoDate(cycleOvulation)) type = 'ovulation';
    }
    const isToday = dateKey === isoDate(today);
    if (isToday) type = `${type} today`.trim();

    const labels = [formatDate(date)];
    if (type.includes('period')) labels.push('period');
    if (type.includes('fertile')) labels.push('fertile window');
    if (type.includes('ovulation')) labels.push('ovulation');
    if (isToday) labels.push('today');
    if (daySymptoms.length) labels.push(`symptoms logged: ${daySymptoms.join(', ')}`);

    cells.push({
      key: dateKey,
      date: dateKey,
      label: day,
      type,
      symptoms: daySymptoms,
      hasSymptoms: daySymptoms.length > 0,
      ariaLabel: labels.join(', ')
    });
  }

  return cells;
}

function buildSummary(data, stats, confidence) {
  const signature = getCycleSignature(data, stats);
  const topSignals = getTopSignals(data);
  const analytics = getCycleAnalytics(data);
  const patientName =
    data.settings.clinician.patientName?.trim() || data.settings.patientName?.trim() || data.settings.clinician.name?.trim();

  return [
    'BloomCycle Summary',
    `Patient name: ${patientName || 'Not specified'}`,
    `Patient phone: ${data.settings.clinician.phone || 'Not specified'}`,
    `Patient email: ${data.settings.clinician.email || 'Not specified'}`,
    `Cycle signature: ${signature.title}`,
    `Signature note: ${signature.detail}`,
    `Last cycle start: ${data.profile.lastPeriodStart || 'Not added'}`,
    `Average cycle length: ${data.profile.cycleLength} days`,
    `Calculated cycle average: ${analytics.averageCycle} days`,
    `Period regularity: ${analytics.regularity}`,
    `Period length: ${data.profile.periodLength} days`,
    `Current cycle day: ${stats.ready ? stats.cycleDay : 'Not available'}`,
    `Next expected period: ${formatDate(stats.nextPeriod)}`,
    `Estimated ovulation: ${formatDate(stats.ovulation)}`,
    `Fertile window: ${stats.ready ? `${formatDate(stats.fertileStart)} - ${formatDate(stats.fertileEnd)}` : 'Not available'}`,
    `Recent mood: ${data.todayLog.mood}`,
    `Flow level: ${data.todayLog.flow}`,
    `Symptoms: ${data.todayLog.symptoms.join(', ') || 'None logged'}`,
    `Water today: ${data.todayLog.waterGlasses || 0} glasses`,
    `Sleep: ${data.todayLog.sleepHours || 'Not logged'}${data.todayLog.sleepHours ? ' hours' : ''}`,
    `Common recent body signals: ${topSignals.join(', ') || 'Not enough entries yet'}`,
    `Notes: ${data.todayLog.notes || 'None'}`,
    `Cycle confidence score: ${confidence}%`,
    'Disclaimer: This app is for tracking and educational purposes only. It should not replace medical advice.'
  ].join('\n');
}

function buildClinicianMessage(data, stats, currentUser = '') {
  const confidence = getConfidenceScore(data);
  const patientName =
    data.settings.clinician.patientName?.trim() ||
    data.settings.patientName?.trim() ||
    data.settings.clinician.name?.trim() ||
    currentUser ||
    'Patient';

  return [
    'Hello,',
    '',
    'I am sharing a BloomCycle tracking summary for an appointment or care discussion.',
    `Patient name: ${patientName}`,
    `Patient phone: ${data.settings.clinician.phone || 'Not specified'}`,
    `Patient email: ${data.settings.clinician.email || 'Not specified'}`,
    data.settings.clinician.visitReason ? `Reason for visit: ${data.settings.clinician.visitReason}` : 'Reason for visit: Not specified',
    '',
    buildSummary(data, stats, confidence)
  ].join('\n');
}

function maskSensitive(text) {
  return String(text)
    .replace(/BloomCycle/gi, 'Bloom')
    .replace(/period/gi, 'cycle')
    .replace(/ovulation/gi, 'signal')
    .replace(/fertile/gi, 'window')
    .replace(/cramps/gi, 'body signal')
    .replace(/headache/gi, 'body signal')
    .replace(/acne/gi, 'skin signal')
    .replace(/symptoms/gi, 'signals')
    .replace(/flow/gi, 'level')
    .replace(/doctor/gi, 'care')
    .replace(/partner/gi, 'trusted contact');
}

function toTitle(value) {
  return value.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase());
}

function signalHeight(value) {
  const levels = {
    None: 18,
    Low: 28,
    Rested: 72,
    Okay: 52,
    Restless: 35,
    'Low sleep': 24,
    High: 82,
    Steady: 58,
    Drained: 22,
    Medium: 55
  };
  return levels[value] || 46;
}

function getTopSignals(data) {
  const counts = {};
  data.journal.forEach((entry) => {
    ['cramps', 'cravings', 'sleep', 'energy', 'acne', 'headache', 'mood', 'stress'].forEach((field) => {
      const value = entry[field];
      if (!value || value === 'None' || value === 'Okay' || value === 'Steady' || value === 'Low') return;
      const label = `${toTitle(field)}: ${value}`;
      counts[label] = (counts[label] || 0) + 1;
    });
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([label]) => label);
}

createRoot(document.getElementById('root')).render(<Root />);
