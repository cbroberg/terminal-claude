# Warp Git Automation Recommendations

This document outlines three practical approaches to automate common Git workflows in Warp, eliminating the need to manually type multiple Git commands for routine operations like staging, committing, and pushing changes.

## Problem Statement

Instead of manually running these commands every time:
```bash
git status
git add -A
git commit -m "your message"
git push
```

We can automate this workflow using one of the following approaches.

## Recommendation 1: NPM Scripts (Quick & Simple)

**Best for**: Developers who prefer command-line shortcuts and want immediate access without setup.

We've added convenient npm scripts to `package.json`:

```json
{
  "scripts": {
    "commit": "./scripts/quick-commit.sh",
    "git:quick": "git add -A && git status && echo 'Ready to commit!'",
    "git:status": "git status --short --branch"
  }
}
```

### Usage:
```bash
# Full automated commit and push (with interactive prompt)
npm run commit

# Quick staging and status check
npm run git:quick

# Compact status view
npm run git:status
```

### Pros:
- ✅ Works immediately in any terminal
- ✅ Familiar npm script pattern
- ✅ No Warp-specific dependencies
- ✅ Can pass commit messages as arguments

### Cons:
- ❌ Still requires typing a command
- ❌ Limited to text-based interaction

## Recommendation 2: Shell Script (Most Flexible)

**Best for**: Power users who want full control and rich feedback.

Location: `scripts/quick-commit.sh`

The script provides a comprehensive workflow with:
- Visual status indicators (🔍 📝 💾 🚀 ✅)
- Safety checks (prevents empty commits)
- Interactive or argument-based commit messages
- Detailed feedback at each step

### Usage:
```bash
# Interactive mode (prompts for commit message)
./scripts/quick-commit.sh

# Direct mode (commit message as argument)
./scripts/quick-commit.sh "Add new feature"

# Via npm script
npm run commit "Your commit message"
```

### Features:
- Shows staged changes preview
- Validates commit message input
- Displays final status after push
- Colorful, informative output
- Error handling with meaningful messages

### Pros:
- ✅ Rich visual feedback
- ✅ Multiple input methods
- ✅ Comprehensive error handling
- ✅ Can be customized easily
- ✅ Works in any shell/terminal

### Cons:
- ❌ Requires executable permissions
- ❌ Shell script maintenance

## Recommendation 3: Warp Workflow (Native Integration)

**Best for**: Warp power users who want native IDE-like experience.

### Setup Method A: YAML File (Legacy)
We created: `.warp/workflows/git-commit-push.yaml`

### Setup Method B: Warp Drive (Recommended)
1. Open Command Palette (`Cmd + P`)
2. Search "Create a New Personal Workflow"
3. Configure:
   - **Name**: "Git Commit & Push"
   - **Description**: "Stage, commit, and push changes"
   - **Command**: 
   ```bash
   git add -A && git status --porcelain | head -10 && echo "Enter commit message:" && read -r commit_message && git commit -m "$commit_message" && git push && echo "✅ Done!"
   ```

### Usage:
1. **Command Palette**: `Cmd + P` → Search "Git Commit"
2. **Warp Drive**: Navigate to saved workflows
3. **Command Search**: Start typing in terminal, select from suggestions

### Pros:
- ✅ Native Warp integration
- ✅ Searchable and discoverable
- ✅ GUI-style parameter input
- ✅ Syncs across devices (Warp Drive)
- ✅ No external files to maintain

### Cons:
- ❌ Warp-specific (not portable)
- ❌ YAML workflows may be deprecated
- ❌ Requires Warp Drive account for full features

## Our Recommendation: Use All Three!

Each method serves different scenarios:

1. **Daily workflow**: Use `npm run commit` for speed
2. **Complex commits**: Use `./scripts/quick-commit.sh` for detailed feedback
3. **Warp power users**: Set up the Warp workflow for GUI-like experience

## Quick Reference

| Method | Command | When to Use |
|--------|---------|-------------|
| NPM Script | `npm run commit` | Quick daily commits |
| Shell Script | `./scripts/quick-commit.sh "message"` | Need detailed feedback |
| Warp Workflow | `Cmd + P` → "Git Commit" | GUI-style interaction |

## Installation Status

All three methods are already configured in this repository:
- ✅ NPM scripts added to `package.json`
- ✅ Shell script created at `scripts/quick-commit.sh` (executable)
- ✅ Warp workflow YAML created at `.warp/workflows/git-commit-push.yaml`

Try them out and see which fits your workflow best!
