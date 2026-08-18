# The legacy Opus EDM Solution editor — observed model, and what it implies

Reference material, not a specification to clone. Recorded from the running tool
(`supedm\Vincent.Giattino`, v20.2.5.27, 18 August 2026) against the solution
**1000 Bloomberg Back Office Party Credit Risk**, `Tenant 1\All Components\Solution`.

## Why this is in the repo

`CLAUDE.md` is explicit: *do not recreate legacy Business Screens as a web clone; design toward the
future state.* This document is not an argument against that. It exists for a different reason.

A **Solution** is not a Business Screen. It is an orchestrated process — a DAG of data-movement and
decision steps with run history, parameters, nesting and resume-from-failure. And
[`PRD-TRACEABILITY.md`](./PRD-TRACEABILITY.md) records that the Experience object model has **no
`workflows` element at all** (FR-18), which makes an "Approval Workspace Experience" unable to carry
its own approval. This tool is the working answer to *what does a workflow mean in Opus EDM* — so it
is the most concrete input available to closing that gap, and to FR-44's requirement that an AI
Conversion be able to read legacy configuration.

Read it as evidence of what the domain already needs, not as a UI to reproduce.

## What was observed

Six tabs: **Process Workflow**, **Solution Links**, **Comments**, **Configurable Parameters**,
**Run Solution**, **History**. Four were captured. The header carries state that is itself
informative: `Locked for editing, Checked out • Concurrent Processing Disabled`, a `Solution Name`,
and `Locking Mode: On Demand`.

Check-out/lock as a first-class, always-visible state is worth noting against FR-37/FR-50's open
concurrency question — the legacy tool resolved it as pessimistic locking, and said so in the chrome
rather than in a dialog.

### History

| Column | Value observed |
|---|---|
| Run Id | 624 |
| Parent Run Id | 624 |
| Result | ✗ |
| Started / Finished | 18 Aug 2026 18:58:13 → 18:58:30 |
| Launched By | `supedm\Vincent.Giattino` |
| Run Duration | 16 secs |
| Return Code | 1 |
| Failed Run Id | 0 |

Two affordances matter more than the grid:

- *"Double click to update the workflow tab with the statuses from this run"* — the DAG view can be
  rewound to any historical run and shows that run's per-node statuses. Time-travel over a structure,
  not a separate log screen.
- **Execute Failed Solution** — resume from the point of failure rather than re-running from the top.

`Parent Run Id` equal to `Run Id` marks a root run, which implies child runs carry the root's id —
consistent with the `TopRunID` parameter below.

### Configurable Parameters

Five, each with **Override** / **Value** / **Null?** / **View Usage**: `FILE_NAME`, `PM_Status`,
`New_Status`, `Current_Status`, `TopRunID`. All un-overridden in the captured state.

Two observations:

- `TopRunID` is how a nested solution knows the root run it belongs to — correlation is a parameter,
  passed down.
- **`View Usage` is where-used analysis, per parameter.** That is FR-34's impact analysis in miniature,
  already present in the legacy tool at the parameter level. Worth knowing that the capability the PRD
  asks for is one users already have in a narrower form and will expect.

### Solution Links

An empty grid — `Status`, `Component Type`, `Process Description`, `Last Run Start`, `Launched By`,
`Last Run End`, `Run Duration`, `Report` — populated from a **Solution - Select Process** picker over a
component tree:

```
Tenant 1
├── All Components            ├── SPG Foundation          ├── EDM Standard Module Technical
├── EDM Standard Module Business  ├── HomePage            ├── 1105699 Quick View Form
├── Modules                   ├── GearBox                ├── EDM Standard Build
├── Adaptors                  ├── Service                ├── UI Permissions
├── Financial Services Dashboard                          └── Changes
├── SPG BECRS
└── Rates and Curves
```

So a Solution's dependencies are *selected* from a tenant-scoped, folder-organised component
namespace, and each link reports its own last-run status inline. This is the dependency graph FR-29
and FR-34 both need, and it already exists here with per-link run state attached.

### Run Solution — the log, and the model it reveals

The Process Workflow tab was not captured, but the log is ordered and labelled well enough to
reconstruct the graph. **The following is a reconstruction from log lines, not a reading of the DAG.**

```
Validating Solution → Using Cached Execution Plan → Validating Configurable Parameters
                    → "Process Valid and Locked. Start Running"

 1. Download …Back Office File            [Data Porter]  SKIPPED — "The process is disabled"
 2. Unzip …Party Credit Risk              [Data Porter]  ✗ FAILED
      ├── (List Files) Source 1                          ✗ folder cannot be found
      ├── (Update File Monitor Unzipped File)            skipped — previous Input's failure
      ├── (Unzip File)                                   skipped — previous Input's failure
      └── (Archive Zip File)                             skipped — previous Input's failure
 3. Load …File Monitor                    [Data Porter]  skipped
 4. Decision: Filename to Process Exists  [Decision]     skipped
 5. 1010 …Party Credit Risk               [Solution]     skipped   ← nested solution
 6. Update …Process Monitor               [Data Porter]  skipped
 7. Return Code 101 (No more Porter files exist)         skipped
 8. Update …Process Monitor               [Data Porter]  skipped   ← second instance of the same step
 9. Update …Credit Risk Load              [Data Porter]  skipped
10. Archive …Failed File                  [Data Porter]  skipped
11. Update …Source Control Process Keys Fail            skipped
12. Archive …Success File                 [Data Porter]  skipped
13. Decision: New Load..                  [Decision]     skipped
14. Result (Return Failure)               [Result]       skipped
15. Launch 1500 Data Load Exception       [Data Porter]  skipped

Solution: Process Failed — Return Code 1
```

**Node types**: `Data Porter` (data movement, with its own ordered *Inputs*), `Solution` (nesting —
1010, and 1500 as an error path), `Decision` (branch), `Return Code` (typed exit), `Result` (terminal).

**Six behaviours worth carrying forward, none of which the Experience model has today:**

1. **Two distinct non-run states.** `disabled` (step 1 — a deliberate configuration) and `skipped`
   (steps 3–15 — a consequence of an upstream failure) are different facts and are logged
   differently. A single "not run" would have hidden which.
2. **Failure cascades at two levels** — within a step's Inputs, then across steps. The reason is
   restated per node ("Input was skipped due to the previous Input's failure") rather than left for the
   reader to infer from position.
3. **Solutions nest.** 1010 is a child solution; 1500 is an error-path solution. The numbering
   (1000 / 1010 / 1500) is a convention for orchestration order and severity, not an id scheme.
4. **Typed exits, not just success/failure.** `Return Code 101 (No more Porter files exist)` is a
   named, expected non-error outcome that a Decision can branch on. Return Code 1 was the failure.
5. **A cached execution plan** is validated then reused, and the log says so.
6. **The log names the next artifact to read**: *"See CADIS DataPort - Unzip … 8-18-2026 6-58-14 PM 625
   Transfer.Log for error details."* Note `625` — the child run id, where the parent is 624.

## The failure in the captured run

Diagnosable from the log, and worth stating because the cause is probably not the obvious one.

```
CADIS.DataPorter.PlugIn.ListFiles failed:
Folder '\\A2mautedmsqap01\d$\DATA\IN\BBO\Credit Risk' cannot be found
```

That path is an **administrative share** (`d$`), not a normal file share. Reaching it requires local
administrator rights on `A2MAUTEDMSQAP01` for the account the CADIS service runs as — which is *not*
`supedm\Vincent.Giattino`, the account that launched the run. So "cannot be found" has three candidate
causes and only one of them is a missing folder:

1. the folder genuinely does not exist on that host;
2. the **service account** lacks admin-share access (an admin share returns not-found rather than
   access-denied to an unprivileged caller, which is exactly how this misreports);
3. the host is unreachable or the name is wrong.

Order of checks: from the CADIS service host, as the service account, `dir \\A2mautedmsqap01\d$\DATA\IN\BBO\`
— if that fails while `\\A2mautedmsqap01\DATA\...` or a proper share works, it is (2), and the durable
fix is a real share rather than `d$`. The `Transfer.Log` the run names (`… 625 Transfer.Log`) will
distinguish these.

Two warnings in the same step are **not** the cause but are worth closing: the ListFiles plug-in
reports `'Write To File Monitor'` and `'Include Absolute Path'` were not supplied, while all five
Configurable Parameters sit un-overridden.

## What this changes in the platform's plan

Cross-referenced into [`PRD-TRACEABILITY.md`](./PRD-TRACEABILITY.md).

| Observed here | PRD requirement | Implication |
|---|---|---|
| The whole Solution model | **FR-18** `workflows` on an Experience — recorded as **absent** | This is the shape that element needs: typed nodes, ordered inputs, nesting, decisions, typed return codes. The gap is no longer abstract |
| Run history with per-node status, rewindable | **FR-33** Monitor stage, **FR-53** component-level performance | A run is a first-class object with a parent, a duration and a per-node status — the same shape FR-53 needs for its component-level breakdown |
| `Execute Failed Solution` | Not in the PRD | Resume-from-failure is absent from FR-33's lifecycle and is something users of the legacy tool already have. Worth raising as a requirement gap rather than discovering it after launch |
| `View Usage` per parameter | **FR-34** impact analysis | Where-used already exists at parameter granularity. FR-34 should be understood as generalising a familiar capability, not introducing a novel one |
| Solution Links over a tenant component tree | **FR-29** dependency visibility | Dependencies are explicitly selected and carry inline last-run status |
| `disabled` vs `skipped` | — | Two states our `lifecycleState` enum has no equivalent for; a step deliberately turned off and a step abandoned by an upstream failure must not read the same |
| `Locked for editing, Checked out` in the chrome | **FR-37 / FR-50** concurrency, listed as open | The legacy answer is pessimistic locking, surfaced persistently. A decision the PRD still lists as open has an incumbent behaviour users will expect |
| `Launched By`, `Parent Run Id`, `TopRunID` | **NFR-10** auditability | Actor and run-correlation are already the norm here. Note our own gap: `actorId` exists but is client-asserted |

## What is not captured

- **Process Workflow** — the DAG editor itself. The most important tab for FR-18, and the section
  above is a reconstruction from log ordering rather than a reading of the real graph. Node shapes,
  how branches are drawn from a Decision, and whether edges carry conditions are all unknown.
- **Comments** — likely relevant to FR-37's Collaborate stage.
- The Data Porter editor, where a step's Inputs and plug-in parameters are actually configured.
