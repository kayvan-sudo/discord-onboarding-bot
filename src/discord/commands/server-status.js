const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const serverConfigManager = require('../../services/server-config');
const { getActiveSessions, getSessionCount } = require('../../services/onboarding');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('server-status')
    .setDescription('View detailed server status and statistics (Admin only)')
    .setDMPermission(false),

  async execute(interaction) {
    // Check if user has admin permissions using auto-detection
    const { checkMemberAdminPermissions } = require('../../services/server-config');
    const adminCheck = await checkMemberAdminPermissions(interaction.member);

    if (!adminCheck.isAdmin) {
      return interaction.reply({
        content: `❌ You need administrative permissions to use this command.\n\n**Required:** Administrator permission, Server Owner, or an admin role.\n\n**Reason:** ${adminCheck.reason}`,
        flags: 64
      });
    }

    await interaction.deferReply({ flags: 64 });

    try {
      const guild = interaction.guild;
      const config = serverConfigManager.getServerConfig(guild.id);

      if (!config) {
        return interaction.editReply({
          content: '❌ This server is not configured yet. Run `/server-setup` first.',
        });
      }

      // Get server health metrics
      const healthMetrics = await getServerHealthMetrics(guild, config);

      // Get onboarding statistics
      const onboardingStats = await getOnboardingStatistics(guild);

      // Get bot performance metrics
      const performanceMetrics = getBotPerformanceMetrics(interaction.client);

      // Create main status embed
      const statusEmbed = new EmbedBuilder()
        .setTitle(`📊 ${guild.name} - Server Status`)
        .setColor(getStatusColor(healthMetrics.overallHealth))
        .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }))
        .addFields(
          {
            name: '🏥 Server Health',
            value: [
              `**Status:** ${getHealthEmoji(healthMetrics.overallHealth)} ${healthMetrics.overallHealth}`,
              `**Configuration:** ${config.active ? '✅ Complete' : '⚠️ Incomplete'}`,
              `**Bot Permissions:** ${healthMetrics.botPermissions ? '✅ Good' : '❌ Issues'}`,
              `**Audit Channel:** ${healthMetrics.auditChannelExists ? '✅ Available' : '❌ Missing'}`
            ].join('\n'),
            inline: true
          },
          {
            name: '📈 Onboarding Activity',
            value: [
              `**Active Sessions:** ${onboardingStats.activeSessions}`,
              `**Today's Completions:** ${onboardingStats.todayCompletions}`,
              `**This Week:** ${onboardingStats.weekCompletions}`,
              `**Success Rate:** ${onboardingStats.successRate}%`
            ].join('\n'),
            inline: true
          },
          {
            name: '🤖 Bot Performance',
            value: [
              `**Uptime:** ${performanceMetrics.uptime}`,
              `**Memory Usage:** ${performanceMetrics.memoryUsage}`,
              `**Response Time:** ${performanceMetrics.latency}ms`,
              `**Servers:** ${performanceMetrics.guildCount}`
            ].join('\n'),
            inline: true
          }
        )
        .setTimestamp()
        .setFooter({
          text: 'Vaulty Server Status',
          iconURL: interaction.client.user.displayAvatarURL()
        });

      // Calculate total roles configured (welcome + required roles)
      const rolesConfigured = (config.welcome_role ? 1 : 0) + (config.required_roles?.length || 0);

      // Add configuration summary
      statusEmbed.addFields({
        name: '⚙️ Configuration Summary',
        value: [
          `**Welcome Channel:** ${config.welcome_channel ? `<#${config.welcome_channel}>` : 'Not set'}`,
          `**Audit Channel:** ${config.audit_channel ? `<#${config.audit_channel}>` : 'Not set'}`,
          `**Roles Configured:** ${rolesConfigured}/3`,
          `**Admin Roles:** ${config.admin_roles?.length || 0}`,
          `**Google Sheet Tab:** ${config.sheet_tab}`
        ].join('\n'),
        inline: false
      });

      // Add alerts/warnings if any
      const alerts = getServerAlerts(healthMetrics, onboardingStats);
      if (alerts.length > 0) {
        statusEmbed.addFields({
          name: '🚨 Alerts',
          value: alerts.map(alert => `• ${alert}`).join('\n'),
          inline: false
        });
      }


      await interaction.editReply({
        embeds: [statusEmbed]
      });

    } catch (error) {
      console.error('Server status error:', error);
      await interaction.editReply({
        content: `❌ Error retrieving server status: ${error.message}`,
      });
    }
  }
};

async function getServerHealthMetrics(guild, config) {
  const metrics = {
    overallHealth: 'Healthy',
    botPermissions: true,
    auditChannelExists: false,
    welcomeChannelExists: false,
    rolesConfigured: false,
    issues: []
  };

  try {
    // Check bot permissions
    const botMember = await guild.members.fetch(guild.members.me.id);
    const requiredPermissions = [
      'ViewChannel', 'SendMessages', 'EmbedLinks',
      'ManageRoles', 'ReadMessageHistory'
    ];

    for (const perm of requiredPermissions) {
      if (!botMember.permissions.has(perm)) {
        metrics.botPermissions = false;
        metrics.issues.push(`Missing permission: ${perm}`);
        break;
      }
    }

    // Check audit channel
    if (config.audit_channel) {
      try {
        const auditChannel = await guild.channels.fetch(config.audit_channel);
        if (auditChannel && auditChannel.type === 0) { // TEXT channel
          metrics.auditChannelExists = true;
        }
      } catch (error) {
        metrics.issues.push('Audit channel not accessible');
      }
    } else {
      metrics.issues.push('No audit channel configured');
    }

    // Check welcome channel
    if (config.welcome_channel) {
      const welcomeChannel = guild.channels.cache.find(ch => ch.name === config.welcome_channel);
      if (welcomeChannel && welcomeChannel.type === 0) {
        metrics.welcomeChannelExists = true;
      }
    }

    // Check roles (welcome role + required roles)
    let rolesFound = 0;
    let missingRoles = [];

    // Check welcome role
    if (config.welcome_role) {
      const welcomeRole = guild.roles.cache.find(r => r.name === config.welcome_role);
      if (welcomeRole) {
        rolesFound++;
      } else {
        missingRoles.push('Welcome/Autojoin role');
      }
    } else {
      missingRoles.push('Welcome/Autojoin role');
    }

    // Check required roles (onboarding and onboarded)
    if (config.required_roles && config.required_roles.length >= 2) {
      const onboardingRole = guild.roles.cache.find(r => r.name === config.required_roles[0]);
      const onboardedRole = guild.roles.cache.find(r => r.name === config.required_roles[1]);

      if (onboardingRole) {
        rolesFound++;
      } else {
        missingRoles.push('Onboarding role');
      }

      if (onboardedRole) {
        rolesFound++;
      } else {
        missingRoles.push('Onboarded role');
      }
    } else {
      if (!config.required_roles || config.required_roles.length < 2) {
        missingRoles.push('Required roles not configured');
      }
    }

    // Determine if roles are properly configured (all 3 roles found)
    if (rolesFound >= 3) {
      metrics.rolesConfigured = true;
    } else {
      metrics.issues.push(`Missing roles: ${missingRoles.join(', ')}`);
    }

    // Determine overall health
    if (metrics.issues.length === 0) {
      metrics.overallHealth = 'Excellent';
    } else if (metrics.issues.length <= 2) {
      metrics.overallHealth = 'Good';
    } else if (metrics.issues.length <= 4) {
      metrics.overallHealth = 'Warning';
    } else {
      metrics.overallHealth = 'Critical';
    }

  } catch (error) {
    console.error('Error getting health metrics:', error);
    metrics.overallHealth = 'Error';
    metrics.issues.push('Unable to check server health');
  }

  return metrics;
}

async function getOnboardingStatistics(guild) {
  // This is a simplified version - in a real implementation,
  // you'd want to track these metrics in a database
  const stats = {
    activeSessions: getSessionCount(),
    todayCompletions: 0, // Would be tracked in database
    weekCompletions: 0,  // Would be tracked in database
    successRate: 95      // Would be calculated from historical data
  };

  // For now, we'll show active sessions and some mock data
  // In production, you'd query your Google Sheets or database for real stats

  return stats;
}

function getBotPerformanceMetrics(client) {
  const uptime = process.uptime();
  const days = Math.floor(uptime / 86400);
  const hours = Math.floor((uptime % 86400) / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);

  const memoryUsage = process.memoryUsage();
  const memoryMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);

  const latency = client.ws.ping;

  return {
    uptime: days > 0 ? `${days}d ${hours}h ${minutes}m` : `${hours}h ${minutes}m`,
    memoryUsage: `${memoryMB}MB`,
    latency: latency,
    guildCount: client.guilds.cache.size
  };
}

function getServerAlerts(healthMetrics, onboardingStats) {
  const alerts = [];

  if (!healthMetrics.botPermissions) {
    alerts.push('🚨 **Bot permissions issue** - Check bot permissions');
  }

  if (!healthMetrics.auditChannelExists) {
    alerts.push('⚠️ **No audit channel** - Set up audit logging');
  }

  if (!healthMetrics.rolesConfigured) {
    alerts.push('⚠️ **Role configuration incomplete** - Missing welcome/autojoin, onboarding, or onboarded roles');
  }

  if (onboardingStats.activeSessions > 10) {
    alerts.push('📈 **High activity** - Many active onboarding sessions');
  }

  if (healthMetrics.overallHealth === 'Critical') {
    alerts.push('🚨 **Critical issues** - Immediate attention required');
  }

  return alerts;
}

function getStatusColor(health) {
  switch (health) {
    case 'Excellent': return 0x00ff00; // Green
    case 'Good': return 0x00ff88;      // Light green
    case 'Healthy': return 0x00ff00;   // Green
    case 'Warning': return 0xffa500;   // Orange
    case 'Critical': return 0xff0000;  // Red
    case 'Error': return 0x990000;     // Dark red
    default: return 0x0099ff;          // Blue
  }
}

function getHealthEmoji(health) {
  switch (health) {
    case 'Excellent': return '💚';
    case 'Good': return '💚';
    case 'Healthy': return '💚';
    case 'Warning': return '🟡';
    case 'Critical': return '🔴';
    case 'Error': return '❌';
    default: return '🤔';
  }
}
