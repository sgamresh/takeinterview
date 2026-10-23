import { confirmAction } from "../components/modal.js";
import { normalizeModules, parseJsonFile } from "./storage.js";
import { escapeHtml, uuid } from "./ui.js";

const state = {
  modules: [],
  editModuleId: null,
  dirty: false
};

const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);

function status(message) {
  const element = document.getElementById("fileSyncStatus");
  if (element) element.textContent = message;
}

function setDirty(value) {
  state.dirty = value;
  status(value ? "Unsaved changes pending. Click Save to Local JSON Files." : "No unsaved changes.");
}

async function loadFromServer() {
  const response = await fetch("./api/config.php", { cache: "no-store" });
  if (!response.ok) throw new Error("Failed to load server JSON config.");
  const data = await response.json();
  if (!Array.isArray(data.modules)) throw new Error("Invalid module configuration.");
  state.modules = normalizeModules(data.modules);
  setDirty(false);
}

async function saveToServer() {
  const response = await fetch("./api/config.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ modules: state.modules })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) {
    throw new Error(result.error || "Failed to save module configuration.");
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

function openModuleForm(item = null) {
  const form = document.getElementById("moduleForm");
  form.classList.remove("hidden");
  form.innerHTML = `
    <div class="field-grid">
      <label class="field"><span>ID</span><input name="id" class="input" required value="${escapeHtml(item?.id || "")}" ${item ? "disabled" : ""} /></label>
      <label class="field"><span>Name</span><input name="name" class="input" required value="${escapeHtml(item?.name || "")}" /></label>
      <label class="field module-questions-field"><span>Questionnaire Items (one per line, optional)</span><textarea name="questionnaire" class="input" rows="6">${escapeHtml(item?.questionnaire || "")}</textarea></label>
    </div>
    <div class="inline-actions">
      <button class="btn btn-primary" type="submit">${item ? "Update" : "Add"} Skillset</button>
      <button class="btn btn-ghost" type="button" id="cancelModuleForm">Cancel</button>
    </div>
  `;
  state.editModuleId = item?.id || null;
  focusEditPanel(form);
}

function rerenderAll() {
  renderModuleRows();
}

function onStateChanged() {
  rerenderAll();
  setDirty(true);
}

function bindImport() {
  const input = document.getElementById("importModules");
  input.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await parseJsonFile(file);
      if (!Array.isArray(parsed)) throw new Error("modules.json must be an array.");
      state.modules = normalizeModules(parsed);
      onStateChanged();
      alert(`${file.name} imported into editor. Click Save to persist.`);
    } catch (error) {
      alert(`Import failed: ${error.message}`);
    } finally {
      input.value = "";
    }
  });
}

function wireForms() {
  document.getElementById("moduleForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const questions = String(formData.get("questionnaire") || "")
      .split(/\r?\n/)
      .map((question) => question.trim())
      .filter(Boolean);
    const payload = {
      id: state.editModuleId || String(formData.get("id") || "").trim() || uuid("module"),
      name: String(formData.get("name") || "").trim(),
      questionnaire: questions.join("\n")
    };
    if (state.editModuleId) {
      state.modules = state.modules.map((item) => (item.id === state.editModuleId ? payload : item));
    } else {
      state.modules.push(payload);
    }
    state.editModuleId = null;
    form.classList.add("hidden");
    onStateChanged();
  });
}

function wireGlobalActions() {
  document.getElementById("saveToFilesBtn").addEventListener("click", async () => {
    try {
      await saveToServer();
      alert("Saved to /data/modules.json.");
    } catch (error) {
      alert(`Save failed: ${error.message}`);
    }
  });

  document.getElementById("reloadFromDiskBtn").addEventListener("click", async () => {
    const confirmed = await confirmAction({
      title: "Reload from Disk",
      message: state.dirty
        ? "Discard unsaved editor changes and reload skillsets from disk?"
        : "Reload skillsets from disk?"
    });
    if (!confirmed) return;
    try {
      await loadFromServer();
      rerenderAll();
    } catch (error) {
      alert(`Reload failed: ${error.message}`);
    }
  });

  document.getElementById("newModuleBtn").addEventListener("click", () => openModuleForm());
  document.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.id === "cancelModuleForm") {
      document.getElementById("moduleForm").classList.add("hidden");
      return;
    }
    const action = target.dataset.action;
    if (!action) return;
    const id = target.dataset.id;
    if (!id) return;

    if (action === "edit-module") {
      openModuleForm(state.modules.find((item) => item.id === id));
      return;
    }
    if (action === "delete-module") {
      const confirmed = await confirmAction({ message: "Delete this skillset?" });
      if (!confirmed) return;
      state.modules = state.modules.filter((item) => item.id !== id);
      onStateChanged();
    }
  });

  bindImport();
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
