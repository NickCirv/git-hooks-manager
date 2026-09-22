![git-hooks-manager — Nicholas Ashkar repository collection](assets/nicholas-ashkar/banner.png)

# git-hooks-manager

Keep versioned Git hook scripts and install them into a local repository.


<a id="usage"></a>

## What it does

Provides init, add, edit, list, install, uninstall, run, sync and check commands with a .githooks source directory and built-in templates. See the pinned [implementation](https://github.com/NickCirv/git-hooks-manager/blob/13243ad52d29a692c92b5112fd227c39ab757f7b/index.js).


<a id="install"></a>

## Quickstart

Node requirement from the inspected manifest: **`>=20`**. Requires Git and a local repository with the relevant history. Commands are source-inspected, not executed in this review.

The following example is **source-inspected, not executed**. It uses a pinned checkout; npm package publication is not assumed. Replace project paths or provide the stated input fixtures before running it.

```bash
git clone https://github.com/NickCirv/git-hooks-manager.git
cd git-hooks-manager
git checkout 13243ad52d29a692c92b5112fd227c39ab757f7b
npm install --ignore-scripts
node index.js status
```

Dependencies are installed with lifecycle scripts disabled in this recipe. Read the package scripts before enabling any lifecycle step required by your environment.

## Usage and reference

`git-hooks-manager` | `ghm` are the executable names declared by the package. [Command reference](docs/REFERENCE.md) covers source-backed options and entry points.

## Limits and operational notes

Hooks execute commands with your permissions. Installing, synchronizing or removing hooks changes Git behavior and may replace existing hook files. Inspect templates and current hooks before enabling them.

## Development

No runtime checks were executed for this documentation review. The committed smoke test checks entrypoint JavaScript syntax; it does not exercise the command behavior.

| Script | Declared command |
| --- | --- |
| `test` | `node --test` |

Work from the pinned source, keep changes focused, and reproduce the affected behavior with a small fixture before proposing a change. Existing contribution and security policies remain authoritative where present.

## Research and status

[Research record](docs/RESEARCH.md) identifies the inspected revision, source evidence, documentation disposition and verification gaps. Static inspection supports the descriptions here; runtime behavior, dependency installation and current hosted services remain unverified.

## License and author

[License](https://github.com/NickCirv/git-hooks-manager/blob/13243ad52d29a692c92b5112fd227c39ab757f7b/LICENSE)

[Nicholas Ashkar](https://nicholashkar.com) · Applied AI, systems and consulting.
