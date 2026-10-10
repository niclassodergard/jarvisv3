# Jarvis

Personal assistant bot. v1 = single-user web chat with Claude Sonnet 5.5 (`claude-sonnet-5-5`, effort `medium`).

## Layout
- `server/` Node 24 + Hono + `@anthropic-ai/sdk` + `node:sqlite`. Run as TS via Node type stripping (no bundler), built with `tsc` for prod. Use erasable TS syntax only (no parameter properties/enums); relative imports end in `.ts`.
- `web/` React + Vite. Built to `web/dist`, served by the server (one process, one port).
- `deploy/` bootstrap, systemd unit, deploy script.

## Conventions
- Messages are stored as full Anthropic content-block arrays and replayed unchanged (needed for tool/thinking continuity).
- Sonnet 5.5 rejects `thinking: {type: "disabled"}`; use `{type: "between_tools"}` to turn thinking off.
- Never commit `key.txt` or `.env*` (gitignored). Secrets on the server live in `~/.config/jarvis/jarvis.env` (mode 600).

## Add a tool (integration)
Create `server/src/tools/<name>.ts` exporting a `Tool` (`name`, `description`, JSON-schema `inputSchema`, `run`), then list it in `server/src/tools/index.ts`.

## Dev
`.env` (copy `.env.example`; use PORT=8081 locally). Terminal 1: `npm run dev:server`; terminal 2: `npm run dev:web` (proxies /api to 8081).
`npm run typecheck`, `npm test`.

## Deploy (server `ubuntu`, http://100.115.122.103:8080, Tailscale only)
- One time: `deploy/bootstrap-server.sh`, `deploy/set-key.sh`, then on the server `sudo bash ~/jarvis/app/deploy/install-service.sh` (needs the repo's `deploy/` copied over, see README) and `sudo systemctl start jarvis`.
- Each release: `deploy/deploy.sh`. Logs: `journalctl -u jarvis -f`. DB: `~/jarvis/data/jarvis.db`.
