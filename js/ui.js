export function setSyncStatus(type, text) {
  const dot = document.getElementById("sync-dot");
  const label = document.getElementById("sync-text");
  if (dot) dot.className = `status-dot ${type === "connected" ? "ready" : "loading"}`;
  if (label) label.textContent = text;
}

export function showToast(msg) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2800);
}
