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

  const pdf = new JsPdf("p", "pt", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 24;
  const contentWidth = pageWidth - margin * 2;
  const pageContentHeight = pageHeight - margin * 2;
  const captureWidth = 1024;
  const pageContentCssHeight = pageContentHeight / (contentWidth / captureWidth);
  const rows = Array.from(reportElement.querySelectorAll(".table tbody tr"));
  let rowIndex = 0;
  let pageIndex = 0;

  do {
    const pageElement = reportElement.cloneNode(true);
    pageElement.style.width = `${captureWidth}px`;
    pageElement.style.position = "absolute";
    pageElement.style.left = "-10000px";
    pageElement.style.top = "0";
    pageElement.style.margin = "0";

    if (pageIndex > 0) {
      pageElement.querySelector(".summary-grid")?.remove();
    }

    const tbody = pageElement.querySelector(".table tbody");
    tbody.replaceChildren();
    document.body.append(pageElement);

    try {
      while (rowIndex < rows.length) {
        const row = rows[rowIndex].cloneNode(true);
        tbody.append(row);

        if (pageElement.getBoundingClientRect().height > pageContentCssHeight && tbody.rows.length > 1) {
          row.remove();
          break;
        }

        rowIndex += 1;
        if (pageElement.getBoundingClientRect().height > pageContentCssHeight) {
          break;
        }
      }

      const canvas = await window.html2canvas(pageElement, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff"
      });
      const imageHeight = (canvas.height * contentWidth) / canvas.width;
      const imageWidth = imageHeight > pageContentHeight
        ? (contentWidth * pageContentHeight) / imageHeight
        : contentWidth;
      const x = (pageWidth - imageWidth) / 2;

      if (pageIndex > 0) {
        pdf.addPage();
      }
      pdf.addImage(
        canvas.toDataURL("image/png"),
        "PNG",
        x,
        margin,
        imageWidth,
        Math.min(imageHeight, pageContentHeight)
      );
      canvas.width = 0;
      canvas.height = 0;
    } finally {
      pageElement.remove();
    }

    pageIndex += 1;
  } while (rowIndex < rows.length);

  const safeName = evaluation.candidate.fullName.replace(/[^a-z0-9_-]/gi, "_");
  pdf.save(`evaluation_${safeName}_${evaluation.id}.pdf`);
  return true;
}
