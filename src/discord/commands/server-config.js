const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle } = require('discord.js');
const serverConfigManager = require('../../services/server-config');

// Helper function to send audit logs for configuration changes
async function sendConfigAuditLog(guild, adminUser, action, details) {
  try {
    const config = serverConfigManager.getServerConfig(guild.id);
    if (!config || !config.audit_channel) return;

    const auditChannel = await guild.channels.fetch(config.audit_channel);
    if (!auditChannel) return;

    const auditEmbed = new EmbedBuilder()
      .setTitle('⚙️ Configuration Changed')
      .setDescription(`**${adminUser.username}** made a configuration change`)
      .setColor(0xffa500)
      .addFields(
        { name: '👤 Admin', value: `${adminUser.tag}\nID: ${adminUser.id}`, inline: true },
        { name: '📅 Timestamp', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
        { name: '🎯 Action', value: action, inline: true },
        { name: '📋 Details', value: details, inline: false }
      )
      .setFooter({ text: 'Vaulty Configuration Audit', iconURL: guild.client.user.displayAvatarURL() })
      .setTimestamp();

    await auditChannel.send({ embeds: [auditEmbed] });
  } catch (error) {
    console.warn('Failed to send config audit log:', error.message);
  }
}

// Helper function to handle admin command errors
async function handleAdminError(interaction, error, context = {}) {
  const guild = interaction.guild;
  const adminUser = interaction.user;

  // Create detailed error information
  const errorId = `ERR_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const errorDetails = {
    errorId,
    message: error.message,
    stack: error.stack,
    command: interaction.commandName,
    subcommand: interaction.options.getSubcommand ? interaction.options.getSubcommand() : 'N/A',
    guild: {
      id: guild.id,
      name: guild.name
    },
    admin: {
      id: adminUser.id,
      tag: adminUser.tag,
      username: adminUser.username
    },
    context,
    timestamp: new Date().toISOString()
  };

  // Log to Heroku/console
  console.error('❌ Admin Command Error:', {
    errorId,
    message: error.message,
    command: errorDetails.command,
    subcommand: errorDetails.subcommand,
    guild: errorDetails.guild.name,
    admin: errorDetails.admin.tag,
    stack: error.stack,
    context: context,
    timestamp: errorDetails.timestamp
  });

  // Create user-friendly error message for Discord
  const userErrorEmbed = new EmbedBuilder()
    .setTitle('❌ Command Error')
    .setDescription('An error occurred while processing your command.')
    .setColor(0xff0000)
    .addFields(
      { name: '🔍 Error ID', value: `\`${errorId}\``, inline: true },
      { name: '📝 Command', value: `\`${errorDetails.command}${errorDetails.subcommand !== 'N/A' ? ` ${errorDetails.subcommand}` : ''}\``, inline: true },
      { name: '👤 Admin', value: adminUser.tag, inline: true },
      { name: '⚠️ Error Message', value: error.message.length > 500 ? error.message.substring(0, 497) + '...' : error.message, inline: false }
    )
    .setFooter({ text: 'Please share the Error ID with the development team for assistance' })
    .setTimestamp();

  // Add technical details for debugging (collapsed)
  if (context && Object.keys(context).length > 0) {
    userErrorEmbed.addFields({
      name: '🔧 Context',
      value: `\`\`\`json\n${JSON.stringify(context, null, 2).substring(0, 500)}${JSON.stringify(context, null, 2).length > 500 ? '\n...' : ''}\`\`\``,
      inline: false
    });
  }

  // Send error message to admin
  try {
    await interaction.followUp({
      embeds: [userErrorEmbed],
      flags: 64
    });
  } catch (sendError) {
    // If followUp fails, try reply
    try {
      await interaction.reply({
        embeds: [userErrorEmbed],
        flags: 64
      });
    } catch (replyError) {
      console.error('❌ Failed to send error message to admin:', {
        errorId,
        sendError: sendError.message,
        replyError: replyError.message
      });
    }
  }

  // Send to audit log if configured
  try {
    const config = serverConfigManager.getServerConfig(guild.id);
    if (config && config.audit_channel) {
      const auditChannel = await guild.channels.fetch(config.audit_channel);
      if (auditChannel) {
        const auditErrorEmbed = new EmbedBuilder()
          .setTitle('🚨 Admin Command Error')
          .setDescription(`**${adminUser.username}** encountered an error while using a command`)
          .setColor(0xff4444)
          .addFields(
            { name: '🔍 Error ID', value: `\`${errorId}\``, inline: true },
            { name: '📝 Command', value: `\`${errorDetails.command}${errorDetails.subcommand !== 'N/A' ? ` ${errorDetails.subcommand}` : ''}\``, inline: true },
            { name: '👤 Admin', value: `${adminUser.tag}\nID: ${adminUser.id}`, inline: true },
            { name: '⚠️ Error Message', value: error.message, inline: false },
            { name: '📊 Guild', value: `${guild.name}\nID: ${guild.id}`, inline: true },
            { name: '🕒 Timestamp', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
            { name: '🎯 Context', value: context && Object.keys(context).length > 0 ? `\`\`\`json\n${JSON.stringify(context, null, 2).substring(0, 300)}${JSON.stringify(context, null, 2).length > 300 ? '\n...' : ''}\`\`\`` : 'None', inline: false }
          )
          .setFooter({ text: 'Vaulty Error Monitoring', iconURL: guild.client.user.displayAvatarURL() })
          .setTimestamp();

        await auditChannel.send({ embeds: [auditErrorEmbed] });
      }
    }
  } catch (auditError) {
    console.warn('⚠️ Failed to send error to audit log:', auditError.message);
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('server-config')
    .setDescription('View and modify server configuration settings (Admin only)')
    .setDMPermission(false)
    .addSubcommand(subcommand =>
      subcommand
        .setName('view')
        .setDescription('View current server configuration'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('set-welcome')
        .setDescription('Set the welcome channel')
        .addChannelOption(option =>
          option
            .setName('channel')
            .setDescription('Channel for welcome messages')
            .setRequired(true)
            .addChannelTypes(0))) // TEXT channel
    .addSubcommand(subcommand =>
      subcommand
        .setName('set-audit')
        .setDescription('Set the audit log channel')
        .addChannelOption(option =>
          option
            .setName('channel')
            .setDescription('Channel for audit logs')
            .setRequired(true)
            .addChannelTypes(0))) // TEXT channel
    .addSubcommand(subcommand =>
      subcommand
        .setName('set-roles')
        .setDescription('Configure onboarding roles')
        .addRoleOption(option =>
          option
            .setName('onboarding-role')
            .setDescription('Role to remove after onboarding')
            .setRequired(false))
        .addRoleOption(option =>
          option
            .setName('onboarded-role')
            .setDescription('Role to grant after onboarding')
            .setRequired(false))
        .addRoleOption(option =>
          option
            .setName('sample-role')
            .setDescription('Optional sample role for requests')
            .setRequired(false))
        .addRoleOption(option =>
          option
            .setName('welcome-role')
            .setDescription('Role to assign when users join the server')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('add-admin-role')
        .setDescription('Add an admin role')
        .addRoleOption(option =>
          option
            .setName('role')
            .setDescription('Role to add as admin')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove-admin-role')
        .setDescription('Remove an admin role')
        .addRoleOption(option =>
          option
            .setName('role')
            .setDescription('Role to remove from admin list')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('reset')
        .setDescription('Reset server configuration to defaults'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('questions')
        .setDescription('Manage onboarding questions')
        .addStringOption(option =>
          option
            .setName('action')
            .setDescription('Action to perform')
            .setRequired(true)
            .addChoices(
              { name: 'View all questions', value: 'view' },
              { name: 'Add new question', value: 'add' },
              { name: 'Edit question', value: 'edit' },
              { name: 'Remove question', value: 'remove' },
              { name: 'Reorder questions', value: 'reorder' },
              { name: 'Reset to defaults', value: 'reset' }
            ))
        .addStringOption(option =>
          option
            .setName('question_id')
            .setDescription('Question ID for edit/remove (get from /server-config questions view)')
            .setRequired(false))),

  async execute(interaction) {
    // Check if user has admin permissions using auto-detection
    const { checkMemberAdminPermissions } = require('../../services/server-config');
    const adminCheck = await checkMemberAdminPermissions(interaction.member);

    if (!adminCheck.isAdmin) {
      return await interaction.followUp({
        content: `❌ You need administrative permissions to use this command.\n\n**Required:** Administrator permission, Server Owner, or an admin role.\n\n**Reason:** ${adminCheck.reason}`,
        flags: 64
      });
    }

    await interaction.deferReply({ flags: 64 });

    const subcommand = interaction.options.getSubcommand();
    const guild = interaction.guild;

    try {
      switch (subcommand) {
        case 'view':
          await showServerConfig(interaction, guild);
          break;
        case 'set-welcome':
          await setWelcomeChannel(interaction, guild);
          break;
        case 'set-audit':
          await setAuditChannel(interaction, guild);
          break;
        case 'set-roles':
          await setRoles(interaction, guild);
          break;
        case 'add-admin-role':
          await addAdminRole(interaction, guild);
          break;
        case 'remove-admin-role':
          await removeAdminRole(interaction, guild);
          break;
      case 'reset':
        await resetConfig(interaction, guild);
        break;
      case 'questions':
        await handleQuestionsSubcommand(interaction, guild);
        break;
      default:
        await interaction.followUp({
          content: '❓ Unknown subcommand.',
          flags: 64
        });
      }
    } catch (error) {
      // Try to handle the error, but don't fail if interaction was already replied to
      try {
        await handleAdminError(interaction, error, {
          action: subcommand,
          options: interaction.options.data
        });
      } catch (errorHandlerError) {
        console.error('Failed to handle admin error:', errorHandlerError);
      }
    }
  }
};

async function showServerConfig(interaction, guild) {
  const config = serverConfigManager.getServerConfig(guild.id);
  const stats = serverConfigManager.getStats();

  if (!config) {
    return interaction.followUp({
      content: '❌ This server is not configured yet. Run `/server-setup` first.',
      flags: 64
    });
  }

  const embed = new EmbedBuilder()
    .setTitle(`⚙️ ${guild.name} Configuration`)
    .setColor(config.active ? 0x00ff00 : 0xffa500)
    .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }))
    .addFields(
      {
        name: '🏠 Server Info',
        value: [
          `**Name:** ${guild.name}`,
          `**ID:** ${guild.id}`,
          `**Members:** ${guild.memberCount}`,
          `**Status:** ${config.active ? '✅ Active' : '⚠️ Inactive'}`
        ].join('\n'),
        inline: true
      },
      {
        name: '📊 Google Sheets',
        value: [
          `**Tab:** ${config.sheet_tab}`,
          `**Configured:** <t:${Math.floor(new Date(config.joined_at).getTime() / 1000)}:F>`,
          `**Last Updated:** <t:${Math.floor(new Date(config.last_updated).getTime() / 1000)}:R>`
        ].join('\n'),
        inline: true
      },
      {
        name: '📢 Channels',
        value: [
          `**Welcome:** ${config.welcome_channel ? `<#${config.welcome_channel}>` : 'Not set'}`,
          `**Audit:** ${config.audit_channel ? `<#${config.audit_channel}>` : 'Not set'}`,
          `**System:** ${guild.systemChannel ? `<#${guild.systemChannel.id}>` : 'None'}`
        ].join('\n'),
        inline: false
      },
      {
        name: '🎭 Roles',
        value: [
          `**Onboarding:** ${await getRoleDisplay(guild, config.required_roles?.[0])}`,
          `**Onboarded:** ${await getRoleDisplay(guild, config.required_roles?.[1])}`,
          `**Sample:** ${await getRoleDisplay(guild, config.required_roles?.[2])}`
        ].join('\n'),
        inline: false
      },
      {
        name: '👑 Admin Roles',
        value: config.admin_roles?.length > 0
          ? config.admin_roles.map(roleName => `• ${roleName}`).join('\n')
          : 'None configured',
        inline: false
      },
      {
        name: '🌐 Global Stats',
        value: [
          `**Total Servers:** ${stats.total_servers}`,
          `**Active Servers:** ${stats.active_servers}`,
          `**Your Server Rank:** #${Object.keys(serverConfigManager.getActiveServers()).indexOf(guild.id) + 1}`
        ].join('\n'),
        inline: false
      }
    )
    .setFooter({
      text: 'Use /server-config subcommands to modify settings',
      iconURL: interaction.client.user.displayAvatarURL()
    })
    .setTimestamp();

  // Add quick action buttons
  const row = new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('config_action')
        .setPlaceholder('Choose an action...')
        .addOptions([
          {
            label: 'Set Welcome Channel',
            value: 'set_welcome',
            description: 'Configure welcome message channel',
            emoji: '👋'
          },
          {
            label: 'Set Audit Channel',
            value: 'set_audit',
            description: 'Configure audit log channel',
            emoji: '📋'
          },
          {
            label: 'Configure Roles',
            value: 'set_roles',
            description: 'Set onboarding roles',
            emoji: '🎭'
          },
          {
            label: 'Add Admin Role',
            value: 'add_admin',
            description: 'Add role to admin list',
            emoji: '👑'
          },
          {
            label: 'View Statistics',
            value: 'view_stats',
            description: 'Show detailed statistics',
            emoji: '📊'
          }
        ])
    );

  await interaction.followUp({
    embeds: [embed],
    components: [row]
  });
}

async function setWelcomeChannel(interaction, guild) {
  const channel = interaction.options.getChannel('channel');
  const config = serverConfigManager.getServerConfig(guild.id);

  if (!config) {
    return interaction.followUp({
      content: '❌ This server is not configured yet. Run `/server-setup` first.',
      flags: 64
    });
  }

    await serverConfigManager.updateServerConfig(guild.id, {
      welcome_channel: channel.name
    });

    // Send audit log
    await sendConfigAuditLog(guild, interaction.user, 'Set Welcome Channel', `Channel: <#${channel.id}> (${channel.name})`);

    await interaction.followUp({
      content: `✅ Welcome channel set to <#${channel.id}>`,
      flags: 64
    });
}

async function setAuditChannel(interaction, guild) {
  const channel = interaction.options.getChannel('channel');
  const config = serverConfigManager.getServerConfig(guild.id);

  if (!config) {
    return interaction.followUp({
      content: '❌ This server is not configured yet. Run `/server-setup` first.',
      flags: 64
    });
  }

    await serverConfigManager.updateServerConfig(guild.id, {
      audit_channel: channel.id
    });

    // Send audit log
    await sendConfigAuditLog(guild, interaction.user, 'Set Audit Channel', `Channel: <#${channel.id}> (${channel.name})`);

    await interaction.followUp({
      content: `✅ Audit channel set to <#${channel.id}>`,
      flags: 64
    });
}

async function setRoles(interaction, guild) {
  const onboardingRole = interaction.options.getRole('onboarding-role');
  const onboardedRole = interaction.options.getRole('onboarded-role');
  const sampleRole = interaction.options.getRole('sample-role');
  const welcomeRole = interaction.options.getRole('welcome-role');

  const config = serverConfigManager.getServerConfig(guild.id);
  if (!config) {
    return interaction.followUp({
      content: '❌ This server is not configured yet. Run `/server-setup` first.',
      flags: 64
    });
  }

  // Build new required roles array
  const requiredRoles = [...(config.required_roles || [])];

  if (onboardingRole) requiredRoles[0] = onboardingRole.name;
  if (onboardedRole) requiredRoles[1] = onboardedRole.name;
  if (sampleRole) requiredRoles[2] = sampleRole.name;

  // Update configuration
  const updates = {
    required_roles: requiredRoles
  };

  if (welcomeRole) {
    updates.welcome_role = welcomeRole.name;
  }

  await serverConfigManager.updateServerConfig(guild.id, updates);

  const roleList = [];
  if (welcomeRole) roleList.push(`**Welcome/Autojoin:** ${welcomeRole.name}`);
  if (onboardingRole) roleList.push(`**Onboarding:** ${onboardingRole.name}`);
  if (onboardedRole) roleList.push(`**Onboarded:** ${onboardedRole.name}`);
  if (sampleRole) roleList.push(`**Sample:** ${sampleRole.name}`);

  await interaction.followUp({
    content: `✅ Roles configured:\n${roleList.join('\n')}`,
    flags: 64
  });
}

async function addAdminRole(interaction, guild) {
  const role = interaction.options.getRole('role');
  const config = serverConfigManager.getServerConfig(guild.id);

  if (!config) {
    return interaction.followUp({
      content: '❌ This server is not configured yet. Run `/server-setup` first.',
      flags: 64
    });
  }

  const adminRoles = [...(config.admin_roles || [])];
  if (!adminRoles.includes(role.name)) {
    adminRoles.push(role.name);
  }

  await serverConfigManager.updateServerConfig(guild.id, {
    admin_roles: adminRoles
  });

  await interaction.followUp({
    content: `✅ Added ${role.name} to admin roles.`,
    flags: 64
  });
}

async function removeAdminRole(interaction, guild) {
  const role = interaction.options.getRole('role');
  const config = serverConfigManager.getServerConfig(guild.id);

  if (!config) {
    return interaction.followUp({
      content: '❌ This server is not configured yet. Run `/server-setup` first.',
      flags: 64
    });
  }

  const adminRoles = (config.admin_roles || []).filter(r => r !== role.name);

  await serverConfigManager.updateServerConfig(guild.id, {
    admin_roles: adminRoles
  });

  await interaction.followUp({
    content: `✅ Removed ${role.name} from admin roles.`,
    flags: 64
  });
}

async function resetConfig(interaction, guild) {
  const config = serverConfigManager.getServerConfig(guild.id);

  if (!config) {
    return interaction.followUp({
      content: '❌ This server is not configured yet. Run `/server-setup` first.',
      flags: 64
    });
  }

  // Confirm reset with user
  const confirmEmbed = new EmbedBuilder()
    .setTitle('⚠️ Confirm Reset')
    .setDescription('This will reset all server configuration to defaults. The Google Sheet tab will be preserved, but all other settings will be reset.')
    .setColor(0xffa500)
    .addFields(
      { name: 'What will be reset:', value: '• Welcome channel\n• Audit channel\n• Role configuration\n• Admin roles', inline: false },
      { name: 'What will be kept:', value: '• Google Sheet tab\n• Server registration\n• Historical data', inline: false }
    );

  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('confirm_reset')
        .setLabel('Confirm Reset')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅'),
      new ButtonBuilder()
        .setCustomId('cancel_reset')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❌')
    );

  await interaction.followUp({
    embeds: [confirmEmbed],
    components: [row],
    flags: 64
  });
}

async function handleQuestionsSubcommand(interaction, guild) {
  const action = interaction.options.getString('action');
  const questionId = interaction.options.getString('question_id');

  try {
    switch (action) {
      case 'view':
        await viewQuestions(interaction, guild);
        break;
      case 'add':
        await startAddQuestion(interaction, guild);
        break;
      case 'edit':
        if (!questionId) {
          return interaction.followUp({
            content: '❌ Please provide a question ID to edit. Use `/server-config questions view` to see question IDs.',
            flags: 64
          });
        }
        await startEditQuestion(interaction, guild, questionId);
        break;
      case 'remove':
        if (!questionId) {
          return interaction.followUp({
            content: '❌ Please provide a question ID to remove. Use `/server-config questions view` to see question IDs.',
            flags: 64
          });
        }
        await removeQuestion(interaction, guild, questionId);
        break;
      case 'reorder':
        await startReorderQuestions(interaction, guild);
        break;
      case 'reset':
        await resetQuestionsToDefaults(interaction, guild);
        break;
      default:
        await interaction.followUp({
          content: '❓ Unknown questions action.',
          flags: 64
        });
    }
  } catch (error) {
    console.error('Questions subcommand error:', error);
    try {
      await interaction.followUp({
        content: `❌ Error managing questions: ${error.message}`,
        flags: 64
      });
    } catch (followUpError) {
      // If followUp fails, the interaction was already handled
      console.warn('Could not send error followUp - interaction already replied to');
    }
  }
}

async function viewQuestions(interaction, guild) {
  const config = serverConfigManager.getServerConfig(guild.id);
  const questions = serverConfigManager.getServerQuestions(guild.id);

  if (questions.length === 0) {
    return interaction.followUp({
      content: '❌ This server has no questions configured. Run `/server-setup` first to configure the server with default questions.',
      flags: 64
    });
  }

  const embed = new EmbedBuilder()
    .setTitle('📋 Server Questions')
    .setDescription(`Current onboarding questions for **${guild.name}**`)
    .setColor(0x0099ff)
    .setFooter({ text: 'Use question IDs for edit/remove operations' });

  questions.forEach((question, index) => {
    const status = question.active ? '✅' : '❌';
    const validation = question.validation === 'required' ? 'Required' :
                      question.validation === 'optional' ? 'Optional' :
                      question.validation.charAt(0).toUpperCase() + question.validation.slice(1);

    embed.addFields({
      name: `${index + 1}. ${question.question.substring(0, 50)}${question.question.length > 50 ? '...' : ''}`,
      value: [
        `**ID:** \`${question.id}\``,
        `**Type:** ${question.type}`,
        `**Validation:** ${validation}`,
        `**Status:** ${status}`,
        question.placeholder ? `**Example:** ${question.placeholder}` : ''
      ].filter(Boolean).join('\n'),
      inline: false
    });
  });

  await interaction.followUp({
    embeds: [embed],
    flags: 64
  });
}

async function startAddQuestion(interaction, guild) {
  const modal = new ModalBuilder()
    .setCustomId('add_question_modal')
    .setTitle('Add New Question');

  const questionInput = new TextInputBuilder()
    .setCustomId('question_text')
    .setLabel('Question Text')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('What is your favorite color?')
    .setRequired(true)
    .setMaxLength(200);

  const typeInput = new TextInputBuilder()
    .setCustomId('question_type')
    .setLabel('Question Type (text, email, number)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('text')
    .setValue('text')
    .setRequired(true);

  const validationInput = new TextInputBuilder()
    .setCustomId('question_validation')
    .setLabel('Validation (required, optional, email, url)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('required')
    .setValue('required')
    .setRequired(true);

  const placeholderInput = new TextInputBuilder()
    .setCustomId('question_placeholder')
    .setLabel('Placeholder/Example (optional)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g., Blue, Green, Red')
    .setRequired(false);

  const firstRow = new ActionRowBuilder().addComponents(questionInput);
  const secondRow = new ActionRowBuilder().addComponents(typeInput);
  const thirdRow = new ActionRowBuilder().addComponents(validationInput);
  const fourthRow = new ActionRowBuilder().addComponents(placeholderInput);

  modal.addComponents(firstRow, secondRow, thirdRow, fourthRow);

  await interaction.showModal(modal);
}

async function startEditQuestion(interaction, guild, questionId) {
  const config = serverConfigManager.getServerConfig(guild.id);

  if (!config || !config.questions) {
    return interaction.followUp({
      content: '❌ No questions configured for this server.',
      flags: 64
    });
  }

  const questions = serverConfigManager.getServerQuestions(guild.id);
  const question = questions.find(q => q.id === questionId);
  if (!question) {
    return interaction.followUp({
      content: `❌ Question with ID "${questionId}" not found. Use \`/server-config questions view\` to see available questions.`,
      flags: 64
    });
  }

  const modal = new ModalBuilder()
    .setCustomId(`edit_question_modal_${questionId}`)
    .setTitle('Edit Question');

  const questionInput = new TextInputBuilder()
    .setCustomId('question_text')
    .setLabel('Question Text')
    .setStyle(TextInputStyle.Short)
    .setValue(question.question)
    .setRequired(true)
    .setMaxLength(200);

  const typeInput = new TextInputBuilder()
    .setCustomId('question_type')
    .setLabel('Question Type')
    .setStyle(TextInputStyle.Short)
    .setValue(question.type || 'text')
    .setRequired(true);

  const validationInput = new TextInputBuilder()
    .setCustomId('question_validation')
    .setLabel('Validation')
    .setStyle(TextInputStyle.Short)
    .setValue(question.validation || 'required')
    .setRequired(true);

  const placeholderInput = new TextInputBuilder()
    .setCustomId('question_placeholder')
    .setLabel('Placeholder/Example')
    .setStyle(TextInputStyle.Short)
    .setValue(question.placeholder || '')
    .setRequired(false);

  const firstRow = new ActionRowBuilder().addComponents(questionInput);
  const secondRow = new ActionRowBuilder().addComponents(typeInput);
  const thirdRow = new ActionRowBuilder().addComponents(validationInput);
  const fourthRow = new ActionRowBuilder().addComponents(placeholderInput);

  modal.addComponents(firstRow, secondRow, thirdRow, fourthRow);

  await interaction.showModal(modal);
}

async function removeQuestion(interaction, guild, questionId) {
  try {
    const removedQuestion = await serverConfigManager.removeServerQuestion(guild.id, questionId);

    // Send audit log
    await sendConfigAuditLog(guild, interaction.user, 'Remove Question',
      `Removed: "${removedQuestion.question}"`);

    await interaction.followUp({
      content: `✅ Question removed: "${removedQuestion.question}"`,
      flags: 64
    });
  } catch (error) {
    await interaction.followUp({
      content: `❌ Error removing question: ${error.message}`,
      flags: 64
    });
  }
}

async function startReorderQuestions(interaction, guild) {
  const questions = serverConfigManager.getServerQuestions(guild.id);

  if (questions.length <= 1) {
    return interaction.followUp({
      content: '❌ Need at least 2 questions to reorder.',
      flags: 64
    });
  }

  const embed = new EmbedBuilder()
    .setTitle('🔄 Reorder Questions')
    .setDescription('Provide the question IDs in the desired order (comma-separated):')
    .setColor(0xffa500);

  questions.forEach((question, index) => {
    embed.addFields({
      name: `${index + 1}. ${question.question.substring(0, 50)}`,
      value: `**ID:** \`${question.id}\``,
      inline: true
    });
  });

  embed.addFields({
    name: 'Example',
    value: '`question_1, question_2, question_3`',
    inline: false
  });

  // Create a button to trigger the reorder modal
  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('start_reorder_modal')
        .setLabel('Start Reordering')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🔄')
    );

  await interaction.followUp({
    embeds: [embed],
    components: [row],
    flags: 64
  });
}

async function resetQuestionsToDefaults(interaction, guild) {
  const embed = new EmbedBuilder()
    .setTitle('⚠️ Confirm Question Reset')
    .setDescription('This will reset all questions to the default set. Any custom questions will be lost.')
    .setColor(0xffa500)
    .addFields(
      { name: 'Default Questions:', value: [
        '1. What\'s your TikTok username?',
        '2. What\'s your email address?',
        '3. What\'s your WhatsApp number?'
      ].join('\n'), inline: false }
    );

  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('confirm_question_reset')
        .setLabel('Confirm Reset')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅'),
      new ButtonBuilder()
        .setCustomId('cancel_question_reset')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❌')
    );

  await interaction.followUp({
    embeds: [embed],
    components: [row],
    flags: 64
  });
}

async function getRoleDisplay(guild, roleName) {
  if (!roleName) return 'Not set';

  const role = guild.roles.cache.find(r => r.name === roleName);
  if (role) {
    return `<@&${role.id}>`;
  }

  return `⚠️ ${roleName} (not found)`;
}
