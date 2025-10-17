const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const data = new SlashCommandBuilder()
  .setName('create-onboarding-roles')
  .setDescription('Create the three onboarding roles: Welcome, Onboarding, and Onboarded (Admin only)')
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

      // Check bot permissions
      const bot = guild.members.me;
      if (!bot.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return interaction.reply({
          content: '❌ Bot lacks Manage Roles permission to create roles.',
          flags: 64
        });
      }

      await interaction.deferReply({ flags: 64 });

      const rolesCreated = [];
      const rolesSkipped = [];

      // Define the three roles in hierarchy order (highest to lowest)
      const roleDefinitions = [
        {
          name: 'Onboarded',
          color: 0x00ff00, // Green
          hoist: false,
          mentionable: true,
          permissions: BigInt(0), // Use default permissions (will be restricted by channel overwrites)
          description: 'Full server access after completing onboarding'
        },
        {
          name: 'Onboarding',
          color: 0xffa500, // Orange
          hoist: false,
          mentionable: false,
          permissions: BigInt(0), // Use default permissions (will be restricted by channel overwrites)
          description: 'Limited access during onboarding process'
        },
        {
          name: 'Welcome',
          color: 0x3498db, // Blue
          hoist: false,
          mentionable: false,
          permissions: BigInt(0), // Use default permissions (will be restricted by channel overwrites)
          description: 'New member access before onboarding'
        }
      ];

      // Create roles from highest to lowest hierarchy
      for (const roleDef of roleDefinitions) {
        try {
          // Check if role already exists
          const existingRole = guild.roles.cache.find(role => role.name === roleDef.name);

          if (existingRole) {
            console.log(`ℹ️ Role "${roleDef.name}" already exists, skipping creation`);
            rolesSkipped.push({
              name: roleDef.name,
              color: roleDef.color,
              existing: true,
              id: existingRole.id
            });
            continue;
          }

          // Create the role
          const roleData = {
            name: roleDef.name,
            color: roleDef.color,
            hoist: roleDef.hoist,
            mentionable: roleDef.mentionable,
            reason: `Created by Vaulty onboarding system: ${roleDef.description}`
          };

          // Only set permissions if they're not the default (BigInt(0))
          if (roleDef.permissions !== BigInt(0)) {
            roleData.permissions = roleDef.permissions;
          }

          const role = await guild.roles.create(roleData);

          console.log(`✅ Created role: ${role.name} (${role.id})`);
          rolesCreated.push({
            name: role.name,
            color: roleDef.color,
            id: role.id,
            description: roleDef.description
          });

        } catch (error) {
          console.error(`❌ Failed to create role "${roleDef.name}":`, error);
          return interaction.editReply({
            content: `❌ Failed to create role "${roleDef.name}": ${error.message}`,
            embeds: []
          });
        }
      }

      // Create success embed
      const embed = new EmbedBuilder()
        .setTitle('✅ Onboarding Roles Setup Complete')
        .setDescription('The three onboarding roles have been configured for your server.')
        .setColor(0x00ff00)
        .setTimestamp();

      // Add fields for created roles
      if (rolesCreated.length > 0) {
        embed.addFields({
          name: '🆕 Roles Created',
          value: rolesCreated.map(role =>
            `**${role.name}** - ${role.description}\n• Color: #${role.color.toString(16).padStart(6, '0')}\n• ID: \`${role.id}\``
          ).join('\n\n'),
          inline: false
        });
      }

      // Add fields for skipped roles
      if (rolesSkipped.length > 0) {
        embed.addFields({
          name: '⏭️ Roles Already Exist',
          value: rolesSkipped.map(role =>
            `**${role.name}** - Already configured\n• ID: \`${role.id}\``
          ).join('\n\n'),
          inline: false
        });
      }

      // Add hierarchy information
      embed.addFields({
        name: '📊 Role Hierarchy',
        value: [
          '1. **Onboarded** (Highest) - Full server access',
          '2. **Onboarding** (Middle) - Limited access during onboarding',
          '3. **Welcome** (Lowest) - New member access'
        ].join('\n'),
        inline: false
      });

      // Add next steps
      embed.addFields({
        name: '🚀 Next Steps',
        value: [
          '• Run `/server-setup` to configure the rest of the bot',
          '• Set up channel permissions for these roles as needed',
          '• The bot will automatically assign these roles during onboarding'
        ].join('\n'),
        inline: false
      });

      await interaction.editReply({
        embeds: [embed]
      });

    } catch (error) {
      console.error('❌ Create onboarding roles command error:', {
        message: error.message,
        stack: error.stack,
        guild: interaction.guild?.name,
        user: interaction.user?.tag,
        timestamp: new Date().toISOString()
      });

      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Command Error')
        .setDescription('An unexpected error occurred while creating onboarding roles.')
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
