<div align="center">

# git-hooks-manager

**Commit .githooks/ once — every teammate gets the same hooks with one command**

[![license](https://img.shields.io/badge/license-MIT-blue?labelColor=0B0A09)](./LICENSE)
[![dependencies](https://img.shields.io/badge/dependencies-0-brightgreen?labelColor=0B0A09)](./package.json)
[![node](https://img.shields.io/badge/node-%3E%3D18-brightgreen?labelColor=0B0A09)](./package.json)

</div>

## Install

```bash
npx github:NickCirv/git-hooks-manager --help
```

## Usage

```bash
# scaffold .githooks/ and create example hooks
npx github:NickCirv/git-hooks-manager init

# add a built-in template (blocks console.log commits)
npx github:NickCirv/git-hooks-manager add pre-commit --template no-console

# install all hooks from .githooks/ into .git/hooks/
npx github:NickCirv/git-hooks-manager install

# teammates activate hooks after git pull
npx github:NickCirv/git-hooks-manager install
```

| Command | Description |
|---|---|
| `init` | Scaffold `.githooks/` with example hooks |
| `install [hook]` | Copy hooks from `.githooks/` into `.git/hooks/` |
| `add <hook>` | Append a command or built-in template to a hook |
| `list` / `status` | Show hook state (installed / missing / drifted) |
| `check` | CI gate — exits 1 if any hook is missing or drifted |
| `sync` | Re-copy all source hooks to `.git/hooks/` |
| `uninstall [hook]` | Remove installed hooks |
| `run <hook>` | Manually execute an installed hook |
| `edit <hook>` | Open hook file in `$EDITOR` |
| `templates` | List available built-in templates |

**Flags:** `--cmd <command>` · `--template <name>` · `--hooks-dir <path>` · `--git-dir <path>`

## What it does

Source hooks live in `.githooks/` committed to your repo. `install` copies them to `.git/hooks/` and sets `chmod 755`. `status` and `check` compare SHA-256 hashes to detect drift — useful in CI to ensure nobody bypassed the hooks. Five built-in templates cover the most common cases: `no-console`, `no-secrets`, `lint`, `commit-msg-format`, `branch-name`. All generated hooks are plain `#!/bin/sh` — no Node.js required at runtime.

---
<sub>Zero dependencies · Node ≥18 · MIT · by <a href="https://github.com/NickCirv">NickCirv</a></sub>
