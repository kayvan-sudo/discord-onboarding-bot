const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const COMMAND_NAME = 'onboard';

module.exports = {
  data: new SlashCommandBuilder()
    .setName(COMMAND_NAME)
    .setDescription('Start interactive onboarding process')
    .setDMPermission(false),

  async execute(interaction) {
    const member = interaction.member;
    const guild = interaction.guild;

    // Check permissions more dynamically:
    // 1. Server owner always allowed
    // 2. Users with Administrator permission
    // 3. Users with Onboarding role (for completing onboarding)
    // 4. Users with common admin/staff role names

    let hasPermission = false;

    // 1. Server owner
    if (member.id === guild.ownerId) {
      hasPermission = true;
    }

    // 2. Administrator permission
    if (!hasPermission && member.permissions.has('Administrator')) {
      hasPermission = true;
    }

    // 3. Onboarding role (for users completing onboarding)
    if (!hasPermission) {
      const onboardingRole = guild.roles.cache.find(role => role.name.toLowerCase() === 'onboarding');
      if (onboardingRole && member.roles.cache.has(onboardingRole.id)) {
        hasPermission = true;
      }
    }

    // 4. Common admin/staff role names
    if (!hasPermission) {
      const adminRoleNames = ['admin', 'administrator', 'mod', 'moderator', 'staff', 'helper', 'help', 'owner'];
      const hasAdminRole = member.roles.cache.some(role =>
        adminRoleNames.includes(role.name.toLowerCase())
      );
      if (hasAdminRole) {
        hasPermission = true;
      }
    }

    if (!hasPermission) {
      return interaction.reply({
        content: '❌ You do not have permission to use this command.\n\nYou must have one of the following roles:\n• Onboarding (to complete your onboarding)\n• Staff roles (Owner, Admin, Mod, or Help for testing purposes)',
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

    // Start the interactive onboarding process
    try {
      await interaction.deferReply({ flags: 64 });

      const channelService = require('../../services/channels');

      // ALWAYS create a private onboarding channel
      const privateChannel = await channelService.createOnboardingChannel(interaction.member);

      if (privateChannel && !privateChannel.error) {
        // Send welcome message and start onboarding in the private channel
        await channelService.sendWelcomeMessage(privateChannel, interaction.member);
        await onboardingService.startOnboarding(privateChannel, interaction.member);

        await interaction.followUp({
          content: `✅ **Onboarding Started!**\n\nI've created a private channel for you: <#${privateChannel.id}>\n\nGo there to complete your onboarding with me!`,
          flags: 64
        });

        console.log(`✅ User ${interaction.user.tag} started onboarding via /onboard command`);
      } else {
        const errorMessage = privateChannel?.error || 'Unknown error occurred';
        console.error(`❌ Failed to create onboarding channel for ${interaction.user.tag}:`, errorMessage);

        await interaction.followUp({
          content: `❌ Sorry, I couldn't create your private onboarding channel. Please try again.\n\nError: ${errorMessage}`,
          flags: 64
        });
      }

    } catch (error) {
      console.error('Error starting onboarding:', error);
      await interaction.followUp({
        content: '❌ Something went wrong while starting onboarding. Please try again.',
        flags: 64
      });
    }
  },

};

