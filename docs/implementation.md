# Implementation Analysis

## 1. Code Structure Analysis

```
app/
├── api.js              # 78 lines - Server, routing, auth, handlers
├── api.test.js         # 51 lines - Integration tests
├── config/
│   ├── config.js       # 8 lines - Constants (credentials, secrets)
│   └── errors.js       # 1 line  - Error message constant
└── util/
    └── utils.js        # 7 lines  - fetch wrapper for tests
```

**Coupling Assessment:**
- `api.js` imports from `config/*` and `jsonwebtoken` → **High afferent coupling**
- `api.test.js` imports from `api.js`, `config`, `util` → **Integration test coupling**
- `utils.js` standalone → **Low coupling (test-only)**
- No circular dependencies ✅

---

## 2. API Implementation Details

### Route Handler Pattern
```javascript
// Inline routing in handler()
if(req.url === '/login' && req.method === "POST") { return loginRoute(req, res) }
// Auth check
if (!validateHeaders(req.headers)) { ... }
// Route match
if (req.url == '/products' && req.method === "POST") { return createProductRoute(req, res) }
```

**Issues:**
- String comparison for routing (no params, no regex)
- No 405 Method Not Allowed handling
- No centralized route registry

### Request Body Parsing
```javascript
const { user, password } = JSON.parse(await once(request, "data"))
```
- Uses `node:events.once()` for single `'data'` event
- **Risk:** Assumes body fits in single chunk (breaks on large payloads)
- **Risk:** No try/catch → malformed JSON crashes process

### Response Formatting
```javascript
response.end(JSON.stringify({ token }))        // login
response.end(JSON.stringify({ category }))     // products
res.writeHead(400); res.end("invalid token!")  // errors (inconsistent)
```
- Inconsistent: sometimes object, sometimes plain string
- No `Content-Type: application/json` header set

---

## 3. Authentication Flow

### Token Generation (`loginRoute`)
```javascript
const token = jwt.sign({ user, message: 'heyduude' }, TOKEN_KEY)
```
- **Algorithm:** HS256 (default)
- **Payload:** `{ user: "Samuel", message: "heyduude" }`
- **No claims:** `iat`, `exp`, `iss`, `aud` missing
- **Secret:** Hardcoded 12-char string

### Token Validation (`validateHeaders`)
```javascript
function validateHeaders(headers) {
  try {
    const auth = headers.authorization.replace(/bearer\s/ig,'')
    jwt.verify(auth, TOKEN_KEY)
    return true
  } catch(err) {
    console.error(err)  // Leaks stack trace
    return false
  }
}
```
- **Regex:** `/bearer\s/ig` - case insensitive, requires space
- **No verification options:** `algorithms`, `issuer`, `audience` not enforced
- **Error handling:** Swallows all errors (expired, malformed, invalid sig)

---

## 4. Business Logic: Product Categorization

```javascript
const categories = {
  premium: { from: 101, to: 500 },
  regular: { from: 51,  to: 100 },
  basic:   { from: 0,   to: 50  },
}

const category = Object.keys(categories).find(key => {
  const c = categories[key]
  return price >= c.from && price <= c.to
})
```

**Analysis:**
- **Algorithm:** Linear search O(n) where n=3 (trivial)
- **Edge Cases:**
  - `price < 0` → `undefined` (no match)
  - `price > 500` → `undefined` (no match)
  - `price` non-numeric → `NaN` comparisons → `undefined`
  - Missing `price` → `undefined`
- **Response:** `{ category: undefined }` for out-of-range (bug)

**Test Coverage:** Only 110, 60, 10 tested — boundaries (0, 50, 51, 100, 101, 500) not tested.

---

## 5. Error Handling

| Scenario | Current Behavior | Issue |
|----------|------------------|-------|
| Invalid credentials | 400 + `{ error: "user invalida" }` | Portuguese error, no i18n |
| Missing auth header | `headers.authorization` → `TypeError` → catch → 400 | Crashes on undefined |
| Malformed JSON | `JSON.parse` throws → **uncaught exception** | Process crashes |
| Invalid token | 400 + `"invalid token!"` (string) | Inconsistent format |
| Route not found | 404 + `"not found!"` (string) | Inconsistent format |
| Server error | `console.error` + 400 | Leaks internals |

**Critical Gap:** No global error handler, no domain/process error boundaries.

---

## 6. Configuration Management

### Current: `config.js`
```javascript
export const VALID = { user: "Samuel", password: "123" };
export const TOKEN_KEY = "dsffaiu40238";
export const BASE_URL = `http://localhost:3000`
```

**Problems:**
- Secrets in source control 🔴
- No environment differentiation (dev/staging/prod)
- No validation of required config
- `BASE_URL` hardcoded (fails in container if port differs)

### Recommended: Environment-Based Config
```javascript
// config.js (proposed)
export const CONFIG = {
  jwt: {
    secret: process.env.JWT_SECRET ?? crypto.randomBytes(32).toString('hex'),
    expiresIn: process.env.JWT_EXPIRES_IN ?? '1h',
    algorithm: 'HS256',
  },
  auth: {
    validUser: process.env.VALID_USER ?? 'admin',
    validPass: process.env.VALID_PASS ?? 'changeme',
  },
  server: {
    port: Number(process.env.PORT) ?? 3000,
    host: process.env.HOST ?? '0.0.0.0',
  },
  cors: {
    origin: process.env.CORS_ORIGIN ?? '*',
  },
}
```

---

## 7. Utilities

### `postRequest` (`util/utils.js`)
```javascript
export async function postRequest(url, data, token) {
  return await fetch(url, {
    method: 'POST',
    body: JSON.stringify(data),
    headers: { authorization: token }
  })
}
```
- **Purpose:** Test helper for integration tests
- **Issues:**
  - No timeout
  - No error handling for network failures
  - Assumes JSON response
  - Header key lowercase (`authorization` vs `Authorization`)

---

## 8. Code Smells & Technical Debt

| # | Smell | Location | Severity | Effort |
|---|-------|----------|----------|--------|
| 1 | **God Function** (`handler` does routing, auth, dispatch) | `api.js:61-74` | 🔴 High | Medium |
| 2 | **Hardcoded Secrets** | `config.js:6` | 🔴 Critical | Low |
| 3 | **Hardcoded Credentials** | `config.js:2-4` | 🔴 Critical | Low |
| 4 | **No Input Validation** | `api.js:11,24` | 🔴 Critical | Medium |
| 5 | **Inconsistent Error Responses** | `api.js:13-14,66-67,72-73` | 🟠 High | Low |
| 6 | **Missing Content-Type Headers** | All responses | 🟠 High | Low |
| 7 | **No Request Size Limit** | `once(request, "data")` | 🟠 High | Low |
| 8 | **Console Logging in Prod** | `api.js:56` | 🟡 Medium | Low |
| 9 | **Regex Token Extraction Fragile** | `api.js:51` | 🟡 Medium | Low |
| 10 | **No Token Expiration** | `api.js:17` | 🔴 Critical | Low |
| 11 | **Linear Category Search** | `api.js:40-43` | 🟢 Low (n=3) | Low |
| 12 | **Undefined Category for Out-of-Range** | `api.js:45` | 🟠 High | Low |
| 13 | **Test-Only Utility in Source Tree** | `util/utils.js` | 🟡 Medium | Low |
| 14 | **No TypeScript Types** | Entire codebase | 🟡 Medium | Medium |
| 15 | **Magic Numbers** (price ranges) | `api.js:26-37` | 🟢 Low | Low |

---

## 9. Refactoring Opportunities

### 9.1 Extract Middleware Pattern
```javascript
// middleware/auth.js
export function authMiddleware(req, res, next) {
  const token = extractToken(req.headers)
  if (!token) return sendError(res, 401, 'Missing token')
  try {
    req.user = jwt.verify(token, CONFIG.jwt.secret)
    next()
  } catch (e) {
    sendError(res, 401, 'Invalid token')
  }
}
```

### 9.2 Route Registry
```javascript
// routes/index.js
export const routes = [
  { method: 'POST', path: '/login', handler: loginHandler, auth: false },
  { method: 'POST', path: '/products', handler: productHandler, auth: true },
]

// router.js
export function router(req, res) {
  const route = routes.find(r => r.method === req.method && matchPath(r.path, req.url))
  if (!route) return sendError(res, 404, 'Not found')
  if (route.auth && !req.user) return sendError(res, 401, 'Unauthorized')
  return route.handler(req, res)
}
```

### 9.3 Validation Layer
```javascript
// validation/schemas.js
export const loginSchema = z.object({
  user: z.string().min(1),
  password: z.string().min(1),
})

export const productSchema = z.object({
  description: z.string().min(1).max(200),
  price: z.number().int().min(0).max(10000),
})
```

### 9.4 Error Handling Wrapper
```javascript
// utils/errors.js
export class AppError extends Error {
  constructor(message, statusCode, code) {
    super(message)
    this.statusCode = statusCode
    this.code = code
  }
}

export function errorHandler(err, req, res) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message, code: err.code })
  }
  logger.error(err)
  return res.status(500).json({ error: 'Internal server error' })
}
```

---

## 10. Bradesco Standards Compliance (Adapted for Node.js)

| Standard | Status | Notes |
|----------|--------|-------|
| **Type Safety** | ❌ | No TypeScript; use strict mode only |
| **Error Handling** | ❌ | No structured errors, no logging framework |
| **Configuration** | ❌ | Hardcoded; should use env + validation |
| **Security** | ❌ | Critical gaps (see Security Audit) |
| **Testing** | ⚠️ | Native runner OK; coverage ~15%, missing edge cases |
| **Documentation** | ❌ | Only minimal README; no API specs (OpenAPI) |
| **Observability** | ❌ | No metrics, tracing, health checks |
| **Dependency Management** | ✅ | Minimal deps, lockfile present |
| **Container Security** | ⚠️ | Non-root user ✅; no distroless, no scan |
| **Code Style** | ⚠️ | No ESLint/Prettier; inconsistent formatting |

---

## 11. Performance Considerations

| Aspect | Current | Concern | Recommendation |
|--------|---------|---------|----------------|
| **Event Loop Blocking** | `JSON.parse` sync | Large payloads block loop | Stream parsing / size limit |
| **Memory** | No limits | Unbounded request body | `http.MaxBytesReader` equivalent |
| **CPU** | Sync JWT verify | Blocks on crypto | Acceptable for low load |
| **Concurrency** | Single process | No clustering | PM2/cluster for multi-core |
| **Connection Handling** | Native http | No keep-alive tuning | Set `server.keepAliveTimeout` |
| **Cold Start** | `npm install` in Docker | Slow builds | Multi-stage build, cache layers |

---

## 12. File-by-File Improvement Checklist

### `app/api.js`
- [ ] Split into: `server.js`, `router.js`, `handlers/`, `middleware/`
- [ ] Add global error handler
- [ ] Add request size limit
- [ ] Add Content-Type headers
- [ ] Add request ID for tracing
- [ ] Graceful shutdown on SIGTERM

### `app/config/config.js`
- [ ] Move all values to environment variables
- [ ] Add schema validation (Zod)
- [ ] Separate configs per environment

### `app/config/errors.js`
- [ ] Expand to error codes catalog
- [ ] Add i18n support structure

### `app/util/utils.js`
- [ ] Move to `test/utils/` (test-only)
- [ ] Add timeout, retry, error handling

### `app/api.test.js`
- [ ] Add boundary tests (0, 50, 51, 100, 101, 500)
- [ ] Add negative tests (invalid token, missing auth, malformed JSON)
- [ ] Add performance/load test placeholder
- [ ] Separate unit vs integration tests