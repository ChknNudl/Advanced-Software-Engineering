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
