const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const COMMAND_NAME = 'list-onboarding';

module.exports = {
  data: new SlashCommandBuilder()
    .setName(COMMAND_NAME)
    .setDescription('Admin command to list all active onboarding sessions and channels (Admin/Owner only)')
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

    try {
      await interaction.deferReply({ ephemeral: true });

      const channels = await interaction.guild.channels.fetch();

      // Find all onboarding channels
      const onboardingChannels = [];
      const testChannels = [];

      for (const channel of channels.values()) {
        if (channel.type === 0) { // GuildText
          if (channel.name.startsWith('onboarding-')) {
            onboardingChannels.push(channel);
          } else if (channel.name.startsWith('test-onboarding-')) {
            testChannels.push(channel);
          }
        }
      }

      const embed = new EmbedBuilder()
        .setTitle('📋 Active Onboarding Sessions')
        .setColor(0x3498db)
        .setDescription('Current onboarding channels and their status')
        .setTimestamp()
        .setFooter({
          text: `Requested by ${interaction.user.username}`,
          iconURL: interaction.user.displayAvatarURL({ dynamic: true })
        });

      // Add regular onboarding channels
      if (onboardingChannels.length > 0) {
        const channelList = onboardingChannels.map(ch => {
          const username = ch.name.replace('onboarding-', '');
          return `🔹 <#${ch.id}> - User: **${username}**`;
        }).join('\n');

        embed.addFields({
          name: `👥 Regular Onboarding (${onboardingChannels.length})`,
          value: channelList,
          inline: false
        });
      } else {
        embed.addFields({
          name: '👥 Regular Onboarding',
          value: 'No active sessions',
          inline: false
        });
      }

      // Add test channels
      if (testChannels.length > 0) {
        const testChannelList = testChannels.map(ch => {
          const username = ch.name.replace('test-onboarding-', '');
          return `🧪 <#${ch.id}> - User: **${username}**`;
        }).join('\n');

        embed.addFields({
          name: `🧪 Test Sessions (${testChannels.length})`,
          value: testChannelList,
          inline: false
        });
      } else {
        embed.addFields({
          name: '🧪 Test Sessions',
          value: 'No active test sessions',
          inline: false
        });
      }

      // Add summary
      const totalChannels = onboardingChannels.length + testChannels.length;
      embed.addFields({
        name: '📊 Summary',
        value: `Total active channels: **${totalChannels}**\nRegular: **${onboardingChannels.length}**\nTest: **${testChannels.length}**`,
        inline: false
      });

      await interaction.followUp({ embeds: [embed], ephemeral: true });

    } catch (error) {
      console.error('Error in list command:', error);
      await interaction.followUp({
        content: '❌ An error occurred while listing sessions. Please try again.',
        ephemeral: true
      });
    }
  },
};
