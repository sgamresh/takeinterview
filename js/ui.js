export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

export function verdictFromPercentage(percentage) {
  if (percentage > 75) return "Strong Hire";
  if (percentage >= 50) return "Consider";
  return "Reject";
}

export function verdictClass(verdict) {
  if (verdict === "Strong Hire") return "good";
  if (verdict === "Consider") return "mid";
  return "low";
}

export function ratingClass(rating) {
  if (rating >= 4) return "rating-good";
  if (rating === 3) return "rating-mid";
  return "rating-low";
}

export function barClass(rating) {
  if (rating >= 4) return "bar-good";
  if (rating === 3) return "bar-mid";
  return "bar-low";
}

export function debounce(fn, delay = 200) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export function uuid(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}
