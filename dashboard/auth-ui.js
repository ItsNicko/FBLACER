import { authApi } from "./auth.js";
import { uiApi } from "./ui.js";

export function initAuthUI() {
  const signupBtn = document.getElementById("signupBtn");
  const loginBtn = document.getElementById("loginBtn");
  const googleLoginBtn = document.getElementById("googleLoginBtn");
  const authForm = document.getElementById("authForm");

  if (!signupBtn || !loginBtn) return; // Not on auth page

  authForm.onsubmit = async (e) => {
    e.preventDefault();
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;
    
    try {
      await authApi.signUp(username, password);
      window.location.href = "dashboard/index.html";
    } catch (error) {
      alert(error.message);
    }
  };

  loginBtn.onclick = async () => {
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;
    
    try {
      await authApi.signIn(username, password);
      window.location.href = "dashboard/index.html";
    } catch (error) {
      alert("Invalid username or password");
    }
  };

  if (googleLoginBtn) {
    googleLoginBtn.onclick = async () => {
      try {
        await authApi.signInWithGoogle();
        window.location.href = "dashboard/index.html";
      } catch (error) {
        console.error("Google Login Error:", error);
        alert("Google Login failed. Please try again.");
      }
    };
  }
}
