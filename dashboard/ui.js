export const uiApi = {
  showToast(message, kind = "info", timeout = 3500) {
    const wrap = this.ensureToastContainer();
    const el = document.createElement("div");
    el.className = `toast ${kind || "info"}`;
    el.textContent = message;
    wrap.appendChild(el);
    setTimeout(() => {
      el.style.transition = "opacity 300ms";
      el.style.opacity = "0";
      setTimeout(() => el.remove(), 350);
    }, timeout);
  },

  ensureToastContainer() {
    let wrap = document.getElementById("toastWrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = "toastWrap";
      wrap.className = "toast-wrap";
      document.body.appendChild(wrap);
    }
    return wrap;
  },

  showPopup(message) {
    this.showToast(message, "info");
  },

  setAuthStatus(msg, isSignedIn = false) {
    const authStatus = document.getElementById("authStatus");
    if (authStatus) authStatus.textContent = msg || "";
    
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) logoutBtn.style.display = isSignedIn ? "inline-block" : "none";
    
    const display = isSignedIn ? "none" : "";
    ["username", "password", "signupBtn", "loginBtn"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = display;
    });
  },

  createOverlay(id, className = "overlay-base") {
    let overlay = document.getElementById(id);
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = id;
      overlay.className = className;
      document.body.appendChild(overlay);
    }
    return overlay;
  }
};
