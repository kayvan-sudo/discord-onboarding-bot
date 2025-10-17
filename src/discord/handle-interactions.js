const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder } = require('discord.js');
const serverConfigManager = require('../services/server-config');

// Import server setup functions
const { performClientServerSetup, performCustomServerSetup } = require('../services/server-setup-utils');

// Helper function to handle admin interaction errors
async function handleInteractionError(interaction, error, context = {}) {
  // CRITICAL: Log that we're even in this function
  console.error('🚨 CRITICAL: handleInteractionError called!');
  console.error('🚨 Error details:', {
    errorMessage: error.message,
    errorStack: error.stack,
    hasInteraction: !!interaction,
    interactionType: interaction?.type,
    isDeferred: interaction?.deferred,
    customId: interaction?.customId,
    context: context
  });

  const guild = interaction.guild;
  const user = interaction.user;

  // Create detailed error information
  const errorId = `INT_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const errorDetails = {
    errorId,
    message: error.message,
    stack: error.stack,
    interactionType: interaction.type,
    customId: interaction.customId,
    guild: guild ? {
      id: guild.id,
      name: guild.name
    } : null,
    user: {
      id: user.id,
      tag: user.tag,
      username: user.username
    },
    context,
    timestamp: new Date().toISOString()
  };

  // Log to Heroku/console
  console.error('❌ Interaction Error:', {
    errorId,
    message: error.message,
    interactionType: errorDetails.interactionType,
    customId: errorDetails.customId,
    guild: errorDetails.guild?.name,
    user: errorDetails.user.tag,
    stack: error.stack,
    context: context,
    timestamp: errorDetails.timestamp
  });

  // Create user-friendly error message for Discord
  const { EmbedBuilder } = require('discord.js');
  const userErrorEmbed = new EmbedBuilder()
    .setTitle('❌ Interaction Error')
    .setDescription('An error occurred while processing your interaction.')
    .setColor(0xff0000)
    .addFields(
      { name: '🔍 Error ID', value: `\`${errorId}\``, inline: true },
      { name: '🎯 Interaction', value: interaction.customId || 'Unknown', inline: true },
      { name: '👤 User', value: user.tag, inline: true },
      { name: '⚠️ Error Message', value: error.message.length > 500 ? error.message.substring(0, 497) + '...' : error.message, inline: false }
    )
    .setFooter({ text: 'Please share the Error ID with the development team for assistance' })
    .setTimestamp();

  // Add technical details for debugging
  if (context && Object.keys(context).length > 0) {
    userErrorEmbed.addFields({
      name: '🔧 Context',
      value: `\`\`\`json\n${JSON.stringify(context, null, 2).substring(0, 500)}${JSON.stringify(context, null, 2).length > 500 ? '\n...' : ''}\`\`\``,
      inline: false
    });
  }

  // Send error message to user
  console.log('📤 Attempting to send error message to user...');
  try {
    // Check if interaction was deferred
    if (interaction.deferred) {
      console.log('📝 Interaction was deferred, using editReply...');
      await interaction.editReply({
        embeds: [userErrorEmbed],
        components: []
      });
    } else {
      console.log('📝 Interaction not deferred, using reply...');
      await interaction.reply({
        embeds: [userErrorEmbed],
        flags: 64
      });
    }
    console.log('✅ Error message sent to user successfully');
  } catch (sendError) {
    console.error('❌ Failed to send error message to user:', {
      errorId,
      deferred: interaction.deferred,
      sendError: sendError.message,
      sendErrorStack: sendError.stack
    });
    // Last resort - try to send a simple text response
    try {
      if (interaction.deferred) {
        await interaction.editReply({
          content: `❌ An error occurred. Error ID: \`${errorId}\`\nPlease share this with the development team.`,
          embeds: [],
          components: []
        });
      } else {
        await interaction.reply({
          content: `❌ An error occurred. Error ID: \`${errorId}\`\nPlease share this with the development team.`,
          flags: 64
        });
      }
      console.log('✅ Fallback error message sent');
    } catch (fallbackError) {
      console.error('❌ Even fallback error message failed:', {
        errorId,
        fallbackError: fallbackError.message
      });
    }
  }

  // Send to audit log if configured and user is admin
  if (guild) {
    try {
      const config = serverConfigManager.getServerConfig(guild.id);
      if (config && config.audit_channel) {
        const auditChannel = await guild.channels.fetch(config.audit_channel);
        if (auditChannel) {
          // Check if user is admin before logging to audit using auto-detection
          const { checkMemberAdminPermissions } = require('../services/server-config');
          const adminCheck = await checkMemberAdminPermissions(interaction.member);
          const isAdmin = adminCheck.isAdmin;

          if (isAdmin) {
            const auditErrorEmbed = new EmbedBuilder()
              .setTitle('🚨 Admin Interaction Error')
              .setDescription(`**${user.username}** encountered an error during an interaction`)
              .setColor(0xff4444)
              .addFields(
                { name: '🔍 Error ID', value: `\`${errorId}\``, inline: true },
                { name: '🎯 Interaction', value: interaction.customId || 'Unknown', inline: true },
                { name: '👤 Admin', value: `${user.tag}\nID: ${user.id}`, inline: true },
                { name: '⚠️ Error Message', value: error.message, inline: false },
                { name: '📊 Guild', value: `${guild.name}\nID: ${guild.id}`, inline: true },
                { name: '🕒 Timestamp', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                { name: '🎯 Context', value: context && Object.keys(context).length > 0 ? `\`\`\`json\n${JSON.stringify(context, null, 2).substring(0, 300)}${JSON.stringify(context, null, 2).length > 300 ? '\n...' : ''}\`\`\`` : 'None', inline: false }
              )
              .setFooter({ text: 'Vaulty Error Monitoring', iconURL: guild.client?.user?.displayAvatarURL() })
              .setTimestamp();

            await auditChannel.send({ embeds: [auditErrorEmbed] });
          }
        }
      }
    } catch (auditError) {
      console.warn('⚠️ Failed to send interaction error to audit log:', auditError.message);
    }
  }
}

module.exports = function handleInteractions(client) {
  client.on('interactionCreate', async (interaction) => {
    console.log(`📨 Interaction received: ${interaction.type} from ${interaction.user?.tag || 'unknown'}`);
    try {
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        await command.execute(interaction);
        return;
      }

      if (interaction.isButton()) {
        console.log(`🎛️ Button interaction detected: ${interaction.customId}`);
        await handleButtonInteraction(interaction);
        return;
      }

      if (interaction.isStringSelectMenu()) {
        await handleSelectMenuInteraction(interaction);
        return;
      }

      if (interaction.isModalSubmit()) {
        await handleModalSubmit(interaction);
        return;
      }
    } catch (e) {
      // Use our detailed error handling instead of generic message
      await handleInteractionError(interaction, e, {
        type: interaction.type,
        commandName: interaction.commandName || interaction.customId || 'unknown'
      });
    }
  });
};

async function handleButtonInteraction(interaction) {
  const customId = interaction.customId;
  console.log(`🔘 Button interaction received: ${customId} from ${interaction.user.tag}`);

  // Handle onboarding button
  if (customId === 'start_onboarding') {
    console.log(`🚀 Starting onboarding for ${interaction.user.tag} via button`);
    await handleStartOnboardingButton(interaction);
    return;
  }

  // Handle server-setup command buttons
  if (customId.startsWith('start_setup') || customId.startsWith('setup_') ||
      customId.startsWith('reconfigure') || customId.startsWith('view_stats') ||
      customId.startsWith('manual_') || customId.startsWith('back_to_') ||
      customId.startsWith('confirm_manual_') || customId.startsWith('cancel_manual_') ||
      customId === 'confirm_reset' || customId === 'cancel_reset') {
    console.log(`🔧 Routing ${customId} to handleServerSetupButtons`);
    await handleServerSetupButtons(interaction);
    return;
  }
}

async function handleServerSetupButtons(interaction) {
  const customId = interaction.customId;
  const guild = interaction.guild;
  console.log(`🔧 Processing server setup button: ${customId} for guild: ${guild?.name}`);

  // Test function to verify function calls work
  async function testFunction() {
    console.log('🧪 Test function called successfully');
    return 'test_result';
  }

  try {
    // Test the function call mechanism
    console.log('🧪 Testing function call mechanism...');
    const testResult = await testFunction();
    console.log('🧪 Test function result:', testResult);
    console.log('🧪 Function call mechanism works!');

    console.log('🔄 Switch statement entered with customId:', customId);

    switch (customId) {
      case 'start_setup':
        console.log('🎯 Matched case: start_setup');
        await startRoleConfiguration(interaction, guild);
        break;

      case 'configure_roles':
        await showRoleConfiguration(interaction, guild);
        break;

      case 'create_welcome_role':
        await createWelcomeRole(interaction, guild);
        break;

      case 'create_onboarding_role':
        await createOnboardingRole(interaction, guild);
        break;

      case 'create_verified_role':
        await createVerifiedRole(interaction, guild);
        break;

      case 'select_welcome_role':
        await selectWelcomeRole(interaction, guild);
        break;

      case 'select_onboarding_role':
        await selectOnboardingRole(interaction, guild);
        break;

      case 'select_verified_role':
        await selectVerifiedRole(interaction, guild);
        break;

      case 'finish_role_setup':
        await completeRoleSetup(interaction, guild);
        break;

      case 'skip_role_setup':
        await skipRoleSetup(interaction, guild);
        break;

      case 'proceed_anyway':
        await performServerSetup(interaction, guild);
        break;

      case 'go_back_roles':
        await showRoleConfiguration(interaction, guild);
        break;

      case 'manual_setup':
        console.log(`📋 Starting manual setup for ${interaction.user.tag}`);
        await startManualSetup(interaction, guild);
        break;

      case 'manual_step_1':
        await handleManualStep1(interaction, guild);
        break;

      case 'back_to_manual_start':
        await startManualSetup(interaction, guild);
        break;

      case 'back_to_step_1':
        await handleManualStep1(interaction, guild);
        break;

      case 'back_to_step_2':
        await handleManualStep2(interaction, guild);
        break;

      case 'back_to_step_3':
        await handleManualStep3(interaction, guild);
        break;

      case 'back_to_step_4':
        await handleManualStep4(interaction, guild);
        break;

      case 'back_to_step_5':
        await handleManualStep5(interaction, guild);
        break;

      case 'confirm_manual_setup':
        console.log('🎯 CONFIRM_MANUAL_SETUP CASE MATCHED!');
        console.log('🚀 About to call confirmManualSetup function...');
        console.log('🚀 Function exists:', typeof confirmManualSetup);
        console.log('🚀 Interaction valid:', !!interaction);
        console.log('🚀 Guild valid:', !!guild);

        // Check if function is defined
        if (typeof confirmManualSetup !== 'function') {
          console.error('🚨 CRITICAL: confirmManualSetup is not a function!');
          console.error('🚨 Available functions:', Object.keys(global).filter(key => typeof global[key] === 'function'));
          throw new Error('confirmManualSetup function is not defined');
        }

        try {
          console.log('🚀 Calling confirmManualSetup...');
          await confirmManualSetup(interaction, guild);
          console.log('✅ confirmManualSetup completed successfully');
        } catch (error) {
          console.error('❌ confirmManualSetup failed with error:', error);
          console.error('❌ Error type:', error.constructor.name);
          console.error('❌ Error message:', error.message);
          console.error('❌ Error stack:', error.stack);
          throw error; // Re-throw to be caught by outer handler
        }
        break;

      case 'cancel_manual_setup':
        await cancelManualSetup(interaction, guild);
        break;

      case 'reconfigure':
        await startReconfiguration(interaction, guild);
        break;

      case 'view_stats':
        await showServerStats(interaction, guild);
        break;

      case 'setup_client_server':
        console.log(`🏢 Starting client server setup for ${interaction.user.tag} in ${guild.name}`);
        await performClientServerSetup(interaction, guild);
        break;

      case 'setup_custom_server':
        console.log(`🎨 Starting custom server setup for ${interaction.user.tag} in ${guild.name}`);
        await performCustomServerSetup(interaction, guild);
        break;

      case 'setup_cancel':
      case 'cancel':
      case 'cancel_reset':
        await interaction.update({
          content: '❌ Operation cancelled.',
          embeds: [],
          components: []
        });
        break;

      case 'confirm_reset':
        console.log('🔄 Confirming server config reset for guild:', guild?.name);
        try {
          const config = serverConfigManager.getServerConfig(guild.id);
          if (!config) {
            await interaction.update({
              content: '❌ Server configuration not found.',
              embeds: [],
              components: []
            });
            return;
          }

          // Reset specific fields while preserving Google Sheet tab and registration
          const preservedFields = {
            sheet_tab: config.sheet_tab,
            joined_at: config.joined_at,
            // Deactivate server so it shows server type selection on next /server-setup
            active: false,
            // Keep historical data if it exists
            ...(config.historical_data && { historical_data: config.historical_data })
          };

          // Reset the server config to minimal state
          await serverConfigManager.updateServerConfig(guild.id, {
            ...preservedFields,
            welcome_channel: null,
            audit_channel: null,
            required_roles: [],
            admin_roles: [],
            questions: serverConfigManager.getDefaultQuestions(),
            question_version: 1,
            last_question_update: new Date().toISOString(),
            last_updated: new Date().toISOString()
          });

          const successEmbed = {
            title: '✅ Server Configuration Reset',
            description: 'Server configuration has been reset to defaults and deactivated.',
            color: 0x00ff00,
            fields: [
              { name: 'What was reset:', value: '• Welcome channel\n• Audit channel\n• Role configuration\n• Admin roles\n• Questions', inline: false },
              { name: 'What was preserved:', value: '• Google Sheet tab\n• Server registration\n• Historical data', inline: false },
              { name: '🎯 Next Step:', value: 'Run `/server-setup` to choose between Client Server or Custom Server setup!', inline: false }
            ],
            footer: { text: 'Server is now deactivated - ready for fresh setup' },
            timestamp: new Date()
          };

          await interaction.update({
            embeds: [successEmbed],
            components: []
          });

        } catch (error) {
          console.error('❌ Error resetting server config:', error);
          await interaction.update({
            content: `❌ Failed to reset server configuration: ${error.message}`,
            embeds: [],
            components: []
          });
        }
        break;

      default:
        console.log('❓ DEFAULT CASE: No match found for customId:', customId);
        console.log('❓ Available cases would be: start_setup, configure_roles, create_welcome_role, etc.');
        await interaction.reply({
          content: '❓ Unknown button interaction.',
          flags: 64
        });
    }
  } catch (error) {
    console.error('🚨 CATCH BLOCK: Error caught in handleServerSetupButtons');
    console.error('🚨 Original error:', error.message);
    console.error('🚨 Error stack:', error.stack);
    console.error('🚨 About to call handleInteractionError...');

    try {
      await handleInteractionError(interaction, error, {
        action: 'server_setup_button',
        customId: interaction.customId
      });
      console.error('🚨 handleInteractionError completed successfully');
    } catch (handlerError) {
      console.error('🚨 CRITICAL: handleInteractionError itself failed!');
      console.error('🚨 Handler error:', handlerError.message);
      console.error('🚨 Handler stack:', handlerError.stack);

      // Last resort - try to send a simple error message
      try {
        console.error('🚨 Attempting emergency error message...');
        await interaction.editReply({
          content: `❌ Critical error occurred. Error: ${error.message}\nHandler Error: ${handlerError.message}`,
          embeds: [],
          components: []
        });
        console.error('🚨 Emergency error message sent');
      } catch (emergencyError) {
        console.error('🚨 EMERGENCY ERROR MESSAGE ALSO FAILED!');
        console.error('🚨 Final error:', emergencyError.message);
      }
    }

    console.error('🚨 Error handling process completed');
  }
}

async function performServerSetup(interaction, guild) {
  await interaction.deferUpdate();

  try {
    // Perform auto-configuration
    const serverConfig = await serverConfigManager.configureServer(guild.id, guild);

    // Send audit log for server setup completion
    if (serverConfig.audit_channel) {
      try {
        const auditChannel = await guild.channels.fetch(serverConfig.audit_channel);
        if (auditChannel) {
          const auditEmbed = {
            title: '🚀 Server Configured',
            description: `**${guild.name}** has been configured for Vaulty`,
            color: 0x00ff00,
            fields: [
              { name: '👤 Admin', value: `${interaction.user.tag}\nID: ${interaction.user.id}`, inline: true },
              { name: '📅 Timestamp', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
              { name: '🎯 Action', value: 'Server Setup Complete', inline: true },
              { name: '📊 Sheet Tab', value: serverConfig.sheet_tab, inline: true },
              { name: '📢 Audit Channel', value: `<#${serverConfig.audit_channel}>`, inline: true },
              { name: '👋 Welcome Channel', value: serverConfig.welcome_channel, inline: true },
              { name: '🎭 Roles', value: serverConfig.required_roles?.join(', ') || 'Default', inline: false }
            ],
            footer: { text: 'Vaulty Server Configuration', iconURL: guild.client.user.displayAvatarURL() },
            timestamp: new Date()
          };

          await auditChannel.send({ embeds: [auditEmbed] });
        }
      } catch (auditError) {
        console.warn('Failed to send server setup audit log:', auditError.message);
      }
    }

    const successEmbed = {
      title: '✅ Server Setup Complete!',
      description: `**${guild.name}** has been successfully configured for Vaulty!`,
      color: 0x00ff00,
      fields: [
        {
          name: '📋 Configuration Summary',
          value: [
            `**Server:** ${guild.name}`,
            `**Sheet Tab:** ${serverConfig.sheet_tab}`,
            `**Audit Channel:** ${serverConfig.audit_channel ? `<#${serverConfig.audit_channel}>` : 'Auto-detected'}`,
            `**Welcome Channel:** ${serverConfig.welcome_channel}`,
            `**Roles:** ${serverConfig.required_roles?.join(', ') || 'Default'}`
          ].join('\n'),
          inline: false
        },
        {
          name: '🚀 Ready to Use!',
          value: [
            '• `/onboard` - Start onboarding process',
            '• `/server-config` - View/modify settings',
            '• `/tiktok-stats` - Creator analytics',
            '• `/ping` - Bot health check'
          ].join('\n'),
          inline: false
        }
      ],
      footer: { text: 'Vaulty Multi-Server Setup Complete!' },
      timestamp: new Date()
    };

    await interaction.editReply({
      embeds: [successEmbed],
      components: []
    });

  } catch (error) {
    await handleInteractionError(interaction, error, {
      action: 'perform_server_setup',
      setupStep: 'final_configuration'
    });
  }
}

async function startManualSetup(interaction, guild) {
  console.log(`🎯 startManualSetup called for ${interaction.user.tag} in ${guild.name}`);
  try {
    console.log(`⏳ Deferring update for manual setup`);
    await interaction.deferUpdate();
    console.log(`✅ Successfully deferred update`);

    // Initialize global manual setup data if it doesn't exist
    if (!global.manualSetupData) {
      global.manualSetupData = new Map();
    }

    const manualSetupEmbed = {
      title: '⚙️ Manual Server Setup',
      description: `Let's configure **${guild.name}** step by step. You'll be asked to specify each setting manually.`,
      color: 0x3498db,
      fields: [
        {
          name: '📋 Setup Steps:',
          value: [
            '1️⃣ **Welcome Channel** - Where users first arrive',
            '2️⃣ **Audit Channel** - Where admin logs are sent',
            '3️⃣ **Autojoin Role** - Role assigned when users join',
            '4️⃣ **Onboarding Role** - Role during onboarding process',
            '5️⃣ **Final Configuration** - Review and confirm'
          ].join('\n'),
          inline: false
        }
      ],
      footer: { text: 'Click Continue to start manual setup' },
      timestamp: new Date()
    };

    console.log(`🔧 Creating continue button components`);
    const continueButton = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('manual_step_1')
          .setLabel('Continue Setup')
          .setStyle(ButtonStyle.Success)
          .setEmoji('▶️'),
        new ButtonBuilder()
          .setCustomId('cancel')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('❌')
      );
    console.log(`✅ Created continue button components`);

    console.log(`📤 Sending manual setup embed with components`);
    await interaction.editReply({
      embeds: [manualSetupEmbed],
      components: [continueButton]
    });
    console.log(`✅ Successfully sent manual setup response`);
  } catch (error) {
    console.error('❌ Error in startManualSetup:', error);
    throw error; // Re-throw to be caught by the outer error handler
  }
}

async function startReconfiguration(interaction, guild) {
  // Don't defer here - performServerSetup will handle it
  const reconfigEmbed = {
    title: '🔄 Server Reconfiguration',
    description: `Let's update the configuration for **${guild.name}**.`,
    color: 0xffa500,
    fields: [
      {
        name: '⚙️ What will happen:',
        value: [
          '• Current settings will be preserved',
          '• You can modify any configuration',
          '• Google Sheet tab remains the same',
          '• Bot will restart with new settings'
        ].join('\n'),
        inline: false
      }
    ],
    footer: { text: 'Select what you want to reconfigure' },
    timestamp: new Date()
  };

  // For now, just trigger a new setup
  // TODO: Add more granular reconfiguration options
  await performServerSetup(interaction, guild);
}

async function handleManualStep1(interaction, guild) {
  try {
    await interaction.deferUpdate();

  // Get available text channels
  const textChannels = guild.channels.cache
    .filter(channel => channel.type === 0) // GuildText
    .sort((a, b) => a.position - b.position);

  if (textChannels.size === 0) {
    return interaction.editReply({
      content: '❌ No text channels found in this server.',
      embeds: [],
      components: []
    });
  }

  const channelOptions = textChannels.map(channel => ({
    label: `#${channel.name}`,
    value: channel.id,
    description: channel.topic ? channel.topic.substring(0, 50) : 'No description'
  })).slice(0, 25); // Discord limit of 25 options

  const step1Embed = {
    title: '1️⃣ Step 1: Welcome Channel',
    description: 'Select the channel where new users will be welcomed and can start onboarding.',
    color: 0x3498db,
    fields: [
      {
        name: '💡 Recommended Channels:',
        value: '• `welcome`\n• `introductions`\n• `general`\n• `main`',
        inline: true
      }
    ],
    footer: { text: 'Select a channel to continue' },
    timestamp: new Date()
  };

  const channelSelect = new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('select_welcome_channel')
        .setPlaceholder('Choose welcome channel...')
        .addOptions(channelOptions)
    );

  const backButton = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('back_to_manual_start')
        .setLabel('Back')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('⬅️')
    );

  await interaction.editReply({
    embeds: [step1Embed],
    components: [channelSelect, backButton]
  });
  } catch (error) {
    console.error('❌ Error in handleManualStep1:', error);
    throw error; // Re-throw to be caught by the outer error handler
  }
}

async function showServerStats(interaction, guild) {
  const config = serverConfigManager.getServerConfig(guild.id);
  const stats = serverConfigManager.getStats();

  const statsEmbed = {
    title: '📊 Server Statistics',
    description: `Statistics for **${guild.name}**`,
    color: 0x0099ff,
    fields: [
      {
        name: '🏠 This Server',
        value: [
          `**Configured:** ${config ? '✅ Yes' : '❌ No'}`,
          `**Active:** ${config?.active ? '✅ Yes' : '❌ No'}`,
          `**Sheet Tab:** ${config?.sheet_tab || 'N/A'}`,
          `**Audit Channel:** ${config?.audit_channel ? `<#${config.audit_channel}>` : 'None'}`
        ].join('\n'),
        inline: true
      },
      {
        name: '🌐 Global Stats',
        value: [
          `**Total Servers:** ${stats.total_servers}`,
          `**Active Servers:** ${stats.active_servers}`,
          `**Configured Audits:** ${stats.configured_audit_channels}`,
          `**Last Updated:** <t:${Math.floor(new Date(stats.last_updated).getTime() / 1000)}:R>`
        ].join('\n'),
        inline: true
      }
    ],
    footer: { text: 'Vaulty Multi-Server Statistics' },
    timestamp: new Date()
  };

  await interaction.update({
    embeds: [statsEmbed],
    components: []
  });
}

async function handleSelectMenuInteraction(interaction) {
  const customId = interaction.customId;
  const values = interaction.values;

  if (!values || values.length === 0) {
    return interaction.reply({
      content: '❓ No option selected.',
      flags: 64
    });
  }

  const selectedValue = values[0];

  switch (customId) {
    case 'config_action':
      await handleConfigAction(interaction, selectedValue);
      break;

    case 'select_channel':
      await handleChannelSelection(interaction, selectedValue);
      break;

    case 'select_role':
      await handleRoleSelection(interaction, selectedValue);
      break;

    case 'select_welcome_channel':
      await handleWelcomeChannelSelection(interaction, selectedValue);
      break;

    case 'select_audit_channel':
      await handleAuditChannelSelection(interaction, selectedValue);
      break;

    case 'select_welcome_role':
      await handleWelcomeRoleSelection(interaction, selectedValue);
      break;

    case 'select_onboarding_role':
      await handleOnboardingRoleSelection(interaction, selectedValue);
      break;

    case 'select_onboarded_role':
      await handleOnboardedRoleSelection(interaction, selectedValue);
      break;

    default:
      await interaction.reply({
        content: '❓ Unknown select menu interaction.',
        flags: 64
      });
  }
}

async function handleWelcomeChannelSelection(interaction, channelId) {
  try {
    await interaction.deferUpdate();

  const guild = interaction.guild;
  const selectedChannel = await guild.channels.fetch(channelId);

  if (!selectedChannel) {
    return interaction.editReply({
      content: '❌ Channel not found. Please try again.',
      embeds: [],
      components: []
    });
  }

  // Store the welcome channel selection in a temporary storage
  // For now, we'll use a simple in-memory store, but this should be improved
  if (!global.manualSetupData) {
    global.manualSetupData = new Map();
  }
  const setupKey = `${guild.id}_${interaction.user.id}`;
  const setupData = global.manualSetupData.get(setupKey) || {};
  setupData.welcomeChannel = selectedChannel;
  global.manualSetupData.set(setupKey, setupData);

  // Move to step 2: Audit channel selection
  await handleManualStep2(interaction, guild);
  } catch (error) {
    console.error('❌ Error in handleWelcomeChannelSelection:', error);
    throw error; // Re-throw to be caught by the outer error handler
  }
}

async function handleAuditChannelSelection(interaction, channelId) {
  try {
    // Don't defer here - select menu handler already deferred
    // await interaction.deferUpdate();

  const guild = interaction.guild;
  const selectedChannel = await guild.channels.fetch(channelId);

  if (!selectedChannel) {
    return interaction.editReply({
      content: '❌ Channel not found. Please try again.',
      embeds: [],
      components: []
    });
  }

  // Store the audit channel selection
  const setupKey = `${guild.id}_${interaction.user.id}`;
  const setupData = global.manualSetupData.get(setupKey) || {};
  setupData.auditChannel = selectedChannel;
  global.manualSetupData.set(setupKey, setupData);

  // Move to step 3: Welcome/Autojoin role selection
  await handleManualStep3(interaction, guild);
  } catch (error) {
    console.error('❌ Error in handleAuditChannelSelection:', error);
    throw error; // Re-throw to be caught by the outer error handler
  }
}

async function handleManualStep2(interaction, guild) {
  try {
    // Don't defer here - handleWelcomeChannelSelection already deferred
    // await interaction.deferUpdate();

  // Get available text channels
  const textChannels = guild.channels.cache
    .filter(channel => channel.type === 0) // GuildText
    .sort((a, b) => a.position - b.position);

  if (textChannels.size === 0) {
    return interaction.editReply({
      content: '❌ No text channels found in this server.',
      embeds: [],
      components: []
    });
  }

  const channelOptions = textChannels.map(channel => ({
    label: `#${channel.name}`,
    value: channel.id,
    description: channel.topic ? channel.topic.substring(0, 50) : 'No description'
  })).slice(0, 25); // Discord limit of 25 options

  const step2Embed = {
    title: '2️⃣ Step 2: Audit Channel',
    description: 'Select the channel where administrative actions and onboarding completions will be logged.',
    color: 0xe67e22,
    fields: [
      {
        name: '💡 Recommended Channels:',
        value: '• `audit-logs`\n• `admin-logs`\n• `bot-logs`\n• `staff-only`',
        inline: true
      }
    ],
    footer: { text: 'Select a channel to continue' },
    timestamp: new Date()
  };

  const channelSelect = new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('select_audit_channel')
        .setPlaceholder('Choose audit channel...')
        .addOptions(channelOptions)
    );

  const backButton = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('back_to_step_1')
        .setLabel('Back to Step 1')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('⬅️')
    );

  await interaction.editReply({
    embeds: [step2Embed],
    components: [channelSelect, backButton]
  });
  } catch (error) {
    console.error('❌ Error in handleManualStep2:', error);
    throw error; // Re-throw to be caught by the outer error handler
  }
}

async function handleManualStep3(interaction, guild) {
  try {
    await interaction.deferUpdate();

    // Get available roles
    const roles = guild.roles.cache
      .filter(role => !role.managed && role.name !== '@everyone') // Exclude managed roles and @everyone
      .sort((a, b) => b.position - a.position); // Sort by position (highest first)

    if (roles.size === 0) {
      return interaction.editReply({
        content: '❌ No roles found in this server.',
        embeds: [],
        components: []
      });
    }

    const roleOptions = roles.map(role => ({
      label: role.name,
      value: role.id,
      description: `Position: ${role.position}`,
      emoji: role.color ? '🎨' : '📝'
    })).slice(0, 25); // Discord limit of 25 options

    const step3Embed = {
      title: '3️⃣ Step 3: Autojoin Role',
      description: 'Select the role that will be automatically assigned when users join the server.',
      color: 0x9b59b6,
      fields: [
        {
          name: '💡 Recommended Roles:',
          value: '• `Welcome`\n• `Member`\n• `Newcomer`\n• `Unverified`',
          inline: true
        },
        {
          name: 'ℹ️ Note:',
          value: 'This role will be assigned to all new users automatically.',
          inline: true
        }
      ],
      footer: { text: 'Select a role to continue' },
      timestamp: new Date()
    };

    const roleSelect = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('select_welcome_role')
          .setPlaceholder('Choose autojoin role...')
          .addOptions(roleOptions)
      );

    const backButton = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('back_to_step_2')
          .setLabel('Back to Step 2')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('⬅️')
      );

    await interaction.editReply({
      embeds: [step3Embed],
      components: [roleSelect, backButton]
    });

  } catch (error) {
    console.error('❌ Error in handleManualStep3:', error);
    throw error; // Re-throw to be caught by the outer error handler
  }
}

async function handleWelcomeRoleSelection(interaction, roleId) {
  try {
    // Don't defer here - select menu handler already deferred
    // await interaction.deferUpdate();

    const guild = interaction.guild;
    const selectedRole = await guild.roles.fetch(roleId);

    if (!selectedRole) {
      return interaction.editReply({
        content: '❌ Role not found. Please try again.',
        embeds: [],
        components: []
      });
    }

    // Store the welcome role selection
    const setupKey = `${guild.id}_${interaction.user.id}`;
    const setupData = global.manualSetupData.get(setupKey) || {};
    setupData.welcomeRole = selectedRole;
    global.manualSetupData.set(setupKey, setupData);

    // Move to step 4: Onboarding role selection
    await handleManualStep4(interaction, guild);
  } catch (error) {
    console.error('❌ Error in handleWelcomeRoleSelection:', error);
    throw error; // Re-throw to be caught by the outer error handler
  }
}

async function handleManualStep4(interaction, guild) {
  try {
    await interaction.deferUpdate();

    // Get available roles (same as step 3)
    const roles = guild.roles.cache
      .filter(role => !role.managed && role.name !== '@everyone')
      .sort((a, b) => b.position - a.position);

    if (roles.size === 0) {
      return interaction.editReply({
        content: '❌ No roles found in this server.',
        embeds: [],
        components: []
      });
    }

    const roleOptions = roles.map(role => ({
      label: role.name,
      value: role.id,
      description: `Position: ${role.position}`,
      emoji: role.color ? '🎨' : '📝'
    })).slice(0, 25);

    const step4Embed = {
      title: '4️⃣ Step 4: Onboarding Role',
      description: 'Select the role that will be assigned during the onboarding process.',
      color: 0xe74c3c,
      fields: [
        {
          name: '💡 Recommended Roles:',
          value: '• `Onboarding`\n• `In-Process`\n• `Pending`\n• `Unverified`',
          inline: true
        },
        {
          name: 'ℹ️ Note:',
          value: 'This role will be removed after onboarding is complete.',
          inline: true
        }
      ],
      footer: { text: 'Select a role to continue' },
      timestamp: new Date()
    };

    const roleSelect = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('select_onboarding_role')
          .setPlaceholder('Choose onboarding role...')
          .addOptions(roleOptions)
      );

    const backButton = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('back_to_step_3')
          .setLabel('Back to Step 3')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('⬅️')
      );

    await interaction.editReply({
      embeds: [step4Embed],
      components: [roleSelect, backButton]
    });

  } catch (error) {
    console.error('❌ Error in handleManualStep4:', error);
    throw error; // Re-throw to be caught by the outer error handler
  }
}

async function handleOnboardingRoleSelection(interaction, roleId) {
  try {
    // Don't defer here - select menu handler already deferred

    const guild = interaction.guild;
    const selectedRole = await guild.roles.fetch(roleId);

    if (!selectedRole) {
      return interaction.editReply({
        content: '❌ Role not found. Please try again.',
        embeds: [],
        components: []
      });
    }

    // Store the onboarding role selection
    const setupKey = `${guild.id}_${interaction.user.id}`;
    const setupData = global.manualSetupData.get(setupKey) || {};
    setupData.onboardingRole = selectedRole;
    global.manualSetupData.set(setupKey, setupData);

    // Move to step 5: Onboarded role selection
    await handleManualStep5(interaction, guild);
  } catch (error) {
    console.error('❌ Error in handleOnboardingRoleSelection:', error);
    throw error; // Re-throw to be caught by the outer error handler
  }
}

async function handleManualStep5(interaction, guild) {
  try {
    await interaction.deferUpdate();

    // Get available roles (same as previous steps)
    const roles = guild.roles.cache
      .filter(role => !role.managed && role.name !== '@everyone')
      .sort((a, b) => b.position - a.position);

    if (roles.size === 0) {
      return interaction.editReply({
        content: '❌ No roles found in this server.',
        embeds: [],
        components: []
      });
    }

    const roleOptions = roles.map(role => ({
      label: role.name,
      value: role.id,
      description: `Position: ${role.position}`,
      emoji: role.color ? '🎨' : '📝'
    })).slice(0, 25);

    const step5Embed = {
      title: '5️⃣ Step 5: Onboarded Role',
      description: 'Select the role that will be assigned after onboarding is complete.',
      color: 0x2ecc71,
      fields: [
        {
          name: '💡 Recommended Roles:',
          value: '• `Verified`\n• `Member`\n• `Complete`\n• `Approved`',
          inline: true
        },
        {
          name: 'ℹ️ Note:',
          value: 'This role will be granted after successful onboarding.',
          inline: true
        }
      ],
      footer: { text: 'Select a role to continue' },
      timestamp: new Date()
    };

    const roleSelect = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('select_onboarded_role')
          .setPlaceholder('Choose onboarded role...')
          .addOptions(roleOptions)
      );

    const backButton = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('back_to_step_4')
          .setLabel('Back to Step 4')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('⬅️')
      );

    await interaction.editReply({
      embeds: [step5Embed],
      components: [roleSelect, backButton]
    });

  } catch (error) {
    console.error('❌ Error in handleManualStep5:', error);
    throw error; // Re-throw to be caught by the outer error handler
  }
}

async function handleOnboardedRoleSelection(interaction, roleId) {
  try {
    // Don't defer here - select menu handler already deferred

    const guild = interaction.guild;
    const selectedRole = await guild.roles.fetch(roleId);

    if (!selectedRole) {
      return interaction.editReply({
        content: '❌ Role not found. Please try again.',
        embeds: [],
        components: []
      });
    }

    // Store the onboarded role selection
    const setupKey = `${guild.id}_${interaction.user.id}`;
    const setupData = global.manualSetupData.get(setupKey) || {};
    setupData.onboardedRole = selectedRole;
    global.manualSetupData.set(setupKey, setupData);

    // Move to final review
    await handleManualFinalReview(interaction, guild);
  } catch (error) {
    console.error('❌ Error in handleOnboardedRoleSelection:', error);
    throw error; // Re-throw to be caught by the outer error handler
  }
}

async function handleManualFinalReview(interaction, guild) {
  try {
    await interaction.deferUpdate();

    const setupKey = `${guild.id}_${interaction.user.id}`;
    const setupData = global.manualSetupData?.get(setupKey) || {};

    const reviewEmbed = {
      title: '📋 Final Review: Manual Setup',
      description: `Please review your configuration for **${guild.name}** before applying.`,
      color: 0xf39c12,
      fields: [
        {
          name: '🏠 Welcome Channel',
          value: setupData.welcomeChannel ? `<#${setupData.welcomeChannel.id}>` : 'Not set',
          inline: true
        },
        {
          name: '📢 Audit Channel',
          value: setupData.auditChannel ? `<#${setupData.auditChannel.id}>` : 'Not set',
          inline: true
        },
        {
          name: '🚪 Autojoin Role',
          value: setupData.welcomeRole ? `<@&${setupData.welcomeRole.id}>` : 'Not set',
          inline: true
        },
        {
          name: '📝 Onboarding Role',
          value: setupData.onboardingRole ? `<@&${setupData.onboardingRole.id}>` : 'Not set',
          inline: true
        },
        {
          name: '✅ Onboarded Role',
          value: setupData.onboardedRole ? `<@&${setupData.onboardedRole.id}>` : 'Not set',
          inline: true
        }
      ],
      footer: { text: 'Review your settings and confirm to apply' },
      timestamp: new Date()
    };

    const confirmButtons = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('confirm_manual_setup')
          .setLabel('✅ Confirm & Apply')
          .setStyle(ButtonStyle.Success)
          .setEmoji('🎉'),
        new ButtonBuilder()
          .setCustomId('cancel_manual_setup')
          .setLabel('❌ Cancel')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🚫'),
        new ButtonBuilder()
          .setCustomId('back_to_step_5')
          .setLabel('⬅️ Back to Step 5')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('⬅️')
      );

    await interaction.editReply({
      embeds: [reviewEmbed],
      components: [confirmButtons]
    });

  } catch (error) {
    console.error('❌ Error in handleManualFinalReview:', error);
    throw error; // Re-throw to be caught by the outer error handler
  }
}

async function confirmManualSetup(interaction, guild) {
  console.log('🚀 CONFIRMMANUALSETUP FUNCTION CALLED!');
  console.log('🚀 Interaction object:', {
    hasInteraction: !!interaction,
    type: interaction?.type,
    customId: interaction?.customId,
    deferred: interaction?.deferred,
    replied: interaction?.replied
  });
  console.log('🚀 Guild object:', {
    hasGuild: !!guild,
    guildName: guild?.name,
    guildId: guild?.id
  });

  try {
    console.log('🎯 Starting manual setup confirmation...');
    await interaction.deferUpdate();

    const setupKey = `${guild.id}_${interaction.user.id}`;
    const setupData = global.manualSetupData?.get(setupKey) || {};

    console.log('📊 Setup data retrieved:', {
      setupKey,
      hasWelcomeChannel: !!setupData.welcomeChannel,
      hasAuditChannel: !!setupData.auditChannel,
      hasWelcomeRole: !!setupData.welcomeRole,
      hasOnboardingRole: !!setupData.onboardingRole,
      hasOnboardedRole: !!setupData.onboardedRole
    });

    // Apply the configuration
    console.log('⚙️ Retrieving server config...');
    const config = serverConfigManager.getServerConfig(guild.id);
    console.log('⚙️ Server config retrieved:', !!config);

    if (config) {
      const updates = {};

      if (setupData.welcomeChannel) {
        updates.welcome_channel = setupData.welcomeChannel.name;
        console.log('🏠 Setting welcome channel:', setupData.welcomeChannel.name);
      }

      if (setupData.auditChannel) {
        updates.audit_channel = setupData.auditChannel.id;
        console.log('📢 Setting audit channel:', setupData.auditChannel.id);
      }

      if (setupData.welcomeRole) {
        updates.welcome_role = setupData.welcomeRole.name;
        console.log('🚪 Setting welcome role:', setupData.welcomeRole.name);
      }

      if (setupData.onboardingRole) {
        updates.required_roles = [
          setupData.onboardingRole.name,
          setupData.onboardedRole?.name || config.required_roles?.[1] || 'Verified'
        ];
        console.log('📝 Setting required roles:', updates.required_roles);
      }

      console.log('💾 Applying server config updates...');
      await serverConfigManager.updateServerConfig(guild.id, updates);
      console.log('✅ Server config updated successfully');
    }

    // Clear the temporary setup data
    if (global.manualSetupData) {
      global.manualSetupData.delete(setupKey);
      console.log('🧹 Cleared temporary setup data');
    }

    console.log('📝 Building success embed...');
    const successEmbed = {
      title: '✅ Manual Setup Complete!',
      description: `**${guild.name}** has been successfully configured with your custom settings.`,
      color: 0x00ff00,
      fields: [
        {
          name: '📋 Configuration Applied:',
          value: [
            setupData.welcomeChannel ? `• Welcome Channel: <#${setupData.welcomeChannel.id}>` : '',
            setupData.auditChannel ? `• Audit Channel: <#${setupData.auditChannel.id}>` : '',
            setupData.welcomeRole ? `• Autojoin Role: <@&${setupData.welcomeRole.id}>` : '',
            setupData.onboardingRole ? `• Onboarding Role: <@&${setupData.onboardingRole.id}>` : '',
            setupData.onboardedRole ? `• Onboarded Role: <@&${setupData.onboardedRole.id}>` : ''
          ].filter(Boolean).join('\n') || '• Using existing configuration',
          inline: false
        }
      ],
      footer: { text: 'Setup completed successfully!' },
      timestamp: new Date()
    };

    console.log('📤 Sending success response...');
    await interaction.editReply({
      embeds: [successEmbed],
      components: []
    });

    // Send audit log to designated audit channel
    console.log('📊 Sending audit log to designated channel...');
    try {
      if (setupData.auditChannel && guild) {
        const auditChannel = await guild.channels.fetch(setupData.auditChannel.id);
        if (auditChannel && auditChannel.isTextBased()) {
          const auditEmbed = {
            title: '🔧 Server Setup Completed',
            description: `Manual server configuration completed for **${guild.name}**`,
            color: 0x00ff00,
            fields: [
              {
                name: '👤 Setup Performed By',
                value: `<@${interaction.user.id}> (${interaction.user.tag})`,
                inline: true
              },
              {
                name: '⚙️ Configuration Applied',
                value: [
                  setupData.welcomeChannel ? `• Welcome Channel: <#${setupData.welcomeChannel.id}>` : '',
                  setupData.auditChannel ? `• Audit Channel: <#${setupData.auditChannel.id}>` : '',
                  setupData.welcomeRole ? `• Autojoin Role: <@&${setupData.welcomeRole.id}>` : '',
                  setupData.onboardingRole ? `• Onboarding Role: <@&${setupData.onboardingRole.id}>` : '',
                  setupData.onboardedRole ? `• Onboarded Role: <@&${setupData.onboardedRole.id}>` : ''
                ].filter(Boolean).join('\n') || '• No changes applied',
                inline: false
              },
              {
                name: '📊 Setup Method',
                value: 'Manual Configuration',
                inline: true
              }
            ],
            footer: { text: 'Vaulty Onboarding System' },
            timestamp: new Date()
          };

          await auditChannel.send({ embeds: [auditEmbed] });
          console.log('✅ Audit log sent to designated channel');
        } else {
          console.log('⚠️ Audit channel not found or not text-based');
        }
      } else {
        console.log('⚠️ No audit channel configured for audit logging');
      }
    } catch (auditError) {
      console.error('❌ Failed to send audit log:', auditError);
      // Don't fail the entire setup if audit logging fails
    }

    console.log('🎉 Manual setup confirmation completed successfully!');

  } catch (error) {
    console.error('❌ Error in confirmManualSetup:', error);
    console.error('❌ Error stack:', error.stack);
    throw error; // Re-throw to be caught by the outer error handler
  }
}

async function cancelManualSetup(interaction, guild) {
  try {
    await interaction.deferUpdate();

    // Clear the temporary setup data
    const setupKey = `${guild.id}_${interaction.user.id}`;
    if (global.manualSetupData) {
      global.manualSetupData.delete(setupKey);
    }

    const cancelEmbed = {
      title: '❌ Manual Setup Cancelled',
      description: `The manual setup for **${guild.name}** has been cancelled.`,
      color: 0xe74c3c,
      fields: [
        {
          name: 'ℹ️ Note:',
          value: 'No changes were applied to your server configuration.',
          inline: false
        }
      ],
      footer: { text: 'You can restart the setup anytime with /server-setup' },
      timestamp: new Date()
    };

    await interaction.editReply({
      embeds: [cancelEmbed],
      components: []
    });

  } catch (error) {
    console.error('❌ Error in cancelManualSetup:', error);
    throw error; // Re-throw to be caught by the outer error handler
  }
}

async function handleConfigAction(interaction, action) {
  const guild = interaction.guild;

  try {
    switch (action) {
      case 'set_welcome':
        await showChannelSelector(interaction, 'welcome');
        break;

      case 'set_audit':
        await showChannelSelector(interaction, 'audit');
        break;

      case 'set_roles':
        await showRoleSelector(interaction);
        break;

      case 'add_admin':
        await showRoleSelector(interaction, 'admin');
        break;

      case 'view_stats':
        await showDetailedStats(interaction, guild);
        break;

      default:
        await interaction.update({
          content: '❓ Unknown action selected.',
          embeds: [],
          components: []
        });
    }
  } catch (error) {
    console.error('Config action error:', error);
    await interaction.followUp({
      content: `❌ Error: ${error.message}`,
      flags: 64
    });
  }
}

async function showChannelSelector(interaction, type) {
  const guild = interaction.guild;
  const channels = guild.channels.cache
    .filter(ch => ch.type === 0) // TEXT channels only
    .map(ch => ({
      label: ch.name.length > 25 ? ch.name.substring(0, 22) + '...' : ch.name,
      value: `${type}_channel_${ch.id}`,
      description: `${ch.members.size} members`,
      emoji: type === 'welcome' ? '👋' : '📋'
    }))
    .slice(0, 25); // Discord limit

  if (channels.length === 0) {
    return interaction.update({
      content: '❌ No text channels found in this server.',
      embeds: [],
      components: []
    });
  }

  const selectMenu = {
    type: 3, // String select menu
    custom_id: 'select_channel',
    placeholder: `Select ${type} channel...`,
    options: channels
  };

  const row = { type: 1, components: [selectMenu] };

  const embed = {
    title: `${type === 'welcome' ? '👋' : '📋'} Select ${type.charAt(0).toUpperCase() + type.slice(1)} Channel`,
    description: `Choose which channel to use for ${type} ${type === 'welcome' ? 'messages' : 'logs'}.`,
    color: 0x0099ff
  };

  await interaction.update({
    embeds: [embed],
    components: [row]
  });
}

async function showRoleSelector(interaction, type = 'onboarding') {
  const guild = interaction.guild;
  const roles = guild.roles.cache
    .filter(role => !role.managed && role.name !== '@everyone') // Exclude managed roles and @everyone
    .sort((a, b) => b.position - a.position) // Sort by position
    .map(role => ({
      label: role.name.length > 25 ? role.name.substring(0, 22) + '...' : role.name,
      value: `${type}_role_${role.id}`,
      description: `Position: ${role.position}`,
      emoji: type === 'admin' ? '👑' : '🎭'
    }))
    .slice(0, 25); // Discord limit

  if (roles.length === 0) {
    return interaction.update({
      content: '❌ No suitable roles found in this server.',
      embeds: [],
      components: []
    });
  }

  const selectMenu = {
    type: 3, // String select menu
    custom_id: 'select_role',
    placeholder: `Select ${type} role...`,
    options: roles
  };

  const row = { type: 1, components: [selectMenu] };

  const embed = {
    title: `${type === 'admin' ? '👑' : '🎭'} Select ${type.charAt(0).toUpperCase() + type.slice(1)} Role`,
    description: type === 'admin'
      ? 'Choose a role to add to the admin list.'
      : 'Choose roles for the onboarding process.',
    color: 0x0099ff
  };

  await interaction.update({
    embeds: [embed],
    components: [row]
  });
}

async function handleChannelSelection(interaction, selectedValue) {
  const guild = interaction.guild;
  const [type, _, channelId] = selectedValue.split('_');

  try {
    const channel = await guild.channels.fetch(channelId);
    if (!channel) {
      return interaction.update({
        content: '❌ Channel not found.',
        embeds: [],
        components: []
      });
    }

    if (type === 'welcome') {
      await serverConfigManager.updateServerConfig(guild.id, {
        welcome_channel: channel.name
      });

      // Send audit log
      try {
        const config = serverConfigManager.getServerConfig(guild.id);
        if (config && config.audit_channel) {
          const auditChannel = await guild.channels.fetch(config.audit_channel);
          if (auditChannel) {
            const auditEmbed = {
              title: '⚙️ Configuration Changed',
              description: `**${interaction.user.username}** set welcome channel`,
              color: 0xffa500,
              fields: [
                { name: '👤 Admin', value: `${interaction.user.tag}\nID: ${interaction.user.id}`, inline: true },
                { name: '📅 Timestamp', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                { name: '🎯 Action', value: 'Set Welcome Channel', inline: true },
                { name: '📋 Details', value: `Channel: <#${channel.id}> (${channel.name})`, inline: false }
              ],
              footer: { text: 'Vaulty Configuration Audit', iconURL: guild.client.user.displayAvatarURL() },
              timestamp: new Date()
            };

            await auditChannel.send({ embeds: [auditEmbed] });
          }
        }
      } catch (auditError) {
        console.warn('Failed to send welcome channel audit log:', auditError.message);
      }

      await interaction.update({
        content: `✅ Welcome channel set to <#${channel.id}>`,
        embeds: [],
        components: []
      });
    } else if (type === 'audit') {
      await serverConfigManager.updateServerConfig(guild.id, {
        audit_channel: channel.id
      });

      await interaction.update({
        content: `✅ Audit channel set to <#${channel.id}>`,
        embeds: [],
        components: []
      });
    }

  } catch (error) {
    console.error('Channel selection error:', error);
    await interaction.update({
      content: `❌ Error setting channel: ${error.message}`,
      embeds: [],
      components: []
    });
  }
}

async function handleRoleSelection(interaction, selectedValue) {
  const guild = interaction.guild;
  const [type, _, roleId] = selectedValue.split('_');

  try {
    const role = await guild.roles.fetch(roleId);
    if (!role) {
      return interaction.update({
        content: '❌ Role not found.',
        embeds: [],
        components: []
      });
    }

    if (type === 'admin') {
      // Add admin role
      const config = serverConfigManager.getServerConfig(guild.id);
      const adminRoles = [...(config.admin_roles || [])];

      if (!adminRoles.includes(role.name)) {
        adminRoles.push(role.name);
        await serverConfigManager.updateServerConfig(guild.id, {
          admin_roles: adminRoles
        });

        // Send audit log
        try {
          if (config.audit_channel) {
            const auditChannel = await guild.channels.fetch(config.audit_channel);
            if (auditChannel) {
              const auditEmbed = {
                title: '⚙️ Configuration Changed',
                description: `**${interaction.user.username}** added admin role`,
                color: 0xffa500,
                fields: [
                  { name: '👤 Admin', value: `${interaction.user.tag}\nID: ${interaction.user.id}`, inline: true },
                  { name: '📅 Timestamp', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                  { name: '🎯 Action', value: 'Add Admin Role', inline: true },
                  { name: '📋 Details', value: `Role: ${role.name} (<@&${role.id}>)`, inline: false }
                ],
                footer: { text: 'Vaulty Configuration Audit', iconURL: guild.client.user.displayAvatarURL() },
                timestamp: new Date()
              };

              await auditChannel.send({ embeds: [auditEmbed] });
            }
          }
        } catch (auditError) {
          console.warn('Failed to send admin role audit log:', auditError.message);
        }
      }

      await interaction.update({
        content: `✅ Added ${role.name} to admin roles.`,
        embeds: [],
        components: []
      });
    } else {
      // Onboarding roles - show modal for role assignment
      await showRoleAssignmentModal(interaction, role);
    }

  } catch (error) {
    console.error('Role selection error:', error);
    await interaction.update({
      content: `❌ Error configuring role: ${error.message}`,
      embeds: [],
      components: []
    });
  }
}

async function showRoleAssignmentModal(interaction, selectedRole) {
  const modal = {
    title: 'Configure Onboarding Roles',
    custom_id: 'role_assignment_modal',
    components: [
      {
        type: 1, // Action row
        components: [
          {
            type: 4, // Text input
            custom_id: 'onboarding_role',
            label: 'Role to remove after onboarding',
            style: 1, // Short
            placeholder: 'e.g., Newcomer, Onboarding',
            required: false
          }
        ]
      },
      {
        type: 1, // Action row
        components: [
          {
            type: 4, // Text input
            custom_id: 'onboarded_role',
            label: 'Role to grant after onboarding',
            style: 1, // Short
            placeholder: 'e.g., Creator, Member, Verified',
            required: false
          }
        ]
      },
      {
        type: 1, // Action row
        components: [
          {
            type: 4, // Text input
            custom_id: 'sample_role',
            label: 'Optional sample role',
            style: 1, // Short
            placeholder: 'e.g., VIP, Premium (leave empty if none)',
            required: false
          }
        ]
      }
    ]
  };

  await interaction.showModal(modal);
}

async function handleModalSubmit(interaction) {
  const customId = interaction.customId;

  switch (customId) {
    case 'role_assignment_modal':
      await handleRoleAssignmentModal(interaction);
      break;
    case 'add_question_modal':
      await handleAddQuestionModal(interaction);
      break;
    case 'reorder_questions_modal':
      await handleReorderQuestionsModal(interaction);
      break;
    default:
      // Handle edit question modals
      if (customId.startsWith('edit_question_modal_')) {
        const questionId = customId.replace('edit_question_modal_', '');
        await handleEditQuestionModal(interaction, questionId);
      }
      // Handle role creation modals
      else if (customId.startsWith('create_role_modal_')) {
        const roleType = customId.replace('create_role_modal_', '');
        await handleRoleCreationModal(interaction, roleType);
      } else {
        await interaction.reply({
          content: '❓ Unknown modal submission.',
          flags: 64
        });
      }
  }
}

async function handleRoleAssignmentModal(interaction) {
  const guild = interaction.guild;

  // Get the form values
  const onboardingRoleName = interaction.fields.getTextInputValue('onboarding_role')?.trim();
  const onboardedRoleName = interaction.fields.getTextInputValue('onboarded_role')?.trim();
  const sampleRoleName = interaction.fields.getTextInputValue('sample_role')?.trim();

  try {
    const config = serverConfigManager.getServerConfig(guild.id);
    if (!config) {
      return interaction.reply({
        content: '❌ This server is not configured yet. Run `/server-setup` first.',
        flags: 64
      });
    }

    // Build new required roles array
    const requiredRoles = [...(config.required_roles || [])];

    if (onboardingRoleName) requiredRoles[0] = onboardingRoleName;
    if (onboardedRoleName) requiredRoles[1] = onboardedRoleName;
    if (sampleRoleName) requiredRoles[2] = sampleRoleName;

    // Validate roles exist
    const roleErrors = [];
    for (let i = 0; i < requiredRoles.length; i++) {
      const roleName = requiredRoles[i];
      if (roleName) {
        const role = guild.roles.cache.find(r => r.name === roleName);
        if (!role) {
          roleErrors.push(`Role "${roleName}" not found`);
        }
      }
    }

    if (roleErrors.length > 0) {
      return interaction.reply({
        content: `❌ Role validation failed:\n${roleErrors.map(err => `• ${err}`).join('\n')}`,
        flags: 64
      });
    }

    // Update configuration
    await serverConfigManager.updateServerConfig(guild.id, {
      required_roles: requiredRoles.filter(role => role) // Remove empty entries
    });

    // Send audit log
    const roleChanges = [];
    if (onboardingRoleName) roleChanges.push(`Onboarding: ${onboardingRoleName}`);
    if (onboardedRoleName) roleChanges.push(`Onboarded: ${onboardedRoleName}`);
    if (sampleRoleName) roleChanges.push(`Sample: ${sampleRoleName}`);

    if (roleChanges.length > 0) {
      try {
        const auditChannelId = config.audit_channel;
        if (auditChannelId) {
          const auditChannel = await guild.channels.fetch(auditChannelId);
          if (auditChannel) {
            const auditEmbed = {
              title: '⚙️ Configuration Changed',
              description: `**${interaction.user.username}** configured onboarding roles`,
              color: 0xffa500,
              fields: [
                { name: '👤 Admin', value: `${interaction.user.tag}\nID: ${interaction.user.id}`, inline: true },
                { name: '📅 Timestamp', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                { name: '🎯 Action', value: 'Configure Roles', inline: true },
                { name: '📋 Details', value: roleChanges.join('\n'), inline: false }
              ],
              footer: { text: 'Vaulty Configuration Audit', iconURL: guild.client.user.displayAvatarURL() },
              timestamp: new Date()
            };

            await auditChannel.send({ embeds: [auditEmbed] });
          }
        }
      } catch (auditError) {
        console.warn('Failed to send role config audit log:', auditError.message);
      }
    }

    // Create success message
    const roleSummary = [];
    if (onboardingRoleName) roleSummary.push(`**Onboarding:** ${onboardingRoleName}`);
    if (onboardedRoleName) roleSummary.push(`**Onboarded:** ${onboardedRoleName}`);
    if (sampleRoleName) roleSummary.push(`**Sample:** ${sampleRoleName}`);

    await interaction.reply({
      content: `✅ Onboarding roles configured successfully!\n\n${roleSummary.join('\n')}`,
      flags: 64
    });

  } catch (error) {
    console.error('Role assignment modal error:', error);
    await interaction.reply({
      content: `❌ Error configuring roles: ${error.message}`,
      flags: 64
    });
  }
}

async function handleAddQuestionModal(interaction) {
  const guild = interaction.guild;

  const questionText = interaction.fields.getTextInputValue('question_text')?.trim();
  const questionType = interaction.fields.getTextInputValue('question_type')?.trim();
  const questionValidation = interaction.fields.getTextInputValue('question_validation')?.trim();
  const questionPlaceholder = interaction.fields.getTextInputValue('question_placeholder')?.trim();

  if (!questionText) {
    return interaction.reply({
      content: '❌ Question text is required.',
      flags: 64
    });
  }

  try {
    const questionData = {
      question: questionText,
      type: questionType || 'text',
      validation: questionValidation || 'required',
      placeholder: questionPlaceholder || ''
    };

    const newQuestion = await serverConfigManager.addServerQuestion(guild.id, questionData);

    // Send audit log
    await sendConfigAuditLog(guild, interaction.user, 'Add Question',
      `Added: "${questionText}" (Type: ${questionType}, Validation: ${questionValidation})`);

    await interaction.reply({
      content: `✅ Question added successfully!\n\n**Preview:** ${questionText}\n**ID:** \`${newQuestion.id}\``,
      flags: 64
    });

  } catch (error) {
    console.error('Add question modal error:', error);
    await interaction.reply({
      content: `❌ Error adding question: ${error.message}`,
      flags: 64
    });
  }
}

async function handleEditQuestionModal(interaction, questionId) {
  const guild = interaction.guild;

  const questionText = interaction.fields.getTextInputValue('question_text')?.trim();
  const questionType = interaction.fields.getTextInputValue('question_type')?.trim();
  const questionValidation = interaction.fields.getTextInputValue('question_validation')?.trim();
  const questionPlaceholder = interaction.fields.getTextInputValue('question_placeholder')?.trim();

  if (!questionText) {
    return interaction.reply({
      content: '❌ Question text is required.',
      flags: 64
    });
  }

  try {
    const updateData = {
      question: questionText,
      type: questionType || 'text',
      validation: questionValidation || 'required',
      placeholder: questionPlaceholder || ''
    };

    const updatedQuestion = await serverConfigManager.updateServerQuestion(guild.id, questionId, updateData);

    // Send audit log
    await sendConfigAuditLog(guild, interaction.user, 'Edit Question',
      `Updated: "${questionText}" (ID: ${questionId})`);

    await interaction.reply({
      content: `✅ Question updated successfully!\n\n**New Preview:** ${questionText}`,
      flags: 64
    });

  } catch (error) {
    console.error('Edit question modal error:', error);
    await interaction.reply({
      content: `❌ Error updating question: ${error.message}`,
      flags: 64
    });
  }
}

async function handleRoleCreationModal(interaction, roleType) {
  const guild = interaction.guild;

  const roleName = interaction.fields.getTextInputValue('role_name')?.trim();
  const roleColor = interaction.fields.getTextInputValue('role_color')?.trim();
  const rolePermissions = interaction.fields.getTextInputValue('role_permissions')?.trim();

  if (!roleName) {
    return interaction.reply({
      content: '❌ Role name is required.',
      flags: 64
    });
  }

  try {
    // Parse color (default to a nice color if not provided)
    let color = 0x0099ff; // Default blue
    if (roleColor) {
      try {
        color = parseInt(roleColor.replace('#', ''), 16);
      } catch (e) {
        console.warn(`Invalid color format: ${roleColor}, using default`);
      }
    }

    // Create the role
    const createdRole = await guild.roles.create({
      name: roleName,
      color: color,
      mentionable: true,
      reason: `Auto-created by Vaulty setup (${roleType} role)`
    });

    // Store role selection temporarily
    const config = serverConfigManager.getServerConfig(guild.id) || {};

    if (!config.temp_roles) config.temp_roles = {};
    config.temp_roles[roleType] = { id: createdRole.id, name: createdRole.name };

    await serverConfigManager.updateServerConfig(guild.id, { temp_roles: config.temp_roles });

    // Send audit log
    await sendConfigAuditLog(guild, interaction.user, 'Role Created',
      `Created: "${roleName}" (${roleType} role, color: #${color.toString(16).padStart(6, '0')})`);

    await interaction.reply({
      content: `✅ **${roleName}** role created successfully!\n\nRole will be used as the **${roleType}** role in the auto-role system.`,
      flags: 64
    });

  } catch (error) {
    console.error('Role creation modal error:', error);
    await interaction.reply({
      content: `❌ Error creating role: ${error.message}\n\nMake sure the bot has "Manage Roles" permission.`,
      flags: 64
    });
  }
}

async function handleReorderQuestionsModal(interaction) {
  const guild = interaction.guild;

  const questionOrderText = interaction.fields.getTextInputValue('question_order')?.trim();

  if (!questionOrderText) {
    return interaction.reply({
      content: '❌ Question order is required.',
      flags: 64
    });
  }

  try {
    // Parse the question IDs
    const questionOrder = questionOrderText
      .split(',')
      .map(id => id.trim())
      .filter(id => id.length > 0);

    if (questionOrder.length === 0) {
      return interaction.reply({
        content: '❌ No valid question IDs found.',
        flags: 64
      });
    }

    await serverConfigManager.reorderServerQuestions(guild.id, questionOrder);

    // Send audit log
    await sendConfigAuditLog(guild, interaction.user, 'Reorder Questions',
      `New order: ${questionOrder.join(', ')}`);

    await interaction.reply({
      content: `✅ Questions reordered successfully!\n\n**New Order:** ${questionOrder.join(', ')}`,
      flags: 64
    });

  } catch (error) {
    console.error('Reorder questions modal error:', error);
    await interaction.reply({
      content: `❌ Error reordering questions: ${error.message}`,
      flags: 64
    });
  }
}

async function sendConfigAuditLog(guild, adminUser, action, details) {
  try {
    const config = serverConfigManager.getServerConfig(guild.id);
    if (!config || !config.audit_channel) return;

    const auditChannel = await guild.channels.fetch(config.audit_channel);
    if (!auditChannel) return;

    const auditEmbed = {
      title: '⚙️ Configuration Changed',
      description: `**${adminUser.username}** made a configuration change`,
      color: 0xffa500,
      fields: [
        { name: '👤 Admin', value: `${adminUser.tag}\nID: ${adminUser.id}`, inline: true },
        { name: '📅 Timestamp', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
        { name: '🎯 Action', value: action, inline: true },
        { name: '📋 Details', value: details, inline: false }
      ],
      footer: { text: 'Vaulty Configuration Audit', iconURL: guild.client.user.displayAvatarURL() },
      timestamp: new Date()
    };

    await auditChannel.send({ embeds: [auditEmbed] });
  } catch (error) {
    console.warn('Failed to send config audit log:', error.message);
  }
}

async function showDetailedStats(interaction, guild) {
  // This would show more detailed statistics
  // For now, redirect to the server-status command
  const embed = {
    title: '📊 Detailed Statistics',
    description: 'Use `/server-status` for comprehensive server statistics and health metrics.',
    color: 0x0099ff,
    fields: [
      {
        name: 'Available Commands',
        value: [
          '`/server-status` - Complete server health report',
          '`/server-config view` - Current configuration',
          '`/ping` - Bot performance metrics'
        ].join('\n'),
        inline: false
      }
    ]
  };

  await interaction.update({
    embeds: [embed],
    components: []
  });
}

// ===== ROLE CONFIGURATION FUNCTIONS =====

async function startRoleConfiguration(interaction, guild) {
  await interaction.deferUpdate();

  // Check if server already has role configuration
  const config = serverConfigManager.getServerConfig(guild.id);
  const hasRolesConfigured = config && config.required_roles && config.required_roles.length >= 2;

  const roleConfigEmbed = {
    title: '🎭 Role Configuration',
    description: hasRolesConfigured
      ? `**${guild.name}** already has roles configured. You can update them or proceed with the current setup.`
      : `Let's configure the **auto-role system** for **${guild.name}**. This will determine what roles new members get when they join.`,
    color: 0xffa500,
    fields: [
      {
        name: '🎯 Auto-Role Flow',
        value: [
          '1. **User joins** → Gets **Welcome Role**',
          '2. **Starts onboarding** → Sees only onboarding channels',
          '3. **Completes onboarding** → Loses **Onboarding Role**, gains **Verified Role**',
          '4. **Full server access** → Can participate in all channels'
        ].join('\n'),
        inline: false
      },
      {
        name: '⚙️ Current Status',
        value: hasRolesConfigured
          ? `✅ Roles configured: ${config.required_roles.join(', ')}`
          : '❌ Roles not configured yet',
        inline: false
      }
    ],
    footer: { text: 'Configure roles to enable auto-role functionality' }
  };

  const row1 = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('configure_roles')
        .setLabel('Configure Roles')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🎭'),
      new ButtonBuilder()
        .setCustomId('skip_role_setup')
        .setLabel('Skip (Use Defaults)')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('⏭️')
    );

  const row2 = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('setup_cancel')
        .setLabel('Cancel Setup')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('❌')
    );

  await interaction.editReply({
    embeds: [roleConfigEmbed],
    components: [row1, row2]
  });
}

async function showRoleConfiguration(interaction, guild) {
  await interaction.deferUpdate();

  // Get existing roles
  const existingRoles = guild.roles.cache
    .filter(role => !role.managed && role.name !== '@everyone')
    .sort((a, b) => b.position - a.position)
    .map(role => ({ name: role.name, id: role.id }));

  const roleConfigEmbed = {
    title: '🎭 Configure Auto-Roles',
    description: `Select or create roles for **${guild.name}**'s auto-role system.`,
    color: 0x0099ff,
    fields: [
      {
        name: '👋 Welcome Role',
        value: 'Assigned to new members when they join. This gives them access to onboarding channels.',
        inline: false
      },
      {
        name: '🎓 Onboarding Role',
        value: 'Restricts new members to only onboarding channels until they complete the process.',
        inline: false
      },
      {
        name: '✅ Verified Role',
        value: 'Granted after successful onboarding completion. Gives full server access.',
        inline: false
      }
    ],
    footer: { text: 'Choose existing roles or create new ones' }
  };

  const components = [];

  // Welcome Role Selection
  if (existingRoles.length > 0) {
    const welcomeRow = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('select_welcome_role')
          .setPlaceholder('Select Welcome Role (or create new)')
          .addOptions([
            { label: '+ Create New Welcome Role', value: 'create_new_welcome', emoji: '➕' },
            ...existingRoles.slice(0, 23).map(role => ({
              label: role.name,
              value: `existing_${role.id}`,
              emoji: '👋'
            }))
          ])
      );
    components.push(welcomeRow);
  } else {
    const createRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('create_welcome_role')
          .setLabel('Create Welcome Role')
          .setStyle(ButtonStyle.Success)
          .setEmoji('👋')
      );
    components.push(createRow);
  }

  // Onboarding Role Selection
  if (existingRoles.length > 0) {
    const onboardingRow = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('select_onboarding_role')
          .setPlaceholder('Select Onboarding Role (or create new)')
          .addOptions([
            { label: '+ Create New Onboarding Role', value: 'create_new_onboarding', emoji: '➕' },
            ...existingRoles.slice(0, 23).map(role => ({
              label: role.name,
              value: `existing_${role.id}`,
              emoji: '🎓'
            }))
          ])
      );
    components.push(onboardingRow);
  } else {
    const createRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('create_onboarding_role')
          .setLabel('Create Onboarding Role')
          .setStyle(ButtonStyle.Success)
          .setEmoji('🎓')
      );
    components.push(createRow);
  }

  // Verified Role Selection
  if (existingRoles.length > 0) {
    const verifiedRow = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('select_verified_role')
          .setPlaceholder('Select Verified Role (or create new)')
          .addOptions([
            { label: '+ Create New Verified Role', value: 'create_new_verified', emoji: '➕' },
            ...existingRoles.slice(0, 23).map(role => ({
              label: role.name,
              value: `existing_${role.id}`,
              emoji: '✅'
            }))
          ])
      );
    components.push(verifiedRow);
  } else {
    const createRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('create_verified_role')
          .setLabel('Create Verified Role')
          .setStyle(ButtonStyle.Success)
          .setEmoji('✅')
      );
    components.push(createRow);
  }

  // Finish Setup Button
  const finishRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('finish_role_setup')
        .setLabel('Continue Setup')
        .setStyle(ButtonStyle.Success)
        .setEmoji('▶️'),
      new ButtonBuilder()
        .setCustomId('setup_cancel')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('❌')
    );
  components.push(finishRow);

  await interaction.editReply({
    embeds: [roleConfigEmbed],
    components: components
  });
}

async function createWelcomeRole(interaction, guild) {
  await createRoleWithModal(interaction, guild, 'welcome', 'Welcome', 'A role assigned to new members', 0x00ff00);
}

async function createOnboardingRole(interaction, guild) {
  await createRoleWithModal(interaction, guild, 'onboarding', 'Onboarding', 'Restricts access during onboarding', 0xffa500);
}

async function createVerifiedRole(interaction, guild) {
  await createRoleWithModal(interaction, guild, 'verified', 'Verified', 'Granted after onboarding completion', 0x00ff00);
}

async function createRoleWithModal(interaction, guild, type, defaultName, description, color) {
  const modal = new ModalBuilder()
    .setCustomId(`create_role_modal_${type}`)
    .setTitle(`Create ${defaultName} Role`);

  const nameInput = new TextInputBuilder()
    .setCustomId('role_name')
    .setLabel('Role Name')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder(defaultName)
    .setValue(defaultName)
    .setRequired(true)
    .setMaxLength(100);

  const colorInput = new TextInputBuilder()
    .setCustomId('role_color')
    .setLabel('Role Color (Hex code, e.g., #00ff00)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('#00ff00')
    .setValue(color.toString(16).padStart(6, '0'))
    .setRequired(false)
    .setMaxLength(7);

  const permissionsInput = new TextInputBuilder()
    .setCustomId('role_permissions')
    .setLabel('Additional Permissions (optional)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('View Channels, Send Messages')
    .setRequired(false);

  const firstRow = new ActionRowBuilder().addComponents(nameInput);
  const secondRow = new ActionRowBuilder().addComponents(colorInput);
  const thirdRow = new ActionRowBuilder().addComponents(permissionsInput);

  modal.addComponents(firstRow, secondRow, thirdRow);

  await interaction.showModal(modal);
}

async function selectWelcomeRole(interaction, guild) {
  await handleRoleSelection(interaction, guild, 'welcome', 'Welcome Role');
}

async function selectOnboardingRole(interaction, guild) {
  await handleRoleSelection(interaction, guild, 'onboarding', 'Onboarding Role');
}

async function selectVerifiedRole(interaction, guild) {
  await handleRoleSelection(interaction, guild, 'verified', 'Verified Role');
}

async function handleRoleSelection(interaction, guild, roleType, displayName) {
  const selectedValue = interaction.values[0];

  if (selectedValue.startsWith('create_new_')) {
    // Show role creation modal
    const type = selectedValue.replace('create_new_', '');
    await createRoleWithModal(interaction, guild, type, displayName, `Auto-created ${displayName}`, 0x0099ff);
  } else if (selectedValue.startsWith('existing_')) {
    // Use existing role
    const roleId = selectedValue.replace('existing_', '');
    const role = guild.roles.cache.get(roleId);

    if (!role) {
      await interaction.reply({
        content: `❌ Role not found. Please try again.`,
        flags: 64
      });
      return;
    }

    // Store role selection temporarily (you might want to use a database/cache for this)
    const config = serverConfigManager.getServerConfig(guild.id) || {};

    if (!config.temp_roles) config.temp_roles = {};
    config.temp_roles[roleType] = { id: role.id, name: role.name };

    await serverConfigManager.updateServerConfig(guild.id, { temp_roles: config.temp_roles });

    await interaction.reply({
      content: `✅ **${displayName}** set to: ${role.name}`,
      flags: 64
    });
  }
}

async function completeRoleSetup(interaction, guild) {
  await interaction.deferUpdate();

  const config = serverConfigManager.getServerConfig(guild.id);
  const tempRoles = config?.temp_roles || {};

  // Validate that we have the required roles
  const requiredRoles = [];
  const missingRoles = [];

  if (tempRoles.welcome) {
    requiredRoles[0] = tempRoles.welcome.name;
  } else {
    missingRoles.push('Welcome Role');
  }

  if (tempRoles.onboarding) {
    requiredRoles[1] = tempRoles.onboarding.name;
  } else {
    missingRoles.push('Onboarding Role');
  }

  if (tempRoles.verified) {
    requiredRoles[2] = tempRoles.verified.name;
  } else {
    missingRoles.push('Verified Role');
  }

  if (missingRoles.length > 0) {
    const errorEmbed = {
      title: '❌ Incomplete Role Setup',
      description: 'Please configure all required roles before continuing.',
      color: 0xff0000,
      fields: [
        {
          name: 'Missing Roles',
          value: missingRoles.map(role => `• ${role}`).join('\n'),
          inline: false
        },
        {
          name: 'Configured Roles',
          value: requiredRoles.filter(Boolean).map((role, index) => {
            const types = ['Welcome', 'Onboarding', 'Verified'];
            return `• ${types[index]}: ${role}`;
          }).join('\n') || 'None',
          inline: false
        }
      ],
      footer: { text: 'Use the role selection menus above to configure missing roles' }
    };

    await interaction.editReply({
      embeds: [errorEmbed]
    });
    return;
  }

  // Update server configuration with the selected roles
  await serverConfigManager.updateServerConfig(guild.id, {
    required_roles: requiredRoles,
    temp_roles: undefined // Clean up temp data
  });

  // Send audit log
  await sendConfigAuditLog(guild, interaction.user, 'Role Setup Complete',
    `Welcome: ${requiredRoles[0]}, Onboarding: ${requiredRoles[1]}, Verified: ${requiredRoles[2]}`);

  // Proceed with the rest of the server setup
  await performServerSetup(interaction, guild);
}

async function skipRoleSetup(interaction, guild) {
  await interaction.deferUpdate();

  // Send audit log
  await sendConfigAuditLog(guild, interaction.user, 'Role Setup Skipped',
    'Admin chose to skip role configuration during setup');

  const skipEmbed = {
    title: '⚠️ Role Setup Skipped',
    description: `**${guild.name}** will use default role behavior.\n\nNew members will receive basic onboarding, but auto-role functionality will be limited.`,
    color: 0xffa500,
    fields: [
      {
        name: 'What This Means',
        value: [
          '• No auto-role assignment for new members',
          '• Manual role management required',
          '• Can be configured later with `/server-config set-roles`',
          '• Onboarding will still work normally'
        ].join('\n'),
        inline: false
      }
    ],
    footer: { text: 'You can configure roles later using /server-config set-roles' }
  };

  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('proceed_anyway')
        .setLabel('Proceed with Setup')
        .setStyle(ButtonStyle.Success)
        .setEmoji('▶️'),
      new ButtonBuilder()
        .setCustomId('go_back_roles')
        .setLabel('Go Back to Role Setup')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('⬅️')
    );

  await interaction.editReply({
    embeds: [skipEmbed],
    components: [row]
  });
}

// ===== END ROLE CONFIGURATION FUNCTIONS =====

/**
 * Handle the "Begin Onboarding" button click
 */
async function handleStartOnboardingButton(interaction) {
  try {
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
        content: '❌ You do not have permission to start onboarding.\n\nYou must have one of the following roles:\n• Onboarding (to complete your onboarding)\n• Staff roles (Owner, Admin, Mod, or Help for testing purposes)',
        flags: 64 // Ephemeral
      });
    }

    // Check if user is already in an onboarding session
    const onboardingService = require('../services/onboarding');
    if (onboardingService.isUserOnboarding(interaction.user.id)) {
      return interaction.reply({
        content: '❌ You are already in an active onboarding session. Please complete your current onboarding first.',
        flags: 64
      });
    }

    // Start the interactive onboarding process
    await interaction.deferReply({ flags: 64 });

    const channelService = require('../services/channels');

    // Create a private onboarding channel
    const privateChannel = await channelService.createOnboardingChannel(interaction.member);

    if (privateChannel && !privateChannel.error) {
      // Send welcome message and start onboarding in the private channel
      await channelService.sendWelcomeMessage(privateChannel, interaction.member);
      await onboardingService.startOnboarding(privateChannel, interaction.member);

      await interaction.followUp({
        content: `✅ **Onboarding Started!**\n\nI've created a private channel for you: <#${privateChannel.id}>\n\nGo there to complete your onboarding with me!`,
        flags: 64
      });

      console.log(`✅ User ${interaction.user.tag} started onboarding via button click`);
    } else {
      const errorMessage = privateChannel?.error || 'Unknown error occurred';
      console.error(`❌ Failed to create onboarding channel for ${interaction.user.tag}:`, errorMessage);

      await interaction.followUp({
        content: `❌ Sorry, I couldn't create your private onboarding channel. Please try again.\n\nError: ${errorMessage}`,
        flags: 64
      });
    }

  } catch (error) {
    console.error('❌ Error handling start onboarding button:', error);
    await interaction.reply({
      content: '❌ Something went wrong while starting onboarding. Please try again.',
      flags: 64
    });
  }
}

