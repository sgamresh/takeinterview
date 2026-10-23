import { barClass, escapeHtml, ratingClass } from "../js/ui.js";

function starsFromRating(rating) {
  const value = Math.round(Number(rating) || 0);
  return `${"★".repeat(value)}${"☆".repeat(5 - value)}`;
}

function starRatingMarkup(rating, group, disabled = false) {
  const selectedRating = Number(rating) || 0;
  return `
    <div class="star-rating${disabled ? " is-disabled" : ""}" data-rating="${selectedRating}" role="group" aria-label="${group}">
      ${[1, 2, 3, 4, 5]
        .map(
          (value) => `
            <button class="star-rating-button${value <= selectedRating ? " is-selected" : ""}" type="button"
              data-rating="${value}" aria-label="${value} out of 5 stars"
              title="${value} - ${["", "Weak", "Basic", "Average", "Strong", "Excellent"][value]}"
              aria-pressed="${value === selectedRating}" ${disabled ? "disabled" : ""}>★</button>
          `
        )
        .join("")}
    </div>
  `;
}

export function ratingFromQuestionnaire(ratings) {
  const rated = ratings
    .map(Number)
    .filter((rating) => Number.isFinite(rating) && rating >= 1 && rating <= 5);
  if (!rated.length) return 0;
  return rated.reduce((sum, rating) => sum + rating, 0) / rated.length;
}

export function createModuleCard(module, weight = 0, initial = {}) {
  const card = document.createElement("article");
  card.className = "module-card";
  card.dataset.moduleId = module.id;
  const questions = String(module.questionnaire || "")
    .split(/\r?\n/)
    .map((question) => question.trim())
    .filter(Boolean);
  const questionRatings = Array.isArray(initial.questionRatings)
    ? initial.questionRatings
    : Array.isArray(initial.questionnaireAnswers)
      ? initial.questionnaireAnswers.map((answer) => answer.rating ?? "")
      : [];
  const ratingOverride =
    typeof initial.ratingOverride === "boolean"
      ? initial.ratingOverride
      : Number(initial.rating) > 0;

  card.innerHTML = `
    <div>
      <h3>${escapeHtml(module.name)}</h3>
      <ul class="module-questions">
        ${questions
          .map(
            (question, index) => `
              <li>
                <div class="questionnaire-item" role="group" aria-label="${escapeHtml(question)}">
                  <div class="questionnaire-heading">
                    <span class="questionnaire-prompt">${escapeHtml(question)}</span>
                  </div>
                  <div class="question-rating-control">
                    <span class="muted">Question rating</span>
                    ${starRatingMarkup(questionRatings[index], `Rating for ${question}`)}
                  </div>
                </div>
              </li>
            `
          )
          .join("")}
      </ul>
    </div>
    <div class="field">
      <label class="field">
        <span>Skillset weight (%)</span>
        <input class="input module-weight" type="number" min="0" max="100" step="1" required value="${Math.round(Number(weight))}" />
      </label>
      <label class="rating-override">
        <input type="checkbox" class="module-rating-override" ${ratingOverride ? "checked" : ""} />
        <span>Override calculated rating</span>
      </label>
      <label class="field">
        <span>Overall rating override</span>
        ${starRatingMarkup(ratingOverride ? initial.rating : 0, `Overall rating for ${module.name}`, !ratingOverride)}
      </label>
      <span class="module-rating" hidden></span>
      <span class="rating-text muted">☆☆☆☆☆</span>
      <span class="rating-value muted"></span>
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
  const calculatedRating = ratingFromQuestionnaire(questionRatings);
  const initialRating = ratingOverride ? Number(initial.rating || 0) : calculatedRating;
  ratingEl.textContent = initialRating ? String(initialRating) : "";
  const notesEl = card.querySelector(".module-notes");
  if (initial.notes) notesEl.value = initial.notes;
  updateModuleVisuals(card);
  return card;
}

export function updateModuleVisuals(card) {
  const ratingEl = card.querySelector(".module-rating");
  const ratingOverride = card.querySelector(".module-rating-override").checked;
  const overallStars = card.querySelector(".star-rating[aria-label^='Overall rating']");
  overallStars.classList.toggle("is-disabled", !ratingOverride);
  const overrideRating = ratingOverride ? Number(overallStars.dataset.rating) || 0 : 0;
  overallStars.querySelectorAll("button").forEach((button) => {
    const selected = Number(button.dataset.rating) <= overrideRating;
    button.disabled = !ratingOverride;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(Number(button.dataset.rating) === overrideRating));
  });
  const questionRatings = [...card.querySelectorAll(".question-rating-control .star-rating")]
    .map((control) => Number(control.dataset.rating))
    .filter(Boolean);
  const calculatedRating = ratingFromQuestionnaire(questionRatings);
  const ratingValue = ratingOverride ? overrideRating : calculatedRating;
  const weightInput = card.querySelector(".module-weight");
  const currentWeight = weightInput.value === "" ? 0 : Number(weightInput.value);
  ratingEl.textContent = ratingValue ? String(ratingValue) : "";
  const starsEl = card.querySelector(".rating-text");
  const ratingValueEl = card.querySelector(".rating-value");
  const barEl = card.querySelector(".progress > span");
  const scoreEl = card.querySelector(".module-score");
  const sourceEl = card.querySelector(".rating-source");
  const ratio = (ratingValue / 5) * 100;

  starsEl.textContent = starsFromRating(ratingValue);
  starsEl.className = `rating-text ${ratingValue ? ratingClass(Math.round(ratingValue)) : "muted"}`;
  ratingValueEl.textContent = ratingValue ? `${ratingValue.toFixed(2)}/5` : "";
  ratingValueEl.className = `rating-value ${ratingValue ? ratingClass(Math.round(ratingValue)) : "muted"}`;
  barEl.style.width = `${ratio}%`;
  barEl.className = barClass(Math.round(ratingValue) || 1);
  sourceEl.textContent = ratingOverride
    ? "Manual rating override"
    : ratingValue
      ? "Average of individual question ratings"
      : "Not rated; rate at least one question or use the override";
  scoreEl.textContent = ratingValue
    ? `Weighted score: ${(ratingValue * currentWeight).toFixed(2)}`
    : "Excluded from score (no question ratings)";
}

export function readModuleInputs(container) {
  return [...container.querySelectorAll(".module-card")].map((card) => {
    const ratingOverride = card.querySelector(".module-rating-override").checked;
    const overallStars = card.querySelector(".star-rating[aria-label^='Overall rating']");
    const questionRatings = [...card.querySelectorAll(".question-rating-control .star-rating")].map(
      (control) => Number(control.dataset.rating) || null
    );
    const calculatedRating = ratingFromQuestionnaire(questionRatings.filter(Boolean));
    const weightInput = card.querySelector(".module-weight");
    return {
      moduleId: card.dataset.moduleId,
      rating: ratingOverride
        ? Number(overallStars.dataset.rating || 0)
        : calculatedRating,
      ratingOverride,
      questionRatings,
      weight: weightInput.value === "" ? 0 : Number(weightInput.value),
      weightValid: weightInput.validity.valid,
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
    errors.push("Rate at least one questionnaire item or set a manual rating override.");
  }
  return errors;
}
