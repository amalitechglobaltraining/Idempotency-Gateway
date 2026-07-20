# Payment Request Sequence Diagrams

These diagrams show how the Express API, payment service, repository, in-flight operation map, and payment simulator collaborate for the gateway's five principal request paths. The Mermaid blocks are the editable sources; each section also links to its rendered PNG fallback.

## First Request

[![First payment request sequence](../diagrams/sequence-first-request.png)](../diagrams/sequence-first-request.png)

```mermaid
sequenceDiagram
    participant Client
    participant API as Express API
    participant Service as PaymentService
    participant Repo as IdempotencyRepository
    participant InFlight as In-flight Map
    participant Processor as Payment Simulator

    Client->>API: POST /process-payment with key and payment
    API->>API: Validate key and payment
    API->>Service: process(key, payment)
    Service->>Service: Fingerprint canonical payment
    Service->>Repo: find(key)
    Repo-->>Service: No record
    Service->>Repo: claim(key, hash)
    Repo-->>Service: PROCESSING claim created
    Service->>InFlight: Publish owned Promise
    Note over Service,Processor: Promise is published before processor work starts
    Service->>Processor: simulatePayment(payment) (once)
    Processor-->>Service: Successful payment response
    Service->>Repo: complete(key, 201, response)
    Repo-->>Service: COMPLETED response stored
    Service->>InFlight: Clear key
    Service-->>API: 201 response, cacheHit false
    API-->>Client: 201 / X-Cache-Hit: false
```

## Completed Response Replay

[![Completed payment replay sequence](../diagrams/sequence-completed-replay.png)](../diagrams/sequence-completed-replay.png)

```mermaid
sequenceDiagram
    participant Client
    participant API as Express API
    participant Service as PaymentService
    participant Repo as IdempotencyRepository
    participant Processor as Payment Simulator

    Client->>API: POST /process-payment with repeated key and payment
    API->>API: Validate key and payment
    API->>Service: process(key, payment)
    Service->>Service: Fingerprint canonical payment
    Service->>Repo: find(key)
    Repo-->>Service: Matching COMPLETED record
    Service->>Service: Clone stored response
    Note over Service,Repo: Replay the original stored status and response body
    Note over Service,Processor: Processor is not called
    Service-->>API: Stored 201 response, cacheHit true
    API-->>Client: 201 / X-Cache-Hit: true
```

## Concurrent Identical Requests

[![Concurrent identical payment requests sequence](../diagrams/sequence-concurrent-requests.png)](../diagrams/sequence-concurrent-requests.png)

```mermaid
sequenceDiagram
    participant ClientA as Client A
    participant ClientB as Client B
    participant API as Express API
    participant Service as PaymentService
    participant Repo as IdempotencyRepository
    participant InFlight as In-flight Map
    participant Processor as Payment Simulator

    ClientA->>API: POST key K, payment P
    API->>API: Validate key and payment
    API->>Service: process(K, P)
    Service->>Service: Fingerprint canonical payment
    Service->>Repo: find(K)
    Repo-->>Service: No record
    Service->>Repo: claim(K, hash(P))
    Repo-->>Service: PROCESSING claim created
    Service->>InFlight: Publish owned Promise
    Note over Service,Processor: Promise is published before processor work starts
    Service->>Processor: simulatePayment(P) (once)

    ClientB->>API: POST key K, identical payment P
    API->>API: Validate key and payment
    API->>Service: process(K, P)
    Service->>Service: Fingerprint canonical payment
    Service->>Repo: find(K)
    Repo-->>Service: Matching PROCESSING record
    Service->>InFlight: get(K)
    InFlight-->>Service: Same owned Promise
    Service->>Service: Await shared operation

    Processor-->>Service: Successful payment response
    Service->>Repo: complete(K, 201, response)
    Repo-->>Service: COMPLETED response stored
    Note over Service,InFlight: Stored owned Promise resolves with the operation result
    Service->>InFlight: Clear K
    Service-->>API: Owner result, cacheHit false
    API-->>ClientA: 201 / X-Cache-Hit: false
    Service->>Service: Clone shared result for waiter
    Service-->>API: Waiter result, cacheHit true
    API-->>ClientB: 201 / X-Cache-Hit: true
```

## Same Key with a Different Payment

[![Conflicting payment payload sequence](../diagrams/sequence-payload-conflict.png)](../diagrams/sequence-payload-conflict.png)

```mermaid
sequenceDiagram
    participant Client
    participant API as Express API
    participant Service as PaymentService
    participant Repo as IdempotencyRepository
    participant InFlight as In-flight Map
    participant Processor as Payment Simulator

    Client->>API: POST existing key with different payment
    API->>API: Validate key and payment
    API->>Service: process(key, different payment)
    Service->>Service: Fingerprint canonical payment
    Service->>Repo: find(key)
    Repo-->>Service: PROCESSING or COMPLETED record with different hash
    Note over Service,Processor: Conflict is immediate; InFlight and Processor are unused
    Service-->>API: 409 conflict, cacheHit false
    API-->>Client: 409 / X-Cache-Hit: false
```

## Processing Failure and Later Retry

[![Payment failure and retry sequence](../diagrams/sequence-failure-retry.png)](../diagrams/sequence-failure-retry.png)

```mermaid
sequenceDiagram
    participant ClientA as Owner Client
    participant ClientB as Identical Waiter
    participant API as Express API
    participant Service as PaymentService
    participant Repo as IdempotencyRepository
    participant InFlight as In-flight Map
    participant Processor as Payment Simulator

    ClientA->>API: POST key K, payment P
    API->>Service: process(K, P)
    Service->>Repo: find(K), then claim(K, hash(P))
    Repo-->>Service: PROCESSING claim created
    Service->>InFlight: Publish owned Promise
    Service->>Processor: simulatePayment(P)

    ClientB->>API: POST key K, identical payment P
    API->>Service: process(K, P)
    Service->>Repo: find(K)
    Repo-->>Service: Matching PROCESSING record
    Service->>InFlight: get(K) and await same Promise

    Processor--xService: Throw processing error
    Service->>Repo: releaseProcessing(K, hash(P))
    Repo-->>Service: Delete matching PROCESSING claim
    Note over Service,InFlight: Stored owned Promise rejects with the processing error
    Service->>InFlight: Clear K
    Service--xAPI: Owner request throws
    Service--xAPI: Waiter request throws
    API-->>ClientA: Generic 500 (no X-Cache-Hit)
    API-->>ClientB: Generic 500 (no X-Cache-Hit)
    Note over API,ClientB: Express error middleware maps both failures to the safe response

    ClientA->>API: Later POST key K, payment P
    API->>Service: process(K, P)
    Service->>Repo: find(K)
    Repo-->>Service: No record
    Service->>Repo: claim(K, hash(P))
    Repo-->>Service: New PROCESSING claim created
    Service->>InFlight: Publish new owned Promise
    Service->>Processor: Run a new payment attempt
```
