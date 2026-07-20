# Idempotency Gateway Use Cases

This diagram describes the gateway's externally visible payment, retry, health, and optional maintenance behavior. The actors remain outside the Idempotency Gateway system boundary; labeled interfaces inside the boundary connect them to the enclosed use cases. The diagram distinguishes client actions from the outcomes selected by the gateway for an idempotent retry; it does not imply a scheduled cleanup process.

[![Rendered Idempotency Gateway use-case diagram](../diagrams/use-case.png)](../diagrams/use-case.png)

The Mermaid source below is the editable version of the diagram.

```mermaid
flowchart TB
    Client[API Client]
    Operations[Operations / Maintenance]
    Client ~~~ Operations

    subgraph Gateway[Idempotency Gateway]
        direction TB
        APIInterface[[Payment and health API]]
        MaintenanceInterface[[Optional maintenance hook]]
        Submit([Submit payment<br/>POST /process-payment])
        Retry([Retry payment safely])
        Replay([Replay completed response<br/>X-Cache-Hit: true])
        Wait([Wait for identical in-flight request<br/>X-Cache-Hit: true])
        Conflict([Reject same-key / different-payment reuse<br/>409 - X-Cache-Hit: false])
        Health([Check health<br/>GET /health])
        Cleanup([Delete expired completed records<br/>Optional; no scheduler is wired])

        APIInterface --> Submit
        APIInterface --> Retry
        APIInterface --> Health
        MaintenanceInterface --> Cleanup
        Retry -. completed request .-> Replay
        Retry -. identical request still in flight .-> Wait
        Retry -. same key, different payment .-> Conflict
    end

    Client -->|uses API| Gateway
    Operations -->|may invoke hook| Gateway

    classDef gatewayUseCase fill:#eef0ff,stroke:#7c5cff,stroke-width:1px
    class Submit,Retry,Replay,Wait,Conflict,Health,Cleanup gatewayUseCase
    classDef gatewayInterface fill:#fff8d6,stroke:#b59b00,stroke-width:1px
    class APIInterface,MaintenanceInterface gatewayInterface
```
