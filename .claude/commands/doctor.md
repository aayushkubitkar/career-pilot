# /doctor - Environment check & project bootstrap

You are getting this CareerPilot checkout ready to run: check for the tools the workflow
needs, install the project-local pieces automatically, and offer to install anything
system-level that is missing. Safe to re-run any time.

`$ARGUMENTS` may contain `--check` (report only, install nothing) or nothing (the full flow).

Run the steps in order. Keep output tight — a status line per component, then a table at the end.

---

## Step 1: Detect (read-only, no prompts)

Run these and record what you find. A non-zero exit or "command not found" means absent.

```bash
bun --version
node --version
python3 --version
lualatex --version 2>/dev/null | head -1 ; xelatex --version 2>/dev/null | head -1
ls ~/.bun/bin/bun ~/Library/TinyTeX/bin/*/lualatex ~/.TinyTeX/bin/*/lualatex 2>/dev/null
command -v brew
```

Classify each:

| Component | Needed for | Missing = |
|---|---|---|
| **Claude Code** | everything | you are already running it — skip |
| **Bun** | every job-search CLI (`/scrape`) | **blocker** |
| **Python 3.9+** | `tools/` helpers used by `/rank`, `/apply` | **blocker** (any 3.9+ is fine — the tools run on stock macOS python) |
| **LaTeX** (`lualatex` + `xelatex`) | `/apply` compiles & inspects every PDF | **blocker for `/apply`** (the rest works without it) |
| `pypdf` (python pkg) | sharper ATS text-layer check in `/apply` | optional — a Poppler/visual fallback exists |
| Node | a couple of dev scripts | usually already present; not required to run the workflow |

If Bun is on disk at `~/.bun/bin/bun` but `bun --version` failed, it is installed but not on
this shell's PATH — treat it as "installed, needs a Claude Code restart" (see Step 3).
Same for LaTeX found under `~/.TinyTeX` / `~/Library/TinyTeX` but not on PATH.

---

## Step 2: Project-local bootstrap (do automatically — all safe and local)

Skip a sub-step if its result is already in place. Do **not** prompt for these.

1. **Job-search CLIs.** The shipped portal skills have **zero runtime dependencies** —
   `bun run <skill>/cli/src/cli.ts` works on a fresh clone with nothing installed. So the
   only check that matters is that Bun itself runs one:
   ```bash
   bun run .agents/skills/ats-search/cli/src/cli.ts --help >/dev/null && echo "portal CLIs: OK"
   ```
   If that fails because Bun is missing, note it — Step 3 offers to install Bun.
   `bun install` in each `cli/` is **optional** (it only pulls dev types so `bun run
   typecheck` works); don't run it unless the user asks or is developing a skill.

2. **`companies.csv`.** If `.agents/skills/ats-search/companies.csv` is absent:
   ```bash
   cp .agents/skills/ats-search/companies.example.csv .agents/skills/ats-search/companies.csv
   ```
   Tell the user this is their editable target-company list.

3. **`.env`.** If there is no `.env` at the repo root, create one with commented placeholders:
   ```
   # CareerPilot local environment - gitignored, never committed.
   # Fill in the keys for the sources you want; /scrape skips a source whose key is unset.

   # adzuna-search - broad US aggregator. Free key: https://developer.adzuna.com
   ADZUNA_APP_ID=
   ADZUNA_APP_KEY=

   # usajobs-search - federal roles (optional). Free key: https://developer.usajobs.gov/apirequest/
   # USAJOBS_API_TOKEN=
   # USAJOBS_USER_AGENT=you@example.com
   ```
   If `.env` already exists, leave it alone.

4. **`pypdf`** (optional, improves the ATS check). If Python is present and `python3 -c "import pypdf"`
   fails, offer (one prompt): `python3 -m pip install --user pypdf` — or `--break-system-packages`
   if pip refuses on an externally-managed install. Skip silently if the user declines.

---

## Step 3: Missing system prerequisites - offer to install (one prompt each)

For each blocker still missing, show the exact command, say plainly what it changes on the
machine, and **wait for the user to say yes** before running it. If `$ARGUMENTS` is `--check`,
list them and stop here.

### Bun (missing)

```bash
curl -fsSL https://bun.sh/install | bash
```
Installs to `~/.bun` and appends `~/.bun/bin` to your shell profile. **After it finishes you
must restart Claude Code** (or run `exec $SHELL`) so the portal skills can find `bun` — the
skills invoke it as a bare `bun run …`, which only resolves once it is on the base PATH.

### Python 3.9+ (only if `python3` is genuinely absent)

Stock macOS and every current Linux ship Python 3.9 or newer, and the CareerPilot tools run
on 3.9 — so this is rare. If `python3` truly is not found:
- macOS with Homebrew: `brew install python@3.12`
- otherwise: install from <https://www.python.org/downloads/>

### LaTeX (`lualatex` / `xelatex` missing)

TinyTeX is the lightest option (~65 MB base).

```bash
# 1. install TinyTeX
curl -sL "https://yihui.org/tinytex/install-bin-unix.sh" | sh

# 2. the packages moderncv + cover.cls pull in (macOS path shown; Linux: ~/.TinyTeX/bin/*/)
~/Library/TinyTeX/bin/*/tlmgr install \
  moderncv fontawesome6 fontspec needspace titlesec enumitem ragged2e xcolor pgf \
  collection-latexrecommended collection-fontsrecommended textpos everypage marvosym \
  fontaxes realscripts xltxtra

# 3. put lualatex/xelatex on PATH
~/Library/TinyTeX/bin/*/tlmgr path add    # may prompt for sudo to write /usr/local/bin
```
On Linux, `~/Library/TinyTeX` is `~/.TinyTeX` and the bin dir is `~/.TinyTeX/bin/x86_64-linux`.
**Restart Claude Code afterwards** so `/apply` can compile.

If the user would rather use a full TeX distribution they already trust (MacTeX, TeX Live),
that is fine — they just need `lualatex` and `xelatex` on PATH.

---

## Step 4: External accounts (cannot be automated - just point the user)

- **Adzuna** (optional, broadens `/scrape`): free key at <https://developer.adzuna.com> →
  put `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` in `.env`.
- **USAJOBS** (only for federal roles): free key at <https://developer.usajobs.gov/apirequest/>.

Neither is required — `/scrape` runs `ats-search`, `linkedin-search`, and `freehire-search`
with no keys at all.

---

## Step 5: Report

Print one table, then the single next action.

```
## Environment

| Component      | Status                                    |
|----------------|-------------------------------------------|
| Bun            | OK 1.4.2  /  MISSING - install offered     |
| Python         | OK 3.12.4  /  OK 3.9.6 (fine)              |
| LaTeX          | OK  /  MISSING - TinyTeX offered           |
| Portal CLIs    | run OK  /  blocked (Bun missing)           |
| companies.csv  | created from example  /  present          |
| .env           | created - add your Adzuna key  /  present  |
| pypdf          | OK  /  skipped (visual ATS fallback)       |
```

Then exactly one of:
- **all green** → "Environment is ready. Run `/setup` to import your profile."
- **a system install just ran** → "Installed <X>. **Restart Claude Code**, then run `/doctor`
  again to confirm, then `/setup`."
- **user declined an install** → "Install <X> when you're ready (command above), then re-run
  `/doctor`. You can still run `/setup` and `/scrape` now; `/apply` needs LaTeX / `/scrape`
  needs Bun."

---

## Notes

- Idempotent: every step checks before acting, so re-running `/doctor` is cheap and safe.
- `/doctor` never touches your profile, the tracker, or `seen_jobs.json`.
- The generated `.env`, `companies.csv`, and every `node_modules/` are gitignored.
