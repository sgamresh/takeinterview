import {
  clearDraft,
  cloneEvaluationPayload,
  getDraft,
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
  roles: [],
  templates: [],
  moduleMap: new Map()
};

const els = {
  form: document.getElementById("candidateForm"),
  moduleContainer: document.getElementById("moduleContainer"),
  scoreSummary: document.getElementById("scoreSummary"),
  weightsMeta: document.getElementById("weightsMeta"),
  saveDraftBtn: document.getElementById("saveDraftBtn"),
  submitBtn: document.getElementById("submitBtn"),
  resetBtn: document.getElementById("resetBtn")
};

function templateOptions(roleId, selectedTemplateId = "") {
  const list = state.templates.filter((tpl) => tpl.roleId === roleId);
  return [
    `<option value="">Select template</option>`,
    ...list.map(
      (tpl) =>
        `<option value="${escapeHtml(tpl.id)}" ${tpl.id === selectedTemplateId ? "selected" : ""}>${escapeHtml(tpl.name)}</option>`
    )
  ].join("");
}

function getCurrentSelection() {
  const candidate = readCandidateForm(els.form);
  const role = state.roles.find((item) => item.id === candidate.roleId) || null;
  const template = state.templates.find((item) => item.id === candidate.templateId) || null;
  return { candidate, role, template };
}

function renderModulesFromSelection(prefilledModules = []) {
  const { role, template } = getCurrentSelection();
  els.moduleContainer.innerHTML = "";
  if (!role || !template) {
    els.weightsMeta.textContent = "Select role and template";
    renderSummary([]);
    return;
  }
  els.weightsMeta.textContent = `Weights loaded from ${template.name}`;
  const prefilledMap = new Map(prefilledModules.map((item) => [item.moduleId, item]));

  role.modules.forEach((moduleId) => {
    const moduleData = state.moduleMap.get(moduleId);
    if (!moduleData) return;
    const weight = Number(template.weights?.[moduleId] || 0);
    const card = createModuleCard(moduleData, weight, prefilledMap.get(moduleId));
    const ratingEl = card.querySelector(".module-rating");
    const notesEl = card.querySelector(".module-notes");
    ratingEl.addEventListener("change", () => {
      updateModuleVisuals(card, weight);
      renderSummary(readModuleInputs(els.moduleContainer));
    });
    notesEl.addEventListener("input", () => renderSummary(readModuleInputs(els.moduleContainer)));
    els.moduleContainer.appendChild(card);
  });
  renderSummary(readModuleInputs(els.moduleContainer));
}

function renderSummary(inputs) {
  const { role, template } = getCurrentSelection();
  if (!role || !template || !inputs.length) {
    els.scoreSummary.innerHTML = `<p class="muted">Scoring summary appears after module ratings are added.</p>`;
    return;
  }
  const totalWeight = role.modules.reduce((sum, id) => sum + Number(template.weights?.[id] || 0), 0);
  const totalScore = inputs.reduce((sum, item) => sum + Number(item.rating || 0) * Number(template.weights?.[item.moduleId] || 0), 0);
  const maxScore = 5 * totalWeight;
  const percentage = maxScore ? (totalScore / maxScore) * 100 : 0;
  const verdict = verdictFromPercentage(percentage);

  const moduleBlocks = inputs
    .map((item) => {
      const moduleData = state.moduleMap.get(item.moduleId);
      const weight = Number(template.weights?.[item.moduleId] || 0);
      const score = Number(item.rating || 0) * weight;
      return `
        <div class="summary-card">
          <strong>${escapeHtml(moduleData?.name || item.moduleId)}</strong>
          <p class="muted">Rating: ${item.rating || 0}/5 | Weight: ${weight}%</p>
          <p>Score: ${score.toFixed(2)}</p>
        </div>
      `;
    })
    .join("");

  els.scoreSummary.innerHTML = `
    <div class="summary-grid">
      ${moduleBlocks}
      <div class="summary-card">
        <p class="muted">Total Score</p>
        <p class="large">${percentage.toFixed(2)}%</p>
        <span class="pill ${verdictClass(verdict)}">${verdict}</span>
      </div>
    </div>
  `;
}

function collectPayload() {
  const candidate = readCandidateForm(els.form);
  const role = state.roles.find((item) => item.id === candidate.roleId);
  const template = state.templates.find((item) => item.id === candidate.templateId);
  const moduleInputs = readModuleInputs(els.moduleContainer);
  const candidateErrors = validateCandidate(candidate);
  const moduleErrors = validateModuleInputs(moduleInputs, state.moduleMap);
  const errors = [...candidateErrors, ...moduleErrors];

  if (!role || !template) errors.push("Valid role/template combination is required.");
  showErrors(document.getElementById("candidateErrors"), errors);
  if (errors.length) return { errors };

  const modules = moduleInputs.map((item) => {
    const moduleData = state.moduleMap.get(item.moduleId);
    const weight = Number(template.weights?.[item.moduleId] || 0);
    return {
      id: item.moduleId,
      name: moduleData?.name || item.moduleId,
      rating: item.rating,
      weight,
      score: item.rating * weight,
      notes: item.notes
    };
  });
  const totalWeight = modules.reduce((sum, item) => sum + Number(item.weight), 0);
  const totalScore = modules.reduce((sum, item) => sum + Number(item.score), 0);
  const percentage = totalWeight ? (totalScore / (5 * totalWeight)) * 100 : 0;

  return {
    errors: [],
    payload: {
      id: uuid("eval"),
      candidate,
      roleId: role.id,
      roleName: role.name,
      templateId: template.id,
      templateName: template.name,
      modules,
      totalScore,
      percentage,
      verdict: verdictFromPercentage(percentage)
    }
  };
}

function saveDraftFromForm() {
  const candidate = readCandidateForm(els.form);
  const moduleInputs = readModuleInputs(els.moduleContainer);
  setDraft({
    candidate,
    roleId: candidate.roleId,
    templateId: candidate.templateId,
    moduleInputs,
    savedAt: new Date().toISOString()
  });
}

function hydrateTemplateOptions(selectedRoleId, selectedTemplateId) {
  const templateEl = document.getElementById("templateId");
  templateEl.innerHTML = templateOptions(selectedRoleId, selectedTemplateId);
}

async function init() {
  const { modules, roles, templates } = await loadAllConfigs();
  state.modules = modules;
  state.roles = roles;
  state.templates = templates;
  state.moduleMap = new Map(modules.map((item) => [item.id, item]));

  const url = new URL(window.location.href);
  const cloneId = url.searchParams.get("clone");
  const cloneData = cloneId ? cloneEvaluationPayload(cloneId) : null;
  const draft = cloneData || getDraft();
  const initialCandidate = draft?.candidate || { interviewDate: new Date().toISOString().slice(0, 10) };

  renderCandidateForm(els.form, roles, initialCandidate);
  const roleEl = document.getElementById("roleId");
  const templateEl = document.getElementById("templateId");
  roleEl.value = initialCandidate.roleId || draft?.roleId || "";
  hydrateTemplateOptions(roleEl.value, initialCandidate.templateId || draft?.templateId || "");

  roleEl.addEventListener("change", () => {
    hydrateTemplateOptions(roleEl.value, "");
    renderModulesFromSelection([]);
  });
  templateEl.addEventListener("change", () => renderModulesFromSelection([]));

  if (roleEl.value && templateEl.value) {
    renderModulesFromSelection(draft?.moduleInputs || []);
  }

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
    upsertEvaluation(payload);
    clearDraft();
    window.location.href = `./report.html?id=${encodeURIComponent(payload.id)}`;
  });

  els.form.addEventListener("input", () => saveDraftFromForm());
}

init().catch((error) => {
  console.error(error);
  els.moduleContainer.innerHTML = `<p class="muted">Failed to load data configuration.</p>`;
});
