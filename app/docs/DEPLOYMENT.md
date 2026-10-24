# Publish MarkSync and keep improving it

Status: prepared locally, not deployed. On 22 October the user confirmed the group will use a groupmate's repository later. Do not publish to the old personal origin by mistake.

## Hosting choice

This is a Node 24 application with SQLite and WebSockets. GitHub stores and reviews its code; GitHub Pages cannot run this backend. The optional docs/render.example.yaml describes one Render web service with a persistent disk. It uses a paid plan: creating it requires the group's hosting and budget decision. No paid service has been created.

Render free services cannot attach persistent disks. Do not store the coursework database on an ephemeral filesystem: redeployments could erase accounts and documents. A free hosting requirement needs another durable host or a database architecture change first.

## Deployment after repository setup

1. Finish GITHUB-SETUP.md. Merge approved changes to main with green CI.
2. Connect the group's repository to Render. Copy docs/render.example.yaml to render.yaml at the repository root. Review the Blueprint and charges before creating resources.
3. Set APP_ORIGIN to the exact public HTTPS origin shown for the service, without a trailing slash. This controls cookies, mutation-origin checks and WebSocket upgrades. Keep DATABASE_PATH on the mounted disk.
4. Deploy main. Create a disposable test account and document. Verify save, rendering, online roster and heartbeat.
5. Restart/redeploy and verify the account and document survive. Use a second browser profile with another account to verify join/leave presence.
6. Record the real URL, commit and date in TASK1-AUDIT.md. Before wider invitations, review registration: documents are private until shared; anyone with an invitation may sign in and accept it.

## Future changes

Edit in VS Code, create a feature branch, run pnpm check, push a PR, address AI and peer feedback, and merge after approval. The Blueprint requests deployment only after branch checks pass; verify this setting in the hosting dashboard. Data stays on the disk. Future schema changes require explicit migrations and backups. Use one service instance with this SQLite design.

Before significant changes, make a consistent SQLite backup using its backup API or stop the service before copying database files. Test restore separately. Reverting code does not revert data. Disk-attached deployment may involve downtime; the client reconnects, but users should save/download drafts first.

## Official sources

- [Blueprint specification](https://render.com/docs/blueprint-spec)
- [Persistent disks](https://render.com/docs/disks)
- [Free service limitations](https://render.com/docs/free)

Cloud hosting is extra work, not a Task 1 requirement.
