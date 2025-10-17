// Server Setup Utility Functions
// Separated from server-setup.js command to avoid loading conflicts

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, ChannelType } = require('discord.js');
const serverConfigManager = require('./server-config');
const { createBackOffice } = require('./channels');

/**
 * Check if back office already exists in the guild
 * @param {Guild} guild - Discord guild
 * @returns {boolean} True if back office exists
 */
function backOfficeExists(guild) {
  // Check if back office category exists
  const backOfficeCategory = guild.channels.cache.find(channel =>
    channel.name === 'back office' && channel.type === 4 // Category
  );

  if (!backOfficeCategory) {
    return false;
  }

  // Check if the three required channels exist within the category
  const spamChannel = guild.channels.cache.find(channel =>
    channel.name === '🚽︱spam' && channel.parentId === backOfficeCategory.id
  );
  const auditChannel = guild.channels.cache.find(channel =>
    channel.name === '🤖︱audit-log' && channel.parentId === backOfficeCategory.id
  );
  const officeChannel = guild.channels.cache.find(channel =>
    channel.name === '💬︱office-chat' && channel.parentId === backOfficeCategory.id
  );

  return !!(spamChannel && auditChannel && officeChannel);
}

/**
 * Check if a properly configured welcome channel with embed and button already exists
 * @param {Guild} guild - Discord guild
 * @returns {boolean} True if welcome channel with proper setup exists
 */
async function welcomeChannelExists(guild) {
  try {
    // Find welcome channel (broader search - any channel containing 'welcome')
    const welcomeChannel = guild.channels.cache.find(channel =>
      channel.type === 0 && // Text channel
      channel.name.toLowerCase().includes('welcome')
    );

    if (!welcomeChannel) {
      return false;
    }

    // Fetch recent messages to check for the welcome embed and button
    const messages = await welcomeChannel.messages.fetch({ limit: 10 });

    // Look for a message with the welcome embed and button
    for (const message of messages.values()) {
      // Check if message has embed with specific title
      const hasWelcomeEmbed = message.embeds.some(embed =>
        embed.title === '👋 Welcome to Our Server!' &&
        embed.description && embed.description.includes('Click the button below to start your personalized onboarding process')
      );

      // Check if message has the onboarding button
      const hasOnboardButton = message.components.some(row =>
        row.components.some(component =>
          component.type === 2 && // Button
          component.customId === 'begin_onboarding' &&
          component.label === 'Begin Onboarding'
        )
      );

      if (hasWelcomeEmbed && hasOnboardButton) {
        console.log('🏠 Welcome channel with proper embed and button already exists');
        return true;
      }
    }

    return false;
  } catch (error) {
    console.warn('⚠️ Error checking if welcome channel exists:', error.message);
    return false;
  }
}

/**
 * Create the welcome channel with proper permissions and embed
 * @param {Guild} guild - Discord guild
 * @param {Object} bot - Bot user object
 * @returns {Object} Result with channel info or error
 */
async function createWelcomeChannel(guild, bot) {
  try {
    console.log('🏠 Creating welcome channel...');

    // Check if welcome channel already exists (broader search)
    const existingChannel = guild.channels.cache.find(channel =>
      channel.type === 0 && channel.name.toLowerCase().includes('welcome') // Text channel containing 'welcome'
    );

    if (existingChannel) {
      console.log('🏠 Welcome channel already exists, skipping creation');
      return { exists: true, channel: existingChannel };
    }

    // Get admin roles for permissions
    const adminRoles = await serverConfigManager.detectAdminRoles(guild);
    const adminRoleIds = adminRoles.map(role => role.id);

    // Create permission overwrites
    const permissionOverwrites = [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions, PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.CreatePrivateThreads],
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.UseApplicationCommands] // Allow viewing and using slash commands
      },
      {
        id: bot.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles]
      }
    ];

    // Add admin permissions (they can send messages and manage)
    for (const adminRoleId of adminRoleIds) {
      try {
        const adminRole = await guild.roles.fetch(adminRoleId);
        if (adminRole) {
          permissionOverwrites.push({
            id: adminRole.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.AddReactions]
          });
        }
      } catch (error) {
        console.warn(`Could not add admin role ${adminRoleId} to welcome channel permissions:`, error);
      }
    }

    // Create the welcome channel
    const welcomeChannel = await guild.channels.create({
      name: 'welcome',
      type: ChannelType.GuildText,
      topic: 'Welcome to the server! Use /onboard to get started.',
      permissionOverwrites: permissionOverwrites,
      reason: 'Welcome channel for new members to start onboarding'
    });

    console.log(`✅ Created welcome channel: ${welcomeChannel.name}`);

    // Create and send the welcome embed with button
    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

    const welcomeEmbed = new EmbedBuilder()
      .setTitle('👋 Welcome to Our Server!')
      .setDescription('Thanks for joining! Click the button below to start your personalized onboarding process.')
      .setColor(0x3498db)
      .addFields(
        {
          name: '🚀 What Happens Next',
          value: 'We\'ll ask you a few quick questions to get you set up properly and give you access to the rest of the server.',
          inline: false
        },
        {
          name: '⏱️ Time Required',
          value: '• Quick questionnaire (2-3 minutes)\n• Private onboarding channel\n• Full server access upon completion',
          inline: false
        },
        {
          name: '❓ Need Help?',
          value: 'Contact an admin if you have any issues.',
          inline: false
        }
      )
      .setFooter({ text: 'Click "Begin Onboarding" to start • This channel is read-only for members' })
      .setTimestamp();

    // Create the onboarding button
    const onboardButton = new ButtonBuilder()
      .setCustomId('start_onboarding')
      .setLabel('Begin Onboarding')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🚀');

    const row = new ActionRowBuilder()
      .addComponents(onboardButton);

    await welcomeChannel.send({
      embeds: [welcomeEmbed],
      components: [row]
    });

    console.log('✅ Welcome embed sent to channel');

    return { channel: welcomeChannel };

  } catch (error) {
    console.error('❌ Error creating welcome channel:', error);
    return {
      error: error.message || 'Unknown error occurred',
      code: error.code,
      details: error
    };
  }
}

function getClientServerQuestions() {
  // Standardized questions for client servers (TikTok Shop creators)
  return [
    {
      id: 'tts_username',
      question: "What is your TikTok Shop username? (without @)",
      type: 'text',
      validation: 'required',
      placeholder: 'e.g., yourshopname',
      order: 1,
      active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'contact_method',
      question: "What's your preferred contact method? (WhatsApp number or email address)",
      type: 'text',
      validation: 'required',
      placeholder: 'e.g., +1234567890 or your@email.com',
      order: 2,
      active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'sample_request',
      question: "Would you like to request a sample of our hero product? (Type 'yes' if interested, or 'skip' if you've already requested one or prefer not to)",
      type: 'text',
      validation: 'optional',
      placeholder: 'yes or skip',
      order: 3,
      active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ];
}

async function performClientServerSetup(interaction, guild) {
  await interaction.deferUpdate();

  try {
    // Get bot user for channel permissions
    const bot = guild.members.me;

    // Create welcome channel first (only if it doesn't already exist with proper setup)
    let welcomeResult;
    const existingWelcomeSetup = await welcomeChannelExists(guild);
    if (existingWelcomeSetup) {
      console.log('🏠 Welcome channel with embed and button already exists, skipping creation');
      // Find the welcome channel for config purposes
      const welcomeChannel = guild.channels.cache.find(channel =>
        channel.type === 0 && channel.name.toLowerCase().includes('welcome')
      );
      welcomeResult = { exists: true, channel: welcomeChannel };
    } else {
      console.log('🏠 Creating welcome channel for client server setup...');
      welcomeResult = await createWelcomeChannel(guild, bot);
      if (welcomeResult.error) {
        console.warn(`⚠️ Failed to create welcome channel: ${welcomeResult.error}`);
      } else {
        console.log('✅ Welcome channel created successfully');
      }
    }

    // Create back office category and channels (only if it doesn't exist)
    let backOfficeResult;
    if (backOfficeExists(guild)) {
      console.log('🏢 Back office already exists, skipping creation');
      backOfficeResult = { exists: true };
    } else {
      console.log('🏢 Creating back office for client server setup...');
      backOfficeResult = await createBackOffice(guild);
      if (backOfficeResult.error) {
        console.warn(`⚠️ Failed to create back office: ${backOfficeResult.error}`);
        // Continue with setup even if back office creation fails
      } else {
        console.log('✅ Back office created successfully');
      }
    }

    // Perform automatic server configuration
    const serverConfig = await serverConfigManager.configureServer(guild.id, guild);

    // Add standardized client questions
    const clientQuestions = getClientServerQuestions();
    serverConfig.questions = clientQuestions;

    // Auto-detect and set channels and roles
    const configUpdates = {
      questions: clientQuestions,
      question_version: 1,
      last_question_update: new Date().toISOString(),
      server_type: 'client'
    };

    // Set welcome channel if it was created
    if (welcomeResult.channel) {
      configUpdates.welcome_channel = welcomeResult.channel.name;
    }

    // Set audit channel to the audit-log channel from back office
    if (backOfficeResult.channels?.auditLog) {
      configUpdates.audit_channel = backOfficeResult.channels.auditLog.id;
    }

    // Auto-detect onboarding roles
    const welcomeRole = guild.roles.cache.find(role => role.name === 'Welcome');
    const onboardingRole = guild.roles.cache.find(role => role.name === 'Onboarding');
    const onboardedRole = guild.roles.cache.find(role => role.name === 'Onboarded');

    if (welcomeRole && onboardingRole && onboardedRole) {
      configUpdates.required_roles = [onboardingRole.name, onboardedRole.name];
      configUpdates.welcome_role = welcomeRole.name;
    }

    await serverConfigManager.updateServerConfig(guild.id, configUpdates);

    const successEmbed = {
      title: '✅ Client Server Setup Complete!',
      description: `**${guild.name}** has been configured as a **Client Server** with standardized onboarding!`,
      color: 0x00ff00,
      fields: [
        {
          name: '🏢 Server Type',
          value: 'Client Server (Standardized)',
          inline: true
        },
        {
          name: '📋 Questions Added',
          value: `${clientQuestions.length} standardized questions`,
          inline: true
        },
        {
          name: '📊 Google Sheet',
          value: `Tab: ${serverConfig.sheet_tab}`,
          inline: true
        },
        {
          name: '🏠 Welcome Channel',
          value: welcomeResult.exists ?
            '✅ Welcome channel already exists' :
            welcomeResult.error ?
              '⚠️ Welcome channel creation failed' :
              '✅ Created #welcome channel with onboarding instructions',
          inline: true
        },
        {
          name: '🏢 Back Office',
          value: backOfficeResult.exists ?
            '✅ Back office already exists - using existing setup' :
            backOfficeResult.error ?
              '⚠️ Back office creation failed - check bot permissions' :
              '✅ Created admin-only back office category with:\n• 🚽︱spam - Bot command channel\n• 🤖︱audit-log - Activity logs\n• 💬︱office-chat - Admin chat',
          inline: true
        },
        {
          name: '⚙️ Auto-Configuration',
          value: '✅ Audit channel auto-detected\n✅ Welcome channel auto-set\n✅ Onboarding roles auto-configured',
          inline: true
        },
        {
          name: '🎯 TikTok Integration',
          value: '✅ Auto-nickname enabled\n✅ Email scraping enabled',
          inline: false
        },
        {
          name: '🚀 Ready to Use!',
          value: [
            '`/onboard` - Start creator onboarding',
            '`/server-config questions view` - View questions',
            '`/server-config questions add` - Add custom questions',
            '`/tiktok-stats @username` - Creator analytics'
          ].join('\n'),
          inline: false
        }
      ],
      footer: { text: 'Client Server Setup - Professional Creator Onboarding Ready!' },
      timestamp: new Date()
    };

    await interaction.editReply({
      embeds: [successEmbed],
      components: []
    });

  } catch (error) {
    console.error('❌ Client server setup error:', {
      message: error.message,
      stack: error.stack,
      guild: guild.name,
      user: interaction.user.tag
    });

    await interaction.editReply({
      content: `❌ Client server setup failed: ${error.message}\n\nPlease try again or contact support.`,
      embeds: [],
      components: []
    });
  }
}

async function performCustomServerSetup(interaction, guild) {
  await interaction.deferUpdate();

  try {
    // Get bot user for channel permissions
    const bot = guild.members.me;

    // Create welcome channel first (only if it doesn't already exist with proper setup)
    let welcomeResult;
    const existingWelcomeSetup = await welcomeChannelExists(guild);
    if (existingWelcomeSetup) {
      console.log('🏠 Welcome channel with embed and button already exists, skipping creation');
      // Find the welcome channel for config purposes
      const welcomeChannel = guild.channels.cache.find(channel =>
        channel.type === 0 && channel.name.toLowerCase().includes('welcome')
      );
      welcomeResult = { exists: true, channel: welcomeChannel };
    } else {
      console.log('🏠 Creating welcome channel for custom server setup...');
      welcomeResult = await createWelcomeChannel(guild, bot);
      if (welcomeResult.error) {
        console.warn(`⚠️ Failed to create welcome channel: ${welcomeResult.error}`);
      } else {
        console.log('✅ Welcome channel created successfully');
      }
    }

    // Create back office category and channels (only if it doesn't exist)
    let backOfficeResult;
    if (backOfficeExists(guild)) {
      console.log('🏢 Back office already exists, skipping creation');
      backOfficeResult = { exists: true };
    } else {
      console.log('🏢 Creating back office for custom server setup...');
      backOfficeResult = await createBackOffice(guild);
      if (backOfficeResult.error) {
        console.warn(`⚠️ Failed to create back office: ${backOfficeResult.error}`);
        // Continue with setup even if back office creation fails
      } else {
        console.log('✅ Back office created successfully');
      }
    }

    // Perform basic server configuration
    const serverConfig = await serverConfigManager.configureServer(guild.id, guild);

    // Start with minimal default questions, admin can customize
    const minimalQuestions = [
      {
        id: 'custom_1',
        question: "What is your name?",
        type: 'text',
        validation: 'required',
        placeholder: 'Your full name',
        order: 1,
        active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ];

    serverConfig.questions = minimalQuestions;

    // Auto-detect and set channels and roles
    const configUpdates = {
      questions: minimalQuestions,
      question_version: 1,
      last_question_update: new Date().toISOString(),
      server_type: 'custom'
    };

    // Set welcome channel if it was created
    if (welcomeResult.channel) {
      configUpdates.welcome_channel = welcomeResult.channel.name;
    }

    // Set audit channel to the audit-log channel from back office
    if (backOfficeResult.channels?.auditLog) {
      configUpdates.audit_channel = backOfficeResult.channels.auditLog.id;
    }

    // Auto-detect onboarding roles
    const welcomeRole = guild.roles.cache.find(role => role.name === 'Welcome');
    const onboardingRole = guild.roles.cache.find(role => role.name === 'Onboarding');
    const onboardedRole = guild.roles.cache.find(role => role.name === 'Onboarded');

    if (welcomeRole && onboardingRole && onboardedRole) {
      configUpdates.required_roles = [onboardingRole.name, onboardedRole.name];
      configUpdates.welcome_role = welcomeRole.name;
    }

    await serverConfigManager.updateServerConfig(guild.id, configUpdates);

    const customEmbed = {
      title: '🎨 Custom Server Setup Complete!',
      description: `**${guild.name}** has been configured as a **Custom Server** with basic setup!`,
      color: 0x9b59b6,
      fields: [
        {
          name: '🎨 Server Type',
          value: 'Custom Server (Full Control)',
          inline: true
        },
        {
          name: '🏠 Welcome Channel',
          value: welcomeResult.exists ?
            '✅ Welcome channel already exists' :
            welcomeResult.error ?
              '⚠️ Welcome channel creation failed' :
              '✅ Created #welcome channel with onboarding instructions',
          inline: true
        },
        {
          name: '🏢 Back Office',
          value: backOfficeResult.exists ?
            '✅ Back office already exists - using existing setup' :
            backOfficeResult.error ?
              '⚠️ Back office creation failed - check bot permissions' :
              '✅ Created admin-only back office category with:\n• 🚽︱spam - Bot command channel\n• 🤖︱audit-log - Activity logs\n• 💬︱office-chat - Admin chat',
          inline: true
        },
        {
          name: '⚙️ Auto-Configuration',
          value: '✅ Audit channel auto-detected\n✅ Welcome channel auto-set\n✅ Onboarding roles auto-configured',
          inline: true
        },
        {
          name: '⚙️ Next Steps',
          value: [
            '• Add your custom questions',
            '• Configure roles and channels',
            '• Set up advanced features'
          ].join('\n'),
          inline: false
        },
        {
          name: '📋 Available Commands',
          value: [
            '`/server-config questions add` - Add questions',
            '`/server-config questions view` - View questions',
            '`/server-config set-roles` - Configure roles',
            '`/server-config set-channels` - Set channels'
          ].join('\n'),
          inline: false
        }
      ],
      footer: { text: 'Custom Server Setup - Build your perfect onboarding flow!' },
      timestamp: new Date()
    };

    await interaction.editReply({
      embeds: [customEmbed],
      components: []
    });

  } catch (error) {
    console.error('❌ Custom server setup error:', {
      message: error.message,
      stack: error.stack,
      guild: guild.name,
      user: interaction.user.tag
    });

    await interaction.editReply({
      content: `❌ Custom server setup failed: ${error.message}\n\nPlease try again or contact support.`,
      embeds: [],
      components: []
    });
  }
}

async function showServerTypeSelection(interaction, guild) {
  const typeSelectionEmbed = {
    title: '🏷️ Server Type Selection',
    description: `Choose the setup type for **${guild.name}** that best fits your needs.`,
    color: 0x0099ff,
    fields: [
      {
        name: '🏢 Client Server (Recommended for most)',
        value: [
          '• **Standardized onboarding process**',
          '• **Pre-configured questions** for creators',
          '• **Fast deployment** - ready in seconds',
          '• **Professional setup** for client relationships',
          '• **Can still customize** questions later'
        ].join('\n'),
        inline: true
      },
      {
        name: '🎨 Custom Server (Full Control)',
        value: [
          '• **Complete customization**',
          '• **Build questions from scratch**',
          '• **Advanced configuration options**',
          '• **Full control** over every aspect',
          '• **Flexible for unique requirements**'
        ].join('\n'),
        inline: true
      }
    ],
    footer: { text: 'Choose the option that best fits your server needs' },
    timestamp: new Date()
  };

  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('setup_client_server')
        .setLabel('Client Server')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🏢'),
      new ButtonBuilder()
        .setCustomId('setup_custom_server')
        .setLabel('Custom Server')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🎨'),
      new ButtonBuilder()
        .setCustomId('setup_cancel')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('❌')
    );

  await interaction.reply({
    embeds: [typeSelectionEmbed],
    components: [row],
    flags: 64
  });
}

module.exports = {
  getClientServerQuestions,
  performClientServerSetup,
  performCustomServerSetup,
  showServerTypeSelection
};
