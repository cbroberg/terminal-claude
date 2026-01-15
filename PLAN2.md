✅ Answer:
Based on my analysis of the codebase, here's my optimization plan for the Terminal-Claude project:

## Optimization Plan In Review Mode

### Critical Issues to Address

1. Activity Timeout Not Implemented
   - The PLAN.md describes activity monitoring, but it's completely missing from taskManager.js
   - Hung processes could block the queue indefinitely with no timeout enforcement
   - Recommendation: Add a timer that resets on each output line and force-kill processes after N seconds of silence

2. Hardcoded Paths in Multiple Places
   - Claude CLI path duplicated in server.js and taskManager.js
   - Repository paths also duplicated
   - Recommendation: Move both to .env or a centralized config.js file

3. Shell Injection Vulnerabilities
   - Uses exec with unsanitized user input /ls, /commit commands, prompts
   - Commit message only escapes quotes, insufficient protection
   - Recommendation: Replace exec with execFile and use argument arrays instead of string concatenation

4. Non-Atomic File Writes
   - saveState writes directly to .telegram-claude-state.json
   - Server crash during write corrupts queue state
   - Recommendation: Use temp file + atomic rename pattern

### Reliability Improvements

5. No Startup Recovery
   - Tasks marked as "running" on server crash vanish without user notification
   - Recommendation: On startup, move "running" tasks back to "pending"

6. Missing Graceful Shutdown
   - No SIGTERM/SIGINT handlers
   - Bot keeps polling even during crashes
   - Recommendation: Add process signal handlers to clean up resources

7. ESLint in Production Dependencies
   - Adds 9MB bloat unnecessarily
   - Recommendation: Move to devDependencies only

### Optimization Opportunities

8. Disk I/O Inefficiency
   - saveState called after every change with On cost
   - Large queues will cause noticeable lag
   - Recommendation: Batch writes or use write debouncing

9. Logging Not Configurable
   - bot.log hardcoded and always cleared on startup
   - Makes debugging difficult
   - Recommendation: Add configurable log paths, levels, and retention

10. No Test Coverage
   - Zero unit tests; critical functionality untested
   - Recommendation: Add tests for queue persistence, FIFO ordering, retry logic

### Implementation Order

Phase 1 Security/Reliability - Do first:
- Fix shell injection vulnerabilities
- Implement activity timeout
- Add atomic writes and startup recovery

Phase 2 Code Quality:
- Centralize configuration
- Add graceful shutdown
- Move ESLint to devDependencies

Phase 3 Testing/Optimization:
- Add unit tests
- Optimize disk I/O
- Improve logging

---

Would you like me to proceed with detailed implementation planning for any specific area? I'd recommend starting with the security fixes shell injection + activity timeout since those directly impact stability.
