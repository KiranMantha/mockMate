/**
 * content.js — MAIN world, document_start
 *
 * Overrides fetch + XHR immediately and queues all requests.
 * Receives rules from bridge.js (ISOLATED world) via window.postMessage.
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
      if (!rule.urlPattern || !rule.urlPattern.trim()) continue;
      if (!urlMatches(rule.urlPattern, url)) continue;
      const ruleMethod = (rule.method || '*').toUpperCase();
      if (ruleMethod !== '*' && ruleMethod !== method.toUpperCase()) continue;
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
      return rule;
    }
    return null;
  }

  // ── Build response body ───────────────────────────────────────────────────────
  // Strictly respects rule.responseType — no implicit fallback to dynamic.
  function buildBody(rule, ctx) {
    if (rule.responseType === 'dynamic') {
      if (!rule.dynamicCode || !rule.dynamicCode.trim()) {
        // Dynamic selected but no code written yet — return empty object
        return '{}';
      }
      try {
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
        const transform = new Function('args', rule.dynamicCode + '\n; return modifyResponse(args);');
        const result = transform(args);
        return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      } catch (e) {
        console.error('[MockMate] dynamic error:', e);
        return JSON.stringify({ __mockmate_error__: e.message });
      }
    }

    // responseType === "static" (or anything else) — always use responseBody
    return rule.responseBody || '{}';
  }

  function runRule(mockRule, bodyRaw, isFetchRequest = true, xhrCallback) {
    const { name, responseType, urlPattern: url, method, headers: mockRuleHeaders, statusCode } = mockRule;
    const status = parseInt(statusCode || '200', 10);
    const headers = Object.assign({ 'Content-Type': 'application/json' }, mockRuleHeaders || {}, {
      // Makes mocked responses identifiable in the browser console and response headers.
      // Note: Chrome DevTools Network tab does not show fetch-overridden responses —
      // they never hit the network. Check the Console tab for [MockMate] logs instead.
      'X-MockMate-Rule': name,
      'X-MockMate-Intercepted': 'true'
    });
    const ctx = {
      url,
      method,
      body: parseBody(bodyRaw),
      headers,
      graphql: extractGQL(bodyRaw)
    };
    const body = buildBody(mockRule, ctx);
    const delay = parseInt(mockRule.delay || '0', 10);

    console.info(
      `%c[MockMate]%c 🎭 ${method} ${url}\n  rule: "${name}" | type: ${responseType} | status: ${status}`,
      'color:#6ee7b7;font-weight:bold',
      'color:inherit'
    );

    if (isFetchRequest) {
      const response = new Response(body, {
        status,
        statusText: STATUS_TEXT[status] || 'OK',
        headers: new Headers(headers)
      });
      return delay > 0
        ? new Promise((resolve) => setTimeout(() => resolve(response), delay))
        : Promise.resolve(response);
    } else {
      xhrCallback(body, headers, status, delay);
    }
  }

  // This runs in the actual webpage context, not the extension isolated world
  function interceptNetwork() {
    const { fetch: originalFetch, XMLHttpRequest: originalXMLHttpRequest } = window;

    window.fetch = async function (...args) {
      const [resource, config = {}] = args;
      const url = typeof resource === 'string' ? resource : resource instanceof URL ? resource.href : resource.url;
      const method = (config.method || (resource instanceof Request && resource.method) || 'GET').toUpperCase();
      const bodyRaw = config.body || null;

      const mockRule = findRule(url, method, bodyRaw);

      if (mockRule) {
        if (!_ready) {
          return new Promise((resolve, reject) => {
            _queue.push({ resolve, reject, run: () => runRule(mockRule, bodyRaw) });
            console.debug('[MockMate] queued:', method, url);
          });
        }

        return runRule(mockRule, bodyRaw);
      }

      return originalFetch(...args);
    };

    window.XMLHttpRequest = function () {
      const xhrRequest = new originalXMLHttpRequest();
      let _method = 'GET',
        _url = '';

      const _openRequest = xhrRequest.open.bind(xhrRequest);
      const _sendRequest = xhrRequest.send.bind(xhrRequest);

      xhrRequest.open = function (method, url, ...rest) {
        _method = method.toUpperCase();
        _url = url;
        return _openRequest(method, url, ...rest);
      };

      xhrRequest.send = function (bodyRaw) {
        const mockRule = findRule(_url, _method, bodyRaw);

        if (mockRule) {
          const xhrCallback = (body, status, headers, delay) => {
            setTimeout(() => {
              Object.defineProperty(xhrRequest, 'readyState', { get: () => 4, configurable: true });
              Object.defineProperty(xhrRequest, 'status', { get: () => status, configurable: true });
              Object.defineProperty(xhrRequest, 'statusText', {
                get: () => STATUS_TEXT[status] || 'OK',
                configurable: true
              });
              Object.defineProperty(xhrRequest, 'responseText', { get: () => body, configurable: true });
              Object.defineProperty(xhrRequest, 'response', { get: () => body, configurable: true });
              xhrRequest.getAllResponseHeaders = () =>
                Object.entries(headers)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join('\r\n');
              xhrRequest.getResponseHeader = (k) => headers[k] ?? null;
              ['readystatechange', 'load', 'loadend'].forEach((t) => {
                xhrRequest.dispatchEvent(new Event(t));
                if (typeof xhrRequest['on' + t] === 'function') xhrRequest['on' + t].call(xhrRequest);
              });
            }, delay);
          };

          if (!_ready) {
            return new Promise((resolve, reject) => {
              _queue.push({ resolve, reject, run: () => runRule(mockRule, bodyRaw, false, xhrCallback) });
              console.debug('[MockMate] queued:', method, url);
            });
          }

          return runRule(mockRule, bodyRaw, false, xhrCallback);
        }

        return _sendRequest(bodyRaw);
      };

      return xhrRequest;
    };
  }

  // ── Receive rules from bridge via postMessage ─────────────────────────────────
  window.addEventListener('message', (e) => {
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
        } catch (err) {
          reject(err);
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
        } catch (err) {
          reject(err);
        }
      }
    }
  }, 500);

  interceptNetwork();

  console.debug('[MockMate] interceptor installed, awaiting rules from bridge...');
})();
