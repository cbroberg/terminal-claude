// telegram-claude.js
import TelegramBot from 'node-telegram-bot-api';
import { exec, spawn } from 'child_process';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import 'dotenv/config';

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
const ALLOWED_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Definer dine repositories
const REPOS = {
  'web': '/Users/dit-navn/projects/web-app',
  'api': '/Users/dit-navn/projects/api-backend',
  'mobile': '/Users/dit-navn/projects/mobile-app',
  'experiments': '/Users/dit-navn/experiments'
};

// State management
const STATE_FILE = '.telegram-claude-state.json';
let currentRepo = null;
let pendingCommit = null;

// Active Claude Code sessions per repo
const activeSessions = new Map();

// Load state
async function loadState() {
  if (existsSync(STATE_FILE)) {
    const data = await readFile(STATE_FILE, 'utf-8');
    const state = JSON.parse(data);
    currentRepo = state.currentRepo;
  }
}

// Save state
async function saveState() {
  await writeFile(STATE_FILE, JSON.stringify({ currentRepo }));
}

// Start bot
await loadState();

// Command: /help - Vis alle commands
bot.onText(/\/help/, (msg) => {
  if (msg.chat.id.toString() !== ALLOWED_CHAT_ID) return;
  
  const helpText = `
🤖 *Claude Code Telegram Bot*

*Repository Commands:*
/repos - Vis alle repositories
/web, /api, /mobile - Skift til repo
/status - Vis aktiv repo

*File Commands:*
/ls [path] - List filer
/cat <file> - Vis fil indhold

*Git Commands:*
/git eller /gstatus - Git status
/diff - Vis ændringer
/log [antal] - Vis commits (default: 5)
/branch - Vis branches
/commit <message> - Add, commit og push (med confirmation)
/qc eller /quickcommit - Auto-generer commit message
/pull - Pull changes
/stash - Stash ændringer
/unstash - Pop stash

*Session Commands:*
/session - Start persistent Claude session
/endsession - Stop persistent session
/sessions - Vis aktive sessions

*Andre:*
Send en besked - Kør Claude Code prompt
Send et billede - Gem screenshot i repo
Send en fil - Upload til repo

*Eksempler:*
\`/commit feat: add user authentication\`
\`Refactor Button component til at bruge shadcn/ui\`
\`/qc\` (laver intelligent commit message)
`;
  
  bot.sendMessage(msg.chat.id, helpText, { parse_mode: 'Markdown' });
});

// Start en persistent Claude Code session for en repo
function startClaudeSession(repoName, chatId) {
  if (activeSessions.has(repoName)) {
    return activeSessions.get(repoName);
  }
  
  const repoPath = REPOS[repoName];
  
  const session = spawn('claude-code', ['--interactive'], {
    cwd: repoPath,
    shell: true
  });
  
  const sessionData = {
    process: session,
    repo: repoName,
    active: true,
    chatId: chatId
  };
  
  // Log til console (så du kan følge med på serveren)
  session.stdout.on('data', (data) => {
    console.log(`[${repoName}] STDOUT:`, data.toString());
  });
  
  session.stderr.on('data', (data) => {
    console.error(`[${repoName}] STDERR:`, data.toString());
  });
  
  session.on('close', (code) => {
    console.log(`[${repoName}] Session closed with code ${code}`);
    activeSessions.delete(repoName);
    bot.sendMessage(chatId, `⚠️ Session for ${repoName} blev lukket`);
  });
  
  activeSessions.set(repoName, sessionData);
  return sessionData;
}

// Command: /session - Start persistent session
bot.onText(/\/session/, (msg) => {
  if (msg.chat.id.toString() !== ALLOWED_CHAT_ID) return;
  if (!currentRepo) {
    return bot.sendMessage(msg.chat.id, '⚠️ Vælg først en repo med /repos');
  }
  
  if (activeSessions.has(currentRepo)) {
    bot.sendMessage(msg.chat.id, `✅ Session allerede aktiv for ${currentRepo}`);
  } else {
    startClaudeSession(currentRepo, msg.chat.id);
    bot.sendMessage(msg.chat.id, `🚀 Startet persistent session for ${currentRepo}\nAlle prompts kører nu i samme session med real-time output!`);
  }
});

// Command: /endsession - Stop persistent session
bot.onText(/\/endsession/, (msg) => {
  if (msg.chat.id.toString() !== ALLOWED_CHAT_ID) return;
  if (!currentRepo) {
    return bot.sendMessage(msg.chat.id, '⚠️ Vælg først en repo med /repos');
  }
  
  if (activeSessions.has(currentRepo)) {
    const session = activeSessions.get(currentRepo);
    session.process.kill();
    activeSessions.delete(currentRepo);
    bot.sendMessage(msg.chat.id, `🛑 Session lukket for ${currentRepo}`);
  } else {
    bot.sendMessage(msg.chat.id, `⚠️ Ingen aktiv session for ${currentRepo}`);
  }
});

// Command: /sessions - Vis aktive sessions
bot.onText(/\/sessions/, (msg) => {
  if (msg.chat.id.toString() !== ALLOWED_CHAT_ID) return;
  
  if (activeSessions.size === 0) {
    return bot.sendMessage(msg.chat.id, '⚠️ Ingen aktive sessions\nStart en med /session');
  }
  
  const sessionList = Array.from(activeSessions.keys())
    .map(repo => `✅ ${repo}`)
    .join('\n');
  
  bot.sendMessage(msg.chat.id, `🔄 Aktive sessions:\n\n${sessionList}`);
});

// Command: /repos - Vis tilgængelige repos
bot.onText(/\/repos/, (msg) => {
  if (msg.chat.id.toString() !== ALLOWED_CHAT_ID) return;
  
  const repoList = Object.keys(REPOS)
    .map(key => `/${key} - ${REPOS[key]}`)
    .join('\n');
  
  const current = currentRepo ? `\n\n📂 Aktiv: ${currentRepo}` : '';
  
  bot.sendMessage(msg.chat.id, `📚 Tilgængelige repositories:\n\n${repoList}${current}`);
});

// Command: /web, /api, /mobile etc. - Skift repo
Object.keys(REPOS).forEach(repoName => {
  bot.onText(new RegExp(`^\/${repoName}$`), async (msg) => {
    if (msg.chat.id.toString() !== ALLOWED_CHAT_ID) return;
    
    currentRepo = repoName;
    await saveState();
    bot.sendMessage(msg.chat.id, `✅ Skiftet til: ${repoName}\n📂 ${REPOS[repoName]}`);
  });
});

// Command: /status - Vis aktiv repo
bot.onText(/\/status/, (msg) => {
  if (msg.chat.id.toString() !== ALLOWED_CHAT_ID) return;
  
  if (currentRepo) {
    bot.sendMessage(msg.chat.id, `📂 Aktiv repo: ${currentRepo}\n${REPOS[currentRepo]}`);
  } else {
    bot.sendMessage(msg.chat.id, '⚠️ Ingen repo valgt. Brug /repos for at vælge.');
  }
});

// Command: /ls - List filer i current directory
bot.onText(/\/ls(.*)/, (msg, match) => {
  if (msg.chat.id.toString() !== ALLOWED_CHAT_ID) return;
  if (!currentRepo) {
    return bot.sendMessage(msg.chat.id, '⚠️ Vælg først en repo med /repos');
  }
  
  const subPath = match[1].trim() || '';
  const fullPath = path.join(REPOS[currentRepo], subPath);
  
  exec(`ls -la "${fullPath}"`, (error, stdout, stderr) => {
    if (error) {
      return bot.sendMessage(msg.chat.id, `❌ Error: ${stderr}`);
    }
    bot.sendMessage(msg.chat.id, `📁 ${subPath || '/'}\n\`\`\`\n${stdout}\n\`\`\``, { parse_mode: 'Markdown' });
  });
});

// Command: /cat - Vis fil indhold
bot.onText(/\/cat (.+)/, async (msg, match) => {
  if (msg.chat.id.toString() !== ALLOWED_CHAT_ID) return;
  if (!currentRepo) {
    return bot.sendMessage(msg.chat.id, '⚠️ Vælg først en repo med /repos');
  }
  
  const filePath = match[1];
  const fullPath = path.join(REPOS[currentRepo], filePath);
  
  try {
    const content = await readFile(fullPath, 'utf-8');
    const ext = path.extname(filePath).slice(1);
    
    // Send i chunks hvis filen er stor
    if (content.length > 4000) {
      bot.sendMessage(msg.chat.id, `📄 ${filePath} (for stor, viser første 4000 chars)`);
      bot.sendMessage(msg.chat.id, `\`\`\`${ext}\n${content.slice(0, 4000)}\n\`\`\``, { parse_mode: 'Markdown' });
    } else {
      bot.sendMessage(msg.chat.id, `\`\`\`${ext}\n${content}\n\`\`\``, { parse_mode: 'Markdown' });
    }
  } catch (error) {
    bot.sendMessage(msg.chat.id, `❌ Kunne ikke læse fil: ${error.message}`);
  }
});

// Command: /git eller /gstatus - Vis git status
bot.onText(/\/git$|^\/gstatus$/, (msg) => {
  if (msg.chat.id.toString() !== ALLOWED_CHAT_ID) return;
  if (!currentRepo) {
    return bot.sendMessage(msg.chat.id, '⚠️ Vælg først en repo med /repos');
  }
  
  const repoPath = REPOS[currentRepo];
  
  exec(`cd "${repoPath}" && git status`, (error, stdout, stderr) => {
    if (error) {
      return bot.sendMessage(msg.chat.id, `❌ Error: ${stderr}`);
    }
    bot.sendMessage(msg.chat.id, `🔀 Git Status (${currentRepo}):\n\`\`\`\n${stdout}\n\`\`\``, { parse_mode: 'Markdown' });
  });
});

// Command: /diff - Vis git diff
bot.onText(/\/diff/, (msg) => {
  if (msg.chat.id.toString() !== ALLOWED_CHAT_ID) return;
  if (!currentRepo) {
    return bot.sendMessage(msg.chat.id, '⚠️ Vælg først en repo med /repos');
  }
  
  const repoPath = REPOS[currentRepo];
  
  exec(`cd "${repoPath}" && git diff`, (error, stdout, stderr) => {
    if (error) {
      return bot.sendMessage(msg.chat.id, `❌ Error: ${stderr}`);
    }
    
    if (!stdout) {
      return bot.sendMessage(msg.chat.id, '✨ Ingen ændringer at vise');
    }
    
    // Send i chunks hvis diff er stor
    if (stdout.length > 4000) {
      bot.sendMessage(msg.chat.id, `📝 Diff (første 4000 chars):\n\`\`\`diff\n${stdout.slice(0, 4000)}\n\`\`\``, { parse_mode: 'Markdown' });
    } else {
      bot.sendMessage(msg.chat.id, `📝 Diff:\n\`\`\`diff\n${stdout}\n\`\`\``, { parse_mode: 'Markdown' });
    }
  });
});

// Command: /log - Vis git log
bot.onText(/\/log(?:\s+(\d+))?/, (msg, match) => {
  if (msg.chat.id.toString() !== ALLOWED_CHAT_ID) return;
  if (!currentRepo) {
    return bot.sendMessage(msg.chat.id, '⚠️ Vælg først en repo med /repos');
  }
  
  const limit = match[1] || '5';
  const repoPath = REPOS[currentRepo];
  
  exec(`cd "${repoPath}" && git log --oneline -${limit}`, (error, stdout, stderr) => {
    if (error) {
      return bot.sendMessage(msg.chat.id, `❌ Error: ${stderr}`);
    }
    bot.sendMessage(msg.chat.id, `📜 Seneste commits:\n\`\`\`\n${stdout}\n\`\`\``, { parse_mode: 'Markdown' });
  });
});

// Command: /branch - Vis current branch og branches
bot.onText(/\/branch/, (msg) => {
  if (msg.chat.id.toString() !== ALLOWED_CHAT_ID) return;
  if (!currentRepo) {
    return bot.sendMessage(msg.chat.id, '⚠️ Vælg først en repo med /repos');
  }
  
  const repoPath = REPOS[currentRepo];
  
  exec(`cd "${repoPath}" && git branch -a`, (error, stdout, stderr) => {
    if (error) {
      return bot.sendMessage(msg.chat.id, `❌ Error: ${stderr}`);
    }
    bot.sendMessage(msg.chat.id, `🌿 Branches:\n\`\`\`\n${stdout}\n\`\`\``, { parse_mode: 'Markdown' });
  });
});

// Command: /commit <message> - Add all, commit og push (med confirmation)
bot.onText(/\/commit (.+)/, (msg, match) => {
  if (msg.chat.id.toString() !== ALLOWED_CHAT_ID) return;
  if (!currentRepo) {
    return bot.sendMessage(msg.chat.id, '⚠️ Vælg først en repo med /repos');
  }
  
  const commitMessage = match[1];
  
  bot.sendMessage(msg.chat.id, `⚠️ Dette vil add, commit og push alle ændringer med:\n\n"${commitMessage}"\n\nSend /yes for at bekræfte eller /no for at annullere`, {
    reply_markup: {
      keyboard: [['/yes'], ['/no']],
      one_time_keyboard: true,
      resize_keyboard: true
    }
  });
  
  // Gem pending commit
  pendingCommit = { repo: currentRepo, message: commitMessage };
});

// Command: /yes - Bekræft pending commit
bot.onText(/\/yes/, (msg) => {
  if (msg.chat.id.toString() !== ALLOWED_CHAT_ID) return;
  
  if (!pendingCommit) {
    return bot.sendMessage(msg.chat.id, '⚠️ Ingen pending commit', {
      reply_markup: {
        remove_keyboard: true
      }
    });
  }
  
  const { repo, message } = pendingCommit;
  const repoPath = REPOS[repo];
  
  bot.sendMessage(msg.chat.id, `🔄 Committer og pusher...`, {
    reply_markup: {
      remove_keyboard: true
    }
  });
  
  const commands = [
    `cd "${repoPath}"`,
    `git add .`,
    `git commit -m "${message.replace(/"/g, '\\"')}"`,
    `git push`
  ].join(' && ');
  
  exec(commands, (error, stdout, stderr) => {
    pendingCommit = null;
    
    if (error) {
      if (stderr.includes('nothing to commit')) {
        return bot.sendMessage(msg.chat.id, '✨ Ingen ændringer at committe');
      }
      return bot.sendMessage(msg.chat.id, `❌ Error:\n${stderr}`);
    }
    
    const output = stdout + stderr;
    bot.sendMessage(msg.chat.id, `✅ Committed og pushed!\n\`\`\`\n${output}\n\`\`\``, { parse_mode: 'Markdown' });
  });
});

// Command: /no - Annuller pending commit
bot.onText(/\/no/, (msg) => {
  if (msg.chat.id.toString() !== ALLOWED_CHAT_ID) return;
  
  pendingCommit = null;
  bot.sendMessage(msg.chat.id, '❌ Commit annulleret', {
    reply_markup: {
      remove_keyboard: true
    }
  });
});

// Helper function til at generere commit message
function generateCommitMessage(repoPath, diff, chatId) {
  const prompt = `Based on this git diff, write a concise commit message (max 72 chars, conventional commits style if possible):\n\n${diff.slice(0, 2000)}`;
  
  exec(`cd "${repoPath}" && claude-code --prompt "${prompt.replace(/"/g, '\\"')}"`, 
    { cwd: repoPath }, 
    (error, stdout, stderr) => {
      if (error) {
        return bot.sendMessage(chatId, `❌ Kunne ikke generere commit message: ${stderr}`);
      }
      
      // Extract commit message fra output
      const commitMsg = stdout.trim().split('\n')[0].replace(/^["']|["']$/g, '');
      
      bot.sendMessage(chatId, `💡 Foreslået commit:\n"${commitMsg}"\n\nCommitter med:\n/commit ${commitMsg}\n\nEller skriv din egen commit message`);
    }
  );
}

// Command: /quickcommit eller /qc - Lad Claude Code lave commit message
bot.onText(/\/quickcommit|\/qc/, (msg) => {
  if (msg.chat.id.toString() !== ALLOWED_CHAT_ID) return;
  if (!currentRepo) {
    return bot.sendMessage(msg.chat.id, '⚠️ Vælg først en repo med /repos');
  }
  
  const repoPath = REPOS[currentRepo];
  
  bot.sendMessage(msg.chat.id, `🤔 Analyserer ændringer...`);
  
  // Få git diff til at lave en smart commit message
  exec(`cd "${repoPath}" && git diff --cached`, (error, stdout, stderr) => {
    if (error) {
      return bot.sendMessage(msg.chat.id, `❌ Error: ${stderr}`);
    }
    
    if (!stdout) {
      // Intet staged, stage alt først
      exec(`cd "${repoPath}" && git add . && git diff --cached`, (error2, stdout2) => {
        if (error2) {
          return bot.sendMessage(msg.chat.id, `❌ Error: ${error2.message}`);
        }
        
        if (!stdout2) {
          return bot.sendMessage(msg.chat.id, '✨ Ingen ændringer at committe');
        }
        
        generateCommitMessage(repoPath, stdout2, msg.chat.id);
      });
    } else {
      generateCommitMessage(repoPath, stdout, msg.chat.id);
    }
  });
});

// Command: /pull - Git pull
bot.onText(/\/pull/, (msg) => {
  if (msg.chat.id.toString() !== ALLOWED_CHAT_ID) return;
  if (!currentRepo) {
    return bot.sendMessage(msg.chat.id, '⚠️ Vælg først en repo med /repos');
  }
  
  const repoPath = REPOS[currentRepo];
  
  bot.sendMessage(msg.chat.id, `⬇️ Puller changes...`);
  
  exec(`cd "${repoPath}" && git pull`, (error, stdout, stderr) => {
    if (error) {
      return bot.sendMessage(msg.chat.id, `❌ Error: ${stderr}`);
    }
    
    const output = stdout || stderr;
    bot.sendMessage(msg.chat.id, `✅ Pull complete!\n\`\`\`\n${output}\n\`\`\``, { parse_mode: 'Markdown' });
  });
});

// Command: /stash - Git stash
bot.onText(/\/stash/, (msg) => {
  if (msg.chat.id.toString() !== ALLOWED_CHAT_ID) return;
  if (!currentRepo) {
    return bot.sendMessage(msg.chat.id, '⚠️ Vælg først en repo med /repos');
  }
  
  const repoPath = REPOS[currentRepo];
  
  exec(`cd "${repoPath}" && git stash`, (error, stdout, stderr) => {
    if (error) {
      return bot.sendMessage(msg.chat.id, `❌ Error: ${stderr}`);
    }
    bot.sendMessage(msg.chat.id, `📦 Stashed!\n\`\`\`\n${stdout}\n\`\`\``, { parse_mode: 'Markdown' });
  });
});

// Command: /unstash - Git stash pop
bot.onText(/\/unstash/, (msg) => {
  if (msg.chat.id.toString() !== ALLOWED_CHAT_ID) return;
  if (!currentRepo) {
    return bot.sendMessage(msg.chat.id, '⚠️ Vælg først en repo med /repos');
  }
  
  const repoPath = REPOS[currentRepo];
  
  exec(`cd "${repoPath}" && git stash pop`, (error, stdout, stderr) => {
    if (error) {
      return bot.sendMessage(msg.chat.id, `❌ Error: ${stderr}`);
    }
    bot.sendMessage(msg.chat.id, `📂 Unstashed!\n\`\`\`\n${stdout}\n\`\`\``, { parse_mode: 'Markdown' });
  });
});

// Handle dokumenter/filer sendt til botten
bot.on('document', async (msg) => {
  if (msg.chat.id.toString() !== ALLOWED_CHAT_ID) return;
  if (!currentRepo) {
    return bot.sendMessage(msg.chat.id, '⚠️ Vælg først en repo med /repos');
  }
  
  const fileId = msg.document.file_id;
  const fileName = msg.document.file_name;
  
  bot.sendMessage(msg.chat.id, `📥 Modtager ${fileName}...`);
  
  try {
    const file = await bot.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_TOKEN}/${file.file_path}`;
    
    // Download fil til current repo
    const savePath = path.join(REPOS[currentRepo], fileName);
    
    exec(`curl -o "${savePath}" "${fileUrl}"`, (error) => {
      if (error) {
        return bot.sendMessage(msg.chat.id, `❌ Kunne ikke gemme fil: ${error.message}`);
      }
      bot.sendMessage(msg.chat.id, `✅ Gemt: ${fileName}\nBrug nu Claude Code til at arbejde med den!`);
    });
  } catch (error) {
    bot.sendMessage(msg.chat.id, `❌ Error: ${error.message}`);
  }
});

// Handle screenshots/billeder
bot.on('photo', async (msg) => {
  if (msg.chat.id.toString() !== ALLOWED_CHAT_ID) return;
  
  const photo = msg.photo[msg.photo.length - 1]; // Højeste kvalitet
  const fileId = photo.file_id;
  
  bot.sendMessage(msg.chat.id, `📸 Modtager screenshot...`);
  
  try {
    const file = await bot.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_TOKEN}/${file.file_path}`;
    
    if (currentRepo) {
      const timestamp = Date.now();
      const savePath = path.join(REPOS[currentRepo], `screenshot-${timestamp}.jpg`);
      
      exec(`curl -o "${savePath}" "${fileUrl}"`, (error) => {
        if (error) {
          return bot.sendMessage(msg.chat.id, `❌ Kunne ikke gemme: ${error.message}`);
        }
        bot.sendMessage(msg.chat.id, `✅ Gemt screenshot!\nNu kan du prompte: "Implementer UI fra screenshot-${timestamp}.jpg"`);
      });
    } else {
      bot.sendMessage(msg.chat.id, `⚠️ Vælg først en repo med /repos for at gemme screenshot`);
    }
  } catch (error) {
    bot.sendMessage(msg.chat.id, `❌ Error: ${error.message}`);
  }
});

// Handle normale beskeder (prompts til Claude Code)
bot.on('message', async (msg) => {
  // Skip hvis det er en command eller fil
  if (msg.text?.startsWith('/') || msg.document || msg.photo) return;
  if (msg.chat.id.toString() !== ALLOWED_CHAT_ID) return;
  
  if (!currentRepo) {
    return bot.sendMessage(msg.chat.id, '⚠️ Vælg først en repo med /repos');
  }
  
  const prompt = msg.text;
  const repoPath = REPOS[currentRepo];
  
  // Tjek om der er en aktiv session
  if (activeSessions.has(currentRepo)) {
    // Brug persistent session
    const session = activeSessions.get(currentRepo);
    
    bot.sendMessage(msg.chat.id, `🤔 Kører i ${currentRepo} session...`);
    
    let outputBuffer = '';
    let statusMsgId = null;
    let lastUpdate = Date.now();
    const startTime = Date.now();
    
    // Listener til at fange output
    const outputHandler = (data) => {
      const text = data.toString();
      outputBuffer += text;
      
      // Stream output tilbage til Telegram (update hvert 2 sekund)
      const now = Date.now();
      if (now - lastUpdate > 2000) {
        const elapsed = Math.floor((now - startTime) / 1000);
        const preview = outputBuffer.slice(-800);
        
        if (statusMsgId) {
          bot.editMessageText(`🔄 Arbejder... (${elapsed}s)\n\`\`\`\n${preview}\n\`\`\``, {
            chat_id: msg.chat.id,
            message_id: statusMsgId,
            parse_mode: 'Markdown'
          }).catch(() => {}); // Ignorer rate limit errors
        } else {
          bot.sendMessage(msg.chat.id, `🔄 Arbejder... (${elapsed}s)\n\`\`\`\n${preview}\n\`\`\``, {
            parse_mode: 'Markdown'
          }).then(sentMsg => {
            statusMsgId = sentMsg.message_id;
          }).catch(() => {});
        }
        lastUpdate = now;
      }
    };
    
    const errorHandler = (data) => {
      console.error(`[${currentRepo}] ERROR:`, data.toString());
    };
    
    session.process.stdout.on('data', outputHandler);
    session.process.stderr.on('data', errorHandler);
    
    // Send prompt til session
    session.process.stdin.write(prompt + '\n');
    
    // Vent på completion (du kan gøre dette smartere med prompts/markers)
    setTimeout(() => {
      session.process.stdout.removeListener('data', outputHandler);
      session.process.stderr.removeListener('data', errorHandler);
      
      if (outputBuffer.length > 3500) {
        bot.sendMessage(msg.chat.id, `✅ Done! (Output for langt, viser sidste 3500 chars)`);
        bot.sendMessage(msg.chat.id, `\`\`\`\n${outputBuffer.slice(-3500)}\n\`\`\``, { parse_mode: 'Markdown' });
      } else if (outputBuffer.trim()) {
        bot.sendMessage(msg.chat.id, `✅ Done!\n\`\`\`\n${outputBuffer}\n\`\`\``, { parse_mode: 'Markdown' });
      } else {
        bot.sendMessage(msg.chat.id, `✅ Done! (ingen output)`);
      }
    }, 45000); // 45 sekunder timeout
    
  } else {
    // One-shot execution med real-time streaming
    bot.sendMessage(msg.chat.id, `🤔 Kører i ${currentRepo}...`);
    
    const process = spawn('claude-code', ['--prompt', prompt], {
      cwd: repoPath,
      shell: true
    });
    
    let outputBuffer = '';
    let errorBuffer = '';
    let statusMsgId = null;
    let lastUpdate = Date.now();
    
    // Stream stdout tilbage til Telegram i real-time
    process.stdout.on('data', (data) => {
      const text = data.toString();
      outputBuffer += text;
      console.log(`[${currentRepo}] ${text}`);
      
      // Send updates hver 3 sekunder
      const now = Date.now();
      if (now - lastUpdate > 3000 && outputBuffer.length > 100) {
        const preview = outputBuffer.slice(-800);
        
        if (statusMsgId) {
          bot.editMessageText(`📝 Processing...\n\`\`\`\n${preview}\n\`\`\``, {
            chat_id: msg.chat.id,
            message_id: statusMsgId,
            parse_mode: 'Markdown'
          }).catch(() => {});
        } else {
          bot.sendMessage(msg.chat.id, `📝 Processing...\n\`\`\`\n${preview}\n\`\`\``, {
            parse_mode: 'Markdown'
          }).then(sentMsg => {
            statusMsgId = sentMsg.message_id;
          }).catch(() => {});
        }
        lastUpdate = now;
      }
    });
    
    process.stderr.on('data', (data) => {
      const text = data.toString();
      errorBuffer += text;
      console.error(`[${currentRepo}] ERROR: ${text}`);
    });
    
    process.on('close', (code) => {
      if (code !== 0) {
        bot.sendMessage(msg.chat.id, `❌ Error:\n\`\`\`\n${errorBuffer}\n\`\`\``, { parse_mode: 'Markdown' });
      } else {
        const output = outputBuffer.trim() || 'Done!';
        if (output.length > 3500) {
          bot.sendMessage(msg.chat.id, `✅ Done! (viser sidste 3500 chars)`);
          bot.sendMessage(msg.chat.id, `\`\`\`\n${output.slice(-3500)}\n\`\`\``, { parse_mode: 'Markdown' });
        } else {
          bot.sendMessage(msg.chat.id, `✅ Done!\n\n${output}`);
        }
      }
    });
  }
});

console.log('🚀 Telegram Claude Bot ready!');
console.log(`📂 Repositories: ${Object.keys(REPOS).join(', ')}`);
if (currentRepo) {
  console.log(`✅ Active: ${currentRepo}`);
}
console.log('\nSend /help i Telegram for at se alle commands');
