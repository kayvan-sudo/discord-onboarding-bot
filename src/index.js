const path = require('path');
const dotenv = require('dotenv');
const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const logger = require('./utils/logger');
const pushover = require('./utils/pushover');
const serverConfigManager = require('./services/server-config');
const { REST, Routes } = require('discord.js');
const fs = require('fs');

dotenv.config({ path: path.resolve(__dirname, '..', '.env'), override: true });

function requireEnv(name) {
  const v = (process.env[name] || '').trim();
  if (!v) {
    logger.error(`${name} missing`);
    process.exit(1);
  }
  return v;
}

const DISCORD_TOKEN = requireEnv('DISCORD_TOKEN');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

client.commands = new Collection();

// Load command handlers
require('./discord/load-commands')(client);
require('./discord/handle-interactions')(client);
require('./discord/handle-messages')(client);

async function initializeServerConfigs() {
  try {
    logger.info('🔧 Initializing server configuration system...');
    await serverConfigManager.load();

    const stats = serverConfigManager.getStats();
    logger.info(`📊 Server config loaded: ${stats.total_servers} total, ${stats.active_servers} active`);
  } catch (error) {
    logger.error('❌ Failed to initialize server configuration:', error);
  }
}

async function checkStartupGuildHealth() {
  try {
    logger.info('🏥 Performing startup health checks...');

    for (const guild of client.guilds.cache.values()) {
      try {
        // Check if server is configured
        const serverConfig = serverConfigManager.getServerConfig(guild.id);

        if (!serverConfig) {
          logger.info(`🆕 Unconfigured server detected: ${guild.name} (${guild.id}) - waiting for admin setup`);
          await handleNewServer(guild);
        } else if (!serverConfig.active) {
          logger.info(`🔄 Reactivating server: ${guild.name} (${guild.id})`);
          await serverConfigManager.reactivateServer(guild.id);
        } else {
          logger.info(`✅ Server already configured: ${guild.name} (${guild.id})`);
        }

        // Perform role health checks using server-specific config
        await performRoleHealthCheck(guild, serverConfig);

      } catch (e) {
        logger.warn(`❌ Health check failed for guild ${guild?.name}:`, e?.message);

        // Send Pushover notification for health check failure
        try {
          await pushover.notifyHealthCheckFailure(guild?.name || 'Unknown', [e?.message || 'Unknown error']);
        } catch (notifyError) {
          logger.warn('Failed to send health check notification:', notifyError.message);
        }
      }
    }

    logger.info('✅ Startup health checks completed');
  } catch (e) {
    logger.warn('❌ Startup checks failed:', e?.message);
  }
}

async function handleNewServer(guild) {
  try {
    logger.info(`📥 Bot joined new server: ${guild.name} (${guild.id})`);

    // NOTE: Bot does NOTHING when first invited
    // Configuration happens only when admin runs /server-setup
    // This ensures proper order: /create-back-office first, then /server-setup

    logger.info(`⏳ Waiting for admin commands to configure ${guild.name}`);
  } catch (error) {
    logger.error(`❌ Error handling new server ${guild.name}:`, error);
  }
}

async function performRoleHealthCheck(guild, serverConfig) {
  try {
    if (!serverConfig) {
      logger.warn(`⚠️ No configuration found for guild ${guild.name}, skipping role check`);
      return;
    }

    const me = await guild.members.fetchMe();
    const roles = await guild.roles.fetch();
    const requiredRoles = serverConfig.required_roles || [];

    logger.info(`🔍 Checking ${requiredRoles.length} required roles for ${guild.name}`);

    for (const roleName of requiredRoles) {
      const role = roles.find(r => r && r.name === roleName);
      if (!role) {
        logger.warn(`⚠️ Guild ${guild.name}: missing required role "${roleName}"`);
      } else if (me.roles.highest && me.roles.highest.comparePositionTo(role) <= 0) {
        logger.warn(`⚠️ Guild ${guild.name}: bot role is not above "${roleName}"; cannot assign`);
      } else {
        logger.info(`✅ Guild ${guild.name}: role "${roleName}" is properly configured`);
      }
    }
  } catch (error) {
    logger.warn(`❌ Role health check failed for guild ${guild.name}:`, error.message);
  }
}

async function sendServerWelcomeMessage(guild, serverConfig) {
  try {
    // Try to find a suitable channel to send the welcome message
    let welcomeChannel = guild.channels.cache.find(channel =>
      channel.name.toLowerCase().includes('general') ||
      channel.name.toLowerCase().includes('main') ||
      channel.name.toLowerCase().includes('welcome')
    );

    // Fallback to first text channel
    if (!welcomeChannel) {
      welcomeChannel = guild.channels.cache.find(channel =>
        channel.type === 0 && // TEXT channel
        channel.permissionsFor(guild.members.me).has('SendMessages')
      );
    }

    if (welcomeChannel) {
      const welcomeEmbed = {
        title: '🤖 Vaulty Bot Setup Complete!',
        description: `Hi everyone! I'm **Vaulty**, your onboarding assistant. I've been automatically configured for **${guild.name}** and I'm ready to help with creator onboarding!`,
        color: 0x00ff00,
        fields: [
          {
            name: '📋 Configuration',
            value: [
              `**Server:** ${guild.name}`,
              `**Sheet Tab:** ${serverConfig.sheet_tab}`,
              `**Audit Channel:** ${serverConfig.audit_channel ? `<#${serverConfig.audit_channel}>` : 'Auto-detected'}`,
              `**Welcome Channel:** ${serverConfig.welcome_channel}`
            ].join('\n'),
            inline: false
          },
          {
            name: '🚀 Getting Started',
            value: [
              '• Use `/onboard` to start the onboarding process',
              '• Use `/server-config` to view/change settings',
              '• Check audit logs for completed onboardings'
            ].join('\n'),
            inline: false
          }
        ],
        footer: { text: 'Vaulty Onboarding Bot - Multi-Server Ready!' },
        timestamp: new Date()
      };

      await welcomeChannel.send({ embeds: [welcomeEmbed] });
      logger.info(`📢 Welcome message sent to ${guild.name} in #${welcomeChannel.name}`);
    }
  } catch (error) {
    logger.warn(`❌ Failed to send welcome message to ${guild.name}:`, error.message);
  }
}

// Helper function to load slash commands
function loadSlashCommands() {
  const commandsDir = path.join(__dirname, 'discord', 'commands');
  const files = fs.readdirSync(commandsDir).filter(f => f.endsWith('.js'));
  return files.map(f => require(path.join(commandsDir, f)).data.toJSON());
}

// Helper function to register commands for a specific guild
async function registerCommandsForGuild(guildId) {
  try {
    logger.info(`🔧 Starting command registration for guild ${guildId}`);
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    const body = loadSlashCommands();

    logger.info(`📝 Attempting to register ${body.length} commands for guild ${guildId}`);
    await rest.put(Routes.applicationGuildCommands(APPLICATION_ID, guildId), { body });
    logger.info(`✅ Successfully registered ${body.length} slash command(s) for guild ${guildId}`);

    // List registered commands for verification
    const registeredCommands = await rest.get(Routes.applicationGuildCommands(APPLICATION_ID, guildId));
    logger.info(`📋 Verification: Found ${registeredCommands.length} registered commands in guild ${guildId}`);

  } catch (error) {
    logger.error(`❌ Failed to register commands for guild ${guildId}:`, error);

    // Try to provide more specific error information
    if (error.code) {
      logger.error(`❌ Discord API Error Code: ${error.code}`);
    }
    if (error.message) {
      logger.error(`❌ Error Message: ${error.message}`);
    }

    // Try global registration as fallback
    try {
      logger.info(`🔄 Attempting global command registration as fallback...`);
      await rest.put(Routes.applicationCommands(APPLICATION_ID), { body });
      logger.info(`🌍 Registered ${body.length} global command(s) (may take up to 1 hour)`);
    } catch (fallbackError) {
      logger.error(`❌ Global registration also failed:`, fallbackError.message);
    }
  }
}

async function sendConfigurationErrorMessage(guild, error) {
  try {
    // Try to DM the server owner
    const owner = await guild.fetchOwner();
    if (owner) {
      await owner.send({
        embeds: [{
          title: '⚠️ Vaulty Configuration Error',
          description: `There was an issue automatically configuring Vaulty for **${guild.name}**.`,
          color: 0xffa500,
          fields: [
            {
              name: '❌ Error',
              value: error.message || 'Unknown configuration error',
              inline: false
            },
            {
              name: '🔧 Next Steps',
              value: [
                '1. Ensure I have proper permissions',
                '2. Create channels for audit logs',
                '3. Run `/server-setup` to manually configure',
                '4. Contact support if issues persist'
              ].join('\n'),
              inline: false
            }
          ],
          footer: { text: 'Vaulty Onboarding Bot' },
          timestamp: new Date()
        }]
      });
    }
  } catch (dmError) {
    logger.warn(`❌ Failed to send error DM to ${guild.name} owner:`, dmError.message);
  }
}

// Event: Bot joins a new server
client.on('guildCreate', async (guild) => {
  logger.info(`📥 Bot joined new server: ${guild.name} (${guild.id})`);

  // Send Pushover notification for new server
  try {
    await pushover.notifyNewServer(guild.name, guild.id);
  } catch (error) {
    logger.warn('Failed to send new server notification:', error.message);
  }

  await handleNewServer(guild);

  // Automatically register slash commands for new server
  await registerCommandsForGuild(guild.id);
});

// Event: Bot leaves a server
client.on('guildDelete', async (guild) => {
  logger.info(`📤 Bot left server: ${guild.name} (${guild.id})`);
  await serverConfigManager.deactivateServer(guild.id);
});

// Event: Bot is ready
client.once('ready', async () => {
  logger.info(`🤖 OnboardingBot logged in as ${client.user.tag}`);
  logger.info('👨‍💻 Built by nytemode - https://nytemode.com');

  // Initialize server configuration system
  await initializeServerConfigs();

  // Perform startup health checks
  await checkStartupGuildHealth();

  logger.info('🎉 Bot is ready and multi-server enabled!');

  // Send Pushover notification for bot startup
  try {
    const serverCount = client.guilds.cache.size;
    await pushover.notifyBotStarted(serverCount);
  } catch (error) {
    logger.warn('Failed to send startup notification:', error.message);
  }
});

client.login(DISCORD_TOKEN);

// Global error handling for critical bot errors
process.on('uncaughtException', async (error) => {
  logger.error('💥 Uncaught Exception:', error);
  try {
    await pushover.notifyBotError(`Uncaught Exception: ${error.message}`);
  } catch (notifyError) {
    logger.error('Failed to send error notification:', notifyError.message);
  }
  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  logger.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  try {
    await pushover.notifyBotError(`Unhandled Rejection: ${reason}`);
  } catch (notifyError) {
    logger.error('Failed to send error notification:', notifyError.message);
  }
});
