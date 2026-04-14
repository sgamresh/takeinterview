let mounted = false;

function mountModal() {
  if (mounted) return;
  mounted = true;
  const wrapper = document.createElement("div");
  wrapper.id = "confirmModalRoot";
  document.body.appendChild(wrapper);
}

export function confirmAction({
  title = "Please Confirm",
  message = "Do you want to continue?",
  confirmText = "Confirm",
  cancelText = "Cancel"
} = {}) {
  mountModal();
  const root = document.getElementById("confirmModalRoot");

  return new Promise((resolve) => {
    root.innerHTML = `
      <div class="modal-overlay">
        <div class="modal">
          <h3>${title}</h3>
          <p class="muted">${message}</p>
          <div class="row gap" style="margin-top: 14px;">
            <button id="modalConfirmBtn" class="btn btn-primary">${confirmText}</button>
            <button id="modalCancelBtn" class="btn btn-ghost">${cancelText}</button>
          </div>
        </div>
      </div>
    `;
    const close = (value) => {
      root.innerHTML = "";
      resolve(value);
    };
    document.getElementById("modalConfirmBtn").addEventListener("click", () => close(true));
    document.getElementById("modalCancelBtn").addEventListener("click", () => close(false));
  });
}
