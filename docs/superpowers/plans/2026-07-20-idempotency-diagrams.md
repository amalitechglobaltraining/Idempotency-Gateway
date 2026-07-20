# Idempotency Gateway Diagrams Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add editable Mermaid use-case and sequence diagrams with matching PNG exports and discoverable README links.

**Architecture:** Markdown files are the human-readable and editable source of truth. Mermaid CLI renders each fenced definition into a PNG in `diagrams/`; the diagrams model only behavior confirmed by the current Express, service, repository, and simulator code.

**Tech Stack:** Markdown, Mermaid flowcharts and sequence diagrams, Mermaid CLI, npm project verification scripts

---

## File Structure

- Create `docs/use-case-diagram.md`: explains actors, scope, and the editable Mermaid use-case diagram.
- Create `docs/sequence-diagrams.md`: explains and contains five editable Mermaid sequence diagrams.
- Create `diagrams/use-case.png`: rendered use-case diagram.
- Create `diagrams/sequence-first-request.png`: rendered first-request flow.
- Create `diagrams/sequence-completed-replay.png`: rendered cached replay flow.
- Create `diagrams/sequence-concurrent-requests.png`: rendered concurrent duplicate flow.
- Create `diagrams/sequence-payload-conflict.png`: rendered conflicting-payload flow.
- Create `diagrams/sequence-failure-retry.png`: rendered failure and later retry flow.
- Modify `README.md`: add links to both diagram documents and list the new artifacts in the project structure.

### Task 1: Create the use-case documentation

**Files:**
- Create: `docs/use-case-diagram.md`

- [ ] **Step 1: Add the use-case explanation and Mermaid source**

Create a document with a short scope note, a PNG fallback, and a Mermaid `flowchart LR`. Use an `API Client` actor connected to payment submission, safe retry, and health check. Put payment submission, completed replay, in-flight waiting, conflict rejection, and health inside an `Idempotency Gateway` subgraph. Connect an `Operations / Maintenance` actor to `Delete expired completed records`, labeled `Optional; no scheduler is wired`. Use dashed arrows from safe retry to replay, wait, and conflict to show possible outcomes rather than separate client operations.

- [ ] **Step 2: Check the source against the implemented behavior**

Run:

```powershell
rg -n "process-payment|health|deleteExpired|X-Cache-Hit" README.md src docs/use-case-diagram.md
```

Expected: the route names, optional cleanup capability, and replay terminology agree with the current code and README.

- [ ] **Step 3: Commit the use-case source**

```powershell
git add docs/use-case-diagram.md
git commit -m "docs: add gateway use-case diagram"
```

### Task 2: Create the sequence-diagram documentation

**Files:**
- Create: `docs/sequence-diagrams.md`

- [ ] **Step 1: Add the first-request sequence**

Use participants `Client`, `API` (Express API), `Service` (PaymentService), `Repo` (IdempotencyRepository), `InFlight` (In-flight Map), and `Processor` (Payment Simulator). Show validation, canonical fingerprinting, missing lookup, successful `PROCESSING` claim, publishing the owned Promise before processing, one processor call, completing the record, clearing the in-flight entry, and `201 / X-Cache-Hit: false`.

- [ ] **Step 2: Add the completed-replay sequence**

Show validation and fingerprinting, lookup of a matching `COMPLETED` record, cloned stored response, no processor call, and `201 / X-Cache-Hit: true`. Add a Mermaid note stating that the original status and response body are replayed.

- [ ] **Step 3: Add the concurrent-identical-request sequence**

Show Client A claiming and publishing the owned Promise before processor work. Show Client B finding the matching `PROCESSING` record, reading and awaiting the Promise, and receiving the cloned result with `X-Cache-Hit: true`. Show the processor invoked exactly once and Client A receiving `X-Cache-Hit: false`.

- [ ] **Step 4: Add the payload-conflict sequence**

Show an existing record in either state, a different canonical request hash, immediate `409 / X-Cache-Hit: false`, and a note that the processor and in-flight map are not used.

- [ ] **Step 5: Add the failure-and-retry sequence**

Show the owner and an identical waiter sharing the operation. Show the processor throwing, `releaseProcessing(key, hash)` deleting only the matching claim, the in-flight entry being cleared, and both current HTTP requests receiving the generic `500` response. Then show a later request finding no record and successfully claiming the key for a new attempt.

- [ ] **Step 6: Check participant names, states, and headers**

Run:

```powershell
rg -n "PROCESSING|COMPLETED|X-Cache-Hit|releaseProcessing|In-flight|Payment Simulator" docs/sequence-diagrams.md src README.md
```

Expected: every diagram term maps to a current implementation concept and no diagram uses `Idempotency-Replayed`.

- [ ] **Step 7: Commit the sequence sources**

```powershell
git add docs/sequence-diagrams.md
git commit -m "docs: add payment sequence diagrams"
```

### Task 3: Render and inspect PNG exports

**Files:**
- Create: `diagrams/use-case.png`
- Create: `diagrams/sequence-first-request.png`
- Create: `diagrams/sequence-completed-replay.png`
- Create: `diagrams/sequence-concurrent-requests.png`
- Create: `diagrams/sequence-payload-conflict.png`
- Create: `diagrams/sequence-failure-retry.png`

- [ ] **Step 1: Copy each Mermaid fence into a temporary `.mmd` file**

Create `C:\Users\user\AppData\Local\Temp\idempotency-gateway-diagrams` and copy the six Mermaid definitions verbatim into `.mmd` files there, preserving the Markdown files as the canonical editable sources. Name the temporary inputs after their output PNGs.

- [ ] **Step 2: Render every diagram**

For each temporary input, run Mermaid CLI with a white background and a scale suitable for readable documentation. For example, render the use-case input with:

```powershell
npx --yes @mermaid-js/mermaid-cli -i C:\Users\user\AppData\Local\Temp\idempotency-gateway-diagrams\use-case.mmd -o diagrams/use-case.png -b white -s 2
```

Expected: each command exits `0` and creates the corresponding PNG under `diagrams/`.

- [ ] **Step 3: Verify all PNG files exist and are non-empty**

```powershell
Get-Item diagrams/use-case.png, diagrams/sequence-first-request.png, diagrams/sequence-completed-replay.png, diagrams/sequence-concurrent-requests.png, diagrams/sequence-payload-conflict.png, diagrams/sequence-failure-retry.png | Select-Object Name, Length
```

Expected: six files with non-zero lengths.

- [ ] **Step 4: Visually inspect each PNG**

Open all six files with the image viewer. Confirm labels are readable, no content is clipped, arrows connect the intended participants, the system boundary is clear, and the optional cleanup path is not presented as scheduled behavior. If a diagram fails inspection, adjust its Mermaid source, rerender it, and inspect it again.

- [ ] **Step 5: Commit the rendered diagrams**

```powershell
git add diagrams/*.png
git commit -m "docs: render gateway behavior diagrams"
```

### Task 4: Link diagrams and verify the complete documentation set

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add diagram links to the architecture documentation**

Extend the existing documentation sentence to link `docs/use-case-diagram.md` as `use-case diagram` and `docs/sequence-diagrams.md` as `sequence diagrams`. Keep the existing algorithm, state-machine, requirements, and data-structure links.

- [ ] **Step 2: Update the project structure**

Change the diagram portion of the tree to describe `diagrams/` as containing rendered algorithm, use-case, and sequence diagrams. Describe `docs/` as requirements, design notes, and editable Mermaid sources.

- [ ] **Step 3: Check Markdown paths and terminology**

```powershell
rg -n "use-case-diagram|sequence-diagrams|diagrams/.*\.png|Idempotency-Replayed" README.md docs
git diff --check
```

Expected: README links both new documents, the docs link all six PNGs with valid relative paths, `Idempotency-Replayed` has no matches, and `git diff --check` reports no errors.

- [ ] **Step 4: Run the project verification suite**

```powershell
npm test
npm run typecheck
npm run build
```

Expected: all tests pass, type-check exits `0`, and build exits `0`.

- [ ] **Step 5: Review the final change set**

```powershell
git status --short
git diff --stat HEAD
git log --oneline -5
```

Expected: only the planned README change remains uncommitted; recent commits contain the diagram source and PNG work.

- [ ] **Step 6: Commit README integration and the corrected design terminology**

```powershell
git add README.md docs/superpowers/specs/2026-07-20-idempotency-diagrams-design.md
git commit -m "docs: link gateway behavior diagrams"
```

- [ ] **Step 7: Confirm the branch is clean**

```powershell
git status --short --branch
```

Expected: no uncommitted files and the feature branch is ahead of its remote until publishing.
