## 🤖 Claude Code Telegram Bot

Terminal Bot App to remotely chat with Claude Code remotely

Copyright (c) 2025 Christian Broberg

### Repository Commands
- `/repos` - Show all repositories
- `/web`, `/api`, `/mobile` - Switch to repository
- `/status` - Show active repository

### File Commands
- `/ls [path]` - List files (mobile-optimized: folders & files with icons)
- `/l [path]` - List files (detailed: sizes, permissions, owner)
- `/cat <file>` - Show file content

### Git Commands
- `/git` or `/gstatus` - Git status
- `/diff` - Show changes
- `/log count` - Show commits (default: 5)
- `/branch` - Show branches
- `/commit <message>` - Add, commit and push (with confirmation)
- `/qc` or `/quickcommit` - Auto-generate commit message
- `/pull` - Pull changes
- `/stash` - Stash changes
- `/unstash` - Pop stash

### Other Commands
- **Send a message** - Run Claude Code prompt
- **Send an image** - Save screenshot to repository
- **Send a file** - Upload to repository

### Examples
```
/commit feat: add user authentication
Refactor Button component to use shadcn/ui
/qc (creates intelligent commit message)
```

