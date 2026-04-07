# Google Apps Script Monorepo

Code-managed Google Apps Script projects using `pnpm` workspaces, `clasp`, and TypeScript.

## Requirements

- Node.js 22+
- pnpm 10+
- Google Apps Script API enabled for your Google account

This repository includes a Nix dev shell:

```bash
nix develop
```

## Setup

```bash
pnpm install
pnpm login
```

`pnpm login` runs `clasp login`. If browser login is unavailable, run:

```bash
pnpm clasp login --no-localhost
```

## Workspace Layout

```text
apps/
  example/
    appsscript.json
    package.json
    src/
      Code.ts
```

Each Apps Script project is a package under `apps/*`.

Imported apps:

- `@gas/dakoku-kanri` in `apps/dakoku-kanri` - existing `打刻管理` Apps Script web app
- `@gas/oura-ring` in `apps/oura-ring` - existing Oura sleep-to-calendar sync script

## Import an Existing Web-Edited Script

1. Create an app directory by copying the example:

```bash
cp -R apps/example apps/my-script
```

2. Update `apps/my-script/package.json`:

```json
{
  "name": "@gas/my-script"
}
```

3. Create the local clasp config:

```bash
cp apps/my-script/.clasp.example.json apps/my-script/.clasp.json
```

4. Set the existing Apps Script `scriptId` in `apps/my-script/.clasp.json`.

5. Pull the current web editor source into the workspace:

```bash
pnpm --filter @gas/my-script pull
```

6. Commit the pulled source after reviewing it.

## Daily Workflow

Typecheck all apps:

```bash
pnpm typecheck
```

Pull one app from Apps Script:

```bash
pnpm --filter @gas/my-script pull
```

Push one app to Apps Script:

```bash
pnpm --filter @gas/my-script push
```

For TypeScript apps, build before pushing and point clasp at generated JavaScript. `@gas/dakoku-kanri` follows this pattern: source lives in `コード.ts`, generated Apps Script files live in ignored `build/`, and `push`/`deploy`/`redeploy` run `build` first.

`@gas/dakoku-kanri` reads `CALENDAR_ID` from Apps Script Script Properties. Do not hardcode calendar IDs in source.

`@gas/dakoku-kanri` also creates a private Spreadsheet named `打刻管理 sync` on first sync and stores its ID in Script Properties as `SPREADSHEET_ID`. Every six hours it regenerates the current month into:

- `work_logs`: one row per `勤務` calendar event, with month/date/start/end/duration/title/event_id
- `summary`: current-month event count and total minutes/hours for later invoice generation

`@gas/oura-ring` reads `OURA_TOKEN` and `CALENDAR_ID` from Apps Script Script Properties. Do not hardcode Oura tokens or calendar IDs in source.

Create a version:

```bash
pnpm --filter @gas/my-script version "release description"
```

Create or update a deployment:

```bash
pnpm --filter @gas/my-script deploy --versionNumber 1 --description "release"
```

For an existing deployment, use `redeploy` with its deployment ID:

```bash
pnpm --filter @gas/my-script redeploy <DEPLOYMENT_ID> --versionNumber 1 --description "release"
```

## Notes

- `.clasp.json` is ignored because it is local project binding state.
- `.clasprc.json` is ignored because it is local OAuth state.
- `clasp` 3.x does not transpile TypeScript; do not push raw `.ts` unless you have explicitly verified that target workflow.
- Keep direct web editor edits temporary: pull them immediately, review the diff, then continue from code.
