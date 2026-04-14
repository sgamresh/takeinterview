import { escapeHtml } from "../js/ui.js";

export function renderCandidateForm(target, roles, initial = {}) {
  const roleOptions = roles
    .map((role) => `<option value="${escapeHtml(role.id)}">${escapeHtml(role.name)}</option>`)
    .join("");

  target.innerHTML = `
    <div class="field-grid">
      <label class="field">
        <span>Full Name *</span>
        <input id="fullName" name="fullName" class="input" required value="${escapeHtml(initial.fullName || "")}" />
      </label>
      <label class="field">
        <span>Email *</span>
        <input id="email" name="email" type="email" class="input" required value="${escapeHtml(initial.email || "")}" />
      </label>
      <label class="field">
        <span>Phone Number *</span>
        <input id="phone" name="phone" class="input" required value="${escapeHtml(initial.phone || "")}" />
      </label>
      <label class="field">
        <span>Years of Experience *</span>
        <input id="experience" name="experience" type="number" min="0" step="0.1" class="input" required value="${escapeHtml(initial.experience || "")}" />
      </label>
      <label class="field">
        <span>Role Applied *</span>
        <select id="roleId" name="roleId" class="input" required>
          <option value="">Select role</option>
          ${roleOptions}
        </select>
      </label>
      <label class="field">
        <span>Interview Date *</span>
        <input id="interviewDate" name="interviewDate" type="date" class="input" required value="${escapeHtml(initial.interviewDate || "")}" />
      </label>
      <label class="field">
        <span>Template *</span>
        <select id="templateId" name="templateId" class="input" required>
          <option value="">Select template</option>
        </select>
      </label>
    </div>
    <ul id="candidateErrors" class="error-list hidden"></ul>
  `;
}

export function readCandidateForm(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  return {
    fullName: String(data.fullName || "").trim(),
    email: String(data.email || "").trim(),
    phone: String(data.phone || "").trim(),
    experience: String(data.experience || "").trim(),
    roleId: String(data.roleId || "").trim(),
    interviewDate: String(data.interviewDate || "").trim(),
    templateId: String(data.templateId || "").trim()
  };
}

export function validateCandidate(candidate) {
  const errors = [];
  if (!candidate.fullName) errors.push("Full Name is required.");
  if (!candidate.email) errors.push("Email is required.");
  if (!candidate.phone) errors.push("Phone Number is required.");
  if (!candidate.experience) errors.push("Years of Experience is required.");
  if (!candidate.roleId) errors.push("Role Applied is required.");
  if (!candidate.interviewDate) errors.push("Interview Date is required.");
  if (!candidate.templateId) errors.push("Template selection is required.");
  return errors;
}

export function showErrors(target, errors) {
  if (!errors.length) {
    target.innerHTML = "";
    target.classList.add("hidden");
    return;
  }
  target.classList.remove("hidden");
  target.innerHTML = errors.map((error) => `<li>${escapeHtml(error)}</li>`).join("");
}
