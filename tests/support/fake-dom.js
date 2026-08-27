// tests/support/fake-dom.js
//
// Minimal, dependency-free DOM stand-in (§94 — no new npm package like
// jsdom for this) — only the exact subset of DOM APIs
// frontend/portal/render.js and frontend/portal/app.js actually call:
// document.createElement, element.className/textContent/setAttribute,
// append/prepend/replaceChildren, addEventListener + a synthetic click,
// and Element#closest("a") (used by app.js's delegated link-click
// handler). Not a general-purpose DOM — just enough to prove, without a
// real browser, that a given failure state stops rendering "Carregando…"
// and that a rendered "Tentar novamente" button re-invokes its handler.

export class FakeElement {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.attributes = {};
    this.className = "";
    this._textContent = "";
    this._listeners = {};
    this.parentElement = null;
    const self = this;
    this.classList = {
      add: (...names) => {
        const set = new Set(self.className.split(/\s+/).filter(Boolean));
        for (const name of names) set.add(name);
        self.className = [...set].join(" ");
      },
      remove: (...names) => {
        const set = new Set(self.className.split(/\s+/).filter(Boolean));
        for (const name of names) set.delete(name);
        self.className = [...set].join(" ");
      },
      toggle: (name, force) => {
        const has = self.className.split(/\s+/).filter(Boolean).includes(name);
        const shouldHave = force === undefined ? !has : Boolean(force);
        if (shouldHave) this.classList.add(name);
        else this.classList.remove(name);
        return shouldHave;
      },
      contains: (name) => self.className.split(/\s+/).filter(Boolean).includes(name),
    };
  }

  set textContent(value) {
    this._textContent = value;
    this.children = [];
  }

  get textContent() {
    if (this.children.length === 0) return this._textContent;
    return this.children.map((child) => child.textContent ?? "").join("");
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  get href() {
    return this.attributes.href;
  }

  append(...nodes) {
    for (const node of nodes) {
      if (node == null) continue;
      this.children.push(node);
      node.parentElement = this;
    }
  }

  prepend(...nodes) {
    for (const node of [...nodes].reverse()) {
      if (node == null) continue;
      this.children.unshift(node);
      node.parentElement = this;
    }
  }

  replaceChildren(...nodes) {
    this.children = [];
    this.append(...nodes);
  }

  addEventListener(type, handler) {
    (this._listeners[type] ??= []).push(handler);
  }

  removeEventListener(type, handler) {
    this._listeners[type] = (this._listeners[type] ?? []).filter((h) => h !== handler);
  }

  /**
   * Returns whatever the listener(s) return (a single value directly, or
   * `Promise.all(...)` when there's more than one) so tests can
   * `await element.click()` and actually wait for an async handler (e.g.
   * `onRetry`) to finish, instead of firing it and moving on.
   */
  dispatchEvent(event) {
    const results = (this._listeners[event.type] ?? []).map((handler) => handler(event));
    if (results.length === 0) return undefined;
    if (results.length === 1) return results[0];
    return Promise.all(results);
  }

  /** Synthetic user click — what tests call to exercise a "Tentar novamente" button. */
  click() {
    return this.dispatchEvent({ type: "click", target: this, preventDefault() {} });
  }

  closest(selector) {
    let node = this;
    while (node) {
      if (matchesSimpleSelector(node, selector)) return node;
      node = node.parentElement;
    }
    return null;
  }

  querySelector(selector) {
    return findDescendant(this, (node) => matchesSimpleSelector(node, selector)) ?? null;
  }

  querySelectorAll(selector) {
    const results = [];
    collectDescendants(this, (node) => matchesSimpleSelector(node, selector), results);
    return results;
  }
}

// Only supports what this project's code actually queries with: a bare
// tag name ("a", "button") or `tag[data-attr]` ("link[data-imob-portal-styles]").
function matchesSimpleSelector(node, selector) {
  const attrMatch = selector.match(/^([a-z]+)?\[([\w-]+)\]$/i);
  if (attrMatch) {
    const [, tag, attr] = attrMatch;
    if (tag && node.tagName !== tag.toUpperCase()) return false;
    const dataAttr = attr.startsWith("data-") ? attr.slice(5) : attr;
    return node.attributes[attr] !== undefined || node.dataset?.[camelCase(dataAttr)] !== undefined;
  }
  return node.tagName === selector.toUpperCase();
}

function camelCase(value) {
  return value.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function findDescendant(node, predicate) {
  for (const child of node.children ?? []) {
    if (predicate(child)) return child;
    const found = findDescendant(child, predicate);
    if (found) return found;
  }
  return null;
}

function collectDescendants(node, predicate, out) {
  for (const child of node.children ?? []) {
    if (predicate(child)) out.push(child);
    collectDescendants(child, predicate, out);
  }
}

export function createFakeDocument() {
  const head = new FakeElement("head");
  const body = new FakeElement("body");
  return {
    head,
    body,
    createElement: (tag) => new FakeElement(tag),
    querySelector: (selector) => body.querySelector(selector) ?? head.querySelector(selector),
  };
}

/** Fake `container.dataset` support for the one attribute selector app.js relies on. */
Object.defineProperty(FakeElement.prototype, "dataset", {
  get() {
    const proxyTarget = this.attributes;
    return new Proxy(
      {},
      {
        get: (_, prop) => proxyTarget[`data-${String(prop).replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`],
        set: (_, prop, value) => {
          proxyTarget[`data-${String(prop).replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`] = value;
          return true;
        },
      },
    );
  },
});
