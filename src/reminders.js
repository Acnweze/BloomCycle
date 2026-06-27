const REMINDER_KEY = 'bloomcycle-reminders-fired-v1';

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getFiredReminders() {
  try {
    return JSON.parse(localStorage.getItem(REMINDER_KEY) || '{}');
  } catch {
    return {};
  }
}

function notifyOnce(key, title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const fired = getFiredReminders();
  if (fired[key]) return;
  new Notification(title, { body, icon: '/favicon.ico' });
  fired[key] = Date.now();
  localStorage.setItem(REMINDER_KEY, JSON.stringify(fired));
}

export async function requestReminderPermission() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.requestPermission();
}

export function getReminderPermission() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export function checkDueReminders(data, stats, pregnancyStats) {
  if (!data.settings.reminderEnabled) return;
  const now = new Date();
  const dateKey = localDateKey(now);
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  (data.settings.medications || []).forEach((medication) => {
    const alreadyTaken = (data.todayLog.medicationTaken || []).includes(medication.id);
    if (medication.enabled && medication.time === time && !alreadyTaken) {
      notifyOnce(
        `medicine-${medication.id}-${dateKey}`,
        'Medication reminder',
        `It is time for ${medication.name}. Follow the instructions provided by your clinician or pharmacist.`
      );
    }
  });

  (data.settings.smartReminders || []).forEach((reminder) => {
    if (!reminder.enabled || reminder.time !== time) return;

    if (reminder.type === 'period' && stats.ready && stats.nextPeriod) {
      const daysUntil = calendarDaysBetween(now, stats.nextPeriod);
      if (daysUntil === Number(reminder.daysBefore || 0)) {
        notifyOnce(
          `smart-${reminder.id}-${localDateKey(stats.nextPeriod)}`,
          reminder.label || 'Period estimate',
          `Your next period is estimated ${formatEstimateTiming(daysUntil)}. Predictions can vary.`
        );
      }
      return;
    }

    if (reminder.type === 'ovulation' && stats.ready && stats.ovulation) {
      let nextOvulation = stats.ovulation;
      if (calendarDaysBetween(now, nextOvulation) < 0) {
        nextOvulation = addDays(nextOvulation, Number(data.profile.cycleLength) || 28);
      }
      const daysUntil = calendarDaysBetween(now, nextOvulation);
      if (daysUntil === Number(reminder.daysBefore || 0)) {
        notifyOnce(
          `smart-${reminder.id}-${localDateKey(nextOvulation)}`,
          reminder.label || 'Ovulation estimate',
          `Ovulation is estimated ${formatEstimateTiming(daysUntil)}. Cycle predictions can vary.`
        );
      }
      return;
    }

    if (reminder.type === 'pregnancy' && pregnancyStats?.ready) {
      const milestoneWeek = Number(reminder.milestoneWeek);
      if (pregnancyStats.developmentWeek === milestoneWeek) {
        notifyOnce(
          `smart-${reminder.id}-${localDateKey(pregnancyStats.lmp)}-week-${milestoneWeek}`,
          reminder.label || `Week ${milestoneWeek} milestone`,
          `Your tracker has reached estimated pregnancy week ${milestoneWeek}. Dates can vary.`
        );
      }
      return;
    }

    if (reminder.type === 'hydration') {
      notifyOnce(
        `smart-${reminder.id}-${dateKey}`,
        reminder.label || 'Hydration check',
        'A gentle reminder to check in with your hydration.'
      );
      return;
    }

    if (reminder.type === 'wellness') {
      notifyOnce(
        `smart-${reminder.id}-${dateKey}`,
        reminder.label || 'Daily wellness check-in',
        'Take a moment for your BloomCycle daily wellness check-in.'
      );
    }
  });
}

function calendarDaysBetween(start, end) {
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.floor((endUtc - startUtc) / 86400000);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatEstimateTiming(days) {
  if (days === 0) return 'today';
  return `in ${days} day${days === 1 ? '' : 's'}`;
}
