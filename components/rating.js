import { barClass, escapeHtml, ratingClass } from "../js/ui.js";

function starsFromRating(rating) {
  const value = Number(rating) || 0;
  return `${"★".repeat(value)}${"☆".repeat(5 - value)}`;
}

export function createModuleCard(module, weight = 0, initial = {}) {
  const card = document.createElement("article");
  card.className = "module-card";
  card.dataset.moduleId = module.id;

  card.innerHTML = `
    <div>
      <h3>${escapeHtml(module.name)}</h3>
      <p class="muted">${escapeHtml(module.description || "")}</p>
    </div>
    <div class="field">
      <span>Weight: <strong>${Number(weight)}%</strong></span>
      <span>Rating *</span>
      <select class="input module-rating" required>
        <option value="">Select rating</option>
        <option value="1">1 - Weak</option>
        <option value="2">2 - Basic</option>
        <option value="3">3 - Average</option>
        <option value="4">4 - Strong</option>
        <option value="5">5 - Excellent</option>
      </select>
      <span class="rating-text muted">☆☆☆☆☆</span>
    </div>
    <div class="progress"><span class="bar-low"></span></div>
    <label class="field">
      <span>Notes (Optional)</span>
      <textarea class="module-notes" placeholder="Add module-specific evaluation notes..."></textarea>
    </label>
    <small class="muted module-score">Weighted score: 0.00</small>
  `;

  const ratingEl = card.querySelector(".module-rating");
  const notesEl = card.querySelector(".module-notes");
  if (initial.rating) ratingEl.value = String(initial.rating);
  if (initial.notes) notesEl.value = initial.notes;
  updateModuleVisuals(card, weight);
  return card;
}

export function updateModuleVisuals(card, weight) {
  const ratingValue = Number(card.querySelector(".module-rating").value || 0);
  const starsEl = card.querySelector(".rating-text");
  const barEl = card.querySelector(".progress > span");
  const scoreEl = card.querySelector(".module-score");
  const ratio = (ratingValue / 5) * 100;

  starsEl.textContent = starsFromRating(ratingValue);
  starsEl.className = `rating-text ${ratingClass(ratingValue)}`;
  barEl.style.width = `${ratio}%`;
  barEl.className = barClass(ratingValue);
  scoreEl.textContent = `Weighted score: ${(ratingValue * Number(weight || 0)).toFixed(2)}`;
}

export function readModuleInputs(container) {
  return [...container.querySelectorAll(".module-card")].map((card) => ({
    moduleId: card.dataset.moduleId,
    rating: Number(card.querySelector(".module-rating").value || 0),
    notes: String(card.querySelector(".module-notes").value || "").trim()
  }));
}

export function validateModuleInputs(modules, moduleMap) {
  const errors = [];
  modules.forEach((item) => {
    const moduleName = moduleMap.get(item.moduleId)?.name || item.moduleId;
    if (!item.rating) errors.push(`${moduleName}: rating is required.`);
  });
  return errors;
}
