const qs = (selector, scope = document) => scope.querySelector(selector);
const qsa = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

const on = (element, event, handler) => {
  if (element) element.addEventListener(event, handler);
};

const setText = (element, text) => {
  if (element) element.textContent = text;
};

const toggleHidden = (element, hidden) => {
  if (element) element.classList.toggle("hidden", Boolean(hidden));
};

const clearChildren = (element) => {
  if (!element) return;
  while (element.firstChild) element.removeChild(element.firstChild);
};

export { qs, qsa, on, setText, toggleHidden, clearChildren };
