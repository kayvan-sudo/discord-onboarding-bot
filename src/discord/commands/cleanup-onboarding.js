const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const COMMAND_NAME = 'cleanup-onboarding';

module.exports = {
  data: new SlashCommandBuilder()
    .setName(COMMAND_NAME)
    .setDescription('Clean up onboarding channels (individual or purge old ones 48+ hours)')
    .setDMPermission(false)
    .addStringOption(option =>
      option.setName('mode')
        .setDescription('Cleanup mode')
        .setRequired(false)
        .addChoices(
          { name: 'individual', value: 'individual' },
          { name: 'purge_old', value: 'purge_old' }
        )),

  async execute(interaction) {
    try {
      // Check if user has admin permissions using auto-detection
      const { checkMemberAdminPermissions } = require('../../services/server-config');
      const adminCheck = await checkMemberAdminPermissions(interaction.member);

      const channel = interaction.channel;
      const member = interaction.member;
      const mode = interaction.options.getString('mode') || 'individual';

      await interaction.deferReply({ ephemeral: true });

      if (mode === 'purge_old') {
        // Admin-only: Purge old onboarding channels (48+ hours)
        if (!adminCheck.isAdmin) {
          return interaction.followUp({
            content: `❌ You need administrative permissions to purge old channels.\n\n**Reason:** ${adminCheck.reason}`,
            ephemeral: true
          });
        }

        const channelService = require('../../services/channels');
        const onboardingService = require('../../services/onboarding');

        // Get all channels
        const channels = await interaction.guild.channels.fetch();
        const onboardingChannels = channels.filter(ch =>
          (ch.name.startsWith('onboarding-') || ch.name.startsWith('test-onboarding-')) &&
          ch.type === 0 // GuildText
        );

        let purgedCount = 0;
        const errors = [];

        for (const [channelId, channel] of onboardingChannels) {
          try {
            // Check if channel is older than 48 hours
            const channelAge = Date.now() - channel.createdTimestamp;
            const hoursOld = channelAge / (1000 * 60 * 60);

            if (hoursOld >= 48) {
              // Find the channel owner using cleaned username from channel name
              const channelParts = channel.name.split('-');
              if (channelParts.length >= 2) {
                const cleanedUsernameFromChannel = channelParts[channelParts.length - 1]; // Last part is cleaned username

                // Find member by matching cleaned username
                const members = await interaction.guild.members.fetch();
                const channelOwner = members.find(member => {
                  const memberCleanUsername = member.user.username.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
                  return memberCleanUsername === cleanedUsernameFromChannel;
                });

                if (channelOwner) {
                  // Clear session and cleanup channel
                  onboardingService.clearUserSession(channelOwner.id);
                  await channelService.cleanupOnboardingChannel(channel, channelOwner);
                  purgedCount++;
                } else {
                  console.warn(`Could not find channel owner for ${channel.name} (username: ${cleanedUsernameFromChannel})`);
                  errors.push(`${channel.name} (owner not found)`);
                }
              }
            }
          } catch (error) {
            console.error(`Error purging channel ${channel.name}:`, error);
            errors.push(channel.name);
          }
        }

        const embed = new EmbedBuilder()
          .setTitle('🧹 Bulk Channel Cleanup Complete')
          .setColor(purgedCount > 0 ? 0x00ff00 : 0xffa500)
          .setDescription(`Purged old onboarding channels (48+ hours old)`)
          .addFields(
            { name: '🗑️ Channels Purged', value: `${purgedCount}`, inline: true },
            { name: '⚠️ Errors', value: `${errors.length}`, inline: true },
            { name: '📊 Total Found', value: `${onboardingChannels.size}`, inline: true }
          )
          .setTimestamp()
          .setFooter({
            text: `Bulk cleanup by ${interaction.user.username}`,
            iconURL: interaction.user.displayAvatarURL({ dynamic: true })
          });

        if (errors.length > 0) {
          embed.addFields({
            name: '❌ Failed Channels',
            value: errors.join(', '),
            inline: false
          });
        }

        await interaction.followUp({ embeds: [embed], ephemeral: true });
        console.log(`🧹 Admin ${interaction.user.tag} purged ${purgedCount} old onboarding channels`);

      } else {
        // Individual cleanup mode
        const onboardingService = require('../../services/onboarding');
        const channelService = require('../../services/channels');

        // Check if this is a private onboarding channel
        const isOnboardingChannel = channel.name.startsWith('onboarding-') || channel.name.startsWith('test-onboarding-');

        // Check if channel belongs to user using cleaned username matching
        const cleanUsername = member.user.username.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        const isUserChannel = channel.name === `onboarding-${cleanUsername}` ||
                             channel.name === `test-onboarding-${cleanUsername}`;

        // Allow admins to clean up any onboarding channel
        if (!isOnboardingChannel) {
          return interaction.followUp({
            content: '❌ This command can only be used in private onboarding channels.',
            ephemeral: true
          });
        }

        if (!isUserChannel && !adminCheck.isAdmin) {
          return interaction.followUp({
            content: '❌ You can only clean up your own onboarding channel.',
            ephemeral: true
          });
        }

        // Clear user's session
        const sessionCleared = onboardingService.clearUserSession(member.id);

        // Send cleanup message and delete channel
        await channelService.cleanupOnboardingChannel(channel, member);

        const embed = new EmbedBuilder()
          .setTitle('🧹 Channel Cleanup Started')
          .setColor(0x00ff00)
          .setDescription('Your onboarding channel is being cleaned up!')
          .addFields(
            { name: '📝 Status', value: 'Channel will be deleted in 30 seconds', inline: false },
            { name: '🔄 Next Steps', value: 'If you need to restart onboarding, use `/onboard` in the welcome channel', inline: false }
          )
          .setTimestamp()
          .setFooter({
            text: `Cleanup requested by ${interaction.user.username}`,
            iconURL: interaction.user.displayAvatarURL({ dynamic: true })
          });

        await interaction.followUp({ embeds: [embed], ephemeral: true });

        console.log(`🧹 User ${member.user.tag} initiated cleanup of onboarding channel`);
      }

    } catch (error) {
      console.error('Error in cleanup command:', error);
      await interaction.followUp({
        content: '❌ An error occurred during cleanup. Please try again.',
        ephemeral: true
      });
    }
  },
};
