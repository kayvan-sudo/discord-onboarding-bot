const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const https = require('https');

// Helper function to fetch Heroku status
async function getHerokuStatus() {
  return new Promise((resolve) => {
    const options = {
      hostname: 'status.heroku.com',
      path: '/api/v4/current-status',
      method: 'GET',
      headers: {
        'User-Agent': 'Vaulty-Bot/1.0'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({
            success: true,
            data: parsed
          });
        } catch (e) {
          resolve({
            success: false,
            error: 'Failed to parse Heroku status'
          });
        }
      });
    });

    req.on('error', () => {
      resolve({
        success: false,
        error: 'Network error'
      });
    });

    req.setTimeout(5000, () => {
      req.destroy();
      resolve({
        success: false,
        error: 'Timeout'
      });
    });

    req.end();
  });
}

// Helper function to check Google Sheets connectivity
async function checkGoogleSheetsHealth() {
  try {
    const sheetsService = require('../../services/sheets');
    // Try to get the sheets client - this tests authentication
    await sheetsService.getSheetsClient();
    return {
      success: true,
      status: 'Connected'
    };
  } catch (error) {
    return {
      success: false,
      status: 'Connection Failed',
      error: error.message
    };
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Health check for the bot (Owner/Admin only)')
    .setDMPermission(false),

  async execute(interaction) {
    // Check if user has admin permissions using auto-detection
    const { checkMemberAdminPermissions } = require('../../services/server-config');
    const adminCheck = await checkMemberAdminPermissions(interaction.member);

    if (!adminCheck.isAdmin) {
      return interaction.reply({
        content: `❌ You do not have permission to use this command. (Owner/Admin only)\n\n**Reason:** ${adminCheck.reason}`,
        flags: 64
      });
    }

    const startTime = Date.now();
    
    // Defer reply to gather metrics
    await interaction.deferReply({ flags: 64 });
    
    try {
      // Calculate latency
      const apiLatency = Date.now() - startTime;
      const wsLatency = interaction.client.ws.ping;
      
      // Get bot stats
      const uptime = process.uptime();
      const memoryUsage = process.memoryUsage();
      const guilds = interaction.client.guilds.cache.size;
      const users = interaction.client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
      
      // Format uptime
      const days = Math.floor(uptime / 86400);
      const hours = Math.floor((uptime % 86400) / 3600);
      const minutes = Math.floor((uptime % 3600) / 60);
      const seconds = Math.floor(uptime % 60);
      const uptimeString = `${days}d ${hours}h ${minutes}m ${seconds}s`;
      
      // Format memory usage
      const memoryMB = Math.round(memoryUsage.rss / 1024 / 1024);
      const heapUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
      const heapTotalMB = Math.round(memoryUsage.heapTotal / 1024 / 1024);

      // Check external services
      console.log('🔍 Checking Heroku status...');
      const herokuStatus = await getHerokuStatus();
      
      console.log('🔍 Checking Google Sheets connectivity...');
      const sheetsHealth = await checkGoogleSheetsHealth();
      
      // Determine overall health color
      let embedColor = 0x00ff00; // Green - all good
      if (!herokuStatus.success || !sheetsHealth.success) {
        embedColor = 0xffa500; // Orange - some issues
      }
      
      const embed = new EmbedBuilder()
        .setTitle('🏓 Pong! Comprehensive System Status')
        .setColor(embedColor)
        .addFields(
          { name: '📡 Bot Latency', value: `API: ${apiLatency}ms\nWebSocket: ${wsLatency}ms`, inline: true },
          { name: '⏱️ Bot Uptime', value: uptimeString, inline: true },
          { name: '🏠 Discord Stats', value: `${guilds} guilds\n~${users} users`, inline: true },
          { name: '💾 Memory Usage', value: `RSS: ${memoryMB}MB\nHeap: ${heapUsedMB}MB/${heapTotalMB}MB`, inline: true },
          { name: '🔧 Environment', value: `Node.js: ${process.version}\nPlatform: ${process.platform}`, inline: true }
        )
        .setTimestamp()
        .setFooter({ text: 'Vaulty Bot System Health Check' });

      // Add Heroku status
      if (herokuStatus.success && herokuStatus.data && herokuStatus.data.status) {
        const herokuServices = herokuStatus.data.status;
        let herokuText = '';
        herokuServices.forEach(service => {
          const statusEmoji = service.status === 'green' ? '✅' : 
                             service.status === 'yellow' ? '⚠️' : '❌';
          herokuText += `${statusEmoji} ${service.system}: ${service.status}\n`;
        });
        embed.addFields({ 
          name: '🔧 Heroku Platform Status', 
          value: herokuText || '✅ All systems operational', 
          inline: false 
        });
      } else {
        embed.addFields({ 
          name: '🔧 Heroku Platform Status', 
          value: `❌ ${herokuStatus.error || 'Unable to fetch status'}`, 
          inline: false 
        });
      }

      // Add Google Sheets status
      const sheetsEmoji = sheetsHealth.success ? '✅' : '❌';
      const sheetsText = sheetsHealth.success 
        ? `${sheetsEmoji} Google Sheets: ${sheetsHealth.status}`
        : `${sheetsEmoji} Google Sheets: ${sheetsHealth.status}\nError: ${sheetsHealth.error || 'Unknown error'}`;
      
      embed.addFields({ 
        name: '📊 Google Sheets Status', 
        value: sheetsText, 
        inline: false 
      });

      // Add overall status summary
      const allGood = herokuStatus.success && sheetsHealth.success;
      const overallStatus = allGood 
        ? '✅ All systems operational' 
        : '⚠️ Some services experiencing issues';
      
      embed.addFields({ 
        name: '🎯 Overall Status', 
        value: overallStatus, 
        inline: false 
      });

      await interaction.followUp({ embeds: [embed], flags: 64 });
    } catch (error) {
      console.error('Error in ping command:', error);
      await interaction.followUp({ 
        content: '❌ Error gathering system status. Check logs for details.', 
        flags: 64 
      });
    }
  }
};

