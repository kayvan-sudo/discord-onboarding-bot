const { EmbedBuilder, ChannelType, PermissionFlagsBits, OverwriteType } = require('discord.js');
const serverConfigManager = require('./server-config');

// Create private onboarding channel for a specific user
async function createOnboardingChannel(member) {
  try {
    const guild = member.guild;
    const bot = member.client.user;

    console.log(`🔧 Attempting to create onboarding channel for ${member.user.tag} in ${guild.name}`);

    // Check bot permissions first
    const botMember = await guild.members.fetch(bot.id);
    const botPermissions = botMember.permissions;

    if (!botPermissions.has(PermissionFlagsBits.ManageChannels)) {
      console.error(`❌ Bot lacks ManageChannels permission in ${guild.name}`);
      return { error: 'Bot lacks Manage Channels permission' };
    }

    if (!botPermissions.has(PermissionFlagsBits.ManagePermissions)) {
      console.error(`❌ Bot lacks ManagePermissions permission in ${guild.name}`);
      return { error: 'Bot lacks Manage Permissions permission' };
    }

    // Define admin/owner role IDs for visibility
    const adminRoleIds = [
      '1311452842740900860', // Owner
      '1408123654213992528', // Admin
    ];

    // Build permission overwrites
    const permissionOverwrites = [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: member.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
      {
        id: bot.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.AttachFiles,
        ],
      },
    ];

    // Add admin/owner visibility
    for (const adminRoleId of adminRoleIds) {
      try {
        const adminRole = await guild.roles.fetch(adminRoleId);
        if (adminRole) {
          permissionOverwrites.push({
            id: adminRole.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.ReadMessageHistory,
            ],
            deny: [PermissionFlagsBits.SendMessages], // Can view but not send
          });
        }
      } catch (error) {
        console.warn(`Could not add admin role ${adminRoleId} to channel permissions:`, error);
      }
    }

    // Create private text channel using cleaned username for readability
    const cleanUsername = member.user.username.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const channel = await guild.channels.create({
      name: `onboarding-${cleanUsername}`,
      type: ChannelType.GuildText,
      topic: `Private onboarding channel for ${member.user.tag} (ID: ${member.id})`,
      permissionOverwrites: permissionOverwrites,
    });

    console.log(`✅ Created private channel ${channel.name} for ${member.user.tag}`);
    return channel;

  } catch (error) {
    console.error('❌ Error creating onboarding channel:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      status: error.status,
      method: error.method,
      url: error.url,
      user: member.user.tag,
      guild: member.guild.name
    });

    // Return detailed error information
    return {
      error: error.message || 'Unknown error occurred',
      code: error.code,
      details: error
    };
  }
}

// Send welcome message in private channel
async function sendWelcomeMessage(channel, member) {
  try {
    const message = `<@${member.user.id}> 👋 Hi ${member.user.username}! Welcome to The Creator Vault!\n\nThis is your private onboarding channel. Only you and I can see these messages.\n\nI'll ask you a few simple questions to get you set up. Just reply with your answers and we'll get you onboarded quickly!`;

    await channel.send(message);

    console.log(`✅ Welcome message sent in private channel for ${member.user.tag}`);

  } catch (error) {
    console.error('Error sending welcome message:', error);
  }
}

// Clean up onboarding channel after completion
async function cleanupOnboardingChannel(channel, member) {
  try {
    // Send simple cleanup message
    const cleanupMessage = `This channel will be deleted in 30 seconds. Enjoy the server!`;
    await channel.send(cleanupMessage);

    // Wait 30 seconds then delete
    setTimeout(async () => {
      try {
        await channel.delete();
        console.log(`🗑️ Deleted onboarding channel for ${member.user.tag}`);
      } catch (error) {
        console.error('Error deleting channel:', error);
      }
    }, 30000);

  } catch (error) {
    console.error('Error cleaning up onboarding channel:', error);
  }
}

// Create test channel for admins (similar to regular onboarding but marked as test)
async function createTestChannel(member) {
  try {
    const guild = member.guild;
    const bot = member.client.user;

    console.log(`🧪 Attempting to create test channel for ${member.user.tag} in ${guild.name}`);

    // Check bot permissions first
    const botMember = await guild.members.fetch(bot.id);
    const botPermissions = botMember.permissions;

    if (!botPermissions.has(PermissionFlagsBits.ManageChannels)) {
      console.error(`❌ Bot lacks ManageChannels permission in ${guild.name}`);
      return { error: 'Bot lacks Manage Channels permission' };
    }

    if (!botPermissions.has(PermissionFlagsBits.ManagePermissions)) {
      console.error(`❌ Bot lacks ManagePermissions permission in ${guild.name}`);
      return { error: 'Bot lacks Manage Permissions permission' };
    }

    // Define admin/owner role IDs for visibility
    const adminRoleIds = [
      '1311452842740900860', // Owner
      '1408123654213992528', // Admin
    ];

    // Build permission overwrites
    const permissionOverwrites = [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: member.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
      {
        id: bot.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.AttachFiles,
        ],
      },
    ];

    // Add admin/owner visibility (they can view all test channels)
    for (const adminRoleId of adminRoleIds) {
      try {
        const adminRole = await guild.roles.fetch(adminRoleId);
        if (adminRole) {
          permissionOverwrites.push({
            id: adminRole.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.ReadMessageHistory,
            ],
            deny: [PermissionFlagsBits.SendMessages], // Can view but not send
          });
        }
      } catch (error) {
        console.warn(`Could not add admin role ${adminRoleId} to test channel permissions:`, error);
      }
    }

    // Create private test channel using cleaned username for readability
    const cleanUsername = member.user.username.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const channel = await guild.channels.create({
      name: `test-onboarding-${cleanUsername}`,
      type: ChannelType.GuildText,
      topic: `Test onboarding channel for ${member.user.tag} (ID: ${member.id})`,
      permissionOverwrites: permissionOverwrites,
    });

    console.log(`🧪 Created test channel ${channel.name} for admin ${member.user.tag}`);
    return channel;

  } catch (error) {
    console.error('❌ Error creating test channel:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      status: error.status,
      method: error.method,
      url: error.url,
      user: member.user.tag,
      guild: member.guild.name
    });

    // Return detailed error information
    return {
      error: error.message || 'Unknown error occurred',
      code: error.code,
      details: error
    };
  }
}

// Send test welcome message
async function sendTestWelcomeMessage(channel, member) {
  try {
    const message = `<@${member.user.id}> 🧪 Hi ${member.user.username}! This is a test session for the onboarding system.\n\nThis private test channel simulates the real experience. Only you and I can see these messages.\n\nNo real changes will be made - this is just for testing!`;

    await channel.send(message);

    console.log(`🧪 Test welcome message sent in ${channel.name} for ${member.user.tag}`);

  } catch (error) {
    console.error('Error sending test welcome message:', error);
  }
}

// Clean up test channel
async function cleanupTestChannel(channel, member) {
  try {
    // Send simple cleanup message
    const cleanupMessage = `Test channel will be deleted in 30 seconds.`;
    await channel.send(cleanupMessage);

    // Wait 30 seconds then delete
    setTimeout(async () => {
      try {
        await channel.delete();
        console.log(`🗑️ Deleted test channel for ${member.user.tag}`);
      } catch (error) {
        console.error('Error deleting test channel:', error);
      }
    }, 30000);

  } catch (error) {
    console.error('Error cleaning up test channel:', error);
  }
}

// Create back office category and channels for admin use
async function createBackOffice(guild) {
  try {
    console.log(`🏢 Creating back office for ${guild.name}`);

    const bot = guild.members.me;

    // Check bot permissions
    if (!bot.permissions.has(PermissionFlagsBits.ManageChannels)) {
      console.error(`❌ Bot lacks ManageChannels permission in ${guild.name}`);
      return { error: 'Bot lacks Manage Channels permission' };
    }

    if (!bot.permissions.has(PermissionFlagsBits.ManagePermissions)) {
      console.error(`❌ Bot lacks ManagePermissions permission in ${guild.name}`);
      return { error: 'Bot lacks Manage Permissions permission' };
    }

    // Get admin roles for visibility permissions
    const adminRoles = await serverConfigManager.detectAdminRoles(guild);
    const adminRoleIds = adminRoles.map(role => role.id);

    // Create permission overwrites for the category
    const categoryPermissionOverwrites = [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: bot.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
    ];

    // Add admin roles to category permissions
    for (const adminRoleId of adminRoleIds) {
      try {
        const adminRole = await guild.roles.fetch(adminRoleId);
        if (adminRole) {
          categoryPermissionOverwrites.push({
            id: adminRole.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.ReadMessageHistory,
            ],
            deny: [PermissionFlagsBits.SendMessages], // Can view but not send unless needed
          });
        }
      } catch (error) {
        console.warn(`Could not add admin role ${adminRoleId} to category permissions:`, error);
      }
    }

    // Create the back office category
    const category = await guild.channels.create({
      name: 'back office',
      type: ChannelType.GuildCategory,
      permissionOverwrites: categoryPermissionOverwrites,
      reason: 'Admin back office category for server management'
    });

    console.log(`✅ Created back office category: ${category.name}`);

    // Create the three channels inside the category
    const channels = [];

    // 1. 🚽︱spam - for bot commands
    const spamChannel = await guild.channels.create({
      name: '🚽︱spam',
      type: ChannelType.GuildText,
      parent: category.id,
      topic: 'Bot command channel - Use this for running bot commands',
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: bot.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.AttachFiles,
          ],
        },
        // Allow admin roles to view and send
        ...adminRoleIds.map(roleId => ({
          id: roleId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        }))
      ],
      reason: 'Bot command channel for admin use'
    });
    channels.push(spamChannel);
    console.log(`✅ Created spam channel: ${spamChannel.name}`);

    // 2. 🤖︱audit-log - for audit logging
    const auditChannel = await guild.channels.create({
      name: '🤖︱audit-log',
      type: ChannelType.GuildText,
      parent: category.id,
      topic: 'Audit log channel - Bot activity and server events',
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: bot.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.AttachFiles,
          ],
        },
        // Allow admin roles to view (but not send to avoid spam)
        ...adminRoleIds.map(roleId => ({
          id: roleId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.ReadMessageHistory,
          ],
          deny: [PermissionFlagsBits.SendMessages], // Prevent manual messages in audit log
        }))
      ],
      reason: 'Audit log channel for bot activity and server events'
    });
    channels.push(auditChannel);
    console.log(`✅ Created audit-log channel: ${auditChannel.name}`);

    // 3. 💬︱office-chat - for admin/mod private chat
    const officeChannel = await guild.channels.create({
      name: '💬︱office-chat',
      type: ChannelType.GuildText,
      parent: category.id,
      topic: 'Private admin/moderator chat channel',
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: bot.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.AttachFiles,
          ],
        },
        // Allow admin roles to view and send
        ...adminRoleIds.map(roleId => ({
          id: roleId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.MentionEveryone,
          ],
        }))
      ],
      reason: 'Private admin and moderator chat channel'
    });
    channels.push(officeChannel);
    console.log(`✅ Created office-chat channel: ${officeChannel.name}`);

    console.log(`✅ Back office setup complete for ${guild.name}`);
    return {
      category,
      channels: {
        spam: spamChannel,
        auditLog: auditChannel,
        officeChat: officeChannel
      }
    };

  } catch (error) {
    console.error('❌ Error creating back office:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      status: error.status,
      method: error.method,
      url: error.url,
      guild: guild?.name
    });

    return {
      error: error.message || 'Unknown error occurred',
      code: error.code,
      details: error
    };
  }
}

module.exports = {
  createOnboardingChannel,
  sendWelcomeMessage,
  cleanupOnboardingChannel,
  createTestChannel,
  sendTestWelcomeMessage,
  cleanupTestChannel,
  createBackOffice
};
