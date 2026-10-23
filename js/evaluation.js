import {
  clearImportPayload,
  clearDraft,
  cloneEvaluationPayload,
  findDuplicateEvaluation,
  getDraft,
  getEvaluationById,
  getImportPayload,
  loadAllConfigs,
  setDraft,
  upsertEvaluation
} from "./storage.js";
import { renderCandidateForm, readCandidateForm, showErrors, validateCandidate } from "../components/form.js";
import {
  createModuleCard,
  readModuleInputs,
  updateModuleVisuals,
  validateModuleInputs
} from "../components/rating.js";
import { confirmAction } from "../components/modal.js";
import { escapeHtml, verdictFromPercentage, verdictClass, uuid } from "./ui.js";

const state = {
  modules: [],
  moduleMap: new Map(),
  moduleInputsById: new Map(),
  weightsByModuleId: new Map(),
  editingEvaluationId: null
};

const els = {
  form: document.getElementById("candidateForm"),
  skillsetSelector: document.getElementById("skillsetSelector"),
  moduleContainer: document.getElementById("moduleContainer"),
  scoreSummary: document.getElementById("scoreSummary"),
  weightsMeta: document.getElementById("weightsMeta"),
  saveDraftBtn: document.getElementById("saveDraftBtn"),
  submitBtn: document.getElementById("submitBtn"),
  resetBtn: document.getElementById("resetBtn")
};

function selectedModuleIds() {
  return [...els.skillsetSelector.querySelectorAll("input:checked")].map((input) => input.value);
}

function selectedWeight(moduleId) {
  return Number(state.weightsByModuleId.get(moduleId) || 0);
}

function defaultWeights(selection) {
  state.weightsByModuleId.clear();
  if (!selection.length) return;
  const base = Math.floor(100 / selection.length);
  let remainder = 100 - base * selection.length;
  selection.forEach((moduleId) => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    state.weightsByModuleId.set(moduleId, base + extra);
  });
}

function normalizeWeights(selection) {
  if (!selection.length) return;
  const values = selection.map((moduleId) => state.weightsByModuleId.get(moduleId));
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    defaultWeights(selection);
    return;
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!total) {
    defaultWeights(selection);
    return;
  }
  const exactWeights = values.map((value) => (value / total) * 100);
  const weights = exactWeights.map(Math.floor);
  let remainder = 100 - weights.reduce((sum, value) => sum + value, 0);
  const byRemainder = exactWeights
    .map((value, index) => ({ index, fraction: value - weights[index] }))
    .sort((left, right) => right.fraction - left.fraction);
  byRemainder.slice(0, remainder).forEach(({ index }) => {
    weights[index] += 1;
  });
  selection.forEach((moduleId, index) => state.weightsByModuleId.set(moduleId, weights[index]));
}

function updateWeightsMeta() {
  const total = selectedModuleIds().reduce((sum, moduleId) => sum + selectedWeight(moduleId), 0);
  els.weightsMeta.textContent = `Skillset weights total: ${total}% (must equal 100%)`;
}

function cacheVisibleModuleInputs() {
  readModuleInputs(els.moduleContainer).forEach((input) => {
    state.moduleInputsById.set(input.moduleId, input);
  });
}

function renderSkillsetSelector(selectedIds = []) {
  const selected = new Set(selectedIds);
  els.skillsetSelector.innerHTML = state.modules
    .map(
      (module) => `
        <label class="chip">
          <input type="checkbox" name="skillsetIds" value="${escapeHtml(module.id)}" ${selected.has(module.id) ? "checked" : ""} />
          ${escapeHtml(module.name)}
        </label>
      `
    )
    .join("");
}

function renderModulesFromSelection() {
  cacheVisibleModuleInputs();
  const selection = selectedModuleIds();
  els.moduleContainer.innerHTML = "";
  if (!selection.length) {
    els.weightsMeta.textContent = "Select one or more skillsets";
    els.moduleContainer.innerHTML = `<p class="muted">Choose the skillsets to include in this evaluation.</p>`;
    renderSummary([]);
    return;
  }

  updateWeightsMeta();
  selection.forEach((moduleId) => {
    const moduleData = state.moduleMap.get(moduleId);
    if (!moduleData) return;
    const weight = selectedWeight(moduleId);
    const card = createModuleCard(moduleData, weight, state.moduleInputsById.get(moduleId));
    const ratingOverrideEl = card.querySelector(".module-rating-override");
    const notesEl = card.querySelector(".module-notes");
    const refresh = () => {
      updateModuleVisuals(card);
      renderSummary(readModuleInputs(els.moduleContainer));
    };
    const weightInput = card.querySelector(".module-weight");
    weightInput.addEventListener("input", () => {
      const value = weightInput.value;
      state.weightsByModuleId.set(moduleId, value === "" ? 0 : Number(value));
      updateWeightsMeta();
      updateModuleVisuals(card);
      renderSummary(readModuleInputs(els.moduleContainer));
      saveDraftFromForm();
    });
    card.querySelectorAll(".star-rating-button").forEach((button) => {
      button.addEventListener("click", () => {
        const control = button.closest(".star-rating");
        const rating = Number(button.dataset.rating);
        control.dataset.rating = String(rating);
        control.querySelectorAll(".star-rating-button").forEach((star) => {
          const selected = Number(star.dataset.rating) <= rating;
          star.classList.toggle("is-selected", selected);
          star.setAttribute("aria-pressed", String(Number(star.dataset.rating) === rating));
        });
        if (control.getAttribute("aria-label").startsWith("Overall rating")) {
          ratingOverrideEl.checked = true;
        }
        refresh();
        saveDraftFromForm();
      });
    });
    notesEl.addEventListener("input", () => {
      renderSummary(readModuleInputs(els.moduleContainer));
      saveDraftFromForm();
    });
    ratingOverrideEl.addEventListener("change", () => {
      refresh();
      saveDraftFromForm();
    });
    els.moduleContainer.appendChild(card);
  });
  renderSummary(readModuleInputs(els.moduleContainer));
}

function renderSummary(inputs) {
  if (!inputs.length) {
    els.scoreSummary.innerHTML = `<p class="muted">Scoring summary appears after questionnaire items are answered or a rating is overridden.</p>`;
    return;
  }
  const ratedInputs = inputs.filter((item) => item.rating > 0);
  const totalWeight = ratedInputs.reduce((sum, item) => sum + Number(item.weight || 0), 0);
  const totalScore = inputs.reduce(
    (sum, item) => sum + Number(item.rating || 0) * Number(item.weight || 0),
    0
  );
  const maxScore = 5 * totalWeight;
  const percentage = maxScore ? (totalScore / maxScore) * 100 : 0;
  const verdict = ratedInputs.length ? verdictFromPercentage(percentage) : "";

  const moduleBlocks = inputs
    .map((item) => {
      const moduleData = state.moduleMap.get(item.moduleId);
      const weight = Number(item.weight || 0);
      const score = Number(item.rating || 0) * weight;
      return `
        <div class="summary-card">
          <strong>${escapeHtml(moduleData?.name || item.moduleId)}</strong>
          <p class="muted">${
            item.rating
              ? `Rating: ${Number(item.rating).toFixed(2)}/5${item.ratingOverride ? " (manual override)" : ""} | Weight: ${weight}%`
              : "Not rated"
          }</p>
          <p>${item.rating ? `Score: ${score.toFixed(2)}` : "Excluded from scoring"}</p>
        </div>
      `;
    })
    .join("");

  els.scoreSummary.innerHTML = `
    <div class="summary-grid">
      ${moduleBlocks}
      <div class="summary-card">
        <p class="muted">Total Score</p>
        <p class="large">${ratedInputs.length ? `${percentage.toFixed(2)}%` : "Not rated"}</p>
        ${verdict ? `<span class="pill ${verdictClass(verdict)}">${verdict}</span>` : ""}
        <p class="muted">${ratedInputs.length} of ${inputs.length} skillsets included; unrated skillsets are excluded and remaining weights normalized.</p>
      </div>
    </div>
  `;
}

function collectPayload() {
  const candidate = readCandidateForm(els.form);
  const moduleInputs = readModuleInputs(els.moduleContainer);
  const candidateErrors = validateCandidate(candidate);
  const moduleErrors = moduleInputs.length
    ? validateModuleInputs(moduleInputs, state.moduleMap)
    : ["Select at least one skillset."];
  const errors = [...candidateErrors, ...moduleErrors];
  const totalSelectedWeight = moduleInputs.reduce((sum, item) => sum + Number(item.weight || 0), 0);
  if (moduleInputs.some((item) => !item.weightValid) || Math.round(totalSelectedWeight * 100) !== 10000) {
    errors.push(`Selected skillset weights must total exactly 100%. Current total: ${totalSelectedWeight}%.`);
  }

  showErrors(document.getElementById("candidateErrors"), errors);
  if (errors.length) return { errors };

  const modules = moduleInputs.map((item) => {
    const moduleData = state.moduleMap.get(item.moduleId);
    const weight = Number(item.weight);
    return {
      id: item.moduleId,
      name: moduleData?.name || item.moduleId,
      rating: item.rating,
      ratingOverride: item.ratingOverride,
      questionRatings: item.questionRatings,
      questionnaireAnswers: String(moduleData?.questionnaire || "")
        .split(/\r?\n/)
        .map((question) => question.trim())
        .filter(Boolean)
        .map((question, index) => ({
          question,
          rating: item.questionRatings[index]
        })),
      weight,
      score: item.rating * weight,
      notes: item.notes
    };
  });
  const totalWeight = modules.reduce((sum, item) => sum + (item.rating ? Number(item.weight) : 0), 0);
  const totalScore = modules.reduce((sum, item) => sum + Number(item.score), 0);
  if (!totalWeight) {
    const ratingErrors = ["At least one skillset must have a rating to generate a report."];
    showErrors(document.getElementById("candidateErrors"), ratingErrors);
    return { errors: ratingErrors };
  }
  const percentage = (totalScore / (5 * totalWeight)) * 100;

  return {
    errors: [],
    payload: {
      id: state.editingEvaluationId || uuid("eval"),
      candidate,
      roleId: candidate.roleId,
      roleName: candidate.roleId,
      modules,
      totalScore,
      percentage,
      verdict: verdictFromPercentage(percentage)
    }
  };
}

function saveDraftFromForm() {
  cacheVisibleModuleInputs();
  const candidate = readCandidateForm(els.form);
  setDraft({
    candidate,
    roleId: candidate.roleId,
    selectedModuleIds: selectedModuleIds(),
    moduleInputs: [...state.moduleInputsById.values()],
    savedAt: new Date().toISOString()
  });
}

async function init() {
  const { modules } = await loadAllConfigs();
  state.modules = modules;
  state.moduleMap = new Map(modules.map((item) => [item.id, item]));

  const url = new URL(window.location.href);
  const cloneId = url.searchParams.get("clone");
  const reevalId = url.searchParams.get("reeval");
  const cloneData = cloneId ? cloneEvaluationPayload(cloneId) : null;
  const reevalSource = reevalId ? getEvaluationById(reevalId) : null;
  const reevalData = reevalSource
    ? {
        candidate: {
          ...reevalSource.candidate,
          roleId: reevalSource.roleName || reevalSource.roleId || "",
          interviewDate: new Date().toISOString().slice(0, 10)
        },
        roleId: reevalSource.roleName || reevalSource.roleId || "",
        selectedModuleIds: reevalSource.modules.map((item) => item.id),
        moduleInputs: reevalSource.modules.map((item) => ({
          moduleId: item.id,
          rating: item.rating,
          ratingOverride: item.ratingOverride,
          weight: item.weight,
          questionRatings: item.questionnaireAnswers?.map((answer) => answer.rating ?? "") || [],
          questionnaireAnswers: item.questionnaireAnswers,
          notes: item.notes
        }))
      }
    : null;
  const importedPayload = getImportPayload();
  if (importedPayload) clearImportPayload();
  const draft =
    reevalData ||
    cloneData ||
    importedPayload ||
    (url.searchParams.get("draft") === "1" ? getDraft() : null);
  if (reevalSource) {
    state.editingEvaluationId = reevalSource.id;
  }
  const initialCandidate = {
    ...(draft?.candidate || {}),
    roleId: draft?.roleId || draft?.candidate?.roleName || draft?.candidate?.roleId || "",
    interviewDate: draft?.candidate?.interviewDate || new Date().toISOString().slice(0, 10)
  };
  const moduleInputs = draft?.moduleInputs || [];
  moduleInputs.forEach((item) => {
    state.moduleInputsById.set(item.moduleId, item);
    if (Number.isFinite(Number(item.weight))) state.weightsByModuleId.set(item.moduleId, Number(item.weight));
  });

  renderCandidateForm(els.form, initialCandidate);
  const selectedIds = draft?.selectedModuleIds || moduleInputs.map((item) => item.moduleId);
  if (
    !selectedIds.every((moduleId) => state.weightsByModuleId.has(moduleId)) ||
    selectedIds.some((moduleId) => !Number.isInteger(state.weightsByModuleId.get(moduleId))) ||
    selectedIds.reduce((sum, moduleId) => sum + selectedWeight(moduleId), 0) !== 100
  ) {
    normalizeWeights(selectedIds);
  }
  renderSkillsetSelector(selectedIds);
  renderModulesFromSelection();

  els.skillsetSelector.addEventListener("change", () => {
    defaultWeights(selectedModuleIds());
    renderModulesFromSelection();
    saveDraftFromForm();
  });
  els.form.addEventListener("input", () => saveDraftFromForm());

  els.saveDraftBtn.addEventListener("click", () => {
    saveDraftFromForm();
    alert("Draft saved locally.");
  });

  els.resetBtn.addEventListener("click", async () => {
    const yes = await confirmAction({
      title: "Reset Evaluation",
      message: "This clears the current form and draft for this session."
    });
    if (!yes) return;
    clearDraft();
    window.location.href = "./evaluate.html";
  });

  els.submitBtn.addEventListener("click", () => {
    const { errors, payload } = collectPayload();
    if (errors.length) return;
    const duplicate = findDuplicateEvaluation({
      email: payload.candidate.email,
      roleId: payload.roleId,
      companyName: payload.candidate.companyName,
      excludeId: payload.id
    });
    if (duplicate) {
      showErrors(document.getElementById("candidateErrors"), [
        "Duplicate evaluation is not allowed for same Email + Role + Company. Use Re-evaluate on existing record."
      ]);
      return;
    }
    upsertEvaluation(payload);
    clearDraft();
    window.location.href = `./report.html?id=${encodeURIComponent(payload.id)}`;
  });
}

init().catch((error) => {
  console.error(error);
  els.moduleContainer.innerHTML = `<p class="muted">Failed to load data configuration.</p>`;
});
