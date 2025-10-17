const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const { REST, Routes } = require('discord.js');

dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env'), override: true });

const DISCORD_TOKEN = (process.env.DISCORD_TOKEN || '').trim();
const APPLICATION_ID = (process.env.APPLICATION_ID || '').trim();
const GUILD_ID = (process.env.GUILD_ID || '').trim(); // optional: for per-guild registration during dev

if (!DISCORD_TOKEN) throw new Error('DISCORD_TOKEN missing');
if (!APPLICATION_ID) throw new Error('APPLICATION_ID missing');

function loadSlashCommands() {
  const commandsDir = path.join(__dirname, 'commands');
  const files = fs.readdirSync(commandsDir).filter(f => f.endsWith('.js'));
  return files.map(f => require(path.join(commandsDir, f)).data.toJSON());
}

async function main(guildId = null) {
  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
  const body = loadSlashCommands();

  // Use provided guildId, or GUILD_ID from env, or register globally
  const targetGuildId = guildId || GUILD_ID;

  if (targetGuildId) {
    await rest.put(Routes.applicationGuildCommands(APPLICATION_ID, targetGuildId), { body });
    console.log(`✅ Registered ${body.length} command(s) to guild ${targetGuildId}`);
  } else {
    await rest.put(Routes.applicationCommands(APPLICATION_ID), { body });
    console.log(`🌍 Registered ${body.length} global command(s) (may take up to 1 hour)`);
  }
}

// If a guild ID is provided as command line argument, use it
const providedGuildId = process.argv[2];
if (providedGuildId) {
  console.log(`🎯 Registering commands for guild: ${providedGuildId}`);
  main(providedGuildId).catch((e) => { console.error(e); process.exit(1); });
} else {
  main().catch((e) => { console.error(e); process.exit(1); });
}

