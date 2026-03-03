# git-hooks-manager

**Zero-dependency** git hooks manager for Node.js projects. Install, manage, and share git hooks across your team — no external packages required.

[![npm version](https://img.shields.io/npm/v/git-hooks-manager.svg)](https://npmjs.com/package/git-hooks-manager)
[![license](https://img.shields.io/npm/l/git-hooks-manager.svg)](./LICENSE)
![zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)

A lightweight alternative to Husky. Uses only Node.js built-ins: `fs`, `path`, `os`, `crypto`, `readline`, `child_process`.

---

## Install

```bash
npm install -g git-hooks-manager
# or use without installing:
npx git-hooks-manager --help
```

---

## Quick Start

```bash
# 1. Scaffold .githooks/ directory with example hooks
ghm init

# 2. Add hooks (using built-in templates or custom commands)
ghm add pre-commit --template no-console
ghm add pre-commit --cmd "npm test"
ghm add commit-msg --template commit-msg-format

# 3. Install hooks into .git/hooks/
ghm install

# 4. Commit .githooks/ so teammates can use them
git add .githooks/
git commit -m "chore: add git hooks"

# Teammates just run:
ghm install
```

---

## Commands

| Command | Description |
|---|---|
| `ghm init` | Scaffold `.githooks/` with example hooks |
| `ghm list` | List all hooks and their status |
| `ghm status` | Detailed status (installed / missing / drifted) |
| `ghm check` | CI check — exits 1 if any hook is missing or drifted |
| `ghm install [hook]` | Install all hooks (or a specific hook) |
| `ghm uninstall [hook]` | Remove installed hooks (all or specific) |
| `ghm add <hook>` | Add a command or template to a hook |
| `ghm edit <hook>` | Open hook file in `$EDITOR` |
| `ghm run <hook>` | Manually run an installed hook |
| `ghm sync` | Re-sync all hooks from `.githooks/` |
| `ghm templates` | List available built-in templates |

---

## Built-in Templates

Install templates with `ghm add <hook> --template <name>`:

| Template | Hook | What it does |
|---|---|---|
| `no-console` | `pre-commit` | Reject commits with `console.log` in staged JS/TS files |
| `no-secrets` | `pre-commit` | Scan staged files for common secret patterns |
| `lint` | `pre-commit` | Run ESLint and/or `tsc` on staged files |
| `commit-msg-format` | `commit-msg` | Enforce conventional commits (`feat/fix/chore/docs/...`) |
| `branch-name` | `pre-push` | Enforce branch naming (`feature/`, `fix/`, `chore/`, etc.) |

### Examples

```bash
# Block console.log commits
ghm add pre-commit --template no-console

# Enforce conventional commits
ghm add commit-msg --template commit-msg-format

# Multiple templates stack — they're appended, not replaced
ghm add pre-commit --template no-secrets
ghm add pre-commit --template lint

# Custom command
ghm add pre-push --cmd "npm run build"
```

---

## Options

| Flag | Description |
|---|---|
| `--cmd <command>` | Command to append to a hook (used with `add`) |
| `--template <name>` | Built-in template name (used with `add`) |
| `--git-dir <path>` | Custom `.git` directory path |
| `--hooks-dir <path>` | Custom source hooks directory (default: `.githooks/`) |
| `--version`, `-v` | Print version |
| `--help`, `-h` | Show help |

---

## Team Workflow

```
Developer A                        Developer B
──────────                         ──────────
ghm init                           git pull
ghm add pre-commit --template ...  ghm install
ghm install                        # hooks active instantly
git add .githooks/
git commit -m "chore: add hooks"
git push
```

**CI Integration** — add to your pipeline to verify hooks stay in sync:

```yaml
# GitHub Actions example
- name: Check git hooks
  run: npx git-hooks-manager check --hooks-dir .githooks/
```

---

## How It Works

- Source hooks live in `.githooks/` (committed to your repo)
- `ghm install` copies them to `.git/hooks/` and sets `chmod 755`
- `ghm check` / `ghm status` compare SHA-256 hashes to detect drift
- All hooks are plain `#!/bin/sh` scripts — no Node.js required at runtime

---

## Security

- Zero external dependencies — only Node.js built-ins
- Uses `execFileSync` / `spawnSync` — never `exec` / `execSync`
- Uses `crypto.randomBytes()` — never `Math.random()`
- All sensitive values via `process.env`

---

## Valid Hook Names

`pre-commit` `commit-msg` `pre-push` `pre-rebase` `post-commit` `post-checkout` `post-merge` `post-receive` `pre-receive` `update` `prepare-commit-msg` `pre-merge-commit` `applypatch-msg` `pre-applypatch` `post-update` `push-to-checkout` `fsmonitor-watchman`

---

## License

MIT © [NickCirv](https://github.com/NickCirv)
