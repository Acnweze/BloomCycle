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

export function checkDueReminders(data, stats) {
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

  if (stats.ready && stats.nextPeriod) {
    const daysUntil = Math.ceil((stats.nextPeriod - stats.today) / 86400000);
    const reminderDays = Number(data.settings.periodReminderDays) || 2;
    if (daysUntil === reminderDays) {
      notifyOnce(
        `period-${localDateKey(stats.nextPeriod)}`,
        'Cycle reminder',
        `Your next period is estimated in ${reminderDays} day${reminderDays === 1 ? '' : 's'}. Predictions can vary.`
      );
    }
  }
}
