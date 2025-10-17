const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { createBackOffice } = require('../../services/channels');
const serverConfigManager = require('../../services/server-config');

const data = new SlashCommandBuilder()
  .setName('create-back-office')
  .setDescription('Create admin-only back office category and channels (Admin only)')
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

      // Check if back office already exists
      const existingBackOffice = guild.channels.cache.find(channel =>
        channel.name === 'back office' && channel.type === 4 // Category
      );

      if (existingBackOffice) {
        // Check if the channels exist
        const spamChannel = guild.channels.cache.find(channel =>
          channel.name === '🚽︱spam' && channel.parentId === existingBackOffice.id
        );
        const auditChannel = guild.channels.cache.find(channel =>
          channel.name === '🤖︱audit-log' && channel.parentId === existingBackOffice.id
        );
        const officeChannel = guild.channels.cache.find(channel =>
          channel.name === '💬︱office-chat' && channel.parentId === existingBackOffice.id
        );

        const existingChannels = [];
        if (spamChannel) existingChannels.push('🚽︱spam');
        if (auditChannel) existingChannels.push('🤖︱audit-log');
        if (officeChannel) existingChannels.push('💬︱office-chat');

        const embed = new EmbedBuilder()
          .setTitle('🏢 Back Office Status')
          .setDescription('A back office category already exists!')
          .setColor(0xffa500)
          .addFields(
            {
              name: '📁 Category',
              value: `<#${existingBackOffice.id}> (back office)`,
              inline: true
            },
            {
              name: '📋 Existing Channels',
              value: existingChannels.length > 0 ?
                existingChannels.map(name => `• ${name}`).join('\n') :
                'None found',
              inline: true
            },
            {
              name: '❓ What to do?',
              value: 'The back office is already set up. If you need to recreate it, first delete the existing category and channels, then run this command again.',
              inline: false
            }
          )
          .setFooter({ text: 'Back Office Management' })
          .setTimestamp();

        return interaction.reply({
          embeds: [embed],
          flags: 64
        });
      }

      // Create back office
      await interaction.deferReply({ flags: 64 });

      const result = await createBackOffice(guild);

      if (result.error) {
        const errorEmbed = new EmbedBuilder()
          .setTitle('❌ Back Office Creation Failed')
          .setDescription('Failed to create the admin back office.')
          .setColor(0xff0000)
          .addFields(
            {
              name: '🔍 Error',
              value: result.error,
              inline: false
            },
            {
              name: '💡 Possible Solutions',
              value: [
                '• Ensure the bot has "Manage Channels" permission',
                '• Ensure the bot has "Manage Permissions" permission',
                '• Check that the bot\'s role is high enough in the hierarchy',
                '• Try running `/server-setup` if this is a new server'
              ].join('\n'),
              inline: false
            }
          )
          .setFooter({ text: 'Back Office Creation Error' })
          .setTimestamp();

        return interaction.editReply({
          embeds: [errorEmbed]
        });
      }

      // Success
      const successEmbed = new EmbedBuilder()
        .setTitle('✅ Back Office Created Successfully!')
        .setDescription('Admin-only back office has been created with the following channels:')
        .setColor(0x00ff00)
        .addFields(
          {
            name: '🏢 Category',
            value: result.category.name,
            inline: true
          },
          {
            name: '🚽 Bot Commands',
            value: `<#${result.channels.spam.id}>\n*Use this channel for running bot commands*`,
            inline: true
          },
          {
            name: '🤖 Audit Log',
            value: `<#${result.channels.auditLog.id}>\n*Bot activity and server events*`,
            inline: true
          },
          {
            name: '💬 Admin Chat',
            value: `<#${result.channels.officeChat.id}>\n*Private admin/moderator discussions*`,
            inline: false
          },
          {
            name: '🔒 Permissions',
            value: '• Only admins can view these channels\n• @everyone is denied access\n• Bot has full access to all channels',
            inline: false
          }
        )
        .setFooter({ text: 'Back Office Setup Complete' })
        .setTimestamp();

      await interaction.editReply({
        embeds: [successEmbed]
      });

    } catch (error) {
      console.error('❌ Create back office command error:', {
        message: error.message,
        stack: error.stack,
        guild: interaction.guild?.name,
        user: interaction.user?.tag,
        timestamp: new Date().toISOString()
      });

      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Command Error')
        .setDescription('An unexpected error occurred while creating the back office.')
        .setColor(0xff0000)
        .addFields(
          {
            name: '🔍 Error Details',
            value: error.message.length > 500 ? error.message.substring(0, 497) + '...' : error.message,
            inline: false
          }
        )
        .setFooter({ text: 'Please contact support if this persists' })
        .setTimestamp();

      if (interaction.deferred) {
        await interaction.editReply({
          embeds: [errorEmbed]
        });
      } else {
        await interaction.reply({
          embeds: [errorEmbed],
          flags: 64
        });
      }
    }
}

module.exports = {
  data,
  execute
};

