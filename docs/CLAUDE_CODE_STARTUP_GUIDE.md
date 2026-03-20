# Claude Code in VS Code — Step-by-Step Startup Guide
**For:** Manish | **Project:** ETIP v4.0 | **Date:** March 2026

---

## PHASE 1: INSTALL (One-Time Setup — 10 minutes)

### Step 1: Install Claude Code CLI

Open your Windows terminal (PowerShell or CMD):

```bash
# Verify Node.js 18+ is installed (you have 20 LTS)
node -v

# Install Claude Code globally
npm install -g @anthropic-ai/claude-code

# Verify installation
claude --version
```

### Step 2: Install VS Code Extension

1. Open VS Code
2. Press `Ctrl+Shift+X` (Extensions panel)
3. Search: **"Claude Code"** by Anthropic
4. Click **Install**
5. Restart VS Code

### Step 3: Authenticate

```bash
# In VS Code terminal (Ctrl+`), navigate to your project:
cd E:\code\IntelWatch

# Launch Claude Code — first time will prompt for auth
claude
```

Choose your auth method:
- **Claude Pro/Max subscription** ($20-200/month): OAuth login — recommended for you
- **API key**: Generate at console.anthropic.com → more expensive per-token

After authenticating, Claude Code will show its interactive prompt. Type `/quit` to exit for now.

### Step 4: Verify Configuration Loaded

```bash
cd E:\code\IntelWatch
claude
```

You should see at the very start:
- Your **SessionStart hook** firing (shows git branch, project state summary)
- Type `/help` — you should see your 8 custom commands listed
- Type `/session-start` — it should load PROJECT_STATE.md and DECISIONS_LOG.md

If you see all that: **installation complete**. Type `/quit`.

---

## PHASE 2: FIRST SESSION (Follow This Exactly)

### Step 5: Open Your Project in VS Code

```
File → Open Folder → E:\code\IntelWatch
```

### Step 6: Open Claude Code Panel

Two ways:
- **Option A (Extension)**: Click the Claude icon in the VS Code sidebar
- **Option B (Terminal)**: Press `Ctrl+`` → type `claude`

Use Option B (terminal) — it's more powerful and shows hook output.

### Step 7: Run Session Start

```
/session-start
```

Claude will:
1. Show git status (branch, commits, clean/dirty)
2. Read PROJECT_STATE.md — show deployed vs WIP modules
3. Read DECISIONS_LOG.md — show recent decisions
4. Check Docker containers (if Docker is running)
5. Show session briefing
6. Ask: "What module/feature are you working on this session?"

### Step 8: Declare Your Scope

Answer the question. Example:

```
Working on ingestion service. This is Phase 2 — scaffolding the new module.
```

Claude will respond with scope acknowledgment:
```
Scope locked to: apps/ingestion
Will not modify: api-gateway, shared-types, shared-utils, shared-auth, 
shared-cache, shared-audit, shared-normalization, shared-enrichment, 
shared-ui, user-service
```

### Step 9: Start Working

Now you can use any command:

```
/new-module ingestion
```
→ Scaffolds the entire service with tests, config, registration

```
/implement feed source CRUD endpoints for ingestion service
```
→ TDD flow: scope lock → plan → tests → implement → verify → report

### Step 10: End Your Session

**NEVER close VS Code without this:**

```
/session-end
```

Claude will:
1. Update PROJECT_STATE.md with what you accomplished
2. Log any decisions to DECISIONS_LOG.md
3. Show session summary
4. Commit the state files
5. Warn about any uncommitted code

---

## PHASE 3: DAILY WORKFLOW (Every Session After First)

### The Loop (Memorize This)

```
1. Open VS Code → Ctrl+` → claude
2. /session-start              ← loads everything
3. "Working on [module]"       ← declares scope
4. /implement [feature]        ← does the work (TDD)
5. /diff                       ← review changes
6. git commit                  ← commit your code
7. /session-end                ← update state files
8. (optional) /pre-push        ← if pushing to master
```

### When Switching Modules Mid-Day

```
/session-end                   ← close current module's state
/clear                         ← reset context window
/session-start                 ← reload fresh
"Working on [new module]"      ← new scope
```

**NEVER** work on two modules in one session. Always `/clear` between them.

---

## PHASE 4: ESSENTIAL COMMANDS CHEAT SHEET

### Session Commands
| Command | When | What It Does |
|---------|------|-------------|
| `/session-start` | Beginning of every session | Loads state, decisions, git, containers |
| `/session-end` | End of every session | Updates state files, commits, summary |
| `/clear` | Switching modules | Hard reset — reloads CLAUDE.md fresh |
| `/compact` | Same module, long session | Summarizes context, keeps working |
| `/context` | Anytime | Shows context window usage % |

### Development Commands
| Command | When | What It Does |
|---------|------|-------------|
| `/implement [desc]` | Building a feature | Full TDD: scope → plan → test → build → verify |
| `/new-module [name]` | Creating a new service | Scaffold + register + verify |
| `/review` | Before committing | Code quality + scope + standards check |
| `/diff` | After changes | Visual diff of all changes |

### Safety Commands
| Command | When | What It Does |
|---------|------|-------------|
| `/pre-push` | Before git push | 9-check safety gate |
| `/rca-check` | After any infra change | Matches against 24 known failure patterns |
| `/deploy-check` | After CI deploys | Verifies ETIP + live site health |

### Model Switching
| Command | When |
|---------|------|
| `/model` | Switch between Opus (complex), Sonnet (default), Haiku (quick) |

### Keyboard Shortcuts
| Key | Action |
|-----|--------|
| `Shift+Tab` | Toggle Plan Mode (review before execute) |
| `Ctrl+C` | Cancel current operation |
| `Up Arrow` | Browse previous prompts |
| `Esc` twice | Rewind last change |
| `@filename` | Reference a specific file |

---

## PHASE 5: WHAT THE HOOKS DO (Automatic — No Action Needed)

These fire automatically — you don't invoke them:

### On Session Start (automatic)
- Shows git branch + last 3 commits
- Shows PROJECT_STATE.md summary (phase, next task)
- Shows Docker container status

### On Every Bash Command (automatic)
- **validate-command.mjs**: Blocks rm -rf, SSH, live site commands, force push
- You'll see 🛑 BLOCKED if something dangerous is attempted

### On Every Git Commit (automatic)
- **pre-commit-check.mjs**: 
  - **HARD BLOCKS** commits touching Tier 1 frozen modules (shared-*, api-gateway)
  - Warns on cross-module commits
  - Scans for leaked secrets
  - Override (when you explicitly approve): `git commit --no-verify`

### On Every .ts/.tsx File Write (automatic)
- Runs Prettier auto-format

---

## PHASE 6: TROUBLESHOOTING

### "Claude doesn't know about my project"
→ Check: Is `CLAUDE.md` at the repo root? Run `ls CLAUDE.md`
→ Fix: Must be in the directory where you launch `claude`

### "My custom commands aren't showing up"
→ Check: `ls .claude/commands/` — should show 8 .md files
→ Fix: Ensure `.claude/` directory is at repo root, not nested

### "Hook errors on commit"
→ If Tier 1 blocked: This is intentional. Use `git commit --no-verify` only if you explicitly approved the change.
→ If script error: Check `node --version` is 18+. Hooks use ESM (`import`).

### "Context is getting slow/confused"
→ Run `/context` to check usage %
→ If >50%: `/compact`
→ If >80% or confused: `/clear` → `/session-start` → fresh prompt

### "Claude modified a module it shouldn't have"
→ Check `git diff --stat` — see what was touched
→ If accidental: `git checkout -- apps/[wrong-module]/`
→ If widespread: `git reset --hard safe-point-[tag]` (if you tagged)
→ Prevention: Always `/clear` between modules

### "Docker test fails but local tests pass"
→ This is the Environment Parity Rule catching a real bug
→ Fix: The problem is in your code, not in Docker
→ Common causes: path case sensitivity, missing env var, native dep

---

## PHASE 7: WHAT HAPPENS WHERE (Mental Model)

```
YOU type prompt
    ↓
CLAUDE.md loads (141 lines — rules, constraints, protocol)
    ↓
Auto MEMORY.md loads (Claude's own notes about your preferences)
    ↓
SessionStart hook fires (git state, project summary, containers)
    ↓
You type /session-start
    ↓
Claude reads PROJECT_STATE.md + DECISIONS_LOG.md + DEPLOYMENT_RCA.md
    ↓
You declare scope → Claude acknowledges locked modules
    ↓
You type /implement [feature]
    ↓
Step 0: Scope lock verified against PROJECT_STATE.md
Step 1: Module CLAUDE.md loaded + decisions checked
Step 2: Plan presented → you approve
Step 3: Tests written (TDD red)
Step 4: Code written
Step 5: Tests pass + typecheck + lint + docker-test
Step 5.5: Self-check (6 questions answered)
Step 6: Report generated
    ↓
You review /diff → git commit
    ↓
pre-commit-check.mjs fires:
  - Tier 1 touched? → BLOCKED (exit 2)
  - Cross-module? → WARNING
  - Secrets? → WARNING
    ↓
You type /session-end
    ↓
PROJECT_STATE.md updated + DECISIONS_LOG.md updated + committed
    ↓
Next session: /session-start reads the updated state → loop continues
```

---

## QUICK START (If You Just Want to Begin Right Now)

```bash
# 1. Install
npm install -g @anthropic-ai/claude-code

# 2. Open project in VS Code
# File → Open Folder → E:\code\IntelWatch

# 3. Open terminal
# Ctrl+`

# 4. Launch
cd E:\code\IntelWatch
claude

# 5. Start session
/session-start

# 6. Declare scope
"Working on ingestion service — scaffolding Phase 2"

# 7. Build
/new-module ingestion

# 8. End session
/session-end

# 9. Push (when ready)
/pre-push
# Then manually: git push origin master
```

That's it. You're running.
