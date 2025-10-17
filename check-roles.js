const { Client, GatewayIntentBits } = require('discord.js');
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

client.login(process.env.DISCORD_TOKEN).then(() => {
  console.log('Bot logged in successfully');
  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  if (guild) {
    return guild.roles.fetch().then(roles => {
      const roleNames = roles.map(r => r.name);
      console.log('Available roles:', roleNames.join(', '));
      const hasOnboarding = roleNames.includes('Onboarding');
      const hasOnboarded = roleNames.includes('Onboarded');
      console.log('Has Onboarding role:', hasOnboarding);
      console.log('Has Onboarded role:', hasOnboarded);
      process.exit(0);
    });
  } else {
    console.log('Guild not found');
    process.exit(1);
  }
}).catch(err => {
  console.error('Login failed:', err.message);
  process.exit(1);
});








