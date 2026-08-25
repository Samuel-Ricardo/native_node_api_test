# Architecture Documentation

## 1. System Overview

**Project:** `native_node_api_test`  
**Type:** Minimal REST API for product categorization with JWT authentication  
**Runtime:** Node.js 20+ (ESM modules)  
**Architecture Style:** Monolithic, single-process, native HTTP server (no framework)  
**Auth Pattern:** Stateless JWT (HS256)  
**Deployment:** Docker container, docker-compose for local dev

---

## 2. Architecture Diagram

```mermaid
flowchart TD
    subgraph Client["Client Layer"]
        C1[HTTP Client<br/>curl/Postman/Test]
    end

    subgraph Server["API Server (Node.js Process)"]
        direction TB
        S1[createServer<br/>handler()]
        S2[/login Route<br/>loginRoute()]
        S3[/products Route<br/>createProductRoute()]
        S4[validateHeaders()]
        S5[(Config<br/>config.js)]
        S6[(Errors<br/>errors.js)]
        S7[jsonwebtoken<br/>sign/verify]
        S8[utils.postRequest<br/>Test Helper]
    end

    subgraph Infra["Infrastructure"]
        D1[Docker<br/>node:20-alpine]
        D2[docker-compose<br/>Port 3000]
    end

    C1 -->|HTTP POST /login| S1
    C1 -->|HTTP POST /products<br/>Authorization: Bearer| S1
    S1 -->|Route Match| S2
    S1 -->|Auth Check| S4
    S4 -->|Valid| S3
    S4 -->|Invalid| S1
    S2 -->|Read Credentials| S5
    S2 -->|Sign JWT| S7
    S3 -->|Read Categories| S3
    S3 -->|Return Category| S1
    S1 -->|400/404/200| C1
    D1 -.->|Build & Run| S1
    D2 -.->|Orchestrate| D1
```

---

## 3. Component Analysis

| File | Role | Responsibilities | Coupling |
|------|------|------------------|----------|
| `app/api.js` | **Entry Point / Router / Controller** | HTTP server creation, request routing, auth middleware, response handling | High (central) |
| `app/config/config.js` | **Configuration** | Valid credentials, JWT secret, base URL | Low (imported by api.js, tests) |
| `app/config/errors.js` | **Error Constants** | Standardized error response for invalid login | Low |
| `app/util/utils.js` | **Test Utility** | `postRequest()` wrapper for `fetch` with auth header | Low (tests only) |
| `app/api.test.js` | **Test Suite** | Integration tests for login + product categorization | High (imports app, config, utils) |

---

## 4. API Design

### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/login` | ❌ Public | Validate credentials, return JWT |
| `POST` | `/products` | ✅ Bearer Token | Categorize product by price |

### Request/Response Schemas

#### `POST /login`
```json
// Request
{ "user": "string", "password": "string" }

// Success Response (200)
{ "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." }

// Error Response (400)
{ "error": "user invalida" }
```

#### `POST /products`
```json
// Request (requires Authorization: Bearer <token>)
{ "description": "string", "price": "number" }

// Success Response (200)
{ "category": "premium|regular|basic" }

// Error Responses
400: "invalid token!"
404: "not found!"
```

### Product Categorization Logic

| Category | Price Range (inclusive) |
|----------|------------------------|
| `premium` | 101 – 500 |
| `regular` | 51 – 100 |
| `basic` | 0 – 50 |

> **Note:** Prices outside 0–500 return `undefined` category (bug).

---

## 5. Security Architecture

### JWT Implementation
- **Algorithm:** HS256 (symmetric)
- **Secret:** Hardcoded `"dsffaiu40238"` in `config.js` 🔴 **CRITICAL**
- **Payload:** `{ user, message: "heyduude" }`
- **Expiration:** **None** (tokens never expire) 🔴 **CRITICAL**
- **Token Extraction:** `headers.authorization.replace(/bearer\s/ig, '')` (case-insensitive)

### Authentication Flow
```
Client POST /login (user, pass)
    │
    ▼
Server validates against hardcoded VALID
    │
    ├─ Invalid → 400 { error: "user invalida" }
    │
    └─ Valid → jwt.sign(payload, TOKEN_KEY) → 200 { token }
                        │
                        ▼
Client stores token
                        │
                        ▼
Client POST /products + Authorization: Bearer <token>
                        │
                        ▼
Server validateHeaders() → jwt.verify(token, TOKEN_KEY)
                        │
                        ├─ Invalid/Expired → 400 "invalid token!"
                        │
                        └─ Valid → Route to createProductRoute()
```

### Vulnerabilities Summary
| Severity | Issue | Location |
|----------|-------|----------|
| 🔴 Critical | Hardcoded JWT secret | `config.js:6` |
| 🔴 Critical | Hardcoded plaintext credentials | `config.js:2-4` |
| 🔴 Critical | No token expiration | `api.js:17` |
| 🔴 Critical | No input validation (JSON parse crashes) | `api.js:11,24` |
| 🟠 High | No rate limiting | N/A |
| 🟠 High | Error leaks stack trace | `api.js:56` |
| 🟡 Medium | Insecure default credentials | `config.js` |
| 🟡 Medium | No HTTPS enforcement | N/A |

---

## 6. Data Flow

### Request Lifecycle (`/products`)

```
1. HTTP Request arrives at createServer()
       │
       ▼
2. handler(req, res) invoked
       │
       ▼
3. Route match: req.url === '/products' && POST
       │
       ▼
4. validateHeaders(req.headers)
       │  ├─ Extract Authorization header
       │  ├─ Strip "Bearer " prefix (regex)
       │  ├─ jwt.verify(token, TOKEN_KEY)
       │  └─ Return true/false
       │
       ▼ (if false)
5. 400 "invalid token!" → END
       │
       ▼ (if true)
6. createProductRoute(req, res)
       │  ├─ Read body: once(request, "data")
       │  ├─ JSON.parse(body) → { description, price }
       │  ├─ Find matching category (Object.keys + find)
       │  └─ res.end(JSON.stringify({ category }))
       │
       ▼
7. Response sent to client
```

### Request Lifecycle (`/login`)

```
1. HTTP POST /login
       │
       ▼
2. loginRoute(req, res)
       │  ├─ Read body → JSON.parse → { user, password }
       │  ├─ Compare with VALID (config.js)
       │  ├─ If mismatch → 400 + INVALID_USER_ERROR
       │  └─ If match → jwt.sign({ user, message }, TOKEN_KEY)
       │
       ▼
3. 200 { token } → Client
```

---

## 7. Deployment Architecture

### Dockerfile (Multi-stage implied)

```dockerfile
FROM node:20-alpine           # Base image
WORKDIR /home/node/app        # Working directory
COPY . ./                     # Copy source
RUN npm install               # Install deps (prod only)
USER node                     # Non-root user
CMD ["npm", "run", "docker:startup"]
EXPOSE 3000
```

### docker-compose.yaml

```yaml
version: '3'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - .:/home/node/app      # Hot reload via --watch
```

### Network & Runtime
- **Port:** 3000 (container & host)
- **Process:** `npm run docker:startup` → `npm test` → `npm run dev`
- **Watch Mode:** `node --watch .` restarts on file changes
- **User:** `node` (non-root)

---

## 8. Architecture Decision Records (ADRs)

### ADR-001: Use Native Node.js HTTP Module
**Status:** Accepted  
**Context:** Need minimal, zero-dependency API for learning/testing  
**Decision:** Use `node:http` + `node:events` instead of Express/Fastify  
**Consequences:**  
- ✅ Zero dependencies, minimal bundle  
- ✅ Full control, educational value  
- ❌ No middleware, routing, validation, error handling built-in  
- ❌ Manual boilerplate for every feature  

### ADR-002: Hardcoded Configuration
**Status:** Accepted (for prototype)  
**Context:** Rapid prototyping, single developer  
**Decision:** Store credentials, secrets, URLs in `config.js`  
**Consequences:**  
- ✅ Simple, no env setup needed  
- 🔴 **Critical:** Cannot deploy to production, secrets in git  

### ADR-003: Stateless JWT Without Expiration
**Status:** Accepted (for prototype)  
**Context:** Simplify auth for testing  
**Decision:** No `exp` claim, no refresh tokens  
**Consequences:**  
- ✅ Tokens work forever in tests  
- 🔴 **Critical:** Stolen tokens valid indefinitely  

### ADR-004: Native Test Runner (`node:test`)
**Status:** Accepted  
**Context:** Node.js 20+ has stable test runner  
**Decision:** Use built-in `node --test` instead of Jest/Vitest  
**Consequences:**  
- ✅ Zero config, fast, no deps  
- ❌ Limited assertion library, no snapshot testing  

---

## 9. Quality Attributes Assessment

| Attribute | Score | Notes |
|-----------|-------|-------|
| **Functionality** | ⭐⭐⭐ | Core features work; edge cases unhandled |
| **Reliability** | ⭐ | No error boundaries, crashes on malformed JSON |
| **Security** | ⭐ | Critical vulnerabilities (see Security Audit) |
| **Maintainability** | ⭐⭐ | Single file router, no separation of concerns |
| **Testability** | ⭐⭐⭐ | Exported `app` enables integration tests |
| **Scalability** | ⭐ | Single process, no clustering, blocking JSON.parse |
| **Deployability** | ⭐⭐ | Docker works; no health checks, graceful shutdown |
| **Observability** | ⭐ | Only `console.log` + `console.error` |

---

## 10. Recommendations for Production Readiness

### Phase 0 – Emergency (Before Any Deploy)
- [ ] Move secrets to environment variables
- [ ] Add JWT expiration (`exp` claim, 15-60 min)
- [ ] Add input validation (Zod/Joi/schema)
- [ ] Remove hardcoded credentials

### Phase 1 – Hardening
- [ ] Add rate limiting (express-rate-limit or custom)
- [ ] Implement structured logging (Pino/Winston)
- [ ] Add request validation middleware
- [ ] Error handling wrapper (no stack traces to client)

### Phase 2 – Architecture
- [ ] Extract routes to separate modules
- [ ] Add middleware pipeline (auth, logging, error)
- [ ] Introduce TypeScript for type safety
- [ ] Add health check endpoint (`/health`)

### Phase 3 – Production
- [ ] Add clustering (PM2/cluster module)
- [ ] Implement graceful shutdown
- [ ] Add metrics (Prometheus) & tracing
- [ ] CI/CD pipeline with security scans
- [ ] Load testing & capacity planning