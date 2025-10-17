const { Client, GatewayIntentBits } = require('discord.js');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

async function diagnoseBot() {
  console.log('🔍 Diagnosing Vaulty Bot Connection...\n');

  // Check environment variables
  console.log('📋 Environment Check:');
  console.log('DISCORD_TOKEN:', process.env.DISCORD_TOKEN ? '✅ Set' : '❌ Missing');
  console.log('APPLICATION_ID:', process.env.APPLICATION_ID ? `✅ Set (${process.env.APPLICATION_ID})` : '❌ Missing');

  if (!process.env.DISCORD_TOKEN) {
    console.log('\n❌ Cannot diagnose without DISCORD_TOKEN');
    return;
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
    ]
  });

  try {
    console.log('\n🔌 Attempting to connect to Discord...');

    client.once('ready', async () => {
      console.log('\n✅ Bot Connected Successfully!');
      console.log('🤖 Bot Info:');
      console.log('  Username:', client.user.username);
      console.log('  Discriminator:', client.user.discriminator);
      console.log('  Client ID:', client.user.id);
      console.log('  Application ID:', process.env.APPLICATION_ID || client.user.id);

      console.log('\n🏠 Server Membership:');
      console.log('  Total Servers:', client.guilds.cache.size);
      console.log('  Server Limit: 100');

      if (client.guilds.cache.size >= 95) {
        console.log('  ⚠️  WARNING: Close to server limit!');
      }

      console.log('\n🔗 Correct Invite Link:');
      const applicationId = process.env.APPLICATION_ID || client.user.id;
      const inviteLink = `https://discord.com/api/oauth2/authorize?client_id=${applicationId}&permissions=268435456&scope=bot%20applications.commands`;
      console.log('  ', inviteLink);

      console.log('\n📋 Invite Link Breakdown:');
      console.log('  Client ID:', applicationId);
      console.log('  Permissions:', '268435456 (Manage Roles, Send Messages, etc.)');
      console.log('  Scopes:', 'bot, applications.commands');

      console.log('\n🎯 Next Steps:');
      console.log('1. Use the invite link above to add the bot to your server');
      console.log('2. Ensure you have "Manage Server" permissions in the target server');
      console.log('3. Check that the server has space for another bot member');

      await client.destroy();
      process.exit(0);
    });

    client.once('error', (error) => {
      console.log('\n❌ Connection Error:', error.message);
      process.exit(1);
    });

    await client.login(process.env.DISCORD_TOKEN);

    // Timeout after 10 seconds
    setTimeout(() => {
      console.log('\n⏰ Connection timeout - check your token and internet connection');
      client.destroy();
      process.exit(1);
    }, 10000);

  } catch (error) {
    console.log('\n❌ Login Failed:', error.message);
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Check your DISCORD_TOKEN in .env file');
    console.log('2. Ensure the token hasn\'t expired');
    console.log('3. Verify the bot has correct permissions in Discord Developer Portal');
    console.log('4. Check your internet connection');
    process.exit(1);
  }
}

diagnoseBot();







