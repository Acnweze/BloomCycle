export async function exportCyclePdf(summary, analytics) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 48;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  let y = 54;

  pdf.setFillColor(74, 36, 95);
  pdf.rect(0, 0, pageWidth, 82, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(22);
  pdf.text('BloomCycle Report', margin, 51);

  pdf.setTextColor(38, 20, 46);
  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'normal');
  y = 112;

  const analyticsLines = [
    `Recorded cycles: ${analytics.recordedCycles}`,
    `Calculated average cycle: ${analytics.averageCycle} days`,
    `Cycle regularity: ${analytics.regularity}`,
    `Saved daily check-ins: ${analytics.checkInCount}`,
    `Average sleep: ${analytics.averageSleep === '--' ? 'Not enough data' : `${analytics.averageSleep} hours`}`,
    `Average water: ${analytics.averageWater === '--' ? 'Not enough data' : `${analytics.averageWater} glasses`}`,
    `Most logged mood: ${analytics.topMood}`,
    `Most logged symptom: ${analytics.topSymptom}`,
    '',
    ...summary.split('\n')
  ];

  analyticsLines.forEach((line) => {
    const wrapped = pdf.splitTextToSize(line || ' ', pageWidth - margin * 2);
    const neededHeight = wrapped.length * 15;
    if (y + neededHeight > pageHeight - 54) {
      pdf.addPage();
      y = 54;
    }
    pdf.text(wrapped, margin, y);
    y += neededHeight;
  });

  pdf.setFontSize(8);
  pdf.setTextColor(117, 102, 120);
  pdf.text('Generated locally by BloomCycle. Tracking estimates are not medical advice.', margin, pageHeight - 24);
  pdf.save(`BloomCycle-report-${new Date().toISOString().slice(0, 10)}.pdf`);
}

