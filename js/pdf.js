function ensureJsPdf() {
  return window.jspdf?.jsPDF || null;
}

export async function generateEvaluationPdf(evaluation, reportElement) {
  const JsPdf = ensureJsPdf();
  if (!JsPdf || !window.html2canvas) {
    alert("PDF dependencies are unavailable. Use Print as a fallback.");
    return false;
  }
  if (!reportElement) {
    alert("Report section not found for PDF export.");
    return false;
  }

  const originalWidth = reportElement.style.width;
  reportElement.style.width = "1024px";

  const canvas = await window.html2canvas(reportElement, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff"
  });

  reportElement.style.width = originalWidth;

  const pdf = new JsPdf("p", "pt", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 24;
  const contentWidth = pageWidth - margin * 2;
  const imgWidth = contentWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  let heightLeft = imgHeight;
  let position = margin;

  const imgData = canvas.toDataURL("image/png");
  pdf.addImage(imgData, "PNG", margin, position, imgWidth, imgHeight, "", "FAST");
  heightLeft -= pageHeight - margin * 2;

  while (heightLeft > 0) {
    pdf.addPage();
    position = margin - (imgHeight - heightLeft);
    pdf.addImage(imgData, "PNG", margin, position, imgWidth, imgHeight, "", "FAST");
    heightLeft -= pageHeight - margin * 2;
  }

  const safeName = evaluation.candidate.fullName.replace(/[^a-z0-9_-]/gi, "_");
  pdf.save(`evaluation_${safeName}_${evaluation.id}.pdf`);
  return true;
}
