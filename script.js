let tests = [];
let currentTest = null;
let questions = [];
let progress = { done: 0, total: 0 };
let scores = { topics: {} };

let totalPoints = 0;
let streak = 0;
let loseStreak = 0;
let firstAttempt = true;
let topicChart = null;
let lastChartLabels = null;
let lastChartData = null;
let testRunning = false;
let nextFlashcardTimer = null;
let endedEarly = false;

// Record runtime details (times, accuracy) for this session.
let sessionMetrics = { topics: {}, questions: [] };

// Cached current username (used by UI)
window.currentUsername = null;

function isCleanUsername(name) {
  if (!name) return false;

  const bannedWords = Array.isArray(window.bannedWords)
    ? window.bannedWords
    : [];
  if (!bannedWords.length) return true;

  const lower = name.toLowerCase().trim();

  for (const word of bannedWords) {
    if (!word) continue;
    const wordLower = String(word).toLowerCase();
    const regex = new RegExp(
      "\\b" + wordLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b",
      "i"
    );
    if (regex.test(lower)) return false;

    const stripped = lower.replace(/[^a-z0-9]/g, "");
    const strippedWord = wordLower.replace(/[^a-z0-9]/g, "");
    if (strippedWord && stripped.includes(strippedWord)) return false;
  }

  return true;
}

function isValidFormat(name) {
  return /^[a-zA-Z0-9_]{3,20}$/.test(name);
}

async function isUsernameTaken(name) {
  if (!name) return true;
  try {
    // Try username -> uid map first
    if (!window.db || !window.doc || !window.getDoc) return false;
    const dref = window.doc(window.db, "usernames", name);
    const snap = await window.getDoc(dref);
    return snap.exists();
  } catch (e) {
    console.warn("isUsernameTaken error", e);
    return false;
  }

  // After Firebase restores a session I update the UI to match.
  // Wait for auth readiness and apply persisted name
  try {
    (async function restoreAuthUi() {
      try {
        // Show cached values to avoid signed-out flash
        try {
          const cachedName =
            localStorage.getItem && localStorage.getItem("fblacer_username");
          const cachedUid =
            localStorage.getItem && localStorage.getItem("fblacer_uid");
          if (cachedName && cachedUid) {
            // Wait until the DOM is ready so UI functions can safely run.
            if (document.readyState === "loading") {
              await new Promise((res) =>
                document.addEventListener("DOMContentLoaded", res, {
                  once: true,
                })
              );
            }
            try {
              setAuthStatus("Signed in as " + cachedName, true);
            } catch (e) {}
            try {
              if (typeof window.applyAuthUsername === "function")
                window.applyAuthUsername(cachedName);
            } catch (e) {}
          }
        } catch (e) {}

        // Later I reconcile with the real auth state to stay accurate.
        if (window.leaderboardAuthReady) await window.leaderboardAuthReady;
        if (document.readyState === "loading") {
          await new Promise((res) =>
            document.addEventListener("DOMContentLoaded", res, { once: true })
          );
        }
        const user =
          window.auth && window.auth.currentUser
            ? window.auth.currentUser
            : null;
        if (user) {
          // Attempt to fetch persisted username from server
          let name =
            (localStorage.getItem &&
              localStorage.getItem("fblacer_username")) ||
            "Anonymous";
          try {
            if (window.doc && window.getDoc && window.db) {
              const ud = window.doc(window.db, "users", user.uid);
              const s = await window.getDoc(ud);
              if (s && s.exists()) {
                const d = s.data();
                if (d && d.username) name = d.username;
              }
            }
          } catch (e) {
            /* ignore */
          }
          try {
            setAuthStatus("Signed in as " + name, true);
          } catch (e) {}
          try {
            if (typeof window.applyAuthUsername === "function")
              window.applyAuthUsername(name);
          } catch (e) {}
        } else {
          try {
            setAuthStatus("Not signed in", false);
          } catch (e) {}
          try {
            if (typeof window.applyAuthUsername === "function")
              window.applyAuthUsername(null);
          } catch (e) {}
        }
      } catch (e) {}
    })();
  } catch (e) {}
}

function showPopup(message) {
  try {
    showToast(message, "info");
  } catch {
    alert(message);
  }
}

window.applyAuthUsername = function (username) {
  window.currentUsername = username || null;

  ["lbName", "username"].forEach((id) => {
    const input = document.getElementById(id);
    if (!input) return;

    input.readOnly = !!username;
    input.value = username || "";
    if (username) input.setAttribute("aria-readonly", "true");
    else input.removeAttribute("aria-readonly");
  });
};

function setAuthStatus(msg, isSignedIn = false) {
  const authStatus = document.getElementById("authStatus");
  if (authStatus) authStatus.textContent = msg || "";

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) logoutBtn.style.display = isSignedIn ? "inline-block" : "none";

  const display = isSignedIn ? "none" : "";
  ["username", "password", "signupBtn", "loginBtn"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = display;
  });
}

async function refreshAuthUi() {
  let username = localStorage.getItem("fblacer_username");
  const user = window.auth?.currentUser;

  if (!username && user && window.doc && window.getDoc && window.db) {
    try {
      const snap = await window.getDoc(
        window.doc(window.db, "users", user.uid)
      );
      username = snap?.data()?.username;
    } catch (e) {
      /* ignore */
    }
  }

  if (document.readyState === "loading") {
    await new Promise((res) =>
      document.addEventListener("DOMContentLoaded", res, { once: true })
    );
  }

  if (user) {
    setAuthStatus(`Signed in as ${username || "Anonymous"}`, true);
    window.applyAuthUsername?.(username || null);
  } else {
    setAuthStatus("Not signed in", false);
    window.applyAuthUsername?.(null);
  }
}

async function writeLog(action, context) {
  if (typeof window.writeLog === "function") {
    try {
      return await window.writeLog(action, context);
    } catch (e) {
      console.warn("window.writeLog failed", e);
    }
  }

  const uid = window.auth?.currentUser?.uid || null;
  const payload = {
    action,
    context: context || {},
    uid,
    timestamp: new Date().toISOString(),
  };

  if (window.db && window.doc && window.setDoc) {
    try {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      await window.setDoc(window.doc(window.db, "logs", id), payload);
      return true;
    } catch (e) {
      console.warn("writeLog failed", e);
    }
  }

  console.debug("writeLog:", payload);
  return false;
}

async function resolveProfileUid(clickedName) {
  if (!clickedName) return null;

  window.profileCache = window.profileCache || {};
  if (window.profileCache[clickedName]) return window.profileCache[clickedName];

  const cache = (uid) => {
    if (uid) window.profileCache[clickedName] = uid;
    return uid || null;
  };

  // Try username->uid mapping (fast path)
  try {
    const snap = await window.getDoc(
      window.doc(window.db, "usernames", clickedName)
    );
    if (snap?.exists()) return cache(snap.data()?.uid);
  } catch (err) {
    console.warn("resolveProfileUid: username lookup failed", err);
  }

  // If the input looks like a UID, I try treating it as one directly.
  try {
    if (/^[A-Za-z0-9_-]{12,64}$/.test(clickedName)) {
      const snap = await window.getDoc(
        window.doc(window.db, "users", clickedName)
      );
      if (snap?.exists()) return cache(clickedName);
    }
  } catch (err) {
    console.warn("resolveProfileUid: UID lookup failed", err);
  }

  // As a last resort I query users for a matching username.
  try {
    const q = window.query(
      window.collection(window.db, "users"),
      window.where("username", "==", clickedName)
    );
    const snap = await window.getDocs(q);
    const first = [...snap].find((doc) => doc.exists());
    if (first) return cache(first.id);
  } catch (err) {
    console.warn("resolveProfileUid: users query failed", err);
  }

  // Fallback: query accounts collection
  try {
    const q = window.query(
      window.collection(window.db, "accounts"),
      window.where("username", "==", clickedName)
    );
    const snap = await window.getDocs(q);
    const first = [...snap].find((doc) => doc.exists());
    if (first) return cache(first.data()?.uid || first.id);
  } catch (err) {
    console.warn("resolveProfileUid: accounts query failed", err);
  }

  try {
    writeLog("resolveProfileUid_failed", { clickedName });
  } catch (e) {
    /* ignore */
  }

  return null;
}

// When the page is ready I wire the auth buttons so they behave naturally.
document.addEventListener("DOMContentLoaded", () => {
  const signupBtn = document.getElementById("signupBtn");
  const loginBtn = document.getElementById("loginBtn");
  const logoutBtn = document.getElementById("logoutBtn");

  signupBtn?.addEventListener("click", async () => {
    const name = document.getElementById("username")?.value?.trim() || "";
    const password = document.getElementById("password")?.value || "";

    if (!name || !password) return showPopup("Fill out both fields.");
    if (!isValidFormat(name))
      return showPopup(
        "Username must be 3–20 characters, letters/numbers/underscores only."
      );
    if (!isCleanUsername(name))
      return showPopup("Username contains inappropriate words.");
    if (await isUsernameTaken(name))
      return showPopup("Username is already taken.");

    try {
      if (!window.authCreate) throw new Error("auth create not available");
      const userCred = await window.authCreate(
        `${name}@fblacer.local`,
        password
      );
      const uid = userCred.user.uid;

      try {
        await window.runTransaction(window.db, async (tx) => {
          const userDoc = window.doc(window.db, "usernames", name);
          const snap = await tx.get(userDoc);
          if (snap.exists()) throw new Error("username taken");
          tx.set(userDoc, { uid });
          tx.set(window.doc(window.db, "users", uid), {
            username: name,
            createdAt: new Date().toISOString(),
          });
        });
      } catch (e) {
        console.warn("transaction error", e);
      }

      setAuthStatus(`Account created. Logged in as ${name}`, true);
      window.applyAuthUsername?.(name);
      localStorage.setItem("fblacer_username", name);
      localStorage.setItem("fblacer_uid", uid);
      showPopup("Account created!");
      writeLog("signup", { username: name, uid });
    } catch (err) {
      showPopup(`Signup failed: ${err?.message || err}`);
    }
  });

  loginBtn?.addEventListener("click", async () => {
    const name = document.getElementById("username")?.value?.trim() || "";
    const password = document.getElementById("password")?.value || "";

    if (!name || !password) return showPopup("Fill out both fields.");

    try {
      if (!window.authSignIn) throw new Error("auth sign-in not available");
      await window.authSignIn(`${name}@fblacer.local`, password);

      setAuthStatus(`Logged in as ${name}`, true);
      window.applyAuthUsername?.(name);
      localStorage.setItem("fblacer_username", name);
      if (window.auth?.currentUser?.uid) {
        localStorage.setItem("fblacer_uid", window.auth.currentUser.uid);
      }

      try {
        const uid = window.auth?.currentUser?.uid;
        if (uid && window.doc && window.setDoc && window.db) {
          await window.setDoc(window.doc(window.db, "usernames", name), {
            uid,
          });
        }
      } catch (e) {
        console.warn("ensure username mapping failed", e);
      }

      showPopup("Logged in!");
    } catch (err) {
      showPopup(`Login failed: ${err?.message || err}`);
    }
  });

  logoutBtn?.addEventListener("click", async () => {
    try {
      if (!window.authSignOut) throw new Error("signOut not available");
      await window.authSignOut();
      setAuthStatus("Signed out", false);
      window.applyAuthUsername?.(null);
      localStorage.removeItem("fblacer_username");
      localStorage.removeItem("fblacer_uid");
      showPopup("Signed out");
    } catch (e) {
      showPopup(`Sign out failed: ${e?.message || e}`);
    }
  });

  // Attach confirmation for ending tests
  const endBtn = document.getElementById("endBtn");
  endBtn?.addEventListener("click", () => {
    if (testRunning) confirmEndTest();
  });
});

// Listen for auth state changes and update UI
try {
  if (window.auth) {
    window.auth.onAuthStateChanged?.(async (user) => {
      try {
        if (user) {
          // Try reading username from users/{uid}
          let name = "Anonymous";
          try {
            const udoc = window.doc(window.db, "users", user.uid);
            const snap = await window.getDoc(udoc);
            if (snap && snap.exists()) {
              const data = snap.data();
              if (data && data.username) name = data.username;
            }
          } catch (e) {}
          setAuthStatus("Signed in as " + name, true);
          try {
            if (typeof window.applyAuthUsername === "function")
              window.applyAuthUsername(name);
          } catch (e) {}
        } else {
          setAuthStatus("Not signed in", false);
          try {
            if (typeof window.applyAuthUsername === "function")
              window.applyAuthUsername(null);
          } catch (e) {}
        }
      } catch (e) {}
    });
  }
} catch (e) {}

// Use ALEKS canvas renderer for topic visuals

// The settings panel holds theme toggles and a place to send feedback.
document.addEventListener("DOMContentLoaded", () => {
  const root = document.documentElement;
  // Restore saved dark-mode preference
  const saved = localStorage.getItem("fblacer-dark");
  if (saved === "1") root.classList.add("dark");

  // Grab UI elements I will interact with in the settings modal.
  const settingsBtn = document.getElementById("settingsBtn");
  const settingsModal = document.getElementById("settingsModal");
  const settingsClose = document.getElementById("settingsClose");
  const darkToggle = document.getElementById("settingsDarkToggle");
  const issueText = document.getElementById("issueText");
  const issueEmail = document.getElementById("issueEmail");
  const sendIssueBtn = document.getElementById("sendIssueBtn");
  const reportStatus = document.getElementById("reportStatus");
  const viewProfileBtn = document.getElementById("viewProfileBtn");

  // Make sure the toggle reflects the current theme state.
  if (darkToggle) darkToggle.checked = root.classList.contains("dark");

  function setDarkMode(on) {
    if (on) {
      root.classList.add("dark");
      localStorage.setItem("fblacer-dark", "1");
    } else {
      root.classList.remove("dark");
      localStorage.setItem("fblacer-dark", "0");
    }
    try {
      if (typeof updateChartTheme === "function") updateChartTheme();
    } catch (e) {}
  }

  // Opening the modal populates quick info and ties the controls together.
  if (settingsBtn)
    settingsBtn.addEventListener("click", () => {
      if (settingsModal) {
        settingsModal.style.display = "flex";
        settingsModal.setAttribute("aria-hidden", "false");
      }
      try {
        // Fast path: show cached username so the modal doesn't briefly show signed-out.
        const cachedName =
          (localStorage.getItem && localStorage.getItem("fblacer_username")) ||
          null;
        const cachedUid =
          (localStorage.getItem && localStorage.getItem("fblacer_uid")) || null;
        const user =
          window.auth && window.auth.currentUser
            ? window.auth.currentUser
            : null;
        console.debug(
          "settings open: cachedName, cachedUid, auth.currentUser:",
          cachedName,
          cachedUid,
          user && user.uid
        );
        if (cachedName || user) {
          const displayName = cachedName || (user ? "Anonymous" : "");
          try {
            setAuthStatus("Signed in as " + displayName, true);
          } catch (e) {}
          try {
            if (typeof window.applyAuthUsername === "function")
              window.applyAuthUsername(cachedName || null);
          } catch (e) {}
        }
      } catch (e) {
        console.warn("settings fast path error", e);
      }
      try {
        refreshAuthUi();
      } catch (e) {
        console.warn("refreshAuthUi failed", e);
      }
      // Keep the toggle visual synced with the active theme.
      if (darkToggle) darkToggle.checked = root.classList.contains("dark");
    });

  if (viewProfileBtn)
    viewProfileBtn.addEventListener("click", async () => {
      // If I know the current user, open their profile; otherwise ask for a name.
      const uid =
        (window.auth &&
          window.auth.currentUser &&
          window.auth.currentUser.uid) ||
        (localStorage.getItem && localStorage.getItem("fblacer_uid")) ||
        null;
      if (uid) {
        showProfileOverlay(uid);
      } else {
        const who = prompt("Enter username to view public profile:");
        if (who) {
          // Prefer username->uid map for profile lookup
          try {
            if (window.doc && window.getDoc && window.db) {
              const uref = window.doc(window.db, "usernames", who);
              const s = await window.getDoc(uref);
              if (s && s.exists()) {
                const d = s.data();
                if (d && d.uid) showProfileOverlay(d.uid);
                else alert("Profile not found");
              } else alert("Profile not found");
            }
          } catch (e) {
            alert("Profile lookup failed");
          }
        }
      }
    });
  // Add "View scores" helper to settings
  try {
    const existing = document.getElementById("viewScoresBtn");
    if (!existing) {
      const viewScoresBtn = document.createElement("button");
      viewScoresBtn.id = "viewScoresBtn";
      viewScoresBtn.textContent = "View scores";
      viewScoresBtn.style.marginLeft = "8px";
      viewScoresBtn.addEventListener("click", async () => {
        const uid =
          (window.auth &&
            window.auth.currentUser &&
            window.auth.currentUser.uid) ||
          (localStorage.getItem && localStorage.getItem("fblacer_uid")) ||
          null;
        if (!uid) return showPopup("Sign in to view your saved scores.");
        showUserScoresOverlay(uid);
      });
      if (viewProfileBtn && viewProfileBtn.parentNode)
        viewProfileBtn.parentNode.insertBefore(
          viewScoresBtn,
          viewProfileBtn.nextSibling
        );
    }
  } catch (e) {
    console.warn("Could not insert viewScores button", e);
  }
  if (settingsClose)
    settingsClose.addEventListener("click", () => {
      if (settingsModal) {
        settingsModal.style.display = "none";
        settingsModal.setAttribute("aria-hidden", "true");
      }
    });
  // Let Esc close the modal for a small, expected convenience.
  document.addEventListener("keydown", (e) => {
    if (
      e.key === "Escape" &&
      settingsModal &&
      settingsModal.style.display === "flex"
    ) {
      settingsModal.style.display = "none";
      settingsModal.setAttribute("aria-hidden", "true");
    }
  });

  if (darkToggle)
    darkToggle.addEventListener("change", (e) => {
      setDarkMode(Boolean(e.target.checked));
    });

  // The report form sends issues and optionally logs the attempt.
  if (sendIssueBtn) {
    sendIssueBtn.addEventListener("click", async () => {
      const msg = issueText ? issueText.value.trim() : "";
      const email = issueEmail ? issueEmail.value.trim() : "";
      if (!msg) {
        if (reportStatus)
          reportStatus.textContent = "Please enter a description.";
        return;
      }
      if (reportStatus) {
        reportStatus.textContent = "Sending...";
      }
      try {
        if (!window.reportApi || !window.reportApi.sendIssue)
          throw new Error("report API not available");
        await window.reportApi.sendIssue({
          message: msg,
          email,
          page: location.pathname,
        });
        if (reportStatus) reportStatus.textContent = "Report sent — thank you.";
        if (issueText) issueText.value = "";
        if (issueEmail) issueEmail.value = "";
        // Auto-close modal after sending
        setTimeout(() => {
          if (settingsModal) {
            settingsModal.style.display = "none";
            settingsModal.setAttribute("aria-hidden", "true");
          }
        }, 900);
        // Log report submission
        try {
          writeLog("report", {
            message: msg.slice(0, 500),
            email,
            page: location.pathname,
          });
        } catch (e) {
          console.warn("report log failed", e);
        }
      } catch (err) {
        const m = err && err.message ? err.message : String(err);
        if (reportStatus) reportStatus.textContent = "Failed to send: " + m;
      }
    });
  }
  // Legal pages open in a simple overlay so users can read policies without leaving the app.
  try {
    const openPrivacy = document.getElementById("openPrivacyBtn");
    const openTos = document.getElementById("openTosBtn");
    if (openPrivacy)
      openPrivacy.addEventListener("click", (e) => {
        e.preventDefault();
        showLegalOverlay("legal/Privacy-Policy.html", "Privacy Policy");
      });
    if (openTos)
      openTos.addEventListener("click", (e) => {
        e.preventDefault();
        showLegalOverlay("legal/Terms-of-Service.html", "Terms of Service");
      });
  } catch (e) {
    console.warn("legal button wiring failed", e);
  }
});

function getSegmentColors() {
  const dark = document.documentElement.classList.contains("dark");
  if (dark) {
    return ["#4cd08a", "#3bb0ff", "#ffd54f", "#ff8a80", "#b39ddb"];
  }
  return ["#4CAF50", "#2196F3", "#FFC107", "#E91E63", "#9C27B0"];
}

try {
  const root = document.documentElement;
  const classObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === "attributes" && m.attributeName === "class") {
        setTimeout(() => {
          try {
            if (typeof updateChartTheme === "function") updateChartTheme();
          } catch (e) {}
        }, 0);
        break;
      }
    }
  });
  classObserver.observe(root, { attributes: true, attributeFilter: ["class"] });
} catch (e) {}

function createTopicChart(ctxEl, labels, data) {
  // Render topic visuals with ALEKS canvas renderer
  try {
    // If a previous visual exists, remove it so the next render is clean.
    try {
      if (topicChart && typeof topicChart.destroy === "function")
        topicChart.destroy();
    } catch (e) {}
    topicChart = null;

    // Build a compact scores object so the ALEKS renderer gets what it expects.
    const scoresObj = { topics: {} };
    // Labels and data should match; data holds weighted values used to size slices.
    for (let i = 0; i < labels.length; i++) {
      const lab = labels[i];
      // Prefer real per-topic counts when present to keep the chart honest.
      const src =
        scores && scores.topics && scores.topics[lab]
          ? scores.topics[lab]
          : null;
      if (src) {
        scoresObj.topics[lab] = {
          firstAttemptCorrect: src.firstAttemptCorrect || 0,
          total: src.total || 0,
        };
      } else {
        // Otherwise fall back to the provided weights and round them for display.
        const val = Number(data[i]) || 0;
        scoresObj.topics[lab] = {
          firstAttemptCorrect: Math.round(val),
          total: Math.round(val),
        };
      }
    }

    // renderAleksChart returns simple helpers I can call to update or destroy the view.
    if (typeof window.renderAleksChart === "function") {
      topicChart = window.renderAleksChart(ctxEl, scoresObj);
      try {
        lastChartLabels = labels.slice();
        lastChartData = data.slice();
      } catch (e) {}
    } else {
      console.warn("renderAleksChart not loaded");
    }
  } catch (e) {
    console.error("createTopicChart error", e);
  }
}

function updateChartTheme() {
  try {
    const canvas = document.getElementById("topicChart");
    if (!canvas) return;

    const rootStyles = getComputedStyle(document.documentElement);
    const textColor =
      rootStyles.getPropertyValue("--text-color").trim() || "#102027";
    const surface =
      rootStyles.getPropertyValue("--surface").trim() || "#e6eef6";
    const cssShadow2 = rootStyles.getPropertyValue("--shadow-dark").trim();
    const cssRim2 = rootStyles.getPropertyValue("--shadow-light").trim();
    const isDark = document.documentElement.classList.contains("dark");
    const shadowColor =
      cssShadow2 || (isDark ? "rgba(0,0,0,0.72)" : "rgba(0,0,0,0.12)");
    const rimColor =
      cssRim2 || (isDark ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.6)");

    // Chart.js removed: simply destroy existing aleks chart instance (if any) and re-create
    try {
      if (topicChart && typeof topicChart.destroy === "function") {
        topicChart.destroy();
        topicChart = null;
      }
    } catch (e) {}

    if (lastChartLabels && lastChartData) {
      createTopicChart(canvas, lastChartLabels, lastChartData);
      try {
        const legendEl = document.getElementById("topicLegend");
        if (legendEl) {
          const rootStyles = getComputedStyle(document.documentElement);
          legendEl.style.color =
            rootStyles.getPropertyValue("--text-color").trim() || "#102027";
        }
      } catch (e) {}
    }
  } catch (e) {}
}

fetch("tests.json")
  .then((res) => res.json())
  .then((data) => {
    tests = data.tests || [];
    populateTestDropdown();
  });

function populateTestDropdown() {
  const dropdown = document.getElementById("testSelect");
  // add a placeholder option at the top so the custom display shows "Select test"
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select test";
  // ensure placeholder is shown initially
  placeholder.selected = true;
  dropdown.appendChild(placeholder);
  tests.forEach((test, idx) => {
    const option = document.createElement("option");
    option.value = idx;
    option.textContent = test.testName;
    dropdown.appendChild(option);
  });
  initCustomSelect();
}

function initCustomSelect() {
  const native = document.getElementById("testSelect");
  if (!native) return;
  const existing = document.getElementById("customSelect");
  if (existing) existing.remove();

  const wrapper = document.createElement("div");
  wrapper.id = "customSelect";
  wrapper.className = "custom-select-wrapper center";
  wrapper.style.display = "inline-block";
  wrapper.style.position = "relative";

  const display = document.createElement("button");
  display.type = "button";
  display.className = "custom-select-display";
  display.textContent = native.options[native.selectedIndex]
    ? native.options[native.selectedIndex].textContent
    : "Select test";
  display.setAttribute("aria-haspopup", "listbox");
  display.setAttribute("aria-expanded", "false");

  const menu = document.createElement("div");
  menu.className = "custom-select-menu";
  menu.setAttribute("role", "listbox");
  menu.style.position = "absolute";
  menu.style.top = "calc(100% + 8px)";
  menu.style.left = "0";
  menu.style.minWidth = "220px";
  menu.style.display = "none";
  // make menu scrollable and not grow beyond viewport
  menu.style.maxHeight = "320px";
  menu.style.overflowY = "auto";
  menu.style.boxSizing = "border-box";

  // add a search input at the top of the menu for filtering options
  const search = document.createElement("input");
  search.type = "search";
  search.className = "custom-select-search";
  search.placeholder = "Search tests...";
  search.setAttribute("aria-label", "Search tests");
  search.style.boxSizing = "border-box";
  search.style.width = "100%";
  search.style.padding = "8px 10px";
  search.style.margin = "0 0 6px 0";
  search.style.border = "none";
  search.style.borderRadius = "8px";
  search.style.fontSize = "14px";
  search.style.background = "rgba(255,255,255,0.9)";
  search.autocomplete = "off";
  menu.appendChild(search);

  Array.from(native.options).forEach((opt, i) => {
    // skip placeholder option (empty value) when building the clickable menu
    if (opt.value === "") return;
    const item = document.createElement("div");
    item.className = "custom-select-item";
    item.setAttribute("role", "option");
    item.textContent = opt.textContent;
    item.dataset.value = opt.value;
    if (native.value === opt.value || native.selectedIndex === i)
      item.classList.add("selected");
    item.onclick = () => {
      menu
        .querySelectorAll(".custom-select-item")
        .forEach((it) => it.classList.remove("selected"));
      item.classList.add("selected");
      native.value = opt.value;
      native.selectedIndex = i;
      display.textContent = opt.textContent;
      menu.style.display = "none";
      // menu was closed by selecting an item
      display.setAttribute("aria-expanded", "false");
      native.dispatchEvent(new Event("change", { bubbles: true }));
    };
    menu.appendChild(item);
  });

  // filter function used by the search box
  function filterMenu(q) {
    const items = menu.querySelectorAll(".custom-select-item");
    const needle = (q || "").trim().toLowerCase();
    items.forEach((it) => {
      const txt = it.textContent.trim().toLowerCase();
      if (!needle || txt.indexOf(needle) !== -1) it.style.display = "";
      else it.style.display = "none";
    });
  }

  // wire up search input
  search.addEventListener("input", (e) => {
    filterMenu(e.target.value);
  });

  display.onclick = () => {
    const open = menu.style.display === "block";
    menu.style.display = open ? "none" : "block";
    display.setAttribute("aria-expanded", String(!open));
  };

  display.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      menu.style.display = "none";
      display.setAttribute("aria-expanded", "false");
    }
  });

  document.addEventListener("click", (e) => {
    if (!wrapper.contains(e.target)) {
      menu.style.display = "none";
      display.setAttribute("aria-expanded", "false");
    }
  });

  wrapper.appendChild(display);
  wrapper.appendChild(menu);
  native.parentNode.insertBefore(wrapper, native.nextSibling);

  native.style.display = "none";
}

function startTest() {
  const dropdown = document.getElementById("testSelect");
  const startBtn = document.getElementById("startBtn");
  const endBtn = document.getElementById("endBtn");
  const selectedIndex = dropdown.value;
  if (selectedIndex === "") return;
  const selected = tests[selectedIndex];
  if (!selected || !selected.path) return;

  fetch(selected.path)
    .then((res) => res.json())
    .then((fullTest) => {
      currentTest = fullTest.testName
        ? fullTest
        : (fullTest.tests && fullTest.tests[0]) || null;
      if (!currentTest) {
        return;
      }

      questions = currentTest.topics.flatMap((t) =>
        t.questions.map((q) => ({ ...q, topic: t.topic }))
      );
      shuffleArray(questions);

      progress = { done: 0, total: questions.length };
      scores = { topics: {} };
      totalPoints = 0;
      streak = 0;
      loseStreak = 0;
      firstAttempt = true;

      if (document.getElementById("customSelect"))
        document.getElementById("customSelect").style.display = "none";
      dropdown.style.display = "none";
      startBtn.style.display = "none";
      endBtn.style.display = "inline-block";
      endedEarly = false;

      testRunning = true;
      generateFlashcard();
    })
    .catch((err) => {});
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function generateFlashcard() {
  const container = document.getElementById("flashcard-container");
  container.innerHTML = "";

  if (questions.length === 0) {
    endTest();
    return;
  }

  const question = questions.shift();
  // Shuffle options and track new correct answer
  const shuffledOptions = [...question.options];
  shuffleArray(shuffledOptions);

  const correctAnswer = question.correctAnswer;
  const newCorrectAnswer = shuffledOptions.find((opt) => opt === correctAnswer);

  // Replace question.options and question.correctAnswer with shuffled versions
  question.options = shuffledOptions;
  question.correctAnswer = newCorrectAnswer;

  progress.done++;
  firstAttempt = true;
  // question start timestamp
  const qStart = Date.now();

  const card = document.createElement("div");
  card.className = "flashcard";

  const statsRow = document.createElement("div");
  statsRow.style.display = "flex";
  statsRow.style.justifyContent = "space-between";
  statsRow.style.marginBottom = "10px";

  const pointsDiv = document.createElement("div");
  pointsDiv.id = "livePoints";
  pointsDiv.textContent = `Points: ${totalPoints}`;
  const streakDiv = document.createElement("div");
  streakDiv.id = "liveStreak";
  streakDiv.textContent = `Streak: ${streak}`;
  const progressDiv = document.createElement("div");
  progressDiv.id = "liveProgress";
  progressDiv.textContent = `Q: ${progress.done}/${progress.total}`;

  statsRow.append(pointsDiv, streakDiv, progressDiv);
  card.appendChild(statsRow);

  const questionDiv = document.createElement("div");
  questionDiv.className = "question";
  questionDiv.textContent = question.question;
  questionDiv.style.userSelect = "none";
  questionDiv.style.webkitUserSelect = "none";
  questionDiv.style.msUserSelect = "none";
  card.appendChild(questionDiv);

  const optionsList = document.createElement("ul");
  optionsList.className = "options";

  const explanationDiv = document.createElement("div");
  explanationDiv.className = "explanation";
  explanationDiv.style.display = "none";
  explanationDiv.textContent = `Explanation: ${question.explanation}`;
  card.appendChild(explanationDiv);

  let answeredCorrectly = false;

  question.options.forEach((option) => {
    const li = document.createElement("li");
    li.textContent = option;
    li.dataset.clicked = "false";

    li.onclick = () => {
      if (answeredCorrectly) return;
      if (li.dataset.clicked === "true") return;
      li.dataset.clicked = "true";

      const elapsed = Date.now() - qStart;

      // record question metric
      try {
        sessionMetrics.questions.push({
          question: question.question,
          topic: question.topic,
          elapsedMs: elapsed,
          correct: option === question.correctAnswer,
          firstAttempt: firstAttempt,
        });
        if (!sessionMetrics.topics[question.topic])
          sessionMetrics.topics[question.topic] = {
            times: [],
            correct: 0,
            attempts: 0,
          };
        sessionMetrics.topics[question.topic].times.push(elapsed);
        sessionMetrics.topics[question.topic].attempts += 1;
        if (option === question.correctAnswer)
          sessionMetrics.topics[question.topic].correct += 1;
      } catch (e) {
        console.warn("record metric failed", e);
      }

      if (option === question.correctAnswer) {
        handleCorrect(question.topic);
        li.classList.add("correct");
        answeredCorrectly = true;

        Array.from(optionsList.children).forEach((opt) =>
          opt.classList.add("answered")
        );
        if (nextFlashcardTimer) {
          clearTimeout(nextFlashcardTimer);
          nextFlashcardTimer = null;
        }
        nextFlashcardTimer = setTimeout(() => {
          if (testRunning) generateFlashcard();
        }, 800);
      } else {
        li.classList.add("incorrect");
        explanationDiv.style.display = "block";
        handleWrong(question.topic);
      }

      if (firstAttempt && option !== question.correctAnswer)
        firstAttempt = false;
      updateStats();
    };

    optionsList.appendChild(li);
  });

  card.appendChild(optionsList);
  container.appendChild(card);
}

document.addEventListener("keydown", (e) => {
  if (!["1", "2", "3", "4"].includes(e.key)) return;
  const card = document.querySelector(".flashcard");
  if (!card) return;
  const options = card.querySelectorAll(".options li");
  const idx = parseInt(e.key, 10) - 1;
  if (options[idx]) options[idx].click();
});

function handleCorrect(topic) {
  if (!scores.topics) scores.topics = {};
  if (!scores.topics[topic])
    scores.topics[topic] = { correct: 0, total: 0, firstAttemptCorrect: 0 };

  scores.topics[topic].total++;
  scores.topics[topic].correct++;

  if (firstAttempt) {
    scores.topics[topic].firstAttemptCorrect++;
    streak++;
    loseStreak = 0;
    const pts = Math.round(100 + 100 * streak * 0.15);
    totalPoints += pts;
    showFloatingPoints(`+${pts} pts`, true);
  } else {
    streak = 0;
    loseStreak = 0;
  }
}

function handleWrong(topic) {
  if (!scores.topics[topic])
    scores.topics[topic] = { correct: 0, total: 0, firstAttemptCorrect: 0 };

  scores.topics[topic].total++;

  streak = 0;
  loseStreak++;
  const lost = Math.round(50 + 50 * loseStreak * 0.15);
  const prev = totalPoints;
  totalPoints = Math.max(0, totalPoints - lost);
  const displayLost = prev === 0 && totalPoints === 0 ? 0 : lost;
  showFloatingPoints(`-${displayLost} pts`, false);
}

function showFloatingPoints(text, positive) {
  const live = document.getElementById("livePoints");
  const container = document.getElementById("floating-container");
  const el = document.createElement("div");
  el.className = "floating-pts " + (positive ? "positive" : "negative");
  el.textContent = text;

  if (live) {
    const rect = live.getBoundingClientRect();
    el.style.position = "fixed";
    el.style.left = rect.right + 8 + "px";
    el.style.top = rect.top - 8 + "px";
    el.style.zIndex = 1350;
    document.body.appendChild(el);
  } else if (container) {
    container.appendChild(el);
  } else {
    el.style.position = "fixed";
    el.style.left = "50%";
    el.style.top = "18px";
    el.style.transform = "translateX(-50%)";
    el.style.zIndex = 1350;
    document.body.appendChild(el);
  }

  setTimeout(() => {
    el.remove();
  }, 1100);
}

function updateStats() {
  document.getElementById("livePoints").textContent = `Points: ${totalPoints}`;
  document.getElementById("liveStreak").textContent = `Streak: ${streak}`;
  document.getElementById(
    "liveProgress"
  ).textContent = `Q: ${progress.done}/${progress.total}`;
}

function endTest() {
  // mark complete; if user clicked the 'End Test Now' button we set endedEarly earlier
  testRunning = false;
  if (nextFlashcardTimer) {
    clearTimeout(nextFlashcardTimer);
    nextFlashcardTimer = null;
  }
  const container = document.getElementById("flashcard-container");
  container.innerHTML = `
    <h2>Test Complete!</h2>
    <p>You answered ${progress.done} of ${progress.total} questions.</p>
    <p><strong>Total Points: ${totalPoints}</strong></p>
  `;

  const endBtn = document.getElementById("endBtn");
  if (endBtn) endBtn.style.display = "none";

  const chartContainer = document.getElementById("chart-container");
  chartContainer.style.display = "block";

  const labels = Object.keys(scores.topics);

  const percentages = labels.map((topic) => {
    const { firstAttemptCorrect, total } = scores.topics[topic];
    return total > 0 ? (firstAttemptCorrect / total) * 100 : 0;
  });

  const weights = labels.map((topic) => scores.topics[topic].total);
  const data = percentages.map((pct, idx) => pct * weights[idx]);

  const rootStyles = getComputedStyle(document.documentElement);
  const textColor =
    rootStyles.getPropertyValue("--text-color").trim() || "#102027";
  const surface = rootStyles.getPropertyValue("--surface").trim() || "#e6eef6";

  createTopicChart(document.getElementById("topicChart"), labels, data);

  let newTestBtn = document.getElementById("newTestBtn");
  if (!newTestBtn) {
    newTestBtn = document.createElement("button");
    newTestBtn.id = "newTestBtn";
    newTestBtn.textContent = "Start New Test";
    newTestBtn.style.marginTop = "20px";
    newTestBtn.onclick = () => {
      container.innerHTML = "";
      chartContainer.style.display = "none";
      const sel = document.getElementById("testSelect");
      const custom = document.getElementById("customSelect");
      if (custom) {
        custom.style.display = "inline-block";
        if (sel) sel.style.display = "none";
      } else if (sel) {
        sel.style.display = "inline-block";
      }
      document.getElementById("startBtn").style.display = "inline-block";
      newTestBtn.remove();
    };
    container.appendChild(newTestBtn);
  }

  let sendBtn = document.getElementById("sendLeaderboardBtn");
  if (!sendBtn) {
    sendBtn = document.createElement("button");
    sendBtn.id = "sendLeaderboardBtn";
    sendBtn.textContent = "Send to leaderboard";
    sendBtn.style.marginTop = "12px";
    sendBtn.onclick = () => {
      const testId =
        currentTest && currentTest.testName
          ? currentTest.testName
          : document.getElementById("testSelect").value || "default";
      showLeaderboardOverlay(testId);
    };
    container.appendChild(sendBtn);
  }

  // View analytics button (only for signed-in users)
  let analyticsBtn = document.getElementById("viewAnalyticsBtn");
  if (!analyticsBtn) {
    analyticsBtn = document.createElement("button");
    analyticsBtn.id = "viewAnalyticsBtn";
    analyticsBtn.textContent = "View analytics";
    analyticsBtn.style.marginTop = "12px";
    analyticsBtn.style.marginLeft = "8px";
    analyticsBtn.onclick = () => {
      const testId =
        currentTest && currentTest.testName
          ? currentTest.testName
          : document.getElementById("testSelect").value || "default";
      showAnalyticsOverlay(testId);
    };
    container.appendChild(analyticsBtn);
  }

  // Award mastery achievement if fully completed and >=90%
  try {
    const uid =
      (window.auth && window.auth.currentUser && window.auth.currentUser.uid) ||
      (localStorage.getItem && localStorage.getItem("fblacer_uid")) ||
      null;
    const completed = progress.done === progress.total;
    const overallPct =
      progress.total > 0
        ? (Object.keys(scores.topics).reduce(
            (s, t) => s + (scores.topics[t].correct || 0),
            0
          ) /
            progress.total) *
          100
        : 0;
    if (uid && completed && !endedEarly && overallPct >= 90) {
      const testId =
        currentTest && currentTest.testName
          ? currentTest.testName
          : document.getElementById("testSelect").value || "default";
      grantAchievement(uid, `mastered ${testId}`);
    }
  } catch (e) {
    console.warn("mastery check failed", e);
  }
}

// Called when user clicks "End Test Now" to mark the test as ended early
function endEarly() {
  try {
    endedEarly = true;
  } catch (e) {}
  try {
    endTest();
  } catch (e) {}
}

// Confirmation prompt when user clicks End Test Now
function confirmEndTest() {
  // modal overlay
  let overlay = document.getElementById("endConfirmOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "endConfirmOverlay";
    document.body.appendChild(overlay);
  }
  overlay.style.cssText =
    "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.45);z-index:999999;";
  const panel = document.createElement("div");
  panel.style =
    "background:var(--surface,#fff);color:var(--text-color,#102027);padding:18px;border-radius:10px;min-width:320px;max-width:560px;box-shadow:0 12px 40px rgba(0,0,0,0.3);position:relative;";
  overlay.innerHTML = "";
  const title = document.createElement("h3");
  title.textContent = "Are you sure you want to end test";
  panel.appendChild(title);
  const note = document.createElement("div");
  note.style = "margin-top:6px;color:var(--muted,#666);";
  note.textContent =
    "Ending the test will save your score to your account (not the public leaderboard).";
  panel.appendChild(note);

  const actions = document.createElement("div");
  actions.style = "display:flex;gap:8px;margin-top:12px;align-items:center;";
  const yesBtn = document.createElement("button");
  yesBtn.textContent = "Yes";
  const noBtn = document.createElement("button");
  noBtn.textContent = "No, continue";
  const viewOnlyLink = document.createElement("a");
  viewOnlyLink.href = "#";
  viewOnlyLink.textContent = "no — view analytics for this test";
  viewOnlyLink.style =
    "margin-left:8px;align-self:center;font-size:12px;color:var(--muted,#666);text-decoration:underline;cursor:pointer;";

  yesBtn.addEventListener("click", async () => {
    try {
      // If the user is signed in, attempt to save to Firestore under users/{uid}/scores and users/{uid}/topics.
      // If the user is not signed in, allow ending the test without saving.
      const uid =
        (window.auth &&
          window.auth.currentUser &&
          window.auth.currentUser.uid) ||
        null;
      if (uid) {
        const ok = await saveScoreToFirestore();
        if (!ok) {
          // Preserve prior behavior for signed-in users: notify and do not end the test on critical save failure
          showPopup(
            "Failed to save your score. Please try again or check your connection."
          );
          return;
        }
      } else {
        // Not signed in: inform the user their score won't be saved to an account, but allow ending
        try {
          showToast &&
            showToast(
              "You are not signed in — your score will not be saved to an account.",
              "info"
            );
        } catch (e) {
          /* ignore */
        }
      }
    } catch (e) {
      console.warn("saveScoreToFirestore failed on confirm", e);
    }
    overlay.style.display = "none";
    try {
      endTest();
    } catch (e) {}
  });

  noBtn.addEventListener("click", () => {
    overlay.style.display = "none";
  });

  viewOnlyLink.addEventListener("click", (ev) => {
    ev.preventDefault();
    overlay.style.display = "none";
    const testId =
      currentTest && currentTest.testName
        ? currentTest.testName
        : document.getElementById("testSelect").value || "default";
    showAnalyticsOverlay(testId);
  });

  actions.appendChild(yesBtn);
  actions.appendChild(noBtn);
  actions.appendChild(viewOnlyLink);
  panel.appendChild(actions);
  overlay.appendChild(panel);
}

// Show signed-in user's saved tests
async function showUserScoresOverlay(uid) {
  try {
    if (!uid) return;
    let overlay = document.getElementById("userScoresOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "userScoresOverlay";
      document.body.appendChild(overlay);
    }
    overlay.style.cssText =
      "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.45);z-index:999999;";
    const panel = document.createElement("div");
    panel.style =
      "background:var(--surface,#fff);color:var(--text-color,#102027);padding:20px;border-radius:12px;min-width:280px;max-width:720px;max-height:86vh;overflow:auto;box-shadow:0 18px 48px rgba(0,0,0,0.32);position:relative;";
    overlay.innerHTML = "";
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "×";
    closeBtn.style =
      "position:absolute;right:12px;top:8px;border:none;background:none;font-size:20px;cursor:pointer;";
    closeBtn.onclick = () => {
      overlay.style.display = "none";
    };
    panel.appendChild(closeBtn);
    const title = document.createElement("h3");
    title.textContent = "Your saved tests";
    panel.appendChild(title);
    const list = document.createElement("div");
    list.style = "display:flex;flex-direction:column;gap:10px;margin-top:8px;";
    panel.appendChild(list);
    overlay.appendChild(panel);

    // Read users/{uid}/scores documents
    try {
      if (window.collection && window.getDocs && window.db) {
        const scoresCol = window.collection(window.db, "users", uid, "scores");
        const snap = await window.getDocs(scoresCol);
        const rows = [];
        if (snap && typeof snap.forEach === "function") {
          snap.forEach((s) => {
            try {
              const data = s.data ? s.data() : s._data || {};
              rows.push({
                id: s.id || s._key || "unknown",
                points: Number(data.totalPoints) || 0,
                ts: data.timestamp || data.createdAt || "",
              });
            } catch (e) {}
          });
        }
        if (!rows.length) {
          list.textContent = "No saved tests found.";
        } else {
          rows.sort((a, b) => (b.ts || "").localeCompare(a.ts || ""));
          rows.forEach((r) => {
            const row = document.createElement("div");
            row.style =
              "display:flex;justify-content:space-between;align-items:center;padding:12px;border-radius:10px;background:linear-gradient(180deg, rgba(250,250,250,0.9), rgba(240,240,240,0.9));box-shadow:0 4px 10px rgba(0,0,0,0.04);";
            const left = document.createElement("div");
            left.style = "display:flex;flex-direction:column;";
            const title = document.createElement("div");
            title.textContent = r.id;
            title.style = "font-weight:700;";
            const meta = document.createElement("div");
            meta.textContent = `${r.points} pts • ${
              r.ts ? new Date(r.ts).toLocaleString() : ""
            }`;
            meta.style = "font-size:13px;color:var(--muted,#666);";
            left.appendChild(title);
            left.appendChild(meta);
            const openBtn = document.createElement("button");
            openBtn.textContent = "View analytics";
            openBtn.addEventListener("click", () => {
              overlay.style.display = "none";
              showAnalyticsOverlay(r.id);
            });
            row.appendChild(left);
            row.appendChild(openBtn);
            list.appendChild(row);
          });
        }
      } else {
        list.textContent =
          "Unable to read saved scores from this client environment.";
      }
    } catch (e) {
      list.textContent = "Failed to load saved scores.";
      console.warn("load saved scores failed", e);
    }

    return overlay;
  } catch (e) {
    console.warn("showUserScoresOverlay error", e);
  }
}

// When saving, I write a new historical score and a topic snapshot so nothing is lost.
async function saveScoreToFirestore() {
  try {
    const uid =
      (window.auth && window.auth.currentUser && window.auth.currentUser.uid) ||
      null;
    if (!uid) {
      showPopup("You must be logged in to save your score.");
      return false;
    }

    const testId = currentTest?.testName || "unknown";
    const timestamp = new Date().toISOString();
    let topicScores = {};

    // Create a timestamped score document (append-only)
    let historyId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    try {
      const scoreRef = window.doc(window.db, "users", uid, "scores", historyId);
      await window.setDoc(scoreRef, { testId, totalPoints, timestamp });
      try {
        writeLog("save_score", { testId, totalPoints, historyId });
      } catch {}
    } catch (e) {
      console.warn("save score failed", e);
      return false; // <-- CRITICAL FAILURE
    }

    // Save compact topic breakdown snapshot
    try {
      topicScores = {};
      Object.keys(scores.topics || {}).forEach((topic) => {
        const s = scores.topics[topic] || {};
        const firstAttemptCorrect = Number(s.firstAttemptCorrect || 0);
        const total = Number(s.total || 0);
        const tmetrics = sessionMetrics?.topics?.[topic] || null;

        let avgTimeMs = null;
        if (tmetrics?.times?.length) {
          const sum = tmetrics.times.reduce((a, b) => a + b, 0);
          avgTimeMs = Math.round(sum / tmetrics.times.length);
        }
        topicScores[topic] = { firstAttemptCorrect, total, avgTimeMs };
      });

      // Include small sample of question-level data
      const qsample = Array.isArray(sessionMetrics?.questions)
        ? sessionMetrics.questions.slice(-25)
        : [];
      if (qsample.length) topicScores.sampleQuestions = qsample;

      // The topic snapshot uses the same history id so the pieces stay linked.
      const topicsRef = window.doc(
        window.db,
        "users",
        uid,
        "topics",
        historyId
      );
      await window.setDoc(topicsRef, { testId, ...topicScores, timestamp });
      try {
        writeLog("save_topics", {
          testId,
          topicCount: Object.keys(topicScores).length,
        });
      } catch {}
    } catch (e) {
      console.warn("save topics failed", e);
      return false; // <-- CRITICAL FAILURE
    }

    // Persist detailed analytics (optional)
    try {
      // Detailed analytics are saved as a separate historical doc for deep inspection.
      await persistFullAnalytics(uid, testId, sessionMetrics);
    } catch (e) {
      console.warn("persistFullAnalytics failed", e);
      // Analytics failures shouldn't block the user from finishing the save flow.
    }

    // Mirror summary to /accounts/{uid} (compat)
    try {
      const accountsRef = window.doc(window.db, "accounts", uid);
      let cachedName = null;
      try {
        cachedName = localStorage.getItem("fblacer_username");
      } catch {}
      try {
        const mapName = cachedName || "Anonymous";
        await window.setDoc(window.doc(window.db, "usernames", mapName), {
          uid,
        });
      } catch (e) {}

      const accountPayload = {
        lastUpdated: timestamp,
        username: cachedName || undefined,
        tests: { [testId]: { totalPoints, timestamp } },
        topics: { [testId]: topicScores },
      };

      if (window.runTransaction) {
        await window.runTransaction(window.db, async (tx) => {
          const snap = await tx.get(accountsRef);
          let base = snap?.exists() ? snap.data() : {};
          const merged = {
            ...base,
            lastUpdated: timestamp,
            username: accountPayload.username || base.username,
            tests: { ...(base.tests || {}), ...accountPayload.tests },
            topics: { ...(base.topics || {}), ...accountPayload.topics },
          };
          tx.set(accountsRef, merged);
        });
      } else {
        await window.setDoc(accountsRef, accountPayload, { merge: true });
      }

      try {
        writeLog("mirror_accounts", {
          testId,
          totalPoints,
          topicCount: Object.keys(topicScores).length,
        });
      } catch {}
    } catch (e) {
      console.warn("mirror accounts error", e);
      // If the mirror fails, the app still worked; I don't treat it as fatal.
    }

    showToast("Saved score to your account", "success");
    return true;
  } catch (e) {
    console.warn("saveScoreToFirestore error", e);
    return false;
  }
}

let leaderboardState = { limit: 15, lastLoaded: null };

function showLeaderboardOverlay(testId) {
  let overlay = document.getElementById("lbOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "lbOverlay";
    overlay.className = "lb-overlay";
    overlay.innerHTML = `
      <div class="lb-panel">
        <button class="lb-close" aria-label="Close">×</button>
        <h3 class="lb-title">Leaderboard</h3>
        <div class="lb-subtitle">Top scores for: <span id="lb-test-name"></span></div>
        <div class="lb-list" id="lbList" role="list"></div>
        <div class="lb-bottom">
          <div class="lb-controls">
            <button id="lbShowMore">Show more</button>
          </div>
          <div class="lb-submit">
            <input id="lbName" placeholder="Your name" maxlength="30" />
            <button id="lbSubmitBtn">Submit score</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay
      .querySelector(".lb-close")
      .addEventListener("click", closeLeaderboard);
    overlay
      .querySelector("#lbShowMore")
      .addEventListener("click", async (e) => {
        leaderboardState.limit += 15;
        await fetchAndRenderLeaderboard(testId);
      });
    overlay
      .querySelector("#lbSubmitBtn")
      .addEventListener("click", async () => {
        const nameInput = document.getElementById("lbName");
        const name = (nameInput || {}).value ? nameInput.value.trim() : "";
        // Disallow empty leaderboard names
        if (!name) {
          showToast("Please enter your name to submit a score.", "error");
          try {
            if (nameInput) {
              nameInput.focus();
            }
          } catch (e) {}
          return;
        }
        // Validate leaderboard name (format, banned words)
        try {
          if (!isValidFormat(name)) {
            showToast(
              "Name must be 3–20 characters and may only contain letters, numbers, and underscores.",
              "error"
            );
            try {
              if (nameInput) nameInput.focus();
            } catch (e) {}
            return;
          }
          if (!isCleanUsername(name)) {
            showToast(
              "That name contains inappropriate words. Please choose a different name.",
              "error"
            );
            try {
              if (nameInput) nameInput.focus();
            } catch (e) {}
            return;
          }
        } catch (e) {
          console.warn("username validation failed", e);
        }
        try {
          if (!window.leaderboardApi || !window.leaderboardApi.submitScore)
            throw new Error("Leaderboard API not available");
          if (window.leaderboardAuthReady) await window.leaderboardAuthReady;
          if (!totalPoints || Number(totalPoints) === 0) {
            showToast("Cannot submit a score of 0.", "error");
            return;
          }
          const localKey = `fblacer_sub_${testId}||${name}||${totalPoints}`;
          if (localStorage.getItem(localKey)) {
            showToast("You can only submit the same score once.", "info");
            const submitWrap = overlay.querySelector(".lb-submit");
            if (submitWrap) submitWrap.remove();
            return;
          }
          await window.leaderboardApi.submitScore(testId, name, totalPoints);
          // Log leaderboard submission
          try {
            writeLog("leaderboard_submit", {
              testId,
              name,
              points: totalPoints,
            });
          } catch (e) {
            console.warn("leaderboard_submit log failed", e);
          }
          // Persist score to user's private history when possible
          try {
            await saveScoreToFirestore();
          } catch (e) {
            /* ignore */
          }
          await fetchAndRenderLeaderboard(testId);
          document.getElementById("lbName").value = "";
          try {
            localStorage.setItem(
              localKey,
              JSON.stringify({ ts: new Date().toISOString() })
            );
          } catch (e) {}
          const submitWrap2 = overlay.querySelector(".lb-submit");
          if (submitWrap2) {
            const note = document.createElement("div");
            note.className = "lb-submitted";
            note.textContent = "Sent successfully";
            submitWrap2.parentNode.replaceChild(note, submitWrap2);
          }
          showToast("Sent successfully", "success");
        } catch (err) {
          const msg = err && err.message ? err.message : String(err);
          if (
            msg.toLowerCase().includes("permission") ||
            msg.toLowerCase().includes("missing")
          ) {
            showToast(
              "Failed to submit score: insufficient permissions.",
              "error"
            );
          } else {
            showToast("Failed to submit score: " + msg, "error");
          }
        }
      });
  }

  const testNameEl = document.getElementById("lb-test-name");
  if (testNameEl) testNameEl.textContent = testId;
  // Prefill leaderboard name from cached username when available
  (function () {
    try {
      const nameInput = document.getElementById("lbName");
      if (!nameInput) return;
      const cached =
        window.currentUsername ||
        (localStorage.getItem && localStorage.getItem("fblacer_username")) ||
        null;
      if (cached) {
        console.debug(
          "Autofill: using cached/local username for lbName",
          cached
        );
        nameInput.value = cached;
        nameInput.readOnly = true;
        nameInput.setAttribute("aria-readonly", "true");
        return;
      }
      // leave editable if no cached username
      nameInput.readOnly = false;
      nameInput.removeAttribute("aria-readonly");
    } catch (e) {
      console.warn("Autofill lbName error", e);
    }
  })();
  overlay.style.cssText =
    "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.45);z-index:99999;";
  const panelEl = overlay.querySelector(".lb-panel");
  if (panelEl) {
    panelEl.style.position = "relative";
    panelEl.style.maxHeight = "86vh";
    panelEl.style.overflow = "hidden";
    panelEl.style.width = "min(820px,96%)";
  }
  const listEl = overlay.querySelector("#lbList");
  if (listEl) {
    listEl.style.overflow = "auto";
    listEl.style.maxHeight = "56vh";
  }
  document.body.style.overflow = "hidden";
  leaderboardState.limit = 15;
  // Note: a previous Firestore fetch was removed to avoid client permission issues.
  fetchAndRenderLeaderboard(testId);
}

// The legal overlay loads a local HTML file so users can read policies inline.
async function showLegalOverlay(path, title) {
  try {
    let overlay = document.getElementById("legalOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "legalOverlay";
      document.body.appendChild(overlay);
    }
    overlay.style.cssText =
      "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.55);z-index:100000;";

    const panel = document.createElement("div");
    panel.style =
      "background:var(--surface,#fff);color:var(--text-color,#102027);padding:18px;border-radius:10px;min-width:320px;max-width:920px;max-height:86vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,0.36);position:relative;";
    overlay.innerHTML = "";

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "×";
    closeBtn.style =
      "position:absolute;right:12px;top:8px;border:none;background:none;font-size:20px;cursor:pointer;";
    closeBtn.onclick = () => {
      overlay.style.display = "none";
    };
    panel.appendChild(closeBtn);

    const h = document.createElement("h3");
    h.textContent = title || "Legal";
    panel.appendChild(h);

    const content = document.createElement("div");
    content.style = "margin-top:8px;";
    panel.appendChild(content);

    // Try to fetch policy HTML; fallback to iframe if blocked
    try {
      const res = await fetch(path);
      if (res.ok) {
        const txt = await res.text();
        // If the response contains a body tag, I extract its inner HTML for cleaner display.
        const m = txt.match(/<body[^>]*>([\s\S]*)<\/body>/i);
        const inner = m ? m[1] : txt;
        content.innerHTML = inner;
      } else {
        throw new Error("fetch failed");
      }
    } catch (e) {
      // The iframe fallback keeps the legal content accessible even when fetch is blocked.
      const iframe = document.createElement("iframe");
      iframe.src = path;
      iframe.style = "width:100%;height:70vh;border:none;border-radius:8px;";
      content.appendChild(iframe);
    }

    overlay.appendChild(panel);
    document.body.style.overflow = "hidden";
    return overlay;
  } catch (e) {
    console.warn("showLegalOverlay error", e);
  }
}

// Open analytics overlay for a specific test
async function showAnalyticsOverlay(testId) {
  try {
    // This view is personal — sign in so it shows your saved history.
    const uid =
      (window.auth && window.auth.currentUser && window.auth.currentUser.uid) ||
      null;
    if (!uid) {
      showPopup("You must be signed in to view analytics.");
      return;
    }

    let overlay = document.getElementById("analyticsOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "analyticsOverlay";
      overlay.className = "analytics-overlay";
      document.body.appendChild(overlay);
    }

    overlay.style.cssText =
      "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.45);z-index:999999;";
    const panel = document.createElement("div");
    panel.style =
      "background:var(--surface,#fff);color:var(--text-color,#102027);padding:18px;border-radius:12px;min-width:280px;max-width:920px;max-height:86vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,0.36);position:relative;";
    overlay.innerHTML = "";
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "×";
    closeBtn.style =
      "position:absolute;right:12px;top:8px;border:none;background:none;font-size:20px;cursor:pointer;";
    closeBtn.onclick = () => {
      overlay.style.display = "none";
    };
    panel.appendChild(closeBtn);
    const title = document.createElement("h3");
    title.textContent = `Analytics — ${testId}`;
    panel.appendChild(title);

    const info = document.createElement("div");
    info.textContent = "Loading analytics...";
    panel.appendChild(info);

    // Create container for charts and summary
    const container = document.createElement("div");
    container.style =
      "display:flex;flex-direction:column;gap:12px;margin-top:8px;";
    panel.appendChild(container);
    overlay.appendChild(panel);

    // Read user's saved scores for this test (preserve history)
    let savedHistory = [];
    try {
      if (
        window.collection &&
        window.getDocs &&
        window.query &&
        window.where &&
        window.db
      ) {
        try {
          let q;
          try {
            // Order query by timestamp when available
            q = window.query(
              window.collection(window.db, "users", uid, "scores"),
              window.where("testId", "==", testId),
              window.orderBy ? window.orderBy("timestamp", "desc") : undefined
            );
          } catch (e) {
            // If ordering isn't available, I still query by test id and sort locally.
            q = window.query(
              window.collection(window.db, "users", uid, "scores"),
              window.where("testId", "==", testId)
            );
          }
          const snap = await window.getDocs(q);
          if (snap && typeof snap.forEach === "function") {
            snap.forEach((d) => {
              try {
                const data = d.data ? d.data() : d._data || {};
                savedHistory.push({ id: d.id, ...data });
              } catch (e) {}
            });
          }
        } catch (e) {
          console.warn("query saved scores failed", e);
          savedHistory = [];
        }
      }
    } catch (e) {
      console.warn("fetch savedHistory failed", e);
      savedHistory = [];
    }

    // Fetch public leaderboard history (best-effort)
    let historical = [];
    try {
      if (
        window.leaderboardApi &&
        typeof window.leaderboardApi.fetchUserScoresForTest === "function"
      ) {
        const pub =
          (await window.leaderboardApi.fetchUserScoresForTest(testId, uid)) ||
          [];
        historical = pub.slice();
      }
    } catch (e) {
      console.warn("fetch historical scores failed", e);
      historical = [];
    }

    // When merging I prefer the user's saved entries so private data stays authoritative.
    const combined = [];
    const seen = new Set();
    (savedHistory || []).forEach((h) => {
      const key = (h.id || "") + "|" + (h.timestamp || h.createdAt || "");
      seen.add(key);
      combined.push(h);
    });
    (historical || []).forEach((h) => {
      const key = (h.id || "") + "|" + (h.timestamp || h.createdAt || "");
      if (!seen.has(key)) combined.push(h);
    });
    // Sort combined entries by timestamp (desc)
    combined.sort((a, b) => {
      const ta = new Date(a.timestamp || a.createdAt || 0).getTime() || 0;
      const tb = new Date(b.timestamp || b.createdAt || 0).getTime() || 0;
      return tb - ta;
    });
    historical = combined;

    // The latest score shown prefers the user's saved record, falling back to public data.
    let latestScore = null;
    if (savedHistory && savedHistory.length) latestScore = savedHistory[0];
    else if (historical && historical.length) latestScore = historical[0];

    // For per-topic detail I prefer the user's most recent topic breakdown document.
    let topicData = {};
    try {
      if (
        window.collection &&
        window.getDocs &&
        window.query &&
        window.where &&
        window.db
      ) {
        try {
          let tq;
          try {
            tq = window.query(
              window.collection(window.db, "users", uid, "topics"),
              window.where("testId", "==", testId),
              window.orderBy ? window.orderBy("timestamp", "desc") : undefined
            );
          } catch (e) {
            tq = window.query(
              window.collection(window.db, "users", uid, "topics"),
              window.where("testId", "==", testId)
            );
          }
          const tsnap = await window.getDocs(tq);
          let first = null;
          if (tsnap && typeof tsnap.forEach === "function") {
            tsnap.forEach((d) => {
              if (!first) first = d;
            });
          }
          if (first) topicData = first.data ? first.data() : first._data || {};
        } catch (e) {
          console.warn("query topics failed", e);
          topicData = {};
        }
      }
    } catch (e) {
      console.warn("fetch topic breakdown failed", e);
      topicData = {};
    }

    // Best-effort fetch for global averages
    let globalAvgPoints = null; // number
    let globalTopicAverages = null; // { topicName: percent }
    try {
      if (window.leaderboardApi) {
        if (typeof window.leaderboardApi.fetchTestAverages === "function") {
          const ga = await window.leaderboardApi.fetchTestAverages(testId);
          if (ga) {
            globalAvgPoints =
              typeof ga.averagePoints === "number" ? ga.averagePoints : null;
            globalTopicAverages = ga.topicAverages || null;
          }
        } else if (typeof window.leaderboardApi.fetchTopScores === "function") {
          // Compute averages from available entries
          try {
            const entries = await window.leaderboardApi.fetchTopScores(
              testId,
              1000
            );
            if (entries && entries.length) {
              const sum = entries.reduce(
                (s, e) => s + (Number(e.points) || 0),
                0
              );
              globalAvgPoints = Math.round(sum / entries.length);

              // If entries include topic details, I try to aggregate them into per-topic averages.
              const sums = {};
              const counts = {};
              for (const ent of entries) {
                const td =
                  ent.topics ||
                  ent.topicScores ||
                  ent.topicsBreakdown ||
                  ent.topicBreakdown ||
                  null;
                if (!td || typeof td !== "object") continue;
                for (const k of Object.keys(td)) {
                  try {
                    const v = td[k];
                    let pct = null;
                    if (v && typeof v === "object") {
                      if (
                        typeof v.firstAttemptCorrect !== "undefined" &&
                        typeof v.total !== "undefined"
                      ) {
                        pct =
                          ((Number(v.firstAttemptCorrect) || 0) /
                            Math.max(1, Number(v.total) || 0)) *
                          100;
                      } else if (
                        typeof v.correct !== "undefined" &&
                        typeof v.total !== "undefined"
                      ) {
                        pct =
                          ((Number(v.correct) || 0) /
                            Math.max(1, Number(v.total) || 0)) *
                          100;
                      } else if (typeof v.percent !== "undefined") {
                        pct = Number(v.percent) || null;
                      }
                    } else if (typeof v === "number") {
                      pct = v;
                    }
                    if (pct !== null && !isNaN(pct)) {
                      sums[k] = (sums[k] || 0) + pct;
                      counts[k] = (counts[k] || 0) + 1;
                    }
                  } catch (e) {}
                }
              }
              const out = {};
              for (const k of Object.keys(sums)) {
                out[k] = Math.round(sums[k] / Math.max(1, counts[k]));
              }
              if (Object.keys(out).length) globalTopicAverages = out;
            }
          } catch (e) {
            /* ignore */
          }
        }
      }
    } catch (e) {
      console.warn("fetch global aggregates failed", e);
    }

    // Compute user's average from saved scores
    let userAverageAcrossTests = null;
    let userAllScoresList = [];
    try {
      if (window.collection && window.getDocs && window.db) {
        const scoresCol = window.collection(window.db, "users", uid, "scores");
        const snap = await window.getDocs(scoresCol);
        if (snap && typeof snap.forEach === "function") {
          const arr = [];
          snap.forEach((d) => {
            try {
              const data = d.data ? d.data() : d._data || {};
              arr.push(Number(data.totalPoints) || 0);
            } catch (e) {}
          });
          if (arr.length) {
            userAllScoresList = arr.slice();
            const sum = arr.reduce((s, v) => s + v, 0);
            userAverageAcrossTests = Math.round(sum / arr.length);
          }
        }
      }
    } catch (e) {
      console.warn("compute user average across tests failed", e);
    }

    // If no history exists, I show a helpful message instead of a blank chart.
    const hasTopics = topicData && Object.keys(topicData).length > 0;
    const hasLatest = !!(
      latestScore && typeof latestScore.totalPoints !== "undefined"
    );
    if (!hasTopics && !hasLatest && (!historical || historical.length === 0)) {
      info.textContent =
        "No analytics available for this test yet. Save your score after completing the test to view analytics.";
      return overlay;
    }

    // Remove the loading hint once I have data (or a friendly message).
    info.style.display = "none";

    // A small summary row shows last score, average, and attempt count.
    const statsRow = document.createElement("div");
    statsRow.style = "display:flex;gap:12px;flex-wrap:wrap;align-items:center;";
    // Show most recent score
    const lastScoreEl = document.createElement("div");
    lastScoreEl.style =
      "min-width:160px;padding:10px;border-radius:8px;background:var(--surface,#f6f9fb);";
    const lastPts = hasLatest
      ? Number(latestScore.totalPoints || 0)
      : historical && historical.length
      ? Number(historical[0].points || 0)
      : 0;
    lastScoreEl.innerHTML = `<div style="font-weight:700;font-size:18px;">Last: ${lastPts} pts</div><div style="font-size:12px;color:var(--muted,#666);">Most recent submission</div>`;
    statsRow.appendChild(lastScoreEl);

    // Show user's historical average
    let avg = 0;
    if (historical && historical.length) {
      avg = Math.round(
        historical.reduce((s, h) => s + (Number(h.points) || 0), 0) /
          historical.length
      );
    }
    if (!avg && hasLatest && historical.length === 0) avg = lastPts;
    const avgEl = document.createElement("div");
    avgEl.style =
      "min-width:160px;padding:10px;border-radius:8px;background:var(--surface,#f6f9fb);";
    avgEl.innerHTML = `<div style="font-weight:700;font-size:18px;">Average: ${avg} pts</div><div style="font-size:12px;color:var(--muted,#666);">Across ${
      historical.length || (hasLatest ? 1 : 0)
    } attempts</div>`;
    statsRow.appendChild(avgEl);

    // Show attempt count
    const attemptsEl = document.createElement("div");
    attemptsEl.style =
      "min-width:120px;padding:10px;border-radius:8px;background:var(--surface,#f6f9fb);";
    attemptsEl.innerHTML = `<div style="font-weight:700;font-size:18px;">Attempts: ${
      historical.length || (hasLatest ? 1 : 0)
    }</div><div style="font-size:12px;color:var(--muted,#666);">Saved submissions</div>`;
    statsRow.appendChild(attemptsEl);

    // Where timing exists I compute an overall average to show pacing.
    let overallAvgTime = null;
    try {
      const times = [];
      Object.keys(topicData || {}).forEach((k) => {
        const v = topicData[k];
        if (v && typeof v.avgTimeMs === "number") times.push(v.avgTimeMs);
      });
      if (times.length) {
        overallAvgTime = Math.round(
          times.reduce((a, b) => a + b, 0) / times.length
        );
      }
    } catch (e) {}
    if (overallAvgTime !== null) {
      const timeEl = document.createElement("div");
      timeEl.style =
        "min-width:160px;padding:10px;border-radius:8px;background:var(--surface,#f6f9fb);";
      timeEl.innerHTML = `<div style="font-weight:700;font-size:18px;">Avg time: ${Math.round(
        overallAvgTime / 1000
      )}s</div><div style="font-size:12px;color:var(--muted,#666);">Average time per question</div>`;
      statsRow.appendChild(timeEl);
    }
    container.appendChild(statsRow);

    // Render topic breakdown list
    const topicSection = document.createElement("div");
    topicSection.innerHTML = `<h4>Topic breakdown</h4>`;
    container.appendChild(topicSection);

    const topicList = document.createElement("div");
    topicList.style = "display:flex;flex-direction:column;gap:10px;";

    // Prefer topic keys from saved data; otherwise fall back to the test definition.
    let testTopics = [];
    try {
      if (currentTest && Array.isArray(currentTest.topics))
        testTopics = currentTest.topics.map((t) => t.topic);
    } catch (e) {
      testTopics = [];
    }
    const keys = hasTopics
      ? Object.keys(topicData)
      : testTopics.length
      ? testTopics
      : [];
    if (!keys.length) {
      topicList.textContent = "No per-topic data saved for this test.";
    } else {
      keys.forEach((topic) => {
        try {
          const t = topicData && topicData[topic] ? topicData[topic] : null;
          const corr = Number(
            (t && (t.firstAttemptCorrect || t.correct || 0)) || 0
          );
          const tot = Number((t && (t.total || t.count || 0)) || 0);
          const pct = tot > 0 ? Math.round((corr / tot) * 100) : 0;

          const globalPct =
            globalTopicAverages &&
            typeof globalTopicAverages[topic] !== "undefined"
              ? Math.round(globalTopicAverages[topic])
              : null;

          const row = document.createElement("div");
          row.style = "display:flex;flex-direction:column;gap:6px;";
          const label = document.createElement("div");
          label.style =
            "display:flex;justify-content:space-between;align-items:center;font-weight:600;";
          const left = document.createElement("div");
          const tAvg =
            t && typeof t.avgTimeMs === "number"
              ? `${Math.round(t.avgTimeMs / 1000)}s`
              : "—";
          left.textContent = `${topic} — ${corr}/${tot} (${pct}%) • ${tAvg}`;
          const right = document.createElement("div");
          right.style = "font-size:12px;color:var(--muted,#666);";
          right.textContent =
            globalPct !== null ? `Avg users: ${globalPct}%` : "";
          label.appendChild(left);
          label.appendChild(right);

          const barWrap = document.createElement("div");
          barWrap.style =
            "background:rgba(0,0,0,0.06);height:14px;border-radius:8px;overflow:hidden;";
          const bar = document.createElement("div");
          bar.style = `height:100%;width:${pct}%;background:linear-gradient(90deg,#4CAF50,#2196F3);border-radius:8px;transition:width 600ms ease;`;
          barWrap.appendChild(bar);

          // A thin line marks the global average so you can compare yourself.
          if (globalPct !== null) {
            const overlayLine = document.createElement("div");
            overlayLine.style = `position:relative;pointer-events:none;height:0;margin-top:-14px;`;
            const marker = document.createElement("div");
            marker.style = `position:absolute;left:${globalPct}%;top:0;height:14px;width:2px;background:rgba(0,0,0,0.14);transform:translateX(-50%);`;
            overlayLine.appendChild(marker);
            barWrap.appendChild(overlayLine);
          }

          row.appendChild(label);
          row.appendChild(barWrap);
          topicList.appendChild(row);
        } catch (e) {
          console.warn("render topic row failed", e);
        }
      });
    }
    container.appendChild(topicList);

    // If we captured sample timings I present them so you can study response speed.
    try {
      const sample =
        topicData && topicData.sampleQuestions
          ? topicData.sampleQuestions
          : sessionMetrics && sessionMetrics.questions
          ? sessionMetrics.questions.slice(-10)
          : [];
      if (sample && sample.length) {
        const sampleWrap = document.createElement("div");
        sampleWrap.style = "margin-top:12px;";
        sampleWrap.innerHTML = "<h4>Recent question timings (sample)</h4>";
        const sl = document.createElement("div");
        sl.style =
          "display:flex;flex-direction:column;gap:6px;max-height:160px;overflow:auto;padding-right:6px;";
        sample.forEach((s) => {
          try {
            const r = document.createElement("div");
            r.style =
              "padding:6px;border-radius:6px;background:rgba(0,0,0,0.03);display:flex;justify-content:space-between;align-items:center;";
            const left = document.createElement("div");
            left.textContent = `${s.topic} — ${s.question.substring(0, 80)}${
              s.question.length > 80 ? "…" : ""
            }`;
            const right = document.createElement("div");
            right.style = "font-size:13px;color:var(--muted,#666);";
            right.textContent = `${Math.round((s.elapsedMs || 0) / 1000)}s • ${
              s.correct ? "correct" : "wrong"
            }`;
            r.appendChild(left);
            r.appendChild(right);
            sl.appendChild(r);
          } catch (e) {}
        });
        sampleWrap.appendChild(sl);
        container.appendChild(sampleWrap);
      }
    } catch (e) {}

    // Fetch latest question-level analytics doc
    let analyticsDoc = null;
    try {
      if (
        window.collection &&
        window.getDocs &&
        window.query &&
        window.where &&
        window.db
      ) {
        try {
          let aq;
          try {
            aq = window.query(
              window.collection(window.db, "users", uid, "analytics"),
              window.where("testId", "==", testId),
              window.orderBy ? window.orderBy("timestamp", "desc") : undefined
            );
          } catch (e) {
            aq = window.query(
              window.collection(window.db, "users", uid, "analytics"),
              window.where("testId", "==", testId)
            );
          }
          const aSnap = await window.getDocs(aq);
          let first = null;
          if (aSnap && typeof aSnap.forEach === "function") {
            aSnap.forEach((d) => {
              if (!first) first = d;
            });
          }
          if (first)
            analyticsDoc = first.data ? first.data() : first._data || null;
        } catch (e) {
          console.warn("query analytics failed", e);
          analyticsDoc = null;
        }
      }
    } catch (e) {
      console.warn("fetch analytics doc failed", e);
      analyticsDoc = null;
    }

    // From the analytics doc I build simple histograms that show timing distributions.
    try {
      const ad = analyticsDoc || null;
      const topicHistWrap = document.createElement("div");
      topicHistWrap.style =
        "margin-top:12px;display:flex;flex-wrap:wrap;gap:12px;";
      let histCount = 0;
      if (ad && Array.isArray(ad.questions) && ad.questions.length) {
        // Group recorded times by topic
        const groups = {};
        ad.questions.forEach((q) => {
          try {
            if (!groups[q.topic]) groups[q.topic] = [];
            groups[q.topic].push(Number(q.elapsedMs) || 0);
          } catch (e) {}
        });
        await loadChartJs();
        for (const topicName of Object.keys(groups)) {
          const times = groups[topicName];
          if (!times.length) continue;
          // Create canvas for histogram
          const wrap = document.createElement("div");
          wrap.style = "width:220px;min-width:220px;max-width:33%;";
          const htitle = document.createElement("div");
          htitle.textContent = `${topicName} (time per question)`;
          htitle.style = "font-weight:600;margin-bottom:6px;font-size:13px;";
          const cc = document.createElement("canvas");
          cc.style =
            "width:220px;height:140px;display:block;background:transparent;border-radius:6px;";
          wrap.appendChild(htitle);
          wrap.appendChild(cc);
          topicHistWrap.appendChild(wrap);

          // Times are binned into second-based buckets for readable bars.
          const secs = times.map((t) => Math.round(t / 1000));
          const max = Math.max(...secs);
          const bins = Math.min(6, Math.max(3, Math.ceil(max / 5)));
          const binSize = Math.max(1, Math.ceil((max + 1) / bins));
          const counts = new Array(bins).fill(0);
          secs.forEach((s) => {
            const idx = Math.min(bins - 1, Math.floor(s / binSize));
            counts[idx]++;
          });
          const labels = counts.map(
            (_, i) => `${i * binSize}-${(i + 1) * binSize}s`
          );

          const ctx = cc.getContext("2d");
          try {
            if (window.histCharts === undefined) window.histCharts = [];
          } catch (e) {}
          try {
            // Clean up any previous chart before drawing a new histogram.
            const old = window.histCharts && window.histCharts[histCount];
            if (old && old.destroy) old.destroy();
          } catch (e) {}
          const ch = new window.Chart(ctx, {
            type: "bar",
            data: {
              labels: labels,
              datasets: [
                { label: "count", data: counts, backgroundColor: "#90caf9" },
              ],
            },
            options: {
              responsive: false,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: { y: { beginAtZero: true } },
            },
          });
          window.histCharts[histCount] = ch;
          histCount++;
        }
      }
      if (histCount) container.appendChild(topicHistWrap);
    } catch (e) {
      console.warn("render histograms failed", e);
    }

    // Render multi-line score chart with averages
    // Load Chart.js dynamically (best-effort)
    async function loadChartJs() {
      if (window.Chart) return window.Chart;
      return new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src =
          "https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js";
        s.onload = () => {
          resolve(window.Chart);
        };
        s.onerror = (e) => {
          reject(e);
        };
        document.head.appendChild(s);
      });
    }

    const chartWrap = document.createElement("div");
    chartWrap.style =
      "margin-top:10px;display:flex;flex-direction:column;gap:8px;";
    chartWrap.innerHTML = `<h4 style="margin:0">Score comparison</h4>`;
    // Keep the chart container a fixed height so layout stays stable.
    const chartHolder = document.createElement("div");
    chartHolder.style =
      "width:100%;height:220px;max-height:240px;overflow:hidden;border-radius:8px;background:transparent;padding:6px 0;";
    const chartCanvas = document.createElement("canvas");
    chartCanvas.id = "analyticsMultiChart";
    chartCanvas.style = "width:100%;height:100%;display:block;";
    chartHolder.appendChild(chartCanvas);
    chartWrap.appendChild(chartHolder);
    container.insertBefore(chartWrap, topicSection);

    try {
      await loadChartJs();
      // Prepare data series: history, user average, global average
      const userPts =
        historical && historical.length
          ? historical
              .slice()
              .reverse()
              .map((x) => Number(x.points) || 0)
          : latestScore
          ? [Number(latestScore.totalPoints || 0)]
          : [];
      // Labels can be simple indices or timestamps depending on available data.
      let labels = [];
      if (historical && historical.length) {
        labels = historical
          .slice()
          .reverse()
          .map((h, i) => {
            try {
              return new Date(h.createdAt).toLocaleString();
            } catch (e) {
              return String(i + 1);
            }
          });
      } else if (latestScore) {
        labels = [
          latestScore.timestamp ||
            latestScore.createdAt ||
            new Date().toISOString(),
        ];
      } else if (userAllScoresList && userAllScoresList.length) {
        labels = userAllScoresList.map((_, i) => `#${i + 1}`);
      } else {
        labels = ["1"];
      }

      const avgUser =
        typeof globalAvgPoints === "number" ? globalAvgPoints : null;
      const yourAvg =
        typeof userAverageAcrossTests === "number"
          ? userAverageAcrossTests
          : null;

      const datasets = [];
      // Include the latest score as a series point if present.
      if (userPts && userPts.length) {
        datasets.push({
          label: "Current score",
          data: userPts,
          borderColor: "#1e88e5",
          backgroundColor: "#1e88e5",
          tension: 0.25,
          pointRadius: 4,
          fill: false,
        });
      }
      // Draw your average as a straight horizontal line so it's easy to compare.
      if (yourAvg !== null) {
        datasets.push({
          label: "Your average score",
          data: Array(labels.length).fill(yourAvg),
          borderColor: "#4caf50",
          borderDash: [6, 4],
          tension: 0,
          pointRadius: 0,
          fill: false,
        });
      }
      // Draw the global average similarly so you see the broader context.
      if (avgUser !== null) {
        datasets.push({
          label: "Average user",
          data: Array(labels.length).fill(avgUser),
          borderColor: "#ff7043",
          borderDash: [6, 4],
          tension: 0,
          pointRadius: 0,
          fill: false,
        });
      }

      // Replace any existing chart instance to keep the display correct.
      try {
        if (window.analyticsChart && window.analyticsChart.destroy)
          window.analyticsChart.destroy();
      } catch (e) {}
      const ctx = chartCanvas.getContext("2d");
      window.analyticsChart = new window.Chart(ctx, {
        type: "line",
        data: { labels: labels, datasets: datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          layout: { padding: 6 },
          scales: {
            y: { beginAtZero: true },
          },
          plugins: { legend: { position: "top", labels: { boxWidth: 12 } } },
        },
      });
    } catch (e) {
      console.warn("Chart.js failed to load or render", e);
    }

    // ensure topic section is after the chart and scrollable if content long
    try {
      topicSection.scrollIntoView({ behavior: "smooth" });
    } catch (e) {}

    return overlay;
  } catch (e) {
    console.warn("showAnalyticsOverlay error", e);
  }
}

function closeLeaderboard() {
  const overlay = document.getElementById("lbOverlay");
  if (overlay) overlay.style.display = "none";
  document.body.style.overflow = "";
}

async function fetchAndRenderLeaderboard(testId) {
  const listEl = document.getElementById("lbList");
  if (!listEl) return;
  listEl.innerHTML = '<div class="lb-loading">Loading\u0000</div>';
  try {
    if (!window.leaderboardApi || !window.leaderboardApi.fetchTopScores)
      throw new Error("Leaderboard API not available");
    const entries = await window.leaderboardApi.fetchTopScores(
      testId,
      leaderboardState.limit
    );
    renderLeaderboardEntries(entries);
  } catch (err) {
    listEl.innerHTML = '<div class="lb-error">Failed to load leaderboard</div>';
  }
}

function renderLeaderboardEntries(entries) {
  const listEl = document.getElementById("lbList");
  if (!listEl) return;
  if (!entries || entries.length === 0) {
    listEl.innerHTML =
      '<div class="lb-empty">No scores yet. Be the first to submit!</div>';
    return;
  }
  listEl.innerHTML = "";
  entries.forEach((e, idx) => {
    const item = document.createElement("div");
    item.className = "lb-item";
    let tsText = "";
    try {
      const ts = e.createdAt;
      let d = null;
      if (!ts) d = null;
      else if (typeof ts.toDate === "function") d = ts.toDate();
      else if (ts.seconds) d = new Date(Number(ts.seconds) * 1000);
      else d = new Date(ts);
      if (d && !isNaN(d.getTime())) tsText = d.toLocaleString();
    } catch (err) {
      tsText = "";
    }
    const rank = document.createElement("div");
    rank.className = "lb-rank";
    rank.textContent = String(idx + 1);
    const nameWrap = document.createElement("div");
    nameWrap.className = "lb-name";
    const nameEl = document.createElement("button");
    nameEl.type = "button";
    nameEl.className = "lb-name-btn";
    nameEl.style =
      "background:none;border:none;padding:0;margin:0;font:inherit;cursor:pointer;color:inherit;text-align:left;";
    nameEl.innerHTML = escapeHtml(e.name || "Anonymous");
    nameEl.addEventListener("click", async () => {
      const clickedName = (e.name || "").trim();
      try {
        if (!clickedName) return;
        // If the leaderboard entry already includes a uid, prefer it (avoids extra lookups and permission issues)
        if (e.uid) {
          showProfileOverlay(e.uid);
          return;
        }
        const uid = await resolveProfileUid(clickedName);
        if (uid) {
          showProfileOverlay(uid);
          return;
        }
        try {
          writeLog("profile_lookup_miss", { clickedName });
        } catch (e) {}
        alert("Public profile not found for " + clickedName);
      } catch (err) {
        console.warn("leaderboard name click failed", err);
        try {
          writeLog("profile_lookup_error", {
            clickedName,
            message: err && err.message,
          });
        } catch (e) {}
        alert("Failed to open profile");
      }
    });
    const tsEl = document.createElement("div");
    tsEl.className = "lb-timestamp";
    tsEl.textContent = tsText;
    nameWrap.appendChild(nameEl);
    nameWrap.appendChild(tsEl);
    const points = document.createElement("div");
    points.className = "lb-points";
    points.textContent = String(Number(e.points) || 0);
    item.appendChild(rank);
    item.appendChild(nameWrap);
    item.appendChild(points);
    listEl.appendChild(item);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&"'<>]/g, function (c) {
    return {
      "&": "&amp;",
      '"': "&quot;",
      "'": "&#39;",
      "<": "&lt;",
      ">": "&gt;",
    }[c];
  });
}

function ensureToastContainer() {
  let wrap = document.getElementById("toastWrap");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = "toastWrap";
    wrap.className = "toast-wrap";
    document.body.appendChild(wrap);
  }
  return wrap;
}

// Award named achievement to user's account
async function grantAchievement(uid, achievementName) {
  try {
    if (!uid) return;
    const ts = new Date().toISOString();
    if (window.runTransaction && window.doc && window.db) {
      const accRef = window.doc(window.db, "accounts", uid);
      await window.runTransaction(window.db, async (tx) => {
        const snap = await tx.get(accRef);
        let base = {};
        if (snap && snap.exists && snap.exists()) {
          try {
            base = snap.data() || {};
          } catch (e) {
            base = {};
          }
        }
        const ach = Object.assign({}, base.achievements || {});
        // don't duplicate
        if (!ach[achievementName]) ach[achievementName] = { earnedAt: ts };
        const merged = Object.assign({}, base, {
          achievements: ach,
          lastUpdated: ts,
        });
        tx.set(accRef, merged);
      });
    } else if (window.doc && window.setDoc && window.db) {
      const accRef = window.doc(window.db, "accounts", uid);
      try {
        const snap = await window.getDoc(accRef);
        let base = snap && snap.exists ? snap.data() || {} : {};
        const ach = Object.assign({}, base.achievements || {});
        if (!ach[achievementName]) ach[achievementName] = { earnedAt: ts };
        const merged = Object.assign({}, base, {
          achievements: ach,
          lastUpdated: ts,
        });
        await window.setDoc(accRef, merged);
      } catch (e) {
        console.warn("grantAchievement failed", e);
      }
    }
    try {
      writeLog("grantAchievement", { uid, achievementName });
    } catch (e) {}
  } catch (e) {
    console.warn("grantAchievement error", e);
  }
}

// --- Persist full analytics document when saving score ---
async function persistFullAnalytics(uid, testId, metrics) {
  try {
    if (!uid || !testId || !metrics) return false;
    if (window.doc && window.setDoc && window.db) {
      // write analytics as a new historical document so previous analytics are preserved
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const ref = window.doc(window.db, "users", uid, "analytics", id);
      const payload = {
        testId,
        questions: metrics.questions || [],
        topics: metrics.topics || {},
        timestamp: new Date().toISOString(),
      };
      await window.setDoc(ref, payload);
      try {
        writeLog("persistFullAnalytics", {
          uid,
          testId,
          count: payload.questions.length,
        });
      } catch (e) {}
      return true;
    }
  } catch (e) {
    console.warn("persistFullAnalytics failed", e);
  }
  return false;
}

// Show public profile overlay for a uid or username
async function showProfileOverlay(idOrName) {
  try {
    // Normalize param: if a username was passed, resolve it to uid via usernames/{username}
    let uid = idOrName;
    try {
      // simple heuristic: uid-like strings are alphanumeric with -/_ and length >= 12
      const maybeUid = String(idOrName || "").trim();
      const looksLikeUid = /^[A-Za-z0-9_-]{12,64}$/.test(maybeUid);
      if (!looksLikeUid && maybeUid) {
        // attempt direct usernames/{username} doc read (most efficient when mapping exists)
        if (window.doc && window.getDoc && window.db) {
          try {
            const unameRef = window.doc(window.db, "usernames", maybeUid);
            const usnap = await window.getDoc(unameRef);
            if (usnap && usnap.exists && usnap.exists()) {
              const ud = usnap.data();
              if (ud && ud.uid) uid = ud.uid;
            }
          } catch (e) {
            /* ignore and fallback to other methods below */
          }
        }
        // If still not resolved, fall back to best-effort resolver
        if (!uid || String(uid).trim() === "") {
          try {
            uid = await resolveProfileUid(maybeUid);
          } catch (e) {
            /* ignore */
          }
        }
      }
    } catch (e) {
      /* ignore normalization errors */
    }

    // if after attempts we don't have a uid, bail out
    if (!uid) return null;
    let overlay = document.getElementById("profileOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "profileOverlay";
      overlay.className = "profile-overlay";
      document.body.appendChild(overlay);
    }
    overlay.style.cssText =
      "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.45);z-index:999999;";
    const panel = document.createElement("div");
    panel.style =
      "background:var(--surface,#fff);color:var(--text-color,#102027);padding:24px;border-radius:10px;min-width:280px;max-width:640px;box-shadow:0 12px 40px rgba(0,0,0,0.3);position:relative;";
    overlay.innerHTML = "";
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "×";
    closeBtn.style =
      "position:absolute;right:12px;top:8px;border:none;background:none;font-size:20px;";
    closeBtn.onclick = () => {
      overlay.style.display = "none";
    };
    panel.appendChild(closeBtn);
    const title = document.createElement("h3");
    title.textContent = "Public profile";
    panel.appendChild(title);
    const content = document.createElement("div");
    content.textContent = "Loading...";
    panel.appendChild(content);
    overlay.appendChild(panel);

    // fetch accounts/{uid}
    let acct = null;
    try {
      if (window.doc && window.getDoc && window.db) {
        const aref = window.doc(window.db, "accounts", uid);
        const s = await window.getDoc(aref);
        if (s && s.exists()) acct = s.data();
      }
    } catch (e) {
      console.warn("profile fetch failed", e);
    }

    // render profile
    content.innerHTML = "";
    const avatar = document.createElement("img");
    avatar.style =
      "width:96px;height:96px;border-radius:50%;object-fit:cover;margin-right:12px;";
    avatar.alt = "avatar";
    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.alignItems = "center";
    const nameEl = document.createElement("div");
    nameEl.style.fontWeight = 700;
    nameEl.style.fontSize = "18px";
    // show a temporary loading label while we resolve the public username
    nameEl.textContent = "Loading...";
    avatar.src =
      acct && acct.avatarUrl
        ? acct.avatarUrl
        : "https://www.gravatar.com/avatar/?d=mp&s=96";
    header.appendChild(avatar);
    header.appendChild(nameEl);
    content.appendChild(header);

    // Resolve a public username for this uid when possible. Prefer a dedicated
    // `publicProfiles/{uid}` document that contains only public fields (username, avatarUrl, summary).
    // This keeps private data under `accounts`/`users` protected, while allowing unauthenticated reads.
    (async function resolvePublicName() {
      try {
        let publicName = acct && acct.username ? acct.username : null;
        try {
          // 1) Try publicProfiles/{uid} (preferred—designed for public read)
          if (!publicName && window.doc && window.getDoc && window.db) {
            try {
              const pdoc = window.doc(window.db, "publicProfiles", uid);
              const psnap = await window.getDoc(pdoc);
              if (psnap && psnap.exists && psnap.exists()) {
                const pdata = psnap.data();
                if (pdata) {
                  if (pdata.username) publicName = pdata.username;
                  if (pdata.avatarUrl) avatar.src = pdata.avatarUrl;
                }
              }
            } catch (e) {
              /* ignore and try next */
            }
          }

          // 2) If not present, try users/{uid} document which may contain a username
          if (!publicName && window.doc && window.getDoc && window.db) {
            try {
              const udoc = window.doc(window.db, "users", uid);
              const usnap = await window.getDoc(udoc);
              if (usnap && usnap.exists && usnap.exists()) {
                const ud = usnap.data();
                if (ud && ud.username) publicName = ud.username;
              }
            } catch (e) {
              /* ignore and try next */
            }
          }

          // 3) Best-effort: query usernames collection for username -> uid mapping
          if (
            !publicName &&
            window.getDocs &&
            window.collection &&
            window.query &&
            window.where &&
            window.db
          ) {
            try {
              const col = window.collection(window.db, "usernames");
              const q = window.query(col, window.where("uid", "==", uid));
              const qr = await window.getDocs(q);
              if (qr && typeof qr.forEach === "function") {
                let found = null;
                qr.forEach((docSnap) => {
                  if (docSnap && docSnap.exists && docSnap.exists())
                    found = docSnap;
                });
                if (found) {
                  publicName =
                    found.id ||
                    (found.data && found.data().username
                      ? found.data().username
                      : null);
                }
              }
            } catch (e) {
              /* ignore */
            }
          }
        } catch (e) {
          console.warn("public name resolution error", e);
        }

        nameEl.textContent = publicName || "Anonymous";
      } catch (e) {
        console.warn("resolvePublicName failed", e);
        nameEl.textContent = "Anonymous";
      }
    })();

    // If viewing own profile, allow changing avatar
    try {
      const currentUid =
        (window.auth &&
          window.auth.currentUser &&
          window.auth.currentUser.uid) ||
        (localStorage.getItem && localStorage.getItem("fblacer_uid")) ||
        null;
      if (currentUid && uid && String(currentUid) === String(uid)) {
        const changeWrap = document.createElement("div");
        changeWrap.style.marginTop = "10px";
        changeWrap.style.display = "flex";
        changeWrap.style.alignItems = "center";

        const fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.accept = "image/*";
        fileInput.style.display = "none";

        const changeBtn = document.createElement("button");
        changeBtn.type = "button";
        changeBtn.textContent = "Change picture";
        changeBtn.style.marginRight = "8px";

        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.textContent = "Remove";
        removeBtn.style.marginRight = "8px";

        const statusEl = document.createElement("div");
        statusEl.style.fontSize = "13px";
        statusEl.style.color = "var(--muted,#666)";

        changeBtn.onclick = () => fileInput.click();

        removeBtn.onclick = async () => {
          try {
            if (!(window.doc && window.setDoc && window.db))
              return showToast("Storage not available", "error");
            // remove avatarUrl field
            await window.setDoc(
              window.doc(window.db, "accounts", uid),
              { avatarUrl: "" },
              { merge: true }
            );
            avatar.src = "https://www.gravatar.com/avatar/?d=mp&s=96";
            try {
              writeLog("avatar_removed", { uid });
            } catch (e) {}
            statusEl.textContent = "Removed";
            setTimeout(() => {
              statusEl.textContent = "";
            }, 2500);
          } catch (e) {
            console.warn("remove avatar failed", e);
            showToast("Failed to remove avatar", "error");
          }
        };

        fileInput.addEventListener("change", async (ev) => {
          const f =
            (ev.target && ev.target.files && ev.target.files[0]) || null;
          if (!f) return;
          if (!f.type || !f.type.startsWith("image/"))
            return showToast("Please select an image file", "error");
          statusEl.textContent = "Processing...";
          try {
            // read file into Image then resize to max 512px using canvas to limit size
            const dataUrl = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onerror = () => reject(new Error("Failed to read file"));
              reader.onload = () => {
                const img = new Image();
                img.onload = () => {
                  try {
                    const maxDim = 512;
                    let w = img.width,
                      h = img.height;
                    if (w > maxDim || h > maxDim) {
                      const ratio = Math.min(maxDim / w, maxDim / h);
                      w = Math.round(w * ratio);
                      h = Math.round(h * ratio);
                    }
                    const canvas = document.createElement("canvas");
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext("2d");
                    ctx.drawImage(img, 0, 0, w, h);
                    const out = canvas.toDataURL("image/jpeg", 0.85);
                    resolve(out);
                  } catch (e) {
                    reject(e);
                  }
                };
                img.onerror = () => reject(new Error("Image load error"));
                img.src = reader.result;
              };
              reader.readAsDataURL(f);
            });

            // preview
            avatar.src = dataUrl;

            // save to accounts/{uid}.avatarUrl (merge)
            if (window.doc && window.setDoc && window.db) {
              await window.setDoc(
                window.doc(window.db, "accounts", uid),
                { avatarUrl: dataUrl, lastUpdated: new Date().toISOString() },
                { merge: true }
              );
              try {
                writeLog("avatar_updated", { uid });
              } catch (e) {}
              showToast("Profile picture updated", "success");
              statusEl.textContent = "Updated";
              setTimeout(() => {
                statusEl.textContent = "";
              }, 2500);
            } else {
              showToast("Unable to save avatar: backend unavailable", "error");
              statusEl.textContent = "";
            }
          } catch (e) {
            console.warn("avatar upload failed", e);
            showToast("Failed to update profile picture", "error");
            statusEl.textContent = "";
          } finally {
            try {
              fileInput.value = "";
            } catch (e) {}
          }
        });

        changeWrap.appendChild(changeBtn);
        changeWrap.appendChild(removeBtn);
        changeWrap.appendChild(statusEl);
        content.appendChild(changeWrap);
        content.appendChild(fileInput);
      }
    } catch (e) {
      console.warn("owner avatar UI failed", e);
    }

    const achTitle = document.createElement("h4");
    achTitle.textContent = "Achievements";
    achTitle.style.marginTop = "12px";
    content.appendChild(achTitle);
    const achList = document.createElement("div");
    const achievements = acct && acct.achievements ? acct.achievements : {};
    const keys = Object.keys(achievements || {});
    if (!keys.length) {
      achList.textContent = "No achievements yet.";
    } else {
      keys.forEach((k) => {
        const row = document.createElement("div");
        row.textContent = `${k} — ${achievements[k].earnedAt || ""}`;
        achList.appendChild(row);
      });
    }
    content.appendChild(achList);

    // public stats (tests summary)
    const testsEl = document.createElement("div");
    testsEl.style.marginTop = "12px";
    testsEl.innerHTML = "<h4>Tests</h4>";
    const testsList = document.createElement("div");
    const tests = acct && acct.tests ? acct.tests : {};
    const tkeys = Object.keys(tests || {});
    if (!tkeys.length) testsList.textContent = "No test records";
    else
      tkeys.forEach((tn) => {
        const r = document.createElement("div");
        const rec = tests && tests[tn] ? tests[tn] : {};
        const pts = Number(rec.totalPoints || 0);
        const tsRaw = rec.timestamp || "";
        let tsText = "";
        try {
          // handle Firestore Timestamp objects or ISO strings
          let d = null;
          if (
            tsRaw &&
            typeof tsRaw === "object" &&
            typeof tsRaw.toDate === "function"
          )
            d = tsRaw.toDate();
          else if (tsRaw) d = new Date(tsRaw);
          if (d && !isNaN(d.getTime())) tsText = d.toLocaleString();
          else tsText = String(tsRaw || "");
        } catch (e) {
          tsText = String(tsRaw || "");
        }

        // Example render: "Advanced Accounting — 115 pts • Oct 7, 2025, 10:36 PM"
        r.innerHTML =
          "<strong>" +
          escapeHtml(tn) +
          "</strong>" +
          ' — <span class="pts">' +
          pts.toLocaleString() +
          "</span> pts" +
          (tsText
            ? ' <small class="muted">• ' + escapeHtml(tsText) + "</small>"
            : "");
        testsList.appendChild(r);
      });
    testsEl.appendChild(testsList);
    content.appendChild(testsEl);

    return overlay;
  } catch (e) {
    console.warn("showProfileOverlay error", e);
  }
}

function showToast(message, kind = "info", timeout = 3500) {
  const wrap = ensureToastContainer();
  const el = document.createElement("div");
  el.className = "toast " + (kind || "info");
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity 300ms";
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 350);
  }, timeout);
}

async function submitScore(name, test, score) {
  try {
    if (!name || !test || typeof score !== "number") {
      return;
    }
    const docId = `${name}-${test}`.replace(/\s+/g, "_");
    if (!window.leaderboardApi || !window.leaderboardApi.setScoreDoc)
      throw new Error("leaderboardApi.setScoreDoc not available");
    await window.leaderboardAuthReady;
    if (!score || Number(score) === 0) {
      return;
    }
    const localKey = `fblacer_sub_${test}||${name}||${score}`;
    if (localStorage.getItem(localKey)) {
      return;
    }
    const createdAt = new Date().toISOString();
    await window.leaderboardApi.setScoreDoc(test, docId, {
      name,
      test,
      points: score,
      createdAt,
    });
    // Log submitScore action
    try {
      writeLog("submitScore", { test, name, points: score, createdAt });
    } catch (e) {
      console.warn("submitScore log failed", e);
    }
    try {
      localStorage.setItem(localKey, JSON.stringify({ ts: createdAt }));
    } catch (e) {}
  } catch (err) {}
}

(function () {
  "use strict";

  // Default color palette (used cyclically)
  const DEFAULT_COLORS = [
    "#4CAF50", // green
    "#2196F3", // blue
    "#FFC107", // amber
    "#E91E63", // pink
    "#9C27B0", // purple
    "#FF7043", // orange-ish
    "#26A69A", // teal
    "#7E57C2", // deep purple
  ];

  function readCSSVar(name, fallback) {
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue(
        name
      );
      if (!v) return fallback;
      return v.trim() || fallback;
    } catch (e) {
      return fallback;
    }
  }

  function createTooltipElement(surface, textColor) {
    const tip = document.createElement("div");
    tip.id = "aleksTooltip";
    tip.style.position = "fixed";
    tip.style.pointerEvents = "none";
    tip.style.padding = "8px 10px";
    tip.style.borderRadius = "6px";
    tip.style.background = surface;
    tip.style.color = textColor;
    tip.style.boxShadow = "0 6px 18px rgba(0,0,0,0.12)";
    tip.style.fontSize = "13px";
    tip.style.zIndex = 2147483647; // very high
    tip.style.display = "none";
    tip.style.maxWidth = "320px";
    tip.style.whiteSpace = "nowrap";
    return tip;
  }

  // Brighten a hex color by a factor (0..1) - simple approach
  function brightenHex(hex, amt) {
    // hex like #rrggbb
    try {
      const c = hex.replace("#", "");
      const num = parseInt(c, 16);
      let r = (num >> 16) + Math.round(255 * amt);
      let g = ((num >> 8) & 0x00ff) + Math.round(255 * amt);
      let b = (num & 0x0000ff) + Math.round(255 * amt);
      r = Math.min(255, Math.max(0, r));
      g = Math.min(255, Math.max(0, g));
      b = Math.min(255, Math.max(0, b));
      const out =
        "#" + ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");
      return out;
    } catch (e) {
      return hex;
    }
  }

  // Main render function factory
  function renderAleksChart(canvasOrId, scores) {
    // Resolve canvas element
    let canvas;
    if (typeof canvasOrId === "string")
      canvas = document.getElementById(canvasOrId);
    else canvas = canvasOrId;
    if (!canvas || canvas.tagName !== "CANVAS") {
      throw new Error(
        "renderAleksChart requires a canvas element or canvas id"
      );
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D context not available");

    // Read theme colors
    const textColor = readCSSVar("--text-color", "#102027");
    const surface = readCSSVar("--surface", "#ffffff");

    // Tooltip
    let tooltip = document.getElementById("aleksTooltip");
    if (!tooltip) {
      tooltip = createTooltipElement(surface, textColor);
      document.body.appendChild(tooltip);
    }

    // Chart state
    let entries = []; // {label, correct, total, value}
    let totalValue = 0;
    let colors = DEFAULT_COLORS.slice();

    // Event handlers references for cleanup
    const handlers = { move: null, leave: null, resize: null };

    // compute entries from scores.topics
    function computeEntries(scoresObj) {
      const topics = scoresObj && scoresObj.topics ? scoresObj.topics : {};
      const out = [];
      for (const label of Object.keys(topics)) {
        const t = topics[label] || { firstAttemptCorrect: 0, total: 0 };
        const first = Number(t.firstAttemptCorrect) || 0;
        const tot = Number(t.total) || 0;
        // sliceValue as requested: (firstAttemptCorrect / total) * total
        // which simplifies to firstAttemptCorrect mathematically; implement the formula exactly
        const ratio = tot > 0 ? first / tot : 0;
        const value = ratio * tot; // equals 'first' when tot>0
        out.push({ label, correct: first, total: tot, value });
      }
      return out;
    }

    // Resize canvas to its displayed size and DPR
    function resizeCanvas() {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const cssW = Math.max(240, Math.round(rect.width));
      const cssH = Math.max(240, Math.round(rect.height));
      canvas.style.width = cssW + "px";
      canvas.style.height = cssH + "px";
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // Draw the doughnut with radial slices
    function draw(highlightIndex = -1) {
      resizeCanvas();
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      const cx = w / 2;
      const cy = h / 2;

      // Visual parameters - radial sectors (no inner hole)
      const baseRadius = Math.min(w, h) * 0.18; // minimal inner radius from center
      const maxOuterRadius = Math.min(w, h) * 0.48; // farthest a sector can reach

      // Clear canvas each frame before drawing
      ctx.clearRect(0, 0, w, h);

      // A subtle center circle gives the chart some visual grounding.
      ctx.save();
      ctx.fillStyle = readCSSVar("--surface", "#ffffff");
      ctx.beginPath();
      ctx.arc(cx, cy, baseRadius - 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // If there is no data I draw a faint hint so the chart doesn't look empty.
      if (!entries.length || totalValue <= 0) {
        ctx.save();
        ctx.strokeStyle = "rgba(0,0,0,0.06)";
        ctx.lineWidth = Math.max(8, baseRadius * 0.2);
        ctx.beginPath();
        ctx.arc(cx, cy, (baseRadius + maxOuterRadius) / 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        return;
      }

      // Each sector grows outward with correctness to make strengths obvious.
      let angle = -Math.PI / 2; // start drawing at the top
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const sliceAngle = (e.value / totalValue) * Math.PI * 2;
        const start = angle;
        const end = angle + sliceAngle;

        // Correctness is a ratio between 0 and 1; I use it to size the slice.
        const corrRatio = e.total > 0 ? e.correct / e.total : 0;
        // Compute outer radius based on correctness
        const targetOuter =
          baseRadius + (maxOuterRadius - baseRadius) * corrRatio;

        // When hovered I nudge the outer radius to emphasize the slice.
        const isHover = i === highlightIndex;
        const hoverExtra = isHover
          ? Math.min(12, (maxOuterRadius - baseRadius) * 0.08)
          : 0;
        const outerR = targetOuter + hoverExtra;

        // Draw filled sector from center to outer radius
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, outerR, start, end);
        ctx.closePath();

        let fillColor = colors[i % colors.length];
        if (isHover) fillColor = brightenHex(fillColor, 0.18);
        ctx.fillStyle = fillColor;
        ctx.fill();

        // Carve inner circle to create ring segment
        ctx.save();
        ctx.globalCompositeOperation = "destination-out";
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, baseRadius, end, start, true);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // A thin stroke separates neighboring slices for clarity.
        ctx.strokeStyle = "rgba(0,0,0,0.06)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, outerR, start, end);
        ctx.stroke();

        angle = end;
      }

      // The center label optionally shows the total number of questions.
      ctx.save();
      ctx.fillStyle = readCSSVar("--text-color", "#102027");
      ctx.font = `600 ${Math.max(
        14,
        baseRadius * 0.18
      )}px Inter, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      // Display total-correct / total in center
      const totalCorrect = entries.reduce((s, e) => s + (e.correct || 0), 0);
      const totalQuestions = entries.reduce((s, e) => s + (e.total || 0), 0);
      ctx.fillText(`${totalCorrect}/${totalQuestions}`, cx, cy);
      ctx.restore();

      // If a legend area exists I populate it so labels are clear.
      try {
        const legendEl = document.getElementById("topicLegend");
        if (legendEl) {
          legendEl.innerHTML = "";
          entries.forEach((e, idx) => {
            const item = document.createElement("div");
            item.className = "item";
            const sw = document.createElement("span");
            sw.className = "swatch";
            sw.style.background = colors[idx % colors.length];
            sw.style.display = "inline-block";
            sw.style.width = "14px";
            sw.style.height = "14px";
            sw.style.borderRadius = "3px";
            sw.style.marginRight = "8px";
            item.appendChild(sw);
            const txt = document.createElement("span");
            txt.textContent = `${e.label} — ${e.correct}/${e.total}`;
            item.appendChild(txt);
            legendEl.appendChild(item);
          });
          legendEl.style.color = readCSSVar("--text-color", "#102027");
        }
      } catch (e) {
        // Ignore legend errors silently
      }
    }

    // Detect hovered slice by mouse position
    function handleMouseMove(ev) {
      const rect = canvas.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const baseRadius = Math.min(rect.width, rect.height) * 0.18;
      const maxOuterRadius = Math.min(rect.width, rect.height) * 0.48;

      if (dist < baseRadius || dist > maxOuterRadius) {
        // If the mouse is outside any slice I clear the hover state.
        tooltip.style.display = "none";
        draw(-1);
        return;
      }

      // Compute angle relative to top for hit-testing
      let ang = Math.atan2(dy, dx);
      // normalize into 0..2PI and treat the top as the starting point
      ang += Math.PI / 2;
      if (ang < 0) ang += Math.PI * 2;

      // find slice index by cumulative angles
      let a = 0;
      let found = -1;
      for (let i = 0; i < entries.length; i++) {
        const portion = entries[i].value / totalValue;
        const start = a;
        const end = a + portion;
        if (ang >= start * Math.PI * 2 && ang <= end * Math.PI * 2) {
          found = i;
          break;
        }
        a = end;
      }

      if (found === -1) {
        tooltip.style.display = "none";
        draw(-1);
        return;
      }

      // Show tooltip with topic name and performance
      const e = entries[found];
      const pct = e.total > 0 ? Math.round((e.correct / e.total) * 100) : 0;
      tooltip.textContent = `${e.label}\n${e.correct} / ${e.total} correct (${pct}%)`;
      // Position tooltip near cursor, clamp inside viewport
      const left = Math.min(
        window.innerWidth - 8 - tooltip.offsetWidth,
        ev.clientX + 12
      );
      const top = Math.min(
        window.innerHeight - 8 - tooltip.offsetHeight,
        ev.clientY + 12
      );
      tooltip.style.left = left + "px";
      tooltip.style.top = top + "px";
      tooltip.style.display = "block";

      // Redraw the chart with the hovered slice highlighted.
      draw(found);
    }

    function handleMouseLeave() {
      tooltip.style.display = "none";
      draw(-1);
    }

    function attachHandlers() {
      handlers.move = handleMouseMove;
      handlers.leave = handleMouseLeave;
      canvas.addEventListener("mousemove", handlers.move);
      canvas.addEventListener("mouseleave", handlers.leave);
      // If the canvas or container resizes I redraw so the visuals remain crisp.
      handlers.resize = () => draw(-1);
      window.addEventListener("resize", handlers.resize);
    }

    function detachHandlers() {
      if (handlers.move) canvas.removeEventListener("mousemove", handlers.move);
      if (handlers.leave)
        canvas.removeEventListener("mouseleave", handlers.leave);
      if (handlers.resize)
        window.removeEventListener("resize", handlers.resize);
    }

    // Public API: update, destroy
    function update(newScores) {
      scores = newScores;
      entries = computeEntries(scores);
      totalValue = entries.reduce((s, e) => s + (e.value || 0), 0);
      // if totalValue is 0 but some topics exist, assign equal tiny weights to render slices
      if (totalValue === 0 && entries.length > 0) {
        entries.forEach((e) => (e.value = 1));
        totalValue = entries.length;
      }
      draw(-1);
    }

    function destroy() {
      detachHandlers();
      try {
        if (tooltip && tooltip.parentNode)
          tooltip.parentNode.removeChild(tooltip);
      } catch (e) {}
      // clear canvas
      try {
        const r = canvas.getBoundingClientRect();
        ctx.clearRect(0, 0, r.width, r.height);
      } catch (e) {}
    }

    // initialization
    colors = DEFAULT_COLORS.slice();
    entries = computeEntries(scores || {});
    totalValue = entries.reduce((s, e) => s + (e.value || 0), 0);
    if (totalValue === 0 && entries.length > 0) {
      entries.forEach((e) => (e.value = 1));
      totalValue = entries.length;
    }
    attachHandlers();
    draw(-1);

    return { update, destroy, el: canvas };
  }

  // expose globally
  window.renderAleksChart = renderAleksChart;
})();

window.submitScore = submitScore;
