const https = require('https');

// Pushover notification service
class PushoverService {
  constructor() {
    this.appToken = process.env.PUSHOVER_APP_TOKEN;
    this.userKey = process.env.PUSHOVER_USER_KEY;
    this.enabled = !!(this.appToken && this.userKey);
  }

  /**
   * Send a notification to Pushover
   * @param {string} message - The message to send
   * @param {object} options - Additional options
   * @param {string} options.title - Notification title (optional)
   * @param {string} options.priority - Priority level (-2, -1, 0, 1, 2) (optional)
   * @param {string} options.sound - Notification sound (optional)
   */
  async sendNotification(message, options = {}) {
    if (!this.enabled) {
      console.log('📱 Pushover: Service disabled (missing credentials)');
      return false;
    }

    const postData = new URLSearchParams({
      token: this.appToken,
      user: this.userKey,
      message: message,
      title: options.title || 'Vaulty Bot Alert',
      priority: options.priority || '0',
      sound: options.sound || 'pushover'
    });

    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'api.pushover.net',
        port: 443,
        path: '/1/messages.json',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData.toString())
        }
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            console.log('📱 Pushover: Notification sent successfully');
            resolve(true);
          } else {
            console.error(`📱 Pushover: Failed to send notification (${res.statusCode}):`, data);
            resolve(false);
          }
        });
      });

      req.on('error', (error) => {
        console.error('📱 Pushover: Request error:', error.message);
        resolve(false);
      });

      req.write(postData.toString());
      req.end();
    });
  }

  // Predefined notification methods for common events

  /**
   * Send notification for bot startup
   */
  async notifyBotStarted(serverCount = 0) {
    return this.sendNotification(
      `🤖 Vaulty Bot is now online and ready!\n\n📊 Managing ${serverCount} Discord server${serverCount !== 1 ? 's' : ''}`,
      {
        title: 'Bot Started',
        priority: '0',
        sound: 'magic'
      }
    );
  }

  /**
   * Send notification for bot shutdown/error
   */
  async notifyBotError(error = 'Unknown error') {
    return this.sendNotification(
      `🚨 Vaulty Bot encountered a critical error:\n\n${error}`,
      {
        title: 'Bot Error',
        priority: '1', // High priority
        sound: 'siren'
      }
    );
  }

  /**
   * Send notification for new onboarding start
   */
  async notifyOnboardingStarted(userTag, serverName) {
    return this.sendNotification(
      `🎯 New onboarding started!\n\n👤 User: ${userTag}\n🏠 Server: ${serverName}`,
      {
        title: 'New Onboarding',
        priority: '0',
        sound: 'bike'
      }
    );
  }

  /**
   * Send notification for onboarding completion
   */
  async notifyOnboardingCompleted(userTag, serverName, tiktokUsername = null) {
    let message = `✅ Onboarding completed!\n\n👤 User: ${userTag}\n🏠 Server: ${serverName}`;
    if (tiktokUsername) {
      message += `\n📱 TikTok: @${tiktokUsername}`;
    }

    return this.sendNotification(message, {
      title: 'Onboarding Complete',
      priority: '0',
      sound: 'cashregister'
    });
  }

  /**
   * Send notification for critical errors
   */
  async notifyCriticalError(errorType, details, serverName = null) {
    let message = `🚨 Critical Error: ${errorType}\n\n${details}`;
    if (serverName) {
      message += `\n🏠 Server: ${serverName}`;
    }

    return this.sendNotification(message, {
      title: 'Critical Error',
      priority: '1',
      sound: 'falling'
    });
  }

  /**
   * Send notification for new server join
   */
  async notifyNewServer(serverName, serverId) {
    return this.sendNotification(
      `📥 Bot joined new server!\n\n🏠 Server: ${serverName}\n🆔 ID: ${serverId}\n\nWaiting for admin to run /server-setup`,
      {
        title: 'New Server',
        priority: '0',
        sound: 'tugboat'
      }
    );
  }

  /**
   * Send notification for health check failures
   */
  async notifyHealthCheckFailure(serverName, issues) {
    return this.sendNotification(
      `⚠️ Health check failed!\n\n🏠 Server: ${serverName}\n❌ Issues: ${issues.join(', ')}`,
      {
        title: 'Health Check Failed',
        priority: '0',
        sound: 'echo'
      }
    );
  }

  /**
   * Send daily summary
   */
  async notifyDailySummary(stats) {
    const message = `📊 Daily Summary\n\n` +
      `📈 Onboardings: ${stats.onboardings || 0}\n` +
      `🚨 Errors: ${stats.errors || 0}\n` +
      `🏠 Servers: ${stats.servers || 0}\n` +
      `⚡ Uptime: ${stats.uptime || 'N/A'}`;

    return this.sendNotification(message, {
      title: 'Daily Summary',
      priority: '-1', // Low priority
      sound: 'intermission'
    });
  }
}

module.exports = new PushoverService();
