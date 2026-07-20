# Idempotency Gateway Diagram Design

## Goal

Add clear use-case and sequence diagrams that explain the gateway's externally visible behavior and its main request flows. Each diagram will be available as editable Mermaid source and as a rendered PNG for readers whose Markdown viewer does not render Mermaid.

## Deliverables

- `docs/use-case-diagram.md` documents the system boundary and actors.
- `docs/sequence-diagrams.md` documents five distinct request scenarios.
- `diagrams/` contains matching PNG exports.
- `README.md` links to the new diagram documentation.
- The existing algorithm documentation and `diagrams/algorithm.png` remain unchanged.

## Use-Case Diagram

The primary actor is an API client. Inside the Idempotency Gateway boundary, the diagram shows these use cases:

- submit a payment;
- retry a payment safely;
- replay a completed response;
- wait for an identical in-flight request;
- reject reuse of a key with a different payload; and
- check service health.

An operations or maintenance actor is connected to expired-record cleanup. The diagram labels cleanup as optional and not currently scheduled so it does not imply functionality beyond the repository capability.

## Sequence Diagrams

Five separate diagrams keep each behavioral path readable:

1. **First request:** validate and hash the payment, claim a `PROCESSING` record, register the in-flight operation, process the payment once, store the completed response, and return `201` with `Idempotency-Replayed: false`.
2. **Completed replay:** find a matching `COMPLETED` record and immediately return the stored status, headers, and body with `Idempotency-Replayed: true`.
3. **Concurrent identical requests:** the first request owns processing; the second finds the matching `PROCESSING` record and waits on the in-memory operation; both receive the same result while the payment processor runs once.
4. **Payload conflict:** a request reuses an existing key with a different canonical payment hash and receives `409` without invoking the payment processor.
5. **Failure and retry:** processing fails, the conditional `PROCESSING` claim is released, current callers receive `500`, and a later request can claim the key and retry.

The participants and messages will match the implemented architecture: API client, Express API, payment service, idempotency repository, in-flight operation map, and payment simulator.

## Source and Rendering

The Markdown files contain fenced Mermaid source as the canonical editable representation. PNG files are generated from the same Mermaid definitions and embedded or linked beside the relevant documentation. Diagram labels favor domain language over implementation details while retaining the status codes, replay headers, state names, and ownership behavior needed to understand correctness.

## Verification

- Render every Mermaid definition without syntax errors.
- Visually inspect every PNG for clipping, unreadable labels, and misleading connections.
- Check that Markdown image and document links resolve.
- Confirm each flow against the current service and repository implementation.
- Run the existing test, type-check, and build commands to ensure documentation work does not disturb the project.

## Out of Scope

- Changing gateway behavior or production code.
- Adding a scheduled cleanup job.
- Replacing the existing algorithm or state-machine documentation.
- Producing an exhaustive UML model of internal classes.
