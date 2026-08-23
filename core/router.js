// core/router.js
//
// Minimal method+path router for the private Worker API (§71: request →
// router → auth → handler → business/module → storage → response). No
// external dependencies — the private API surface is small enough not to
// need a framework, and pulling one in would violate §94 (regra de
// simplicidade: só adicionar peça nova se Static Asset/JSON/R2/Browser/
// módulo pequeno/Worker privado curto não bastarem).

function compilePath(path) {
  const paramNames = [];
  const pattern = path
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      if (segment.startsWith(":")) {
        paramNames.push(segment.slice(1));
        return "([^/]+)";
      }
      if (segment === "*") {
        paramNames.push("wildcard");
        return "(.*)";
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");
  return { regex: new RegExp(`^/${pattern}/?$`), paramNames };
}

export class Router {
  #routes = [];

  #add(method, path, handler) {
    const { regex, paramNames } = compilePath(path);
    this.#routes.push({ method, regex, paramNames, handler });
    return this;
  }

  get(path, handler) {
    return this.#add("GET", path, handler);
  }

  post(path, handler) {
    return this.#add("POST", path, handler);
  }

  put(path, handler) {
    return this.#add("PUT", path, handler);
  }

  delete(path, handler) {
    return this.#add("DELETE", path, handler);
  }

  /** Matches a request's method+pathname against registered routes. */
  match(method, pathname) {
    for (const route of this.#routes) {
      if (route.method !== method) continue;
      const match = route.regex.exec(pathname);
      if (!match) continue;
      const params = {};
      route.paramNames.forEach((name, index) => {
        params[name] = decodeURIComponent(match[index + 1]);
      });
      return { handler: route.handler, params };
    }
    return null;
  }
}
