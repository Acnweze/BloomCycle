function parseDate(value) {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function dayDifference(start, end) {
  return Math.round((parseDate(end) - parseDate(start)) / 86400000);
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function mostCommon(values, fallback) {
  if (!values.length) return fallback;
  const counts = values.reduce((result, value) => ({ ...result, [value]: (result[value] || 0) + 1 }), {});
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

export function getCycleAnalytics(data) {
  const periodStarts = [...new Set([...(data.profile.periodStarts || []), data.profile.lastPeriodStart].filter(Boolean))]
    .sort();
  const cycleLengths = periodStarts
    .slice(1)
    .map((date, index) => dayDifference(periodStarts[index], date))
    .filter((length) => length >= 18 && length <= 60);
  const averageCycle = cycleLengths.length
    ? Math.round(average(cycleLengths))
    : Number(data.profile.cycleLength) || 28;
  const variation = cycleLengths.length > 1
    ? Math.round(average(cycleLengths.map((length) => Math.abs(length - average(cycleLengths)))))
    : null;

  let regularity = 'Building history';
  if (variation !== null) {
    if (variation <= 2) regularity = 'Very consistent';
    else if (variation <= 5) regularity = 'Mostly consistent';
    else regularity = 'Variable';
  }

  const dailyLogs = data.dailyLogs || [];
  const sleepValues = dailyLogs.map((entry) => Number(entry.sleepHours)).filter((value) => value > 0);
  const waterValues = dailyLogs.map((entry) => Number(entry.waterGlasses)).filter((value) => value >= 0);
  const moods = dailyLogs.map((entry) => entry.mood).filter(Boolean);
  const loggedSymptoms = dailyLogs.flatMap((entry) => entry.symptoms || []);

  return {
    averageCycle,
    variation,
    regularity,
    recordedCycles: Math.max(periodStarts.length - 1, 0),
    checkInCount: dailyLogs.length,
    averageSleep: sleepValues.length ? average(sleepValues).toFixed(1) : '--',
    averageWater: waterValues.length ? average(waterValues).toFixed(1) : '--',
    topMood: mostCommon(moods, 'Not enough data'),
    topSymptom: mostCommon(loggedSymptoms, 'Not enough data'),
    moodCounts: countTop(moods, 5),
    symptomCounts: countTop(loggedSymptoms, 5),
    cycleLengths
  };
}

function countTop(values, limit) {
  const counts = {};
  values.forEach((value) => {
    counts[value] = (counts[value] || 0) + 1;
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

