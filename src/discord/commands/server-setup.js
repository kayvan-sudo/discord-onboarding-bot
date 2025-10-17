const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { showServerTypeSelection } = require('../../services/server-setup-utils');
const serverConfigManager = require('../../services/server-config');

const data = new SlashCommandBuilder()
  .setName('server-setup')
  .setDescription('Configure Vaulty bot for this server (Admin only)')
  .setDMPermission(false);

async function execute(interaction) {
    try {
      // Check if user has admin permissions using auto-detection
      const { checkMemberAdminPermissions } = require('../../services/server-config');
      const adminCheck = await checkMemberAdminPermissions(interaction.member);

      if (!adminCheck.isAdmin) {
        return interaction.reply({
          content: `❌ You need administrative permissions to use this command.\n\n**Required:** Administrator permission, Server Owner, or an admin role.\n\n**Reason:** ${adminCheck.reason}`,
          flags: 64
        });
      }

    const guild = interaction.guild;
    const existingConfig = serverConfigManager.getServerConfig(guild.id);

    if (existingConfig && existingConfig.active) {
      // Server is already configured - show current config and offer to update
      const configEmbed = new EmbedBuilder()
        .setTitle('🔧 Server Configuration')
        .setDescription(`**${guild.name}** is already configured!`)
        .setColor(0x00ff00)
        .addFields(
          { name: '📊 Sheet Tab', value: existingConfig.sheet_tab || 'Not set', inline: true },
          { name: '📢 Audit Channel', value: existingConfig.audit_channel ? `<#${existingConfig.audit_channel}>` : 'Not set', inline: true },
          { name: '👋 Welcome Channel', value: existingConfig.welcome_channel || 'Not set', inline: true },
          { name: '🎭 Required Roles', value: existingConfig.required_roles?.join(', ') || 'Not set', inline: false },
          { name: '⚙️ Admin Roles', value: existingConfig.admin_roles?.join(', ') || 'Not set', inline: false },
          { name: '📅 Configured', value: `<t:${Math.floor(new Date(existingConfig.joined_at).getTime() / 1000)}:F>`, inline: false }
        )
        .setFooter({ text: 'Vaulty Multi-Server Configuration' })
        .setTimestamp();

      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('manual_setup')
            .setLabel('Manual Setup')
            .setStyle(ButtonStyle.Success)
            .setEmoji('⚙️'),
          new ButtonBuilder()
            .setCustomId('reconfigure')
            .setLabel('Auto Configure')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🔄'),
          new ButtonBuilder()
            .setCustomId('view_stats')
            .setLabel('View Stats')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('📊')
        );

      const row2 = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('cancel')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('❌')
        );

      await interaction.reply({
        embeds: [configEmbed],
        components: [row, row2],
        flags: 64
      });

  } else {
    // Server is not configured - show server type selection
    await showServerTypeSelection(interaction, guild);
  }
  } catch (error) {
      console.error('❌ Server setup error:', {
        message: error.message,
        stack: error.stack,
        guild: interaction.guild?.name,
        user: interaction.user?.tag,
        timestamp: new Date().toISOString()
      });

      await interaction.reply({
        content: `❌ An error occurred during server setup: ${error.message}\n\nPlease try again or contact the development team.`,
        flags: 64
      });
    }
  }

module.exports = {
  data,
  execute
};
