module.exports = function handleMessages(client) {
  // Handle new member joins - create private onboarding channel
  client.on('guildMemberAdd', async (member) => {
    try {
      console.log(`👋 New member joined: ${member.user.tag} in ${member.guild.name}`);

      // Import services
      const channelService = require('../services/channels');
      const rolesService = require('../services/roles');

      // Assign restricted onboarding role first
      await rolesService.assignInitialRole(member);

      // Create private onboarding channel for this user
      const privateChannel = await channelService.createOnboardingChannel(member);

      if (privateChannel && !privateChannel.error) {
        // Send welcome message in the private channel
        await channelService.sendWelcomeMessage(privateChannel, member);

        // Start the interactive onboarding process
        const onboardingService = require('../services/onboarding');
        await onboardingService.startOnboarding(privateChannel, member);

        console.log(`✅ Private onboarding channel created for ${member.user.tag}`);
      } else {
        // Handle channel creation error
        const errorMessage = privateChannel?.error || 'Unknown error occurred';
        console.error(`❌ Failed to create onboarding channel for ${member.user.tag}:`, errorMessage);

        // Try to send a fallback message in a public channel or DM
        try {
          // Try to find a general channel or send DM
          const generalChannel = member.guild.channels.cache.find(
            ch => ch.type === 0 && (ch.name.includes('general') || ch.name.includes('main') || ch.name.includes('welcome'))
          );

          if (generalChannel) {
            await generalChannel.send(`<@${member.id}> Welcome! There was an issue setting up your private onboarding channel. Please contact an admin for assistance.`);
          } else {
            // Try to DM the user
            try {
              await member.send(`Welcome to the server! There was an issue setting up your private onboarding channel. Please contact an admin for assistance.`);
            } catch (dmError) {
              console.error('Could not send fallback message to user:', dmError);
            }
          }
        } catch (fallbackError) {
          console.error('Error sending fallback message:', fallbackError);
        }
      }

    } catch (error) {
      console.error('Error handling new member join:', error);
    }
  });

  // Handle regular messages
  client.on('messageCreate', async (message) => {
    // Ignore bot messages
    if (message.author.bot) return;

    // Handle onboarding responses first
    const onboardingService = require('../services/onboarding');
    const isOnboardingResponse = await onboardingService.handleResponse(message);
    if (isOnboardingResponse) return;

    // Handle custom commands
    const content = message.content.toLowerCase().trim();

    // !vaulty command
    if (content === '!vaulty') {
      try {
        const response = "👋 Hi! I'm Vaulty, The Creator Vault's onboarding assistant. I'm here to help new creators get set up and welcome them to our amazing community!";
        await message.reply(response);
      } catch (error) {
        console.error('Error handling !vaulty command:', error);
      }
    }
  });
};

