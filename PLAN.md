# Queue-Based Claude Message System - Implementation Plan

## Overview

Implement a FIFO (First-In-First-Out) queue system for handling Telegram messages that trigger Claude Code operations. This allows users to send multiple prompts in quick succession, and they will be processed sequentially in order, without hard timeout limits that interrupt long-running operations.

## Key Goals

1. **No Hard Timeouts** - Remove the 2-minute timeout that cuts off long Claude sessions
2. **Activity-Based Monitoring** - Detect stuck/hung processes by lack of activity (no data output), not by elapsed time
3. **FIFO Queue Management** - Process messages in exact order received, persisted to disk
4. **User Feedback** - Keep users informed of queue position and task progress
5. **Graceful Recovery** - Survive server restarts with queue persistence and retry logic

## Architecture

### New Files to Create

#### 1. `messageQueue.js`
Manages the FIFO queue of pending Claude tasks.

**Responsibilities:**
- Load/save queue from `.telegram-claude-state.json`
- Enqueue new tasks with unique IDs and metadata
- Dequeue and process tasks in order
- Update task status (pending → running → completed/failed)
- Persist queue to disk after every change

**Key Methods:**
```javascript
class MessageQueue {
  enqueue(task)           // Add task to queue
  dequeue()               // Get next pending task
  updateStatus(taskId, status, result/error)  // Update task state
  getQueue()              // Return all queued tasks
  saveState()             // Persist to disk
  loadState()             // Restore from disk
}
```

**Queue State Structure:**
```json
{
  "currentRepo": "tcc",
  "tasks": [
    {
      "id": "uuid-1234",
      "messageId": 12345,
      "chatId": 8590514646,
      "type": "claude_prompt",
      "repo": "tcc",
      "prompt": "Refactor button component",
      "status": "pending|running|completed|failed",
      "createdAt": 1705329600000,
      "startedAt": null,
      "completedAt": null,
      "result": null,
      "error": null,
      "retries": 0
    }
  ]
}
```

#### 2. `taskManager.js`
Executes queued tasks with activity-based monitoring.

**Responsibilities:**
- Poll queue for next pending task
- Spawn Claude Code process with all necessary parameters
- Monitor stdout/stderr for activity
- Detect stuck processes (no activity for 30+ seconds) vs legitimate long-running operations
- Update queue with results
- Emit events for status changes

**Key Methods:**
```javascript
class TaskManager {
  constructor(queue)
  start()                 // Begin processing queue
  stop()                  // Stop processing
  processTask(task)       // Execute single task
  checkActivityTimeout()  // Monitor for stuck processes
}
```

**Activity Monitoring Logic:**
- Timer resets every time data arrives on stdout/stderr
- If no data arrives for 30 seconds → process is stuck, kill it
- If data arrives continuously → process is working (no timeout)
- Example: A 15-minute Claude operation is fine if it sends at least 1 byte every 30 seconds

#### 3. Modify `server.js`
Update message handler to use queue instead of immediate execution.

**Changes:**
```javascript
// OLD - immediate spawn
bot.on('message', (msg) => {
  // spawn and wait
})

// NEW - enqueue and defer
bot.on('message', async (msg) => {
  const task = {
    id: uuid(),
    messageId: msg.message_id,
    chatId: msg.chat.id,
    prompt: msg.text,
    repo: currentRepo,
    status: 'pending'
  }
  
  queue.enqueue(task)
  
  // Show queue position
  const position = queue.getQueue().length
  bot.sendMessage(msg.chat.id, `⏳ Added to queue (position ${position})`)
})
```

**New Commands:**
- `/queue` - Show all pending and running tasks
- `/cancel <task_id>` - Kill running task and mark as cancelled
- Auto-update original message when task completes

## Implementation Steps

### Phase 1: Queue Infrastructure
1. Create `messageQueue.js` with full queue management
2. Update `.telegram-claude-state.json` schema to include `tasks` array
3. Test queue persistence (save/load across server restarts)

### Phase 2: Task Execution Engine
1. Create `taskManager.js` with activity-based monitoring
2. Replace fixed 2-minute timeout with activity timeout (30 seconds = no data = stuck)
3. Implement process lifecycle: spawn → monitor → kill/complete → update queue

### Phase 3: Telegram Integration
1. Modify message handler to enqueue instead of spawn
2. Add `/queue` command to show status
3. Implement message editing to update task progress
4. Add `/cancel` command to kill running tasks

### Phase 4: Polish & Recovery
1. Implement retry logic (exponential backoff: 1x, 2x, 4x delay)
2. Add server startup recovery (resume queued tasks)
3. Add task cleanup (remove old completed tasks after N hours)
4. Improve Telegram feedback with better status messages

## Activity Timeout Explained

**What it is NOT:**
- It's NOT "kill the process after X minutes of real time"
- It's NOT enforcing a maximum execution time

**What it IS:**
- It's "kill the process if it hasn't sent ANY data for 30 seconds"
- A process that takes 1 hour but continuously outputs data = no timeout
- A process that hangs silently after 5 seconds = timeout

**Example Scenarios:**

✅ **15-minute long Claude session (OK):**
```
Time 0:00 - Process starts
Time 0:05 - Sends first chunk of output "Analyzing..."
Time 5:00 - Sends more output "Building component..."
Time 10:00 - Sends more output "Testing..."
Time 15:00 - Sends final output "Done!"
→ No timeout because data arrives regularly
```

❌ **Hung process (TIMEOUT):**
```
Time 0:00 - Process starts
Time 0:05 - No output sent
Time 0:30 - No output sent for 30 seconds
→ TIMEOUT: Kill process, mark as failed
```

## Concurrency Model

**Initial approach: Serial processing**
- Only 1 Claude process runs at a time
- Simplest to implement, guarantees FIFO ordering
- Future: Can add 2-3 concurrent workers if needed

## State Management

**Persistence:**
- Extend existing `.telegram-claude-state.json` to include `tasks` array
- Write to disk after every state change (atomic: temp file + rename)
- Load queue on server startup

**Recovery:**
- Tasks marked as "running" when server crashes = resume with 1 retry
- Failed tasks = automatic retry with exponential backoff
- Users can manually retry via `/cancel` + new message

## Telegram Feedback Messages

**When task is enqueued:**
```
⏳ Added to queue (position 3)
Estimated wait: ~6 minutes
```

**When task starts:**
```
▶️ Running your request now...
```

**When task completes (edit original message):**
```
✅ Svar:
```claude
Result output...
```
```

**When task fails:**
```
❌ Error: Process timed out or crashed
Retrying... (attempt 2/3)
```

## New Commands

### `/queue`
Show all pending and running tasks
```
📋 Task Queue:
1. (running) Refactor button component [5min elapsed]
2. (pending) Add dark mode support
3. (pending) Fix memory leak
```

### `/cancel <task_id>`
Stop running task
```
❌ Task cancelled
```

## Configuration

**Environment Variables (`.env`):**
```
ACTIVITY_TIMEOUT_MS=30000      # No data for 30s = stuck
MAX_RETRIES=3                  # Retry failed tasks
RETRY_BACKOFF_BASE=1000        # Exponential backoff in ms
MAX_CONCURRENT_TASKS=1         # Serial processing initially
QUEUE_CLEANUP_HOURS=24         # Remove old completed tasks
```

## Testing Checklist

- [ ] Queue persists across server restarts
- [ ] Tasks process in FIFO order
- [ ] Activity timeout works (stuck process killed after 30s)
- [ ] Long operations (15+ min) complete successfully
- [ ] Failed tasks retry automatically
- [ ] `/queue` command shows correct status
- [ ] `/cancel` command kills running task
- [ ] Messages update in place instead of duplicating
- [ ] Error messages are informative

## Future Enhancements

1. Parallel execution (2-3 concurrent workers per repo)
2. Task priority levels (high/normal/low)
3. Scheduled execution (run at specific time)
4. Task dependencies (wait for task X before running task Y)
5. Web dashboard to monitor queue status
6. Persistent task history with completion times
