import { getDraft, getEvaluationById, getEvaluations, searchEvaluations } from "./storage.js";
import { formatDate, escapeHtml, verdictClass, debounce } from "./ui.js";
import { generateEvaluationPdf } from "./pdf.js";

const page = document.body.dataset.page;

if (page === "index") initIndex();
if (page === "report") initReport();

function initIndex() {
  const statsGrid = document.getElementById("statsGrid");
  const rows = document.getElementById("evaluationRows");
  const searchInput = document.getElementById("searchInput");
  const compareA = document.getElementById("compareA");
  const compareB = document.getElementById("compareB");
  const compareBtn = document.getElementById("compareBtn");
  const comparisonResult = document.getElementById("comparisonResult");
  const resumeDraftBtn = document.getElementById("resumeDraftBtn");
  const draftStatus = document.getElementById("draftStatus");

  const all = getEvaluations();
  const avgScore =
    all.length === 0 ? 0 : all.reduce((sum, item) => sum + Number(item.percentage || 0), 0) / all.length;
  const strongCount = all.filter((item) => item.verdict === "Strong Hire").length;

  statsGrid.innerHTML = `
    <article class="stat-card">
      <p class="muted">Total Evaluations</p>
      <p class="value">${all.length}</p>
    </article>
    <article class="stat-card">
      <p class="muted">Average Score</p>
      <p class="value">${avgScore.toFixed(1)}%</p>
    </article>
    <article class="stat-card">
      <p class="muted">Strong Hire</p>
      <p class="value">${strongCount}</p>
    </article>
  `;

  const draft = getDraft();
  draftStatus.textContent = draft
    ? `Draft available for ${draft.candidate?.fullName || "current candidate"} (saved ${formatDate(draft.savedAt)}).`
    : "No draft evaluation saved.";
  resumeDraftBtn.disabled = !draft;
  resumeDraftBtn.addEventListener("click", () => {
    window.location.href = "./evaluate.html";
  });

  function renderRows(list) {
    if (!list.length) {
      rows.innerHTML = `<tr><td colspan="6" class="muted">No evaluations found.</td></tr>`;
      return;
    }
    rows.innerHTML = list
      .map(
        (entry) => `
          <tr>
            <td>
              <strong>${escapeHtml(entry.candidate?.fullName || "-")}</strong><br />
              <small class="muted">${escapeHtml(entry.candidate?.email || "-")}</small>
            </td>
            <td>${escapeHtml(entry.roleName || "-")}</td>
            <td>${formatDate(entry.candidate?.interviewDate || entry.createdAt)}</td>
            <td>${Number(entry.percentage || 0).toFixed(2)}%</td>
            <td><span class="pill ${verdictClass(entry.verdict)}">${escapeHtml(entry.verdict)}</span></td>
            <td class="row gap">
              <a class="btn btn-ghost" href="./report.html?id=${encodeURIComponent(entry.id)}">View</a>
              <a class="btn btn-secondary" href="./evaluate.html?clone=${encodeURIComponent(entry.id)}">Clone</a>
            </td>
          </tr>
        `
      )
      .join("");
  }

  renderRows(all);
  searchInput.addEventListener(
    "input",
    debounce((event) => renderRows(searchEvaluations(event.target.value)))
  );

  const options = [
    `<option value="">Select candidate</option>`,
    ...all.map(
      (entry) =>
        `<option value="${escapeHtml(entry.id)}">${escapeHtml(entry.candidate?.fullName || entry.id)} (${Number(entry.percentage || 0).toFixed(1)}%)</option>`
    )
  ].join("");
  compareA.innerHTML = options;
  compareB.innerHTML = options;

  compareBtn.addEventListener("click", () => {
    const a = getEvaluationById(compareA.value);
    const b = getEvaluationById(compareB.value);
    if (!a || !b || a.id === b.id) {
      comparisonResult.innerHTML = `<p class="muted">Select two different candidates for comparison.</p>`;
      return;
    }
    comparisonResult.innerHTML = renderComparison(a, b);
  });
}

function renderComparison(a, b) {
  const moduleIds = new Set([...a.modules.map((item) => item.id), ...b.modules.map((item) => item.id)]);
  const moduleRows = [...moduleIds]
    .map((id) => {
      const left = a.modules.find((item) => item.id === id);
      const right = b.modules.find((item) => item.id === id);
      return `
        <div>${escapeHtml(left?.name || right?.name || id)}</div>
        <div>${left ? `${left.rating}/5 (${left.score.toFixed(1)})` : "-"}</div>
        <div>${right ? `${right.rating}/5 (${right.score.toFixed(1)})` : "-"}</div>
      `;
    })
    .join("");

  return `
    <div class="compare-card">
      <div class="compare-grid">
        <strong>Module</strong>
        <strong>${escapeHtml(a.candidate.fullName)}</strong>
        <strong>${escapeHtml(b.candidate.fullName)}</strong>
        ${moduleRows}
        <strong>Final</strong>
        <strong>${a.percentage.toFixed(2)}% (${escapeHtml(a.verdict)})</strong>
        <strong>${b.percentage.toFixed(2)}% (${escapeHtml(b.verdict)})</strong>
      </div>
    </div>
  `;
}

function initReport() {
  const panel = document.getElementById("reportPanel");
  const pdfBtn = document.getElementById("downloadPdfBtn");
  const printBtn = document.getElementById("printBtn");
  const id = new URL(window.location.href).searchParams.get("id");
  const target = id ? getEvaluationById(id) : getEvaluations()[0];

  if (!target) {
    panel.innerHTML = `<p class="muted">No report data found. Create an evaluation first.</p>`;
    pdfBtn.disabled = true;
    return;
  }

  panel.innerHTML = `
    <div class="summary-grid">
      <div class="summary-card">
        <p class="muted">Candidate</p>
        <p class="large">${escapeHtml(target.candidate.fullName)}</p>
        <p>${escapeHtml(target.candidate.email)} | ${escapeHtml(target.candidate.phone)}</p>
      </div>
      <div class="summary-card">
        <p class="muted">Role & Template</p>
        <p class="large">${escapeHtml(target.roleName)}</p>
        <p>${escapeHtml(target.templateName)}</p>
      </div>
      <div class="summary-card">
        <p class="muted">Final Score</p>
        <p class="large">${target.percentage.toFixed(2)}%</p>
        <span class="pill ${verdictClass(target.verdict)}">${escapeHtml(target.verdict)}</span>
      </div>
    </div>
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>Module</th>
            <th>Rating</th>
            <th>Weight</th>
            <th>Score</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          ${target.modules
            .map(
              (item) => `
              <tr>
                <td>${escapeHtml(item.name)}</td>
                <td>${item.rating}/5</td>
                <td>${item.weight}%</td>
                <td>${item.score.toFixed(2)}</td>
                <td>${escapeHtml(item.notes || "-")}</td>
              </tr>
            `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;

  pdfBtn.addEventListener("click", async () => {
    pdfBtn.disabled = true;
    pdfBtn.textContent = "Generating...";
    try {
      await generateEvaluationPdf(target, panel);
    } catch (error) {
      console.error(error);
      alert("Failed to generate PDF.");
    } finally {
      pdfBtn.disabled = false;
      pdfBtn.textContent = "Download PDF";
    }
  });
  printBtn.addEventListener("click", () => window.print());
}
