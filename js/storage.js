const STORAGE_KEYS = {
  modules: "iee_config_modules",
  roles: "iee_config_roles",
  templates: "iee_config_templates",
  evaluations: "iee_evaluations",
  draft: "iee_draft",
  importPayload: "iee_import_payload"
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

export function deleteEvaluationById(id) {
  const next = getEvaluations().filter((item) => item.id !== id);
  safeWrite(STORAGE_KEYS.evaluations, next);
  return next;
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

function normalizeKeyText(value) {
  return String(value || "").trim().toLowerCase();
}

export function findDuplicateEvaluation({ email, roleId, companyName, excludeId = "" }) {
  const nEmail = normalizeKeyText(email);
  const nRole = normalizeKeyText(roleId);
  const nCompany = normalizeKeyText(companyName);
  return (
    getEvaluations().find((item) => {
      if (excludeId && item.id === excludeId) return false;
      return (
        normalizeKeyText(item.candidate?.email) === nEmail &&
        normalizeKeyText(item.roleId) === nRole &&
        normalizeKeyText(item.candidate?.companyName) === nCompany
      );
    }) || null
  );
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
      entry.candidate?.companyName,
      entry.roleName,
      entry.templateName
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(text);
  });
}

export function getCompanyNames() {
  return [...new Set(getEvaluations().map((entry) => String(entry.candidate?.companyName || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

export function filterEvaluationsByCompany(companyName) {
  const target = String(companyName || "").trim().toLowerCase();
  if (!target) return getEvaluations();
  return getEvaluations().filter(
    (entry) => String(entry.candidate?.companyName || "").trim().toLowerCase() === target
  );
}

export function exportEvaluationsByCompany(companyName) {
  const evaluations = filterEvaluationsByCompany(companyName);
  return {
    companyName: String(companyName || "").trim(),
    exportedAt: new Date().toISOString(),
    totalEvaluations: evaluations.length,
    evaluations
  };
}

export function exportCandidateHistory({ email, companyName }) {
  const nEmail = normalizeKeyText(email);
  const nCompany = normalizeKeyText(companyName);
  const evaluations = getEvaluations().filter(
    (entry) =>
      normalizeKeyText(entry.candidate?.email) === nEmail &&
      normalizeKeyText(entry.candidate?.companyName) === nCompany
  );
  const candidate = evaluations[0]?.candidate || { email, companyName };
  return {
    companyName: String(companyName || "").trim(),
    candidate,
    exportedAt: new Date().toISOString(),
    totalEvaluations: evaluations.length,
    evaluations
  };
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

function genId(prefix = "eval") {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function toDraftFromEvaluation(evaluation) {
  if (!evaluation) return null;
  return {
    candidate: {
      ...evaluation.candidate,
      interviewDate: new Date().toISOString().slice(0, 10)
    },
    roleId: evaluation.roleId || "",
    templateId: evaluation.templateId || "",
    moduleInputs: (evaluation.modules || []).map((item) => ({
      moduleId: item.id,
      rating: Number(item.rating || 0),
      notes: String(item.notes || "")
    })),
    savedAt: new Date().toISOString()
  };
}

function normalizeImportedEvaluation(item, companyFallback = "") {
  if (!item || typeof item !== "object") return null;
  const candidate = item.candidate && typeof item.candidate === "object" ? item.candidate : {};
  const companyName = String(
    candidate.companyName || item.companyName || item.company || companyFallback || ""
  ).trim();

  return {
    ...item,
    id: String(item.id || genId("eval")),
    candidate: {
      ...candidate,
      companyName
    },
    modules: Array.isArray(item.modules) ? item.modules : [],
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export function mergeImportedCandidateData(parsed) {
  const existing = getEvaluations();
  const merged = [...existing];
  let importedCount = 0;
  let latestImported = null;
  let candidateSeed = null;

  if (!parsed || typeof parsed !== "object") {
    return { importedCount, latestImported, candidateSeed };
  }

  const companyFallback = String(parsed.companyName || parsed.company || "").trim();
  const queue = [];

  if (Array.isArray(parsed)) {
    queue.push(...parsed.map((item) => ({ evaluation: item, companyFallback })));
  } else {
    if (Array.isArray(parsed.evaluations)) {
      queue.push(...parsed.evaluations.map((item) => ({ evaluation: item, companyFallback })));
    }
    if (Array.isArray(parsed.candidates)) {
      parsed.candidates.forEach((candidateBlock) => {
        if (!candidateBlock || typeof candidateBlock !== "object") return;
        const blockCompany = String(candidateBlock.companyName || companyFallback || "").trim();
        if (candidateBlock.candidate && !candidateSeed) {
          candidateSeed = {
            ...candidateBlock.candidate,
            companyName: String(candidateBlock.candidate.companyName || blockCompany || "").trim()
          };
        }
        if (Array.isArray(candidateBlock.evaluations)) {
          queue.push(
            ...candidateBlock.evaluations.map((item) => ({
              evaluation: item,
              companyFallback: blockCompany
            }))
          );
        }
      });
    }
    if (parsed.candidate) {
      candidateSeed = {
        ...parsed.candidate,
        companyName: String(parsed.candidate.companyName || companyFallback || "").trim()
      };
    }
  }

  queue.forEach(({ evaluation, companyFallback: companyFromQueue }) => {
    const normalized = normalizeImportedEvaluation(evaluation, companyFromQueue);
    if (!normalized) return;

    if (merged.some((entry) => entry.id === normalized.id)) {
      normalized.id = genId("eval");
    }

    merged.unshift(normalized);
    importedCount += 1;
    latestImported = normalized;
  });

  if (importedCount > 0) {
    safeWrite(STORAGE_KEYS.evaluations, merged);
  }

  return {
    importedCount,
    latestImported,
    candidateSeed,
    draftFromLatest: toDraftFromEvaluation(latestImported)
  };
}

export function setImportPayload(payload) {
  safeWrite(STORAGE_KEYS.importPayload, payload);
}

export function getImportPayload() {
  return safeRead(STORAGE_KEYS.importPayload, null);
}

export function clearImportPayload() {
  localStorage.removeItem(STORAGE_KEYS.importPayload);
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
