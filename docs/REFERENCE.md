# git-hooks-manager — command reference

[Overview](../README.md) · [Research record](RESEARCH.md)

Describes revision `13243ad52d29a692c92b5112fd227c39ab757f7b`. Commands are source-inspected; no execution results are asserted.

## Workflow

Provides init, add, edit, list, install, uninstall, run, sync and check commands with a .githooks source directory and built-in templates.

Requires Git and a local repository with the relevant history. Commands are source-inspected, not executed in this review.

```bash
node index.js status
```

## Commands and controls

| Control | Behavior in the inspected implementation |
| --- | --- |
| `status / list` | Inspect local hook state |
| `init` | Create a hook-source scaffold |
| `add HOOK --template NAME` | Create a hook from a bundled template |
| `install / sync` | Copy source hooks into Git hooks |
| `uninstall` | Remove installed hooks |

## Interpretation and side effects

Hooks execute commands with your permissions. Installing, synchronizing or removing hooks changes Git behavior and may replace existing hook files. Inspect templates and current hooks before enabling them.

## Implementation reference

- [package.json](https://github.com/NickCirv/git-hooks-manager/blob/13243ad52d29a692c92b5112fd227c39ab757f7b/package.json)
- [index.js](https://github.com/NickCirv/git-hooks-manager/blob/13243ad52d29a692c92b5112fd227c39ab757f7b/index.js)
- [test/smoke.test.js](https://github.com/NickCirv/git-hooks-manager/blob/13243ad52d29a692c92b5112fd227c39ab757f7b/test/smoke.test.js)
