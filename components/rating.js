import { barClass, escapeHtml, ratingClass } from "../js/ui.js";

function starsFromRating(rating) {
  const value = Number(rating) || 0;
  return `${"★".repeat(value)}${"☆".repeat(5 - value)}`;
}

export function ratingFromQuestionnaire(responses) {
  const answered = responses.filter((response) => response === "true" || response === "false");
  if (!answered.length) return 0;
  const trueCount = answered.filter((response) => response === "true").length;
  return 1 + Math.round((trueCount / answered.length) * 4);
}

export function createModuleCard(module, weight = 0, initial = {}) {
  const card = document.createElement("article");
  card.className = "module-card";
  card.dataset.moduleId = module.id;
  const questions = String(module.questionnaire || "")
    .split(/\r?\n/)
    .map((question) => question.trim())
    .filter(Boolean);
  const responses = Array.isArray(initial.questionnaireResponses)
    ? initial.questionnaireResponses
    : Array.isArray(initial.questionnaireAnswers)
      ? initial.questionnaireAnswers.map((answer) => answer.answer)
      : [];
  const ratingOverride =
    typeof initial.ratingOverride === "boolean"
      ? initial.ratingOverride
      : Number(initial.rating) > 0;

  card.innerHTML = `
    <div>
      <h3>${escapeHtml(module.name)}</h3>
      <ol class="module-questions">
        ${questions
          .map(
            (question, index) => `
              <li>
                <div class="questionnaire-item" role="group" aria-label="${escapeHtml(question)}">
                  <span class="questionnaire-prompt">${escapeHtml(question)}</span>
                  <div class="questionnaire-options">
                    ${[
                      ["true", "Y", "True"],
                      ["false", "N", "False"],
                      ["na", "NA", "Not applicable"]
                    ]
                      .map(
                        ([value, label, description]) => `
                          <label class="questionnaire-choice" title="${description}" aria-label="${description}">
                            <input type="radio" name="question_${escapeHtml(module.id)}_${index}" value="${value}" ${
                              (responses[index] || "na") === value ? "checked" : ""
                            } />
                            <span>${label}</span>
                          </label>
                        `
                      )
                      .join("")}
                  </div>
                </div>
              </li>
            `
          )
          .join("")}
      </ol>
    </div>
    <div class="field">
      <span>Weight: <strong>${Number(weight)}%</strong></span>
      <label class="rating-override">
        <input type="checkbox" class="module-rating-override" ${ratingOverride ? "checked" : ""} />
        <span>Override questionnaire rating</span>
      </label>
      <label class="field">
        <span>Rating</span>
        <select class="input module-rating" ${ratingOverride ? "" : "disabled"}>
          <option value="">No rating (all items are NA)</option>
          <option value="1">1 - Weak</option>
          <option value="2">2 - Basic</option>
          <option value="3">3 - Average</option>
          <option value="4">4 - Strong</option>
          <option value="5">5 - Excellent</option>
        </select>
      </label>
      <span class="rating-text muted">☆☆☆☆☆</span>
      <span class="muted rating-source"></span>
    </div>
    <div class="progress"><span class="bar-low"></span></div>
    <label class="field">
      <span>Notes (Optional)</span>
      <textarea class="module-notes" placeholder="Add module-specific evaluation notes..."></textarea>
    </label>
    <small class="muted module-score">Weighted score: 0.00</small>
  `;

  const ratingEl = card.querySelector(".module-rating");
  const responsesNow = [...card.querySelectorAll(".questionnaire-item")].map(
    (item) => item.querySelector("input:checked")?.value || "na"
  );
  const calculatedRating = ratingFromQuestionnaire(responsesNow);
  const initialRating = ratingOverride ? Number(initial.rating || 0) : calculatedRating;
  if (initialRating) ratingEl.value = String(initialRating);
  const notesEl = card.querySelector(".module-notes");
  if (initial.notes) notesEl.value = initial.notes;
  updateModuleVisuals(card, weight);
  return card;
}

export function updateModuleVisuals(card, weight) {
  const ratingEl = card.querySelector(".module-rating");
  const ratingOverride = card.querySelector(".module-rating-override").checked;
  ratingEl.disabled = !ratingOverride;
  if (!ratingOverride) {
    const responses = [...card.querySelectorAll(".questionnaire-item")].map(
      (item) => item.querySelector("input:checked")?.value || "na"
    );
    const calculatedRating = ratingFromQuestionnaire(responses);
    ratingEl.value = calculatedRating ? String(calculatedRating) : "";
  }
  const ratingValue = Number(ratingEl.value || 0);
  const starsEl = card.querySelector(".rating-text");
  const barEl = card.querySelector(".progress > span");
  const scoreEl = card.querySelector(".module-score");
  const sourceEl = card.querySelector(".rating-source");
  const ratio = (ratingValue / 5) * 100;

  starsEl.textContent = starsFromRating(ratingValue);
  starsEl.className = `rating-text ${ratingValue ? ratingClass(ratingValue) : "muted"}`;
  barEl.style.width = `${ratio}%`;
  barEl.className = barClass(ratingValue || 1);
  sourceEl.textContent = ratingOverride
    ? "Manual rating override"
    : ratingValue
      ? "Calculated from True/False answers; NA excluded"
      : "Not rated; all items are NA";
  scoreEl.textContent = ratingValue
    ? `Weighted score: ${(ratingValue * Number(weight || 0)).toFixed(2)}`
    : "Excluded from score (all items are NA)";
}

export function readModuleInputs(container) {
  return [...container.querySelectorAll(".module-card")].map((card) => {
    const questionnaireResponses = [...card.querySelectorAll(".questionnaire-item")].map(
      (item) => item.querySelector("input:checked")?.value || "na"
    );
    const ratingOverride = card.querySelector(".module-rating-override").checked;
    const calculatedRating = ratingFromQuestionnaire(questionnaireResponses);
    return {
      moduleId: card.dataset.moduleId,
      rating: ratingOverride
        ? Number(card.querySelector(".module-rating").value || 0)
        : calculatedRating,
      ratingOverride,
      questionnaireResponses,
      notes: String(card.querySelector(".module-notes").value || "").trim()
    };
  });
}

export function validateModuleInputs(modules, moduleMap) {
  const errors = [];
  modules.forEach((item) => {
    const moduleName = moduleMap.get(item.moduleId)?.name || item.moduleId;
    if (item.ratingOverride && !item.rating) {
      errors.push(`${moduleName}: choose a rating for the manual override.`);
    }
  });
  if (!modules.some((item) => item.rating)) {
    errors.push("Answer at least one questionnaire item or set a manual rating override.");
  }
  return errors;
}
