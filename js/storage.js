const STORAGE_KEYS = {
  modules: "iee_config_modules",
  roles: "iee_config_roles",
  templates: "iee_config_templates",
  evaluations: "iee_evaluations",
  draft: "iee_draft"
};

function safeRead(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (error) {
    console.error(`Failed to parse localStorage key ${key}`, error);
    return fallback;
  }
}

function safeWrite(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export async function loadConfig(type) {
  const key = STORAGE_KEYS[type];
  const localOverride = safeRead(key, null);
  if (Array.isArray(localOverride)) return localOverride;
  const response = await fetch(`./data/${type}.json`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to load ${type}.json`);
  return response.json();
}

export async function loadAllConfigs() {
  const [modules, roles, templates] = await Promise.all([
    loadConfig("modules"),
    loadConfig("roles"),
    loadConfig("templates")
  ]);
  return { modules, roles, templates };
}

export function saveConfig(type, value) {
  safeWrite(STORAGE_KEYS[type], value);
}

export function clearConfig(type) {
  localStorage.removeItem(STORAGE_KEYS[type]);
}

export function getEvaluations() {
  const list = safeRead(STORAGE_KEYS.evaluations, []);
  return Array.isArray(list) ? list : [];
}

export function getEvaluationById(id) {
  return getEvaluations().find((item) => item.id === id) || null;
}

export function upsertEvaluation(evaluation) {
  const list = getEvaluations();
  const index = list.findIndex((item) => item.id === evaluation.id);
  if (index >= 0) {
    list[index] = { ...list[index], ...evaluation, updatedAt: new Date().toISOString() };
  } else {
    list.unshift({
      ...evaluation,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }
  safeWrite(STORAGE_KEYS.evaluations, list);
  return list;
}

export function setDraft(draft) {
  safeWrite(STORAGE_KEYS.draft, draft);
}

export function getDraft() {
  return safeRead(STORAGE_KEYS.draft, null);
}

export function clearDraft() {
  localStorage.removeItem(STORAGE_KEYS.draft);
}

export function searchEvaluations(query) {
  const text = query.trim().toLowerCase();
  if (!text) return getEvaluations();
  return getEvaluations().filter((entry) => {
    const haystack = [
      entry.candidate?.fullName,
      entry.candidate?.email,
      entry.roleName,
      entry.templateName
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(text);
  });
}

export function cloneEvaluationPayload(id) {
  const source = getEvaluationById(id);
  if (!source) return null;
  return {
    candidate: {
      ...source.candidate,
      interviewDate: new Date().toISOString().slice(0, 10)
    },
    roleId: source.roleId,
    templateId: source.templateId,
    moduleInputs: source.modules.map((item) => ({
      moduleId: item.id,
      rating: item.rating,
      notes: item.notes
    }))
  };
}

export function exportJsonFile(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function parseJsonFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        resolve(parsed);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
