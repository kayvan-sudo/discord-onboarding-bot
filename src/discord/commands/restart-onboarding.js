const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const COMMAND_NAME = 'restart-onboarding';

module.exports = {
  data: new SlashCommandBuilder()
    .setName(COMMAND_NAME)
    .setDescription('Admin: Restart user onboarding (works in/onboarding channels or specify user)')
    .setDMPermission(false)
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to restart onboarding for (leave empty to restart current channel user)')
        .setRequired(false)),

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

    let targetUser = interaction.options.getUser('user');
    let targetMember;

    // If no user specified, check if we're in an onboarding channel
    if (!targetUser) {
      const channel = interaction.channel;
      const isOnboardingChannel = channel.name.startsWith('onboarding-') || channel.name.startsWith('test-onboarding-');

      if (isOnboardingChannel) {
        // Extract cleaned username from channel name (format: onboarding-USERNAME or test-onboarding-USERNAME)
        const channelParts = channel.name.split('-');
        if (channelParts.length >= 2) {
          const cleanedUsernameFromChannel = channelParts[channelParts.length - 1]; // Last part is the cleaned username

          // Find member by matching cleaned username (try multiple approaches)
          const members = await interaction.guild.members.fetch();

          // First try exact match with cleaned username
          targetMember = members.find(member => {
            const memberCleanUsername = member.user.username.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
            return memberCleanUsername === cleanedUsernameFromChannel;
          });

          // If no exact match, try partial matches
          if (!targetMember) {
            targetMember = members.find(member => {
              const memberCleanUsername = member.user.username.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
              return memberCleanUsername.includes(cleanedUsernameFromChannel) ||
                     cleanedUsernameFromChannel.includes(memberCleanUsername);
            });
          }

          if (targetMember) {
            targetUser = targetMember.user;
            console.log(`✅ Found user ${targetUser.tag} from channel ${channel.name}`);
          } else {
            console.warn(`Could not find member with cleaned username ${cleanedUsernameFromChannel} from channel ${channel.name}`);
          }
        }
      }

      if (!targetUser) {
        return interaction.reply({
          content: '❌ Please specify a user to restart onboarding for, or use this command in an onboarding channel.',
          ephemeral: true
        });
      }
    } else {
      targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    }

    if (!targetMember) {
      return interaction.reply({
        content: '❌ User not found in this server.',
        ephemeral: true
      });
    }

    try {
      await interaction.deferReply({ ephemeral: true });

      const onboardingService = require('../../services/onboarding');
      const channelService = require('../../services/channels');

      // Check if user already has an active session
      let existingChannelToDelete = null;
      if (onboardingService.isUserOnboarding(targetUser.id)) {
        // Clear existing session first
        onboardingService.clearUserSession(targetUser.id);

        // Debug logging
        console.log(`🔍 User ${targetUser.tag} has active onboarding session`);

        // If command was run in an onboarding channel, delete that channel
        const currentChannel = interaction.channel;
        const isCurrentChannelOnboarding = currentChannel.name.startsWith('onboarding-') || currentChannel.name.startsWith('test-onboarding-');

        console.log(`📍 Current channel: ${currentChannel.name} (type: ${currentChannel.type})`);
        console.log(`🔍 Is current channel onboarding? ${isCurrentChannelOnboarding}`);

        if (isCurrentChannelOnboarding) {
          existingChannelToDelete = currentChannel;
          console.log(`🎯 Will delete current channel: ${currentChannel.name}`);
        } else {
          // Otherwise, find the user's onboarding channel by username
          const cleanUsername = targetUser.username.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
          console.log(`🔍 Looking for onboarding channel with username: ${cleanUsername}`);

          const channels = await interaction.guild.channels.fetch();
          existingChannelToDelete = channels.find(ch => {
            const matches = (ch.name === `onboarding-${cleanUsername}` || ch.name === `test-onboarding-${cleanUsername}`) && ch.type === 0;
            console.log(`🔍 Checking channel: ${ch.name} (type: ${ch.type}) - matches: ${matches}`);
            return matches;
          });

          if (existingChannelToDelete) {
            console.log(`🎯 Found user's onboarding channel: ${existingChannelToDelete.name}`);
          } else {
            console.log(`❓ No onboarding channel found for user ${cleanUsername}`);
          }
        }
      } else {
        console.log(`ℹ️ User ${targetUser.tag} does not have an active onboarding session`);
      }

      // Create new onboarding channel and start fresh session
      const newChannel = await channelService.createOnboardingChannel(targetMember);

      if (newChannel && !newChannel.error) {
        // Send fresh welcome message
        await channelService.sendWelcomeMessage(newChannel, targetMember);

        // Start new onboarding process
        await onboardingService.startOnboarding(newChannel, targetMember);

        const embed = new EmbedBuilder()
          .setTitle('🔄 Onboarding Restarted')
          .setColor(0x00ff00)
          .setDescription(`Successfully restarted onboarding for ${targetUser.username}`)
          .addFields(
            { name: '📝 New Channel', value: `<#${newChannel.id}>`, inline: true },
            { name: '👤 User', value: `<@${targetUser.id}>`, inline: true },
            { name: '⏰ Status', value: 'Onboarding session started', inline: true }
          )
          .setTimestamp()
          .setFooter({
            text: `Restarted by ${interaction.user.username}`,
            iconURL: interaction.user.displayAvatarURL({ dynamic: true })
          });

        await interaction.followUp({ embeds: [embed], ephemeral: true });

        // Schedule deletion of old channel after a delay to allow user to see completion message
        if (existingChannelToDelete) {
          console.log(`⏰ Scheduling deletion of old channel ${existingChannelToDelete.name} in 5 seconds...`);
          console.log(`📊 Channel details: ID=${existingChannelToDelete.id}, Guild=${interaction.guild.name}`);

          // Send a message in the old channel warning about deletion
          try {
            await existingChannelToDelete.send({
              content: `🔄 **Onboarding Restarted**\n\nYour onboarding has been restarted in <#${newChannel.id}>. This channel will be deleted in a few seconds.\n\nPlease continue in the new channel.`,
              flags: 4096 // Suppress notifications
            });
            console.log(`📨 Sent deletion warning to ${existingChannelToDelete.name}`);
          } catch (msgError) {
            console.warn(`Could not send deletion warning in ${existingChannelToDelete.name}:`, msgError.message);
          }

          // Verify bot has permission to delete
          const botMember = await interaction.guild.members.fetch(interaction.client.user.id);
          const canDelete = botMember.permissionsIn(existingChannelToDelete).has('ManageChannels');
          console.log(`🔐 Bot has ManageChannels permission in ${existingChannelToDelete.name}: ${canDelete}`);

          setTimeout(async () => {
            console.log(`⏳ Executing deletion of ${existingChannelToDelete.name}...`);
            try {
              await existingChannelToDelete.delete();
              console.log(`🗑️ Successfully deleted old channel ${existingChannelToDelete.name}`);
            } catch (error) {
              console.error(`❌ Failed to delete old channel ${existingChannelToDelete.name}:`, {
                error: error.message,
                code: error.code,
                statusCode: error.status,
                channelId: existingChannelToDelete.id,
                guildId: interaction.guild.id
              });
            }
          }, 5000); // 5 second delay
        } else {
          console.log(`ℹ️ No existing channel to delete for user ${targetUser.tag}`);
        }

        console.log(`🔄 Admin ${interaction.user.tag} restarted onboarding for ${targetUser.tag}`);

      } else {
        const errorMessage = newChannel?.error || 'Unknown error occurred';
        console.error(`❌ Failed to restart onboarding for ${targetUser.tag}:`, errorMessage);

        await interaction.followUp({
          content: `❌ Failed to restart onboarding for ${targetUser.username}.\n\nError: ${errorMessage}`,
          ephemeral: true
        });
      }

    } catch (error) {
      console.error('Error in restart command:', error);
      await interaction.followUp({
        content: '❌ An error occurred while restarting onboarding. Please try again.',
        ephemeral: true
      });
    }
  },
};
