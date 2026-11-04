# MarkSync

**Advanced Software Engineering — University of Sussex**

MarkSync is a collaborative Markdown document platform designed for individuals and teams to create, organise, share and edit documents.

## Team

- Jakub Kulczak
- Tom Doherty
- Dhanvin Sajith
- Algiz Zhumagazy

## Features

- User registration and authentication
- Markdown document creation, editing and rendering
- Projects and folder organisation
- Document deletion and restoration
- Read-only and editing permissions
- Document and project sharing
- Real-time collaborative editing using Yjs and WebSockets

## Technology Stack

- **Backend:** Node.js, TypeScript and Express
- **Frontend:** HTML, CSS and JavaScript
- **Database:** SQLite
- **Real-time communication:** WebSockets and Yjs
- **Package manager:** pnpm
- **Testing:** Automated TypeScript tests

## Prerequisites

Install the following before running the project:

- Node.js (a version supported by the application)
- pnpm
- Git
- A modern web browser such as Chrome

## Running Locally

### 1. Clone the repository

```bash
git clone https://github.com/ChknNudl/Advanced-Software-Engineering.git
cd Advanced-Software-Engineering
```

### 2. Enter the application directory

```bash
cd app
```

### 3. Install dependencies

```bash
pnpm install --frozen-lockfile
```

On Windows PowerShell, use `pnpm.cmd` if `pnpm` is not recognised.

### 4. Start MarkSync

```bash
pnpm dev
```

For Windows PowerShell:

```powershell
pnpm.cmd dev
```

### 5. Open the application

Visit:

**http://localhost:3000**

The development server must remain running while using the application.

## Project Structure

```text
Advanced-Software-Engineering/
├── .github/          # GitHub configuration
├── docs/adr/         # Group architectural decisions
├── app/
│   ├── src/          # TypeScript backend
│   ├── public/       # Web interface
│   ├── test/         # Automated tests
│   ├── docs/         # Application documentation
│   ├── package.json
│   └── pnpm-lock.yaml
└── README.md
```

## Collaboration and Development

All development should take place through feature branches and Pull Requests. Changes must be reviewed by another team member and pass the required automated quality checks before merging.

## Additional Documentation

For more information, see:

- [Application README](app/README.md)
- [Architecture](app/docs/ARCHITECTURE.md)
- [Collaboration Guide](app/docs/COLLABORATION.md)
- [ADR 001](docs/adr/)
- [Task 1 Checklist](app/docs/TASK1-CHECKLIST.md)

## Deployment

Task 1 is designed to run locally. Public cloud deployment is not required at this stage.

Remote collaboration between computers requires a reachable server deployment.

## Task 2: collaboration and chaos tests

Requires **Node.js 24** and **pnpm 11.25.0**. From the repository root:

```sh
cd app
pnpm install --frozen-lockfile
pnpm test:chaos
```

On Windows PowerShell, use `pnpm.cmd` for these commands. The chaos suite starts its own temporary local server and SQLite database; do not start the site first. It uses three editing clients and one read-only observer over real WebSockets, with simulated message delay, loss, duplication and reordering. It checks convergence against all generated edits, persistence and acknowledgement queues, and includes a negative control that must detect loss when recovery is disabled. The default runs 100 generated scenarios, plus focused regression and replay tests.

To reproduce a failure in PowerShell, use the seed and path printed by fast-check:

```powershell
$env:CHAOS_SEED = '20261104'
$env:CHAOS_RUNS = '100'
# Set CHAOS_PATH only when replaying the exact path reported by a failure:
# $env:CHAOS_PATH = 'paste-the-reported-path'
pnpm.cmd test:chaos
Remove-Item Env:CHAOS_SEED, Env:CHAOS_RUNS, Env:CHAOS_PATH -ErrorAction SilentlyContinue
```

On macOS/Linux: `CHAOS_SEED=20261104 CHAOS_RUNS=100 pnpm test:chaos`. Add `CHAOS_PATH='reported-path'` to replay a shrunk counterexample. Raise CHAOS_RUNS up to 2000 for additional exploration. Seeds reproduce a bounded experiment; passing tests are not a proof for every possible execution.

`pnpm check` runs all local quality gates. GitHub Actions runs the chaos suite inside `checks` with seeds 20261104 and 11042026 (100 scenarios each). **The repository owner must require `checks` in the main-branch ruleset**; workflow execution alone does not enforce a merge gate.

See [Task 2 design and demonstration](app/docs/TASK2.md), [AI debugging log](app/docs/TASK2-AI-LOG.md), and the [two-page submission report](app/output/pdf/marksync-task2-report.pdf). After peer review and successful CI, merge the PR, tag the final main commit, and email the tag, report and merged PR URL. Do not move the existing Task 1 tag.
