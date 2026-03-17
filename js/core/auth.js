import {
  auth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  updateProfile
} from "../core/firebase.js";
import { ensureUserProfile } from "../services/usersService.js";
import { qs, qsa, on, setText, toggleHidden } from "../utils/dom.js";
import { translateFirebaseError } from "../utils/errors.js";

const THEME_KEY = "easyrent-theme";

const state = {
  user: null,
  profile: null,
  isAdmin: false
};

const resolveInitialTheme = () => {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

const applyTheme = (theme) => {
  const resolved = theme === "dark" ? "dark" : "light";
  document.body.dataset.theme = resolved;
  localStorage.setItem(THEME_KEY, resolved);
  window.EASYRENT = window.EASYRENT || {};
  window.EASYRENT.theme = resolved;
  return resolved;
};

const updateThemeButton = (button, theme) => {
  if (!button) return;
  button.textContent = theme === "dark" ? "Светлая тема" : "Тёмная тема";
  button.setAttribute("aria-label", "Переключить тему");
  button.title = "Переключить тему";
};

const initThemeControls = () => {
  const authWrap = qs(".auth");
  let button = qs("#theme-toggle");
  if (!button && authWrap) {
    button = document.createElement("button");
    button.id = "theme-toggle";
    button.className = "theme-toggle";
    button.type = "button";
    authWrap.prepend(button);
  }

  const current = applyTheme(resolveInitialTheme());
  updateThemeButton(button, current);

  if (button) {
    button.onclick = () => {
      const next = document.body.dataset.theme === "dark" ? "light" : "dark";
      const applied = applyTheme(next);
      updateThemeButton(button, applied);
    };
  }
};

const initRevealEffects = () => {
  if (window.EASYRENT?.revealInited) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("reveal-in");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.12 }
  );

  const registerElements = () => {
    const elements = qsa(".hero, .panel, .card, .stat-card");
    elements.forEach((element, index) => {
      if (element.dataset.revealBound === "1") return;
      element.dataset.revealBound = "1";
      element.classList.add("reveal-ready");
      element.style.setProperty("--reveal-delay", `${(index % 6) * 70}ms`);
      observer.observe(element);
    });
  };

  registerElements();
  const mutationObserver = new MutationObserver(() => registerElements());
  mutationObserver.observe(document.body, { childList: true, subtree: true });

  window.EASYRENT = window.EASYRENT || {};
  window.EASYRENT.revealInited = true;
};

const initAuthUI = () => {
  initThemeControls();
  initRevealEffects();

  const modal = qs("#auth-modal");
  const openBtn = qs("#open-auth");
  const closeBtn = qs("#close-auth");
  const loginForm = qs("#login-form");
  const registerForm = qs("#register-form");
  const resetForm = qs("#reset-form");
  const authMessage = qs("#auth-message");
  const userMenu = qs("#user-menu");
  const userEmail = qs("#user-email");
  const logoutBtn = qs("#logout-btn");
  const adminLink = qs("#admin-link");
  const tabs = modal ? qsa(".tab", modal) : [];

  const showTab = (tabName) => {
    if (!modal) return;
    tabs.forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.tab === tabName);
    });
    qsa("[data-panel]", modal).forEach((panel) => {
      panel.classList.toggle("hidden", panel.dataset.panel !== tabName);
    });
    if (authMessage) authMessage.textContent = "";
  };

  const openModal = (tabName = "login") => {
    if (!modal) return;
    modal.classList.remove("hidden");
    showTab(tabName);
  };

  const closeModal = () => {
    if (!modal) return;
    modal.classList.add("hidden");
  };

  if (openBtn) on(openBtn, "click", () => openModal("login"));
  if (closeBtn) on(closeBtn, "click", closeModal);
  if (modal) {
    on(modal, "click", (event) => {
      if (event.target === modal) closeModal();
    });
  }

  tabs.forEach((tab) => on(tab, "click", () => showTab(tab.dataset.tab)));

  const setMessage = (message, isError = false) => {
    if (!authMessage) return;
    authMessage.textContent = message;
    authMessage.style.color = isError ? "#c0392b" : "";
  };

  if (loginForm) {
    on(loginForm, "submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(loginForm);
      try {
        await signInWithEmailAndPassword(auth, formData.get("email"), formData.get("password"));
        closeModal();
      } catch (error) {
        setMessage(translateFirebaseError(error, "Не удалось войти."), true);
      }
    });
  }

  if (registerForm) {
    on(registerForm, "submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(registerForm);
      try {
        const credential = await createUserWithEmailAndPassword(
          auth,
          formData.get("email"),
          formData.get("password")
        );
        await updateProfile(credential.user, { displayName: formData.get("name") });
        await ensureUserProfile(credential.user, {
          name: formData.get("name"),
          phone: formData.get("phone")
        });
        closeModal();
      } catch (error) {
        setMessage(translateFirebaseError(error, "Не удалось создать аккаунт."), true);
      }
    });
  }

  if (resetForm) {
    on(resetForm, "submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(resetForm);
      try {
        await sendPasswordResetEmail(auth, formData.get("email"));
        setMessage("Письмо для восстановления отправлено.");
      } catch (error) {
        setMessage(translateFirebaseError(error, "Не удалось отправить письмо."), true);
      }
    });
  }

  if (logoutBtn) {
    on(logoutBtn, "click", async () => {
      await signOut(auth);
    });
  }

  const updateAuthUI = () => {
    if (openBtn && userMenu) {
      toggleHidden(openBtn, Boolean(state.user));
      toggleHidden(userMenu, !state.user);
    }
    setText(userEmail, state.user?.email || "");
    if (adminLink) adminLink.classList.toggle("hidden", !state.isAdmin);
    document.body.dataset.auth = state.user ? "signed-in" : "signed-out";
  };

  onAuthStateChanged(auth, async (user) => {
    state.user = user;
    state.profile = null;
    state.isAdmin = false;

    if (user) {
      state.profile = await ensureUserProfile(user);
      state.isAdmin = state.profile?.role === "admin";
    }

    updateAuthUI();

    window.EASYRENT = window.EASYRENT || {};
    window.EASYRENT.auth = { ...state };
    window.EASYRENT.openAuthModal = openModal;
    window.EASYRENT.toggleTheme = () => {
      const next = document.body.dataset.theme === "dark" ? "light" : "dark";
      applyTheme(next);
      updateThemeButton(qs("#theme-toggle"), next);
    };

    document.dispatchEvent(new CustomEvent("easyrent-auth", { detail: { ...state } }));
  });
};

const getAuthState = () => ({ ...state });

const onAuthReady = (handler) => {
  const listener = (event) => handler(event.detail);
  document.addEventListener("easyrent-auth", listener);
  if (window.EASYRENT?.auth) handler(window.EASYRENT.auth);
  return () => document.removeEventListener("easyrent-auth", listener);
};

export { initAuthUI, getAuthState, onAuthReady };
