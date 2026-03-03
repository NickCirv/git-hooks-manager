#!/usr/bin/env node
/**
 * git-hooks-manager (ghm) — Zero-dependency git hooks manager
 * Install, manage, and share git hooks across projects.
 * Built-ins only: fs, path, os, crypto, readline, child_process
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import readline from 'readline';
import { execFileSync, spawnSync } from 'child_process';

const VERSION = '1.0.0';
const DEFAULT_HOOKS_DIR = '.githooks';

// ─── ANSI colours ────────────────────────────────────────────────────────────
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
};
const ok = (s) => `${c.green}✔${c.reset} ${s}`;
const warn = (s) => `${c.yellow}⚠${c.reset} ${s}`;
const err = (s) => `${c.red}✖${c.reset} ${s}`;
const info = (s) => `${c.cyan}ℹ${c.reset} ${s}`;
const bold = (s) => `${c.bold}${s}${c.reset}`;
const dim = (s) => `${c.dim}${s}${c.reset}`;

// ─── VALID HOOK NAMES ─────────────────────────────────────────────────────────
const VALID_HOOKS = [
  'applypatch-msg', 'commit-msg', 'fsmonitor-watchman', 'post-update',
  'pre-applypatch', 'pre-commit', 'pre-merge-commit', 'pre-push',
  'pre-rebase', 'pre-receive', 'prepare-commit-msg', 'push-to-checkout',
  'update', 'post-commit', 'post-checkout', 'post-merge', 'post-receive',
];

// ─── BUILT-IN TEMPLATES ───────────────────────────────────────────────────────
const TEMPLATES = {
  'no-console': {
    hook: 'pre-commit',
    description: 'Reject commits containing console.log in staged JS/TS files',
    script: `#!/bin/sh
# Template: no-console — rejects console.log in staged JS/TS files
staged=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\\.(js|jsx|ts|tsx|mjs|cjs)$' || true)
if [ -z "$staged" ]; then
  exit 0
fi
found=$(git diff --cached -- $staged | grep '^+' | grep -v '^+++' | grep 'console\\.log' || true)
if [ -n "$found" ]; then
  echo "$(tput setaf 1)✖ Commit rejected: console.log found in staged files$(tput sgr0)"
  echo "$found"
  exit 1
fi
`,
  },
  'no-secrets': {
    hook: 'pre-commit',
    description: 'Scan staged files for common secret patterns',
    script: `#!/bin/sh
# Template: no-secrets — basic secret pattern detection on staged files
staged=$(git diff --cached --name-only --diff-filter=ACM || true)
if [ -z "$staged" ]; then
  exit 0
fi
patterns="(PRIVATE_KEY|SECRET_KEY|API_KEY|AWS_SECRET|PASSWORD|TOKEN|PASSWD|AUTH_TOKEN)"
found=$(git diff --cached -- $staged | grep '^+' | grep -v '^+++' | grep -iE "$patterns" | grep -v '#.*PLACEHOLDER' || true)
if [ -n "$found" ]; then
  echo "$(tput setaf 1)✖ Commit rejected: possible secret detected in staged files$(tput sgr0)"
  echo "$found"
  echo "If false positive, add comment: # PLACEHOLDER"
  exit 1
fi
`,
  },
  'lint': {
    hook: 'pre-commit',
    description: 'Run eslint and/or tsc on staged JS/TS files',
    script: `#!/bin/sh
# Template: lint — run eslint/tsc on staged files
staged=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\\.(js|jsx|ts|tsx|mjs|cjs)$' || true)
if [ -z "$staged" ]; then
  exit 0
fi
# Run ESLint if available
if command -v npx >/dev/null 2>&1 && [ -f ".eslintrc*" ] || [ -f "eslint.config*" ]; then
  npx eslint --max-warnings=0 $staged
  if [ $? -ne 0 ]; then
    echo "$(tput setaf 1)✖ ESLint failed$(tput sgr0)"
    exit 1
  fi
fi
# Run TypeScript check if tsconfig present
if command -v npx >/dev/null 2>&1 && [ -f "tsconfig.json" ]; then
  npx tsc --noEmit
  if [ $? -ne 0 ]; then
    echo "$(tput setaf 1)✖ TypeScript check failed$(tput sgr0)"
    exit 1
  fi
fi
echo "$(tput setaf 2)✔ Lint passed$(tput sgr0)"
`,
  },
  'commit-msg-format': {
    hook: 'commit-msg',
    description: 'Enforce conventional commits format (feat/fix/chore/etc.)',
    script: `#!/bin/sh
# Template: commit-msg-format — enforce conventional commits
msg=$(cat "$1")
pattern="^(feat|fix|docs|style|refactor|perf|test|chore|ci|build|revert)(\\([a-zA-Z0-9_-]+\\))?: .+"
if ! echo "$msg" | grep -qE "$pattern"; then
  echo "$(tput setaf 1)✖ Commit message does not follow conventional commits format$(tput sgr0)"
  echo "  Expected: <type>(<scope>): <description>"
  echo "  Types: feat fix docs style refactor perf test chore ci build revert"
  echo "  Got: $msg"
  exit 1
fi
`,
  },
  'branch-name': {
    hook: 'pre-push',
    description: 'Enforce branch naming pattern (feature/ fix/ chore/ hotfix/ release/)',
    script: `#!/bin/sh
# Template: branch-name — enforce branch naming conventions
branch=$(git symbolic-ref HEAD 2>/dev/null | sed 's|refs/heads/||')
pattern="^(feature|fix|chore|hotfix|release|docs|test)/[a-zA-Z0-9_-]+"
exempt="^(main|master|develop|staging|production)$"
if echo "$branch" | grep -qE "$exempt"; then
  exit 0
fi
if ! echo "$branch" | grep -qE "$pattern"; then
  echo "$(tput setaf 1)✖ Branch name '$branch' does not match naming convention$(tput sgr0)"
  echo "  Expected: <type>/<description>"
  echo "  Types: feature fix chore hotfix release docs test"
  exit 1
fi
`,
  },
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function findGitDir(startDir = process.cwd()) {
  let dir = startDir;
  for (let i = 0; i < 20; i++) {
    const candidate = path.join(dir, '.git');
    if (fs.existsSync(candidate)) {
      const stat = fs.statSync(candidate);
      if (stat.isDirectory()) return candidate;
      // handle worktrees (.git is a file)
      const content = fs.readFileSync(candidate, 'utf8').trim();
      const match = content.match(/^gitdir:\s*(.+)$/);
      if (match) return path.resolve(dir, match[1]);
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function resolveGitDir(opts) {
  if (opts.gitDir) return opts.gitDir;
  const found = findGitDir();
  if (!found) {
    console.error(err('Not inside a git repository. Run `git init` first.'));
    process.exit(1);
  }
  return found;
}

function resolveHooksDir(opts) {
  if (opts.hooksDir) return path.resolve(opts.hooksDir);
  return path.join(process.cwd(), DEFAULT_HOOKS_DIR);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function fileHash(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function filesMatch(a, b) {
  return fileHash(a) === fileHash(b);
}

function isExecutable(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function gitHooksFromDir(gitDir) {
  const hooksPath = path.join(gitDir, 'hooks');
  if (!fs.existsSync(hooksPath)) return [];
  return fs.readdirSync(hooksPath).filter((f) => !f.endsWith('.sample'));
}

function sourceHooksFromDir(hooksDir) {
  if (!fs.existsSync(hooksDir)) return [];
  return fs.readdirSync(hooksDir).filter((f) => {
    const full = path.join(hooksDir, f);
    return fs.statSync(full).isFile() && !f.startsWith('.');
  });
}

function validateHookName(name) {
  if (!VALID_HOOKS.includes(name)) {
    console.error(err(`Unknown hook: ${bold(name)}`));
    console.error(`  Valid hooks: ${VALID_HOOKS.join(', ')}`);
    process.exit(1);
  }
}

function writeHookFile(dest, content) {
  fs.writeFileSync(dest, content, { mode: 0o755 });
}

function prompt(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

// ─── COMMANDS ─────────────────────────────────────────────────────────────────

function cmdList(opts) {
  const gitDir = resolveGitDir(opts);
  const hooksDir = resolveHooksDir(opts);
  const installedDir = path.join(gitDir, 'hooks');

  const sourceHooks = sourceHooksFromDir(hooksDir);
  const installedHooks = gitHooksFromDir(gitDir);

  console.log(`\n${bold('git-hooks-manager')} — Hook Status\n`);
  console.log(`  ${dim('Source dir:')}   ${hooksDir}`);
  console.log(`  ${dim('Git hooks dir:')} ${installedDir}\n`);

  if (sourceHooks.length === 0) {
    console.log(warn(`No hooks found in ${hooksDir}`));
    console.log(`  Run ${bold('ghm init')} to scaffold example hooks or ${bold('ghm add <hook> --template <name>')} to add a template.\n`);
    return;
  }

  const allHooks = [...new Set([...sourceHooks, ...installedHooks])].sort();

  let anyDrift = false;
  for (const hook of allHooks) {
    const srcPath = path.join(hooksDir, hook);
    const dstPath = path.join(installedDir, hook);
    const hasSource = sourceHooks.includes(hook);
    const hasInstalled = installedHooks.includes(hook);

    if (hasSource && hasInstalled) {
      if (filesMatch(srcPath, dstPath)) {
        console.log(`  ${ok(bold(hook))} ${c.green}installed, up to date${c.reset}`);
      } else {
        anyDrift = true;
        console.log(`  ${warn(bold(hook))} ${c.yellow}installed but differs from source${c.reset}`);
      }
    } else if (hasSource && !hasInstalled) {
      console.log(`  ${err(bold(hook))} ${c.red}not installed${c.reset}`);
    } else {
      console.log(`  ${dim(`  ${hook}`)} ${dim('installed (no source in ' + DEFAULT_HOOKS_DIR + ')')}`);
    }
  }

  if (anyDrift) {
    console.log(`\n  Run ${bold('ghm sync')} to reinstall all hooks from source.\n`);
  } else {
    console.log();
  }
}

function cmdInstall(opts, hookName) {
  const gitDir = resolveGitDir(opts);
  const hooksDir = resolveHooksDir(opts);
  const installedDir = path.join(gitDir, 'hooks');
  ensureDir(installedDir);

  if (hookName) {
    validateHookName(hookName);
    const srcPath = path.join(hooksDir, hookName);
    if (!fs.existsSync(srcPath)) {
      console.error(err(`Hook source not found: ${srcPath}`));
      console.error(`  Run ${bold(`ghm add ${hookName} --cmd <command>`)} to create it first.`);
      process.exit(1);
    }
    const dstPath = path.join(installedDir, hookName);
    fs.copyFileSync(srcPath, dstPath);
    fs.chmodSync(dstPath, 0o755);
    console.log(ok(`Installed ${bold(hookName)} → ${dstPath}`));
  } else {
    const hooks = sourceHooksFromDir(hooksDir);
    if (hooks.length === 0) {
      console.log(warn(`No hooks found in ${hooksDir}`));
      return;
    }
    let count = 0;
    for (const hook of hooks) {
      const srcPath = path.join(hooksDir, hook);
      const dstPath = path.join(installedDir, hook);
      fs.copyFileSync(srcPath, dstPath);
      fs.chmodSync(dstPath, 0o755);
      console.log(ok(`Installed ${bold(hook)}`));
      count++;
    }
    console.log(`\n${ok(`${count} hook(s) installed.`)}`);
  }
}

function cmdUninstall(opts, hookName) {
  const gitDir = resolveGitDir(opts);
  const installedDir = path.join(gitDir, 'hooks');

  if (hookName) {
    validateHookName(hookName);
    const dstPath = path.join(installedDir, hookName);
    if (!fs.existsSync(dstPath)) {
      console.log(warn(`Hook ${bold(hookName)} is not installed.`));
      return;
    }
    fs.unlinkSync(dstPath);
    console.log(ok(`Uninstalled ${bold(hookName)}`));
  } else {
    const hooks = gitHooksFromDir(gitDir);
    if (hooks.length === 0) {
      console.log(info('No hooks currently installed.'));
      return;
    }
    for (const hook of hooks) {
      const dstPath = path.join(installedDir, hook);
      fs.unlinkSync(dstPath);
      console.log(ok(`Uninstalled ${bold(hook)}`));
    }
    console.log(`\n${ok(`${hooks.length} hook(s) removed.`)}`);
  }
}

function cmdAdd(opts, hookName) {
  if (!hookName) {
    console.error(err('Usage: ghm add <hook> [--cmd <command>] [--template <name>]'));
    process.exit(1);
  }
  validateHookName(hookName);
  const hooksDir = resolveHooksDir(opts);
  ensureDir(hooksDir);
  const hookPath = path.join(hooksDir, hookName);

  if (opts.template) {
    const tpl = TEMPLATES[opts.template];
    if (!tpl) {
      console.error(err(`Unknown template: ${opts.template}`));
      console.error(`  Available templates: ${Object.keys(TEMPLATES).join(', ')}`);
      process.exit(1);
    }
    const content = tpl.script;
    if (fs.existsSync(hookPath)) {
      // Append template body after existing shebang
      const existing = fs.readFileSync(hookPath, 'utf8');
      const body = content.split('\n').slice(1).join('\n'); // strip shebang
      writeHookFile(hookPath, existing.trimEnd() + '\n' + body);
      console.log(ok(`Appended template ${bold(opts.template)} to ${bold(hookName)}`));
    } else {
      writeHookFile(hookPath, content);
      console.log(ok(`Created ${bold(hookName)} with template ${bold(opts.template)}`));
    }
    return;
  }

  if (!opts.cmd) {
    console.error(err('Provide --cmd <command> or --template <name>'));
    process.exit(1);
  }

  const line = `${opts.cmd}\n`;
  if (fs.existsSync(hookPath)) {
    fs.appendFileSync(hookPath, line);
    fs.chmodSync(hookPath, 0o755);
    console.log(ok(`Appended command to ${bold(hookName)}: ${dim(opts.cmd)}`));
  } else {
    const header = `#!/bin/sh\n# managed by git-hooks-manager\n${line}`;
    writeHookFile(hookPath, header);
    console.log(ok(`Created ${bold(hookName)} with command: ${dim(opts.cmd)}`));
  }
}

function cmdEdit(opts, hookName) {
  if (!hookName) {
    console.error(err('Usage: ghm edit <hook>'));
    process.exit(1);
  }
  validateHookName(hookName);
  const hooksDir = resolveHooksDir(opts);
  const hookPath = path.join(hooksDir, hookName);

  if (!fs.existsSync(hookPath)) {
    console.error(err(`Hook file not found: ${hookPath}`));
    console.error(`  Run ${bold(`ghm add ${hookName} --cmd <command>`)} to create it first.`);
    process.exit(1);
  }

  const editor = process.env.EDITOR || process.env.VISUAL || 'vi';
  // Only allow known editor binaries via execFileSync
  const result = spawnSync(editor, [hookPath], { stdio: 'inherit' });
  if (result.error) {
    console.error(err(`Failed to open editor: ${result.error.message}`));
    process.exit(1);
  }
}

function cmdRun(opts, hookName) {
  if (!hookName) {
    console.error(err('Usage: ghm run <hook>'));
    process.exit(1);
  }
  validateHookName(hookName);
  const gitDir = resolveGitDir(opts);
  const installedDir = path.join(gitDir, 'hooks');
  const hookPath = path.join(installedDir, hookName);

  if (!fs.existsSync(hookPath)) {
    console.error(err(`Hook ${bold(hookName)} is not installed.`));
    console.error(`  Run ${bold(`ghm install ${hookName}`)} first.`);
    process.exit(1);
  }

  console.log(info(`Running ${bold(hookName)}...`));
  const result = spawnSync(hookPath, [], { stdio: 'inherit', cwd: process.cwd() });
  if (result.error) {
    console.error(err(`Execution error: ${result.error.message}`));
    process.exit(1);
  }
  const code = result.status ?? 1;
  if (code === 0) {
    console.log(ok(`${bold(hookName)} passed.`));
  } else {
    console.error(err(`${bold(hookName)} exited with code ${code}.`));
    process.exit(code);
  }
}

function cmdStatus(opts) {
  const gitDir = resolveGitDir(opts);
  const hooksDir = resolveHooksDir(opts);
  const installedDir = path.join(gitDir, 'hooks');

  const sourceHooks = sourceHooksFromDir(hooksDir);
  const installedHooks = gitHooksFromDir(gitDir);
  const allHooks = [...new Set([...sourceHooks, ...installedHooks])].sort();

  console.log(`\n${bold('Hook Status')}\n`);

  if (allHooks.length === 0) {
    console.log(info('No hooks found (source or installed).'));
    console.log(`  Run ${bold('ghm init')} to get started.\n`);
    return;
  }

  let installed = 0, missing = 0, drifted = 0, orphaned = 0;

  for (const hook of allHooks) {
    const srcPath = path.join(hooksDir, hook);
    const dstPath = path.join(installedDir, hook);
    const hasSource = sourceHooks.includes(hook);
    const hasInstalled = installedHooks.includes(hook);
    const executable = hasInstalled ? isExecutable(dstPath) : false;

    if (hasSource && hasInstalled) {
      const match = filesMatch(srcPath, dstPath);
      const execStr = executable ? '' : ` ${c.yellow}[not executable]${c.reset}`;
      if (match) {
        console.log(`  ${ok(bold(hook))} installed, synced${execStr}`);
        installed++;
      } else {
        console.log(`  ${warn(bold(hook))} installed but ${c.yellow}DIFFERS from source${c.reset}${execStr}`);
        drifted++;
      }
    } else if (hasSource && !hasInstalled) {
      console.log(`  ${err(bold(hook))} ${c.red}NOT INSTALLED${c.reset}`);
      missing++;
    } else {
      console.log(`  ${dim(`  ${hook}`)} ${dim('orphaned (no source)')}`);
      orphaned++;
    }
  }

  console.log(`\n  Installed: ${c.green}${installed}${c.reset}  Missing: ${c.red}${missing}${c.reset}  Drifted: ${c.yellow}${drifted}${c.reset}  Orphaned: ${c.dim}${orphaned}${c.reset}\n`);

  if (missing > 0 || drifted > 0) {
    console.log(`  Run ${bold('ghm sync')} to fix.\n`);
  }
}

function cmdInit(opts) {
  const hooksDir = resolveHooksDir(opts);
  if (fs.existsSync(hooksDir)) {
    console.log(warn(`${hooksDir} already exists.`));
  } else {
    ensureDir(hooksDir);
    console.log(ok(`Created ${hooksDir}`));
  }

  // Write example pre-commit
  const preCommit = path.join(hooksDir, 'pre-commit');
  if (!fs.existsSync(preCommit)) {
    writeHookFile(preCommit,
      `#!/bin/sh\n# pre-commit hook — managed by git-hooks-manager\n# Add your checks below:\n\nexit 0\n`
    );
    console.log(ok(`Created example ${bold('pre-commit')} hook`));
  }

  // Write example commit-msg
  const commitMsg = path.join(hooksDir, 'commit-msg');
  if (!fs.existsSync(commitMsg)) {
    writeHookFile(commitMsg,
      `#!/bin/sh\n# commit-msg hook — managed by git-hooks-manager\n# Validate commit message format below:\n\nexit 0\n`
    );
    console.log(ok(`Created example ${bold('commit-msg')} hook`));
  }

  // Write .gitignore entry suggestion
  const gitignorePath = path.join(process.cwd(), '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const gi = fs.readFileSync(gitignorePath, 'utf8');
    if (!gi.includes('.githooks/')) {
      console.log(info(`Tip: you may want to commit ${DEFAULT_HOOKS_DIR}/ by NOT adding it to .gitignore`));
    }
  }

  console.log(`\n  Next steps:`);
  console.log(`  ${dim('1.')} Edit your hooks in ${bold(hooksDir)}`);
  console.log(`  ${dim('2.')} Run ${bold('ghm install')} to activate them`);
  console.log(`  ${dim('3.')} Commit ${bold(hooksDir + '/')} to share with your team\n`);
}

function cmdSync(opts) {
  const gitDir = resolveGitDir(opts);
  const hooksDir = resolveHooksDir(opts);
  const installedDir = path.join(gitDir, 'hooks');
  ensureDir(installedDir);

  const hooks = sourceHooksFromDir(hooksDir);
  if (hooks.length === 0) {
    console.log(warn(`No hooks found in ${hooksDir}`));
    return;
  }

  let count = 0;
  for (const hook of hooks) {
    const srcPath = path.join(hooksDir, hook);
    const dstPath = path.join(installedDir, hook);
    fs.copyFileSync(srcPath, dstPath);
    fs.chmodSync(dstPath, 0o755);
    console.log(ok(`Synced ${bold(hook)}`));
    count++;
  }
  console.log(`\n${ok(`${count} hook(s) synced.`)}\n`);
}

function cmdCheck(opts) {
  const gitDir = resolveGitDir(opts);
  const hooksDir = resolveHooksDir(opts);
  const installedDir = path.join(gitDir, 'hooks');

  const sourceHooks = sourceHooksFromDir(hooksDir);
  if (sourceHooks.length === 0) {
    console.log(warn(`No source hooks found in ${hooksDir}`));
    return;
  }

  let pass = true;
  for (const hook of sourceHooks) {
    const srcPath = path.join(hooksDir, hook);
    const dstPath = path.join(installedDir, hook);

    if (!fs.existsSync(dstPath)) {
      console.log(err(`${bold(hook)}: NOT INSTALLED`));
      pass = false;
    } else if (!filesMatch(srcPath, dstPath)) {
      console.log(warn(`${bold(hook)}: installed but DIFFERS from source`));
      pass = false;
    } else if (!isExecutable(dstPath)) {
      console.log(warn(`${bold(hook)}: installed but NOT EXECUTABLE`));
      pass = false;
    } else {
      console.log(ok(`${bold(hook)}: OK`));
    }
  }

  if (!pass) {
    console.error(`\n${err('Check failed.')} Run ${bold('ghm sync')} to fix.\n`);
    process.exit(1);
  } else {
    console.log(`\n${ok('All hooks are installed and up to date.')}\n`);
  }
}

function cmdTemplates() {
  console.log(`\n${bold('Built-in Hook Templates')}\n`);
  for (const [name, tpl] of Object.entries(TEMPLATES)) {
    console.log(`  ${c.cyan}${name}${c.reset}`);
    console.log(`    Hook:        ${tpl.hook}`);
    console.log(`    Description: ${tpl.description}`);
    console.log(`    Install:     ${dim(`ghm add ${tpl.hook} --template ${name}`)}\n`);
  }
}

function cmdHelp() {
  console.log(`
${bold('git-hooks-manager')} ${dim(`v${VERSION}`)} — Zero-dependency git hooks manager

${bold('USAGE')}
  ghm <command> [options]

${bold('COMMANDS')}
  ${c.cyan}list${c.reset}                        List all hooks and their status
  ${c.cyan}init${c.reset}                        Scaffold .githooks/ with example hooks
  ${c.cyan}install${c.reset} [hook]              Install all hooks (or specific hook) from .githooks/
  ${c.cyan}uninstall${c.reset} [hook]            Remove installed hooks (all or specific)
  ${c.cyan}add${c.reset} <hook>                  Add a command or template to a hook
  ${c.cyan}edit${c.reset} <hook>                 Open hook in $EDITOR
  ${c.cyan}run${c.reset} <hook>                  Manually run an installed hook
  ${c.cyan}status${c.reset}                      Show detailed hook status
  ${c.cyan}sync${c.reset}                        Re-install all hooks from .githooks/
  ${c.cyan}check${c.reset}                       Verify all hooks are installed and match source
  ${c.cyan}templates${c.reset}                   List available built-in hook templates

${bold('OPTIONS')}
  --cmd <command>             Command to append to hook (used with add)
  --template <name>           Built-in template to use (used with add)
  --git-dir <path>            Custom .git directory
  --hooks-dir <path>          Custom hooks source directory (default: .githooks/)
  --version, -v               Print version
  --help, -h                  Show this help

${bold('EXAMPLES')}
  ghm init                                 Scaffold .githooks/ directory
  ghm add pre-commit --cmd "npm test"      Add npm test to pre-commit
  ghm add pre-commit --template no-console Add no-console template
  ghm add commit-msg --template commit-msg-format
  ghm install                              Install all hooks
  ghm install pre-commit                   Install specific hook
  ghm status                               Show full status
  ghm check                                CI check (exits 1 if any hook missing/drifted)
  ghm run pre-commit                       Manually run pre-commit hook
  ghm sync                                 Re-sync all hooks
  ghm uninstall pre-commit                 Remove pre-commit hook

${bold('BUILT-IN TEMPLATES')}
  no-console        Reject commits with console.log in JS/TS
  no-secrets        Scan staged files for secret patterns
  lint              Run eslint/tsc on staged files
  commit-msg-format Enforce conventional commits
  branch-name       Enforce branch naming pattern

${bold('TEAM SHARING')}
  Commit .githooks/ to your repo. Teammates run ${bold('ghm install')} to activate.
  Use ${bold('ghm check')} in CI to ensure hooks stay in sync.
`);
}

// ─── ARGUMENT PARSER ──────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {};
  const positional = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--version' || a === '-v') { opts.version = true; continue; }
    if (a === '--help' || a === '-h') { opts.help = true; continue; }
    if (a === '--cmd') { opts.cmd = args[++i]; continue; }
    if (a === '--template') { opts.template = args[++i]; continue; }
    if (a === '--git-dir') { opts.gitDir = args[++i]; continue; }
    if (a === '--hooks-dir') { opts.hooksDir = args[++i]; continue; }
    if (a.startsWith('--cmd=')) { opts.cmd = a.slice(6); continue; }
    if (a.startsWith('--template=')) { opts.template = a.slice(11); continue; }
    if (a.startsWith('--git-dir=')) { opts.gitDir = a.slice(10); continue; }
    if (a.startsWith('--hooks-dir=')) { opts.hooksDir = a.slice(12); continue; }
    if (!a.startsWith('-')) positional.push(a);
  }

  return { opts, positional };
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

function main() {
  const { opts, positional } = parseArgs(process.argv);

  if (opts.version) {
    console.log(`git-hooks-manager v${VERSION}`);
    process.exit(0);
  }

  const [command, arg1] = positional;

  if (!command || opts.help) {
    cmdHelp();
    process.exit(0);
  }

  switch (command) {
    case 'list':       cmdList(opts); break;
    case 'install':    cmdInstall(opts, arg1); break;
    case 'uninstall':  cmdUninstall(opts, arg1); break;
    case 'add':        cmdAdd(opts, arg1); break;
    case 'edit':       cmdEdit(opts, arg1); break;
    case 'run':        cmdRun(opts, arg1); break;
    case 'status':     cmdStatus(opts); break;
    case 'init':       cmdInit(opts); break;
    case 'sync':       cmdSync(opts); break;
    case 'check':      cmdCheck(opts); break;
    case 'templates':  cmdTemplates(); break;
    case 'help':       cmdHelp(); break;
    default:
      console.error(err(`Unknown command: ${bold(command)}`));
      console.error(`  Run ${bold('ghm --help')} to see available commands.`);
      process.exit(1);
  }
}

main();
