import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  firebaseConfigured,
  getAuthMessage,
  observeAuth,
  registerAccount,
  sendResetEmail,
  signInAccount,
  signOutAccount
} from './firebase';
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
    const parsed = JSON.parse(stored);
    return {
      ...defaultData,
      ...parsed,
      profile: { ...defaultData.profile, ...parsed.profile },
      todayLog: { ...defaultData.todayLog, ...parsed.todayLog },
      settings: {
        ...defaultData.settings,
        ...parsed.settings,
        clinician: { ...defaultData.settings.clinician, ...parsed.settings?.clinician },
        phaseNotes: { ...defaultData.settings.phaseNotes, ...parsed.settings?.phaseNotes }
      }
    };
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
  const stats = useMemo(() => getCycleStats(data.profile), [data.profile]);
  const confidence = useMemo(() => getConfidenceScore(data), [data]);
  const signature = useMemo(() => getCycleSignature(data, stats), [data, stats]);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(data));
  }, [data, storageKey]);

  const updateProfile = (field, value) => {
    setData((current) => ({
      ...current,
      profile: { ...current.profile, [field]: value }
    }));
  };

  const updateTodayLog = (field, value) => {
    setData((current) => ({
      ...current,
      todayLog: { ...current.todayLog, [field]: value }
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
    const stampedEntry = { ...entry, date: isoDate(new Date()) };
    setData((current) => ({
      ...current,
      journal: [stampedEntry, ...current.journal.filter((item) => item.date !== stampedEntry.date)].slice(0, 30)
    }));
  };

  const copySummary = async () => {
    const summary = buildSummary(data, stats, confidence);
    await navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
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
            display={display}
          />
        )}
        {activePage === 'calendar' && <CalendarPage stats={stats} data={data} display={display} />}
        {activePage === 'log' && (
          <LogPage
            data={data}
            updateTodayLog={updateTodayLog}
            toggleSymptom={toggleSymptom}
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
            copySummary={copySummary}
            copied={copied}
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
          {!firebaseConfigured && (
            <p className="auth-message">Firebase email authentication must be configured before accounts can be used.</p>
          )}
          {message && <p className={`auth-message ${messageType}`}>{message}</p>}
          <button className="primary-btn" type="submit" disabled={busy || !firebaseConfigured}>
            <Icon name={mode === 'reset' ? 'mail' : 'lock'} />
            {busy && 'Please wait...'}
            {!busy && mode === 'register' && 'Create secure account'}
            {!busy && mode === 'login' && 'Sign in'}
            {!busy && mode === 'reset' && 'Send reset email'}
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

function Dashboard({ data, stats, confidence, signature, updateProfile, display }) {
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
            value={data.profile.lastPeriodStart}
            onChange={(event) => updateProfile('lastPeriodStart', event.target.value)}
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
  const monthDays = buildMonth(stats, data.profile);

  return (
    <section className="page">
      <SectionHeader title={display('Calendar')} subtitle={display('Estimated cycle markers for this month')} />
      <div className="calendar-card">
        <div className="weekday-row">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
            <span key={`${day}-${index}`}>{day}</span>
          ))}
        </div>
        <div className="calendar-grid">
          {monthDays.map((day) => (
            <div key={day.key} className={`day-cell ${day.type}`}>
              <span>{day.label}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="legend">
        <span><i className="period-dot" /> {display('Period')}</span>
        <span><i className="fertile-dot" /> {display('Fertile')}</span>
        <span><i className="ovulation-dot" /> {display('Ovulation')}</span>
        <span><i className="today-dot" /> Today</span>
      </div>
    </section>
  );
}

function LogPage({ data, updateTodayLog, toggleSymptom, saveJournalEntry, display }) {
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

  return (
    <section className="page">
      <SectionHeader title={display('Log Symptoms')} subtitle={display('Save what you notice today')} />

      <div className="form-panel">
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
        <button className="primary-btn" type="button" onClick={() => saveJournalEntry(signals)}>
          <Icon name="save" /> Save body signals
        </button>
      </div>
    </section>
  );
}

function InsightsPage({ data, stats, confidence, signature, copySummary, copied, display }) {
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
      <ConfidenceCard confidence={confidence} />
      <button className="summary-btn" type="button" onClick={copySummary}>
        <Icon name="copy" /> {copied ? 'Summary copied' : display('Partner/Doctor Summary')}
      </button>
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

function SettingsPage({ data, setData, updateProfile, stats, currentUser, storageKey, onSignOut }) {
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
            <strong>Gentle reminders</strong>
            <small>Keep reminder preference saved locally for later.</small>
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
        <p>Firebase secures your account. Cycle entries remain stored only in this browser with localStorage.</p>
      </div>
    </section>
  );
}

function GynecologistContact({ data, setData, stats, currentUser }) {
  const [copied, setCopied] = useState(false);
  const clinician = data.settings.clinician;
  const emailBody = encodeURIComponent(buildClinicianMessage(data, stats, currentUser));

  const updateClinician = (field, value) => {
    setData((current) => ({
      ...current,
      settings: {
        ...current.settings,
        clinician: { ...current.settings.clinician, [field]: value }
      }
    }));
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
      <div className="signal-grid">
        <label>
          <span>Patient name</span>
          <input
            type="text"
            value={clinician.patientName || data.settings.patientName || clinician.name}
            placeholder={currentUser || 'Patient name'}
            onChange={(event) => updateClinician('patientName', event.target.value)}
          />
        </label>
        <label>
          <span>Patient phone</span>
          <input
            type="tel"
            value={clinician.phone}
            placeholder="Your phone number"
            onChange={(event) => updateClinician('phone', event.target.value)}
          />
        </label>
        <label>
          <span>Patient email</span>
          <input
            type="email"
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
    leaf: 'M5 19c8 0 14-6 14-14-8 0-14 6-14 14ZM5 19c0-5 3-9 8-11'
  };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={icons[name]} />
    </svg>
  );
}

function buildMonth(stats, profile) {
  const today = stripTime(new Date());
  const lastPeriodStart = parseLocalDate(profile.lastPeriodStart);
  const cycleLength = Number(profile.cycleLength) || 28;
  const periodLength = Number(profile.periodLength) || 5;
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const leading = startOfMonth.getDay();
  const cells = [];

  for (let i = 0; i < leading; i += 1) {
    cells.push({ key: `blank-${i}`, label: '', type: 'blank' });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(today.getFullYear(), today.getMonth(), day);
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
      if (isoDate(date) === isoDate(cycleOvulation)) type = 'ovulation';
    }
    if (isoDate(date) === isoDate(today)) type = `${type} today`.trim();
    cells.push({ key: isoDate(date), label: day, type });
  }

  return cells;
}

function buildSummary(data, stats, confidence) {
  const signature = getCycleSignature(data, stats);
  const topSignals = getTopSignals(data);
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
    `Period length: ${data.profile.periodLength} days`,
    `Current cycle day: ${stats.ready ? stats.cycleDay : 'Not available'}`,
    `Next expected period: ${formatDate(stats.nextPeriod)}`,
    `Estimated ovulation: ${formatDate(stats.ovulation)}`,
    `Fertile window: ${stats.ready ? `${formatDate(stats.fertileStart)} - ${formatDate(stats.fertileEnd)}` : 'Not available'}`,
    `Recent mood: ${data.todayLog.mood}`,
    `Flow level: ${data.todayLog.flow}`,
    `Symptoms: ${data.todayLog.symptoms.join(', ') || 'None logged'}`,
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
