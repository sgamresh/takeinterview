import { confirmAction } from "../components/modal.js";
import { normalizeModules, parseJsonFile } from "./storage.js";
import { escapeHtml, uuid } from "./ui.js";

const state = {
  modules: [],
  roles: [],
  templates: [],
  answerGuides: {},
  editModuleId: null,
  editRoleId: null,
  editTemplateId: null,
  dirty: false
};

const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);

function mapById(list) {
  return new Map(list.map((item) => [item.id, item]));
}

function status(message) {
  const el = document.getElementById("fileSyncStatus");
  if (el) el.textContent = message;
}

function setDirty(value) {
  state.dirty = value;
  status(value ? "Unsaved changes pending. Click Save to Local JSON Files." : "No unsaved changes.");
}

async function loadFromServer() {
  const res = await fetch("./api/config.php", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load server JSON config.");
  const data = await res.json();
  state.modules = normalizeModules(Array.isArray(data.modules) ? data.modules : []);
  state.roles = Array.isArray(data.roles) ? data.roles : [];
  state.templates = Array.isArray(data.templates) ? data.templates : [];
  const answerGuidesResponse = await fetch("./api/answer-key.php", { cache: "no-store" });
  const answerGuides = await answerGuidesResponse.json();
  if (answerGuidesResponse.status === 404 && answerGuides?.error === "Local interviewer answer guide is missing") {
    state.answerGuides = {};
    setDirty(false);
    return;
  }
  if (!answerGuidesResponse.ok || !answerGuides || typeof answerGuides !== "object" || Array.isArray(answerGuides)) {
    const message = answerGuides && typeof answerGuides === "object" ? answerGuides.error : "";
    throw new Error(message || "Failed to load the local answer key.");
  }
  state.answerGuides = answerGuides;
  setDirty(false);
}

async function saveToServer() {
  const payload = {
    modules: state.modules,
    roles: state.roles,
    templates: state.templates
  };
  const res = await fetch("./api/config.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) {
    throw new Error(json.error || "Failed to save JSON files.");
  }
  const answerKeyResponse = await fetch("./api/answer-key.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answerGuides: state.answerGuides })
  });
  const answerKeyResult = await answerKeyResponse.json().catch(() => ({}));
  if (!answerKeyResponse.ok || !answerKeyResult.ok) {
    throw new Error(
      answerKeyResult.error
        ? `Configuration files saved, but answer key save failed: ${answerKeyResult.error}`
        : "Configuration files saved, but answer key save failed."
    );
  }
  setDirty(false);
}

function focusEditPanel(form) {
  const panel = form.closest(".panel");
  requestAnimationFrame(() => {
    panel?.scrollIntoView({ behavior: "smooth", block: "start" });
    form.querySelector("input:not([disabled]), textarea, select")?.focus({ preventScroll: true });
  });
}

function renderModuleRows() {
  const target = document.getElementById("moduleRows");
  target.innerHTML = state.modules
    .map((item) => {
      const questionCount = String(item.questionnaire || "")
        .split(/\r?\n/)
        .filter((question) => question.trim()).length;
      return `
        <tr>
          <td>${escapeHtml(item.id)}</td>
          <td>${escapeHtml(item.name)}</td>
          <td>${questionCount} questionnaire items</td>
          <td class="row gap">
            <button class="btn btn-ghost" data-action="edit-module" data-id="${escapeHtml(item.id)}">Edit</button>
            <button class="btn btn-ghost" data-action="delete-module" data-id="${escapeHtml(item.id)}">Delete</button>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderRoleRows() {
  const moduleMap = mapById(state.modules);
  const target = document.getElementById("roleRows");
  target.innerHTML = state.roles
    .map((item) => {
      const chips = item.modules
        .map((id) => `<span class="chip">${escapeHtml(moduleMap.get(id)?.name || id)}</span>`)
        .join("");
      return `
        <tr>
          <td>${escapeHtml(item.id)}</td>
          <td>${escapeHtml(item.name)}</td>
          <td><div class="chip-list">${chips}</div></td>
          <td class="row gap">
            <button class="btn btn-ghost" data-action="edit-role" data-id="${escapeHtml(item.id)}">Edit</button>
            <button class="btn btn-ghost" data-action="delete-role" data-id="${escapeHtml(item.id)}">Delete</button>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderTemplateRows() {
  const roleMap = mapById(state.roles);
  const moduleMap = mapById(state.modules);
  const target = document.getElementById("templateRows");
  target.innerHTML = state.templates
    .map((item) => {
      const weights = Object.entries(item.weights || {})
        .map(([moduleId, weight]) => `${moduleMap.get(moduleId)?.name || moduleId}: ${weight}%`)
        .join(", ");
      return `
        <tr>
          <td>${escapeHtml(item.id)}</td>
          <td>${escapeHtml(item.name)}</td>
          <td>${escapeHtml(roleMap.get(item.roleId)?.name || item.roleId)}</td>
          <td>${escapeHtml(weights || "-")}</td>
          <td class="row gap">
            <button class="btn btn-ghost" data-action="edit-template" data-id="${escapeHtml(item.id)}">Edit</button>
            <button class="btn btn-ghost" data-action="delete-template" data-id="${escapeHtml(item.id)}">Delete</button>
          </td>
        </tr>
      `;
    })
    .join("");
}

function openModuleForm(item = null) {
  const form = document.getElementById("moduleForm");
  const questions = String(item?.questionnaire || "").split(/\r?\n/);
  const answerGuideFields = Array.from({ length: 5 }, (_, index) => `
    <label class="field">
      <span>Answer key - item ${index + 1}</span>
      <small class="muted">${escapeHtml(questions[index] || `Questionnaire item ${index + 1}`)}</small>
      <textarea name="answerGuide_${index}" class="input" rows="2">${escapeHtml(state.answerGuides[item?.id]?.[index] || "")}</textarea>
    </label>
  `).join("");
  form.classList.remove("hidden");
  form.innerHTML = `
    <div class="field-grid">
      <label class="field"><span>ID</span><input name="id" class="input" required value="${escapeHtml(item?.id || "")}" ${item ? "disabled" : ""} /></label>
      <label class="field"><span>Name</span><input name="name" class="input" required value="${escapeHtml(item?.name || "")}" /></label>
      <label class="field module-questions-field"><span>Questionnaire Items (one per line)</span><textarea name="questionnaire" class="input" rows="6" required>${escapeHtml(item?.questionnaire || "")}</textarea></label>
    </div>
    <div class="answer-key-editor">
      <h3>Strong-answer indicators</h3>
      <p class="muted">These appear as guidance beside each questionnaire item during evaluation.</p>
      <div class="field-grid">${answerGuideFields}</div>
    </div>
    <div class="inline-actions">
      <button class="btn btn-primary" type="submit">${item ? "Update" : "Add"} Module</button>
      <button class="btn btn-ghost" type="button" id="cancelModuleForm">Cancel</button>
    </div>
  `;
  state.editModuleId = item?.id || null;
  focusEditPanel(form);
}

function openRoleForm(item = null) {
  const form = document.getElementById("roleForm");
  const checks = state.modules
    .map(
      (module) => `
      <label class="chip">
        <input type="checkbox" name="moduleIds" value="${escapeHtml(module.id)}" ${item?.modules?.includes(module.id) ? "checked" : ""} />
        ${escapeHtml(module.name)}
      </label>
    `
    )
    .join("");
  form.classList.remove("hidden");
  form.innerHTML = `
    <div class="field-grid">
      <label class="field"><span>ID</span><input name="id" class="input" required value="${escapeHtml(item?.id || "")}" ${item ? "disabled" : ""} /></label>
      <label class="field"><span>Name</span><input name="name" class="input" required value="${escapeHtml(item?.name || "")}" /></label>
    </div>
    <div class="field">
      <span>Assigned Modules</span>
      <div class="chip-list">${checks}</div>
    </div>
    <div class="inline-actions">
      <button class="btn btn-primary" type="submit">${item ? "Update" : "Add"} Role</button>
      <button class="btn btn-ghost" type="button" id="cancelRoleForm">Cancel</button>
    </div>
  `;
  state.editRoleId = item?.id || null;
  focusEditPanel(form);
}

function openTemplateForm(item = null) {
  const form = document.getElementById("templateForm");
  const roleOptions = [
    `<option value="">Select role</option>`,
    ...state.roles.map(
      (role) =>
        `<option value="${escapeHtml(role.id)}" ${item?.roleId === role.id ? "selected" : ""}>${escapeHtml(role.name)}</option>`
    )
  ].join("");

  form.classList.remove("hidden");
  form.innerHTML = `
    <div class="field-grid">
      <label class="field"><span>ID</span><input name="id" class="input" required value="${escapeHtml(item?.id || "")}" ${item ? "disabled" : ""} /></label>
      <label class="field"><span>Name</span><input name="name" class="input" required value="${escapeHtml(item?.name || "")}" /></label>
      <label class="field"><span>Role</span><select name="roleId" class="input" required>${roleOptions}</select></label>
    </div>
    <div id="weightFields" class="field-grid"></div>
    <div class="inline-actions">
      <button class="btn btn-primary" type="submit">${item ? "Update" : "Add"} Template</button>
      <button class="btn btn-ghost" type="button" id="cancelTemplateForm">Cancel</button>
    </div>
  `;
  state.editTemplateId = item?.id || null;

  const roleSelect = form.querySelector("select[name='roleId']");
  const renderWeights = () => {
    const role = state.roles.find((entry) => entry.id === roleSelect.value);
    const weightTarget = form.querySelector("#weightFields");
    if (!role) {
      weightTarget.innerHTML = "<p class='muted'>Select a role to assign weights.</p>";
      return;
    }
    weightTarget.innerHTML = role.modules
      .map((moduleId) => {
        const moduleObj = state.modules.find((item2) => item2.id === moduleId);
        const weight = Number(item?.weights?.[moduleId] || 0);
        return `
          <label class="field">
            <span>Weight - ${escapeHtml(moduleObj?.name || moduleId)} (%)</span>
            <input class="input" type="number" min="0" max="100" name="weight_${escapeHtml(moduleId)}" value="${weight}" required />
          </label>
        `;
      })
      .join("");
  };
  roleSelect.addEventListener("change", renderWeights);
  renderWeights();
  focusEditPanel(form);
}

function rerenderAll() {
  renderModuleRows();
  renderRoleRows();
  renderTemplateRows();
}

function onStateChanged() {
  rerenderAll();
  setDirty(true);
}

function wireForms() {
  document.getElementById("moduleForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const fd = new FormData(form);
    const questions = String(fd.get("questionnaire") || "")
      .split(/\r?\n/)
      .map((question) => question.trim())
      .filter(Boolean);
    if (questions.length !== 5) {
      alert("Enter exactly five questionnaire items, one per line.");
      return;
    }
    const payload = {
      id: state.editModuleId || String(fd.get("id") || "").trim() || uuid("module"),
      name: String(fd.get("name") || "").trim(),
      questionnaire: questions.join("\n")
    };
    state.answerGuides[payload.id] = Array.from({ length: 5 }, (_, index) =>
      String(fd.get(`answerGuide_${index}`) || "").trim()
    );
    if (state.editModuleId) {
      state.modules = state.modules.map((item) => (item.id === state.editModuleId ? payload : item));
    } else {
      state.modules.push(payload);
    }
    state.editModuleId = null;
    form.classList.add("hidden");
    onStateChanged();
  });

  document.getElementById("roleForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const fd = new FormData(form);
    const payload = {
      id: state.editRoleId || String(fd.get("id") || "").trim() || uuid("role"),
      name: String(fd.get("name") || "").trim(),
      modules: fd.getAll("moduleIds").map(String)
    };
    if (state.editRoleId) {
      state.roles = state.roles.map((item) => (item.id === state.editRoleId ? payload : item));
    } else {
      state.roles.push(payload);
    }
    state.editRoleId = null;
    form.classList.add("hidden");
    onStateChanged();
  });

  document.getElementById("templateForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const fd = new FormData(form);
    const roleId = String(fd.get("roleId") || "").trim();
    const role = state.roles.find((entry) => entry.id === roleId);
    if (!role) return;
    const weights = role.modules.reduce((acc, moduleId) => {
      acc[moduleId] = Number(fd.get(`weight_${moduleId}`) || 0);
      return acc;
    }, {});
    const totalWeight = Object.values(weights).reduce((total, weight) => total + weight, 0);
    if (totalWeight !== 100) {
      const difference = Math.abs(totalWeight - 100);
      const comparison = totalWeight > 100 ? `exceeds 100% by ${difference}%` : `falls short of 100% by ${difference}%`;
      alert(`Template weights total ${totalWeight}%. The total must be exactly 100%; it ${comparison}.`);
      form.querySelector("input[name^='weight_']")?.focus();
      return;
    }

    const payload = {
      id: state.editTemplateId || String(fd.get("id") || "").trim() || uuid("template"),
      roleId,
      name: String(fd.get("name") || "").trim(),
      weights
    };
    if (state.editTemplateId) {
      state.templates = state.templates.map((item) => (item.id === state.editTemplateId ? payload : item));
    } else {
      state.templates.push(payload);
    }
    state.editTemplateId = null;
    form.classList.add("hidden");
    onStateChanged();
  });
}

function wireGlobalActions() {
  document.getElementById("saveToFilesBtn").addEventListener("click", async () => {
    try {
      await saveToServer();
      alert("Saved to /data JSON files.");
    } catch (error) {
      alert(`Save failed: ${error.message}`);
    }
  });

  document.getElementById("reloadFromDiskBtn").addEventListener("click", async () => {
    const ok = await confirmAction({
      title: "Reload from Disk",
      message: state.dirty
        ? "Discard unsaved editor changes and reload JSON files from disk?"
        : "Reload JSON files from disk?"
    });
    if (!ok) return;
    try {
      await loadFromServer();
      rerenderAll();
    } catch (error) {
      alert(`Reload failed: ${error.message}`);
    }
  });

  document.getElementById("newModuleBtn").addEventListener("click", () => openModuleForm());
  document.getElementById("newRoleBtn").addEventListener("click", () => openRoleForm());
  document.getElementById("newTemplateBtn").addEventListener("click", () => openTemplateForm());

  document.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const action = target.dataset.action;
    if (!action) {
      if (target.id === "cancelModuleForm") document.getElementById("moduleForm").classList.add("hidden");
      if (target.id === "cancelRoleForm") document.getElementById("roleForm").classList.add("hidden");
      if (target.id === "cancelTemplateForm") document.getElementById("templateForm").classList.add("hidden");
      return;
    }
    const id = target.dataset.id;
    if (!id) return;

    if (action === "edit-module") openModuleForm(state.modules.find((entry) => entry.id === id));
    if (action === "edit-role") openRoleForm(state.roles.find((entry) => entry.id === id));
    if (action === "edit-template") openTemplateForm(state.templates.find((entry) => entry.id === id));

    if (action === "delete-module") {
      const ok = await confirmAction({ message: "Delete this module?" });
      if (!ok) return;
      state.modules = state.modules.filter((entry) => entry.id !== id);
      delete state.answerGuides[id];
      state.roles = state.roles.map((role) => ({
        ...role,
        modules: role.modules.filter((moduleId) => moduleId !== id)
      }));
      state.templates = state.templates.map((template) => {
        const clone = { ...template, weights: { ...template.weights } };
        delete clone.weights[id];
        return clone;
      });
      onStateChanged();
    }

    if (action === "delete-role") {
      const ok = await confirmAction({ message: "Delete this role and its templates?" });
      if (!ok) return;
      state.roles = state.roles.filter((entry) => entry.id !== id);
      state.templates = state.templates.filter((entry) => entry.roleId !== id);
      onStateChanged();
    }

    if (action === "delete-template") {
      const ok = await confirmAction({ message: "Delete this template?" });
      if (!ok) return;
      state.templates = state.templates.filter((entry) => entry.id !== id);
      onStateChanged();
    }
  });

  bindImport("importModules", (parsed) => {
    if (!Array.isArray(parsed)) throw new Error("modules.json must be an array.");
    state.modules = normalizeModules(parsed);
    onStateChanged();
  });
  bindImport("importRoles", (parsed) => {
    if (!Array.isArray(parsed)) throw new Error("roles.json must be an array.");
    state.roles = parsed;
    onStateChanged();
  });
  bindImport("importTemplates", (parsed) => {
    if (!Array.isArray(parsed)) throw new Error("templates.json must be an array.");
    state.templates = parsed;
    onStateChanged();
  });
}

function bindImport(id, onSuccess) {
  const input = document.getElementById(id);
  input.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await parseJsonFile(file);
      onSuccess(parsed);
      alert(`${file.name} imported into editor. Click Save to persist.`);
    } catch (error) {
      alert(`Import failed: ${error.message}`);
    } finally {
      input.value = "";
    }
  });
}

async function init() {
  const blocked = document.getElementById("adminBlocked");
  const content = document.getElementById("adminContent");
  if (!localHosts.has(window.location.hostname)) {
    blocked.classList.remove("hidden");
    return;
  }
  content.classList.remove("hidden");

  await loadFromServer();
  rerenderAll();
  wireForms();
  wireGlobalActions();
}

init().catch((error) => {
  console.error(error);
  alert("Failed to load admin configuration.");
});
