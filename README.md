# Idempotency Gateway – Pay-Once Protocol

![Node.js](https://img.shields.io/badge/Node.js-Express-green)
![API](https://img.shields.io/badge/API-REST-orange)
![License](https://img.shields.io/badge/license-CC0-blue)

A **production-style Node.js/Express implementation** of an **Idempotency Gateway** that guarantees **exactly-once payment processing**.

This service prevents **duplicate financial transactions** caused by network retries, timeouts, or client failures.

When the same request is sent multiple times with the same **Idempotency-Key**, the system ensures the **payment is processed only once** and subsequent requests receive the **same cached response**.

---

# Business Context

FinSafe Transactions Ltd. processes payments for e-commerce platforms.

Network failures sometimes cause client systems to **retry payment requests**, which may lead to **duplicate charges**.

This gateway prevents double charging by implementing an **idempotency layer** that guarantees **safe retries**.

---

# System Architecture

The Idempotency Gateway sits between client applications and the payment processor.

```mermaid
flowchart TD

Client[E-commerce Client]
Gateway[Idempotency Gateway API]
Store[Idempotency Store]
Processor[Payment Processor]

Client -->|POST /process-payment| Gateway

Gateway -->|Check Idempotency-Key| Store

Store -->|Key Exists| Gateway
Store -->|Key Not Found| Gateway

Gateway -->|Return Cached Response| Client

Gateway -->|Process Payment| Processor
Processor -->|Return Result| Gateway

Gateway -->|Store Response| Store
Gateway -->|Return Result| Client
```

---

# Payment Processing Flow

```mermaid
flowchart TD

Request[Client Request]
Check[Check Idempotency-Key]

Process[Process Payment]
Store[Store Response]

ReturnCached[Return Cached Response]
Conflict[Reject Request]

Request --> Check

Check -->|Key Not Found| Process
Process --> Store
Store --> ClientResponse[Return Result]

Check -->|Key Exists + Same Payload| ReturnCached
ReturnCached --> ClientResponse

Check -->|Key Exists + Different Payload| Conflict
Conflict --> ClientResponse
```

---

# Sequence Diagram

This diagram illustrates the **complete lifecycle of a payment request**.

```mermaid
sequenceDiagram

participant Client
participant Gateway
participant Store

Client->>Gateway: POST /process-payment\nIdempotency-Key
Gateway->>Store: Check Key

alt Key Not Found
    Store-->>Gateway: Not Found
    Gateway->>Gateway: Process Payment (2s delay)
    Gateway->>Store: Save Response
    Gateway-->>Client: 201 Created
else Key Exists (Same Payload)
    Store-->>Gateway: Cached Response
    Gateway-->>Client: 200 OK + X-Cache-Hit
else Key Exists (Different Payload)
    Store-->>Gateway: Payload Conflict
    Gateway-->>Client: 409 Conflict
end
```

---

# Handling Simultaneous Requests (Race Condition Protection)

The system safely handles **concurrent identical requests**.

```mermaid
sequenceDiagram

participant ClientA
participant ClientB
participant Gateway
participant Store

ClientA->>Gateway: Request (Key ABC)
Gateway->>Store: Check Key
Store-->>Gateway: Not Found

Gateway->>Gateway: Start Processing

ClientB->>Gateway: Request (Key ABC)
Gateway->>Store: Check Key
Store-->>Gateway: Processing In Progress

Gateway->>Gateway: Wait for result

Gateway->>Store: Save Result
Gateway-->>ClientA: 201 Created
Gateway-->>ClientB: 200 OK (Cached)
```

This prevents **race conditions and duplicate execution**.

---

# Features

### Idempotent Payment Processing

Guarantees **exactly-once execution** for payment requests.

### Duplicate Request Detection

Repeated requests return **cached responses instantly**.

### Payload Integrity Protection

Rejects requests that reuse the same key for **different payloads**.

### In-Flight Request Handling

Simultaneous requests with the same key **wait for the first request to finish**.

### Rate Limiting (Developer’s Choice Feature)

Limits requests to **5 per minute per Idempotency-Key** to prevent abuse.

---

# Setup Instructions

Clone the repository.

```bash
git clone https://github.com/amalitechglobaltraining/Idempotency-Gateway
cd Idempotency-Gateway
```

Install dependencies.

```bash
npm install
```

Start the development server.

```bash
npm run dev
```

Or start normally.

```bash
npm start
```

Server runs at:

```
http://localhost:3000
```

---

# API Documentation

## POST /process-payment

Processes a payment request.

### Headers

```
Idempotency-Key: <unique-string>
Content-Type: application/json
```

### Request Body

```json
{
  "amount": 100,
  "currency": "GHS"
}
```

---

# Success Responses

### First Request

```
201 Created
```

```json
{
  "status": "Charged 100 GHS"
}
```

---

### Duplicate Request

```
200 OK
```

Header:

```
X-Cache-Hit: true
```

Body:

```json
{
  "status": "Charged 100 GHS"
}
```

---

# Error Responses

### Same Key With Different Payload

```
409 Conflict
```

or

```
422 Unprocessable Entity
```

```json
{
  "error": "Idempotency key already used for a different request body."
}
```

---

### Rate Limit Exceeded

```
429 Too Many Requests
```

```json
{
  "error": "Rate limit exceeded: max 5 requests per minute for this Idempotency-Key."
}
```

---

# Developer's Choice Feature – Rate Limiting

### Policy

| Limit      | Window   | Scope               |
| ---------- | -------- | ------------------- |
| 5 requests | 1 minute | per Idempotency-Key |

### Why It Matters

Prevents:

* accidental retry loops
* malicious request floods
* system overload

---

# Project Structure

```
Idempotency-Gateway
│
├── src
│   ├── controllers
│   │       paymentController.js
│   │
│   ├── middleware
│   │       idempotencyMiddleware.js
│   │       rateLimiter.js
│   │
│   ├── routes
│   │       paymentRoutes.js
│   │
│   ├── services
│   │       paymentService.js
│   │
│   └── app.js
│
├── package.json
└── README.md
```

---

# Design Decisions

### In-Memory Idempotency Store

A **JavaScript Map** stores:

* idempotency keys
* request payloads
* responses
* processing state

Advantages:

* O(1) lookup
* simple implementation
* suitable for prototype environments

---

# Scalability Considerations

For production fintech systems, the architecture can be upgraded.

---

## Redis Idempotency Store

Replace in-memory storage with Redis.

Benefits:

* shared state across servers
* high performance
* persistence
* TTL expiration

Example architecture:

```
Client
  │
  ▼
Load Balancer
  │
  ├── Gateway Instance 1
  ├── Gateway Instance 2
  ├── Gateway Instance 3
  │
  ▼
Redis Idempotency Store
```

---

## Distributed Locks

Prevent duplicate execution across servers using:

* Redis Redlock
* ZooKeeper
* Etcd

Workflow:

```
Acquire lock on Idempotency-Key
        │
        ▼
Process payment
        │
        ▼
Release lock
```

---

# Load Testing

The gateway can be stress-tested using **autocannon**.

Example:

```bash
npx autocannon -m POST -H "Idempotency-Key: test123" -H "Content-Type: application/json" -b '{"amount":100,"currency":"GHS"}' http://localhost:3000/process-payment
```

This verifies:

* response caching performance
* concurrency safety
* request throughput

---

# Security Considerations

A real production system should include:

* API authentication
* request signature validation
* TLS encryption
* payload hashing
* centralized logging
* monitoring and alerting

---

# Future Improvements

Potential enhancements include:

* Redis persistence with TTL
* client-level rate limiting
* metrics with Prometheus
* distributed tracing with OpenTelemetry
* integration with real payment gateways

---

# Conclusion

This project demonstrates how **backend engineering principles and distributed system design** can prevent duplicate financial transactions.

By combining:

* idempotency keys
* request caching
* concurrency control
* rate limiting

the gateway provides a **robust foundation for reliable payment processing in fintech systems**.
