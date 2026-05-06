/**
 * content.js — MAIN world, document_start
 *
 * Overrides fetch + XHR immediately and queues all requests.
 * Receives rules from bridge.js (ISOLATED world) via window.postMessage,
 * which correctly crosses the MAIN/ISOLATED world boundary.
 * Once rules arrive, queued requests are flushed.
 */
(function () {
  'use strict';

  let _rules = [];
  let _enabled = true;
  let _ready = false;
  let _queue = [];

  // ── URL matching ──────────────────────────────────────────────────────────────
  function urlMatches(pattern, url) {
    try {
      const re = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
      return new RegExp(re, 'i').test(url);
    } catch {
      return url.toLowerCase().includes(pattern.toLowerCase());
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────
  function parseBody(raw) {
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }

  function extractGQL(body) {
    try {
      const p = typeof body === 'string' ? JSON.parse(body) : body;
      if (p && p.query) return { operationName: p.operationName || null, query: p.query, variables: p.variables || {} };
    } catch {}
    return null;
  }

  const STATUS_TEXT = {
    200: 'OK',
    201: 'Created',
    204: 'No Content',
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    422: 'Unprocessable Entity',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable'
  };

  // ── Rule matching ─────────────────────────────────────────────────────────────
  function findRule(url, method, bodyRaw) {
    if (!_enabled) return null;
    for (const rule of _rules) {
      if (!rule.enabled) continue;
      if (!rule.urlPattern || !rule.urlPattern.trim()) continue; // skip incomplete rules
      if (!urlMatches(rule.urlPattern, url)) continue;
      const m = (rule.method || '*').toUpperCase();
      if (m !== '*' && m !== method.toUpperCase()) continue;
      if (rule.type === 'graphql') {
        const gql = extractGQL(bodyRaw);
        if (!gql) continue;
        if (rule.graphqlOperation) {
          const op = rule.graphqlOperation.toLowerCase();
          if (
            !(gql.operationName && gql.operationName.toLowerCase() === op) &&
            !(gql.query && gql.query.toLowerCase().includes(op))
          )
            continue;
        }
      }
      console.info(`[MockMate] ✅ matched: "${rule.name}" → ${method} ${url}`);
      return rule;
    }
    return null;
  }

  // ── Build response body ───────────────────────────────────────────────────────
  function buildBody(rule, ctx) {
    // Dynamic code always takes precedence if present, regardless of responseType
    const hasDynamic = rule.dynamicCode && rule.dynamicCode.trim();
    if (rule.responseType === 'dynamic' || hasDynamic) {
      try {
        // Build the args object matching the modifyResponse(args) signature
        const staticBody = rule.responseBody || '{}';
        let responseJSON = null;
        try {
          responseJSON = JSON.parse(staticBody);
        } catch (_) {}

        const args = {
          method: ctx.method,
          url: ctx.url,
          response: staticBody,
          responseType: 'json',
          requestHeaders: ctx.headers || {},
          requestData: ctx.body,
          responseJSON
        };

        // eslint-disable-next-line no-new-func
        const fn = new Function('args', rule.dynamicCode + '\n; return modifyResponse(args);');
        const result = fn(args);
        return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      } catch (e) {
        console.error('[MockMate] dynamic error:', e);
        return JSON.stringify({ __mockmate_error__: e.message });
      }
    }
    return rule.responseBody || '{}';
  }

  // ── Execute fetch (mock or real) ──────────────────────────────────────────────
  const _realFetch = window.fetch.bind(window);

  function runFetch(input, init, bodyRaw, url, method) {
    const rule = findRule(url, method, bodyRaw);
    if (!rule) return _realFetch(input, init);

    const status = parseInt(rule.statusCode || '200', 10);
    const headers = Object.assign({ 'Content-Type': 'application/json' }, rule.headers || {});
    const ctx = { url, method, body: parseBody(bodyRaw), headers: {}, graphql: extractGQL(bodyRaw) };
    const body = buildBody(rule, ctx);
    const delay = parseInt(rule.delay || '0', 10);

    console.info(`[MockMate] 🎭 fetch → ${status}`, url);
    const respond = () =>
      new Response(body, { status, statusText: STATUS_TEXT[status] || 'OK', headers: new Headers(headers) });
    return delay > 0 ? new Promise((r) => setTimeout(() => r(respond()), delay)) : Promise.resolve(respond());
  }

  // ── fetch override ────────────────────────────────────────────────────────────
  window.fetch = function (input, init) {
    init = init || {};
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = (init.method || (input instanceof Request && input.method) || 'GET').toUpperCase();
    const bodyRaw = init.body || null;

    if (!_ready) {
      return new Promise((resolve, reject) => {
        _queue.push({ resolve, reject, run: () => runFetch(input, init, bodyRaw, url, method) });
        console.debug('[MockMate] queued:', method, url);
      });
    }
    return runFetch(input, init, bodyRaw, url, method);
  };

  // ── XHR override ─────────────────────────────────────────────────────────────
  const _RealXHR = window.XMLHttpRequest;
  window.XMLHttpRequest = function () {
    const xhr = new _RealXHR();
    let _m = 'GET',
      _u = '';

    const _open = xhr.open.bind(xhr);
    xhr.open = function (method, url, ...rest) {
      _m = method.toUpperCase();
      _u = url;
      return _open(method, url, ...rest);
    };

    const _send = xhr.send.bind(xhr);
    xhr.send = function (bodyRaw) {
      const run = () => {
        const rule = findRule(_u, _m, bodyRaw);
        if (!rule) return _send(bodyRaw);

        const status = parseInt(rule.statusCode || '200', 10);
        const headers = Object.assign({ 'Content-Type': 'application/json' }, rule.headers || {});
        const ctx = { url: _u, method: _m, body: parseBody(bodyRaw), headers: {}, graphql: extractGQL(bodyRaw) };
        const body = buildBody(rule, ctx);
        const delay = parseInt(rule.delay || '0', 10);
        console.info(`[MockMate] 🎭 XHR → ${status}`, _u);

        setTimeout(() => {
          Object.defineProperty(xhr, 'readyState', { get: () => 4, configurable: true });
          Object.defineProperty(xhr, 'status', { get: () => status, configurable: true });
          Object.defineProperty(xhr, 'statusText', { get: () => STATUS_TEXT[status] || 'OK', configurable: true });
          Object.defineProperty(xhr, 'responseText', { get: () => body, configurable: true });
          Object.defineProperty(xhr, 'response', { get: () => body, configurable: true });
          xhr.getAllResponseHeaders = () =>
            Object.entries(headers)
              .map(([k, v]) => `${k}: ${v}`)
              .join('\r\n');
          xhr.getResponseHeader = (k) => headers[k] ?? null;
          ['readystatechange', 'load', 'loadend'].forEach((t) => {
            xhr.dispatchEvent(new Event(t));
            if (typeof xhr['on' + t] === 'function') xhr['on' + t].call(xhr);
          });
        }, delay);
      };

      if (!_ready) {
        _queue.push({ resolve: () => {}, reject: () => {}, run });
        return;
      }
      run();
    };
    return xhr;
  };

  // ── Receive rules from bridge via postMessage ─────────────────────────────────
  window.addEventListener('message', (e) => {
    // Only accept messages from our bridge (same window, our marker)
    if (!e.data || !e.data.__mockmate__) return;

    const { type, payload } = e.data;
    if (type === 'INIT' || type === 'UPDATE') {
      _rules = payload.rules ?? _rules;
      _enabled = payload.enabled ?? _enabled;
      console.debug(`[MockMate] ${type}: ${_rules.length} rules, enabled: ${_enabled}`);
    }

    if (!_ready) {
      _ready = true;
      const q = _queue.splice(0);
      console.debug('[MockMate] flushing', q.length, 'queued request(s)');
      for (const { resolve, reject, run } of q) {
        try {
          Promise.resolve(run()).then(resolve).catch(reject);
        } catch (e) {
          reject(e);
        }
      }
    }
  });

  // Safety valve — if bridge never responds, unblock after 500ms
  setTimeout(() => {
    if (!_ready) {
      console.warn('[MockMate] bridge timeout — releasing queue with no rules');
      _ready = true;
      const q = _queue.splice(0);
      for (const { resolve, reject, run } of q) {
        try {
          Promise.resolve(run()).then(resolve).catch(reject);
        } catch (e) {
          reject(e);
        }
      }
    }
  }, 500);

  console.debug('[MockMate] interceptor installed, awaiting rules from bridge...');
})();
