# Idempotency Gateway Use Cases

This diagram describes the gateway's externally visible payment, retry, health, and optional maintenance behavior. It distinguishes client actions from the outcomes selected by the gateway for an idempotent retry; it does not imply a scheduled cleanup process.

[![Rendered Idempotency Gateway use-case diagram](../diagrams/use-case.png)](../diagrams/use-case.png)

The Mermaid source below is the editable version of the diagram.

```mermaid
flowchart LR
    Client[API Client]
    Operations[Operations / Maintenance]

    subgraph Gateway[Idempotency Gateway]
        direction TB
        Submit([Submit payment<br/>POST /process-payment])
        Retry([Retry payment safely])
        Replay([Replay completed response<br/>X-Cache-Hit: true])
        Wait([Wait for identical in-flight request<br/>X-Cache-Hit: true])
        Conflict([Reject same-key / different-payment reuse<br/>409 - X-Cache-Hit: false])
        Health([Check health<br/>GET /health])
        Cleanup([Delete expired completed records<br/>Optional; no scheduler is wired])
    end

    Client --> Submit
    Client --> Retry
    Client --> Health
    Operations --> Cleanup

    Retry -. completed request .-> Replay
    Retry -. identical request still in flight .-> Wait
    Retry -. same key, different payment .-> Conflict
```
