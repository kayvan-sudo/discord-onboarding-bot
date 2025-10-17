const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const COMMAND_NAME = 'test-onboard';

module.exports = {
  data: new SlashCommandBuilder()
    .setName(COMMAND_NAME)
    .setDescription('Test the private channel onboarding flow (Admin/Owner only)')
    .setDMPermission(false),

  async execute(interaction) {
    // Define admin/owner role IDs - these should match your server setup
    const adminRoleIds = [
      '1311452842740900860', // Owner
      '1408123654213992528', // Admin
    ];

    // Check if user has admin permissions using auto-detection
    const { checkMemberAdminPermissions } = require('../../services/server-config');
    const adminCheck = await checkMemberAdminPermissions(interaction.member);

    if (!adminCheck.isAdmin) {
      return interaction.reply({
        content: `❌ You do not have permission to use this command.\n\nYou must have administrative permissions.\n\n**Reason:** ${adminCheck.reason}`,
        flags: 64 // InteractionResponseFlags.Ephemeral
      });
    }

    // Check if user is already in an onboarding session
    const onboardingService = require('../../services/onboarding');
    if (onboardingService.isUserOnboarding(interaction.user.id)) {
      return interaction.reply({
        content: '❌ You are already in an active onboarding session. Please complete your current onboarding first.',
        flags: 64
      });
    }

    try {
      await interaction.deferReply({ flags: 64 });

      // Import services
      const channelService = require('../../services/channels');

      // ALWAYS create a private test channel
      const testChannel = await channelService.createTestChannel(interaction.member);

      if (testChannel && !testChannel.error) {
        // Send test welcome message and start onboarding in the private channel
        await channelService.sendTestWelcomeMessage(testChannel, interaction.member);
        await onboardingService.startTestOnboarding(testChannel, interaction.member);

        await interaction.followUp({
          content: `✅ **Test Mode Started!**\n\nI've created a private test channel for you: <#${testChannel.id}>\n\nGo there to test the complete onboarding flow. This is a **test session** - no real role changes will be made, but all data will be logged to sheets with a test indicator.`,
          flags: 64
        });

        console.log(`🧪 Admin ${interaction.user.tag} started test onboarding in ${testChannel.name}`);
      } else {
        // Handle error case with detailed information
        const errorMessage = testChannel?.error || 'Unknown error occurred';
        const errorCode = testChannel?.code || 'N/A';

        console.error(`❌ Failed to create test channel for ${interaction.user.tag}:`, {
          error: errorMessage,
          code: errorCode,
          user: interaction.user.tag,
          guild: interaction.guild.name
        });

        // Provide user-friendly error message
        let userMessage = '❌ Failed to create test channel. ';
        if (errorMessage.includes('permission')) {
          userMessage += 'The bot may be missing required permissions. Please check that the bot has "Manage Channels" and "Manage Permissions" permissions.';
        } else if (errorMessage.includes('Maximum number of channels')) {
          userMessage += 'The server has reached the maximum number of channels allowed by Discord.';
        } else {
          userMessage += `Error: ${errorMessage}`;
        }

        userMessage += '\n\nPlease check the bot logs for more details.';

        await interaction.followUp({
          content: userMessage,
          flags: 64
        });
      }

    } catch (error) {
      console.error('Error starting test onboarding:', error);
      await interaction.followUp({
        content: '❌ Something went wrong while starting test onboarding. Please try again.',
        flags: 64
      });
    }
  },
};
