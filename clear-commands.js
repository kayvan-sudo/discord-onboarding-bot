const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const { REST, Routes } = require('discord.js');

dotenv.config({ path: path.resolve(__dirname, '.env'), override: true });

const DISCORD_TOKEN = (process.env.DISCORD_TOKEN || '').trim();
const APPLICATION_ID = (process.env.APPLICATION_ID || '').trim();
const GUILD_ID = (process.env.GUILD_ID || '').trim();

if (!DISCORD_TOKEN) throw new Error('DISCORD_TOKEN missing');
if (!APPLICATION_ID) throw new Error('APPLICATION_ID missing');

async function clearCommands() {
  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

  try {
    console.log('🧹 Clearing existing commands...');

    if (GUILD_ID) {
      // Clear guild-specific commands
      await rest.put(Routes.applicationGuildCommands(APPLICATION_ID, GUILD_ID), { body: [] });
      console.log(`✅ Cleared guild commands for guild ${GUILD_ID}`);
    } else {
      // Clear global commands
      await rest.put(Routes.applicationCommands(APPLICATION_ID), { body: [] });
      console.log('✅ Cleared global commands');
    }

    console.log('🎉 All commands cleared successfully!');
  } catch (error) {
    console.error('❌ Error clearing commands:', error);
    process.exit(1);
  }
}

clearCommands();







