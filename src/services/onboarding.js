const { EmbedBuilder } = require('discord.js');
const serverConfigManager = require('./server-config');
const pushover = require('../utils/pushover');

// Store active onboarding sessions
const activeOnboardings = new Map();

// Store inactivity timers
const inactivityTimers = new Map();

/**
 * Get questions for a specific server
 * @param {string} guildId - Discord server ID
 * @returns {array} Array of questions for the server
 */
function getServerQuestions(guildId) {
  return serverConfigManager.getServerQuestions(guildId);
}

/**
 * Validate answer based on question type
 * @param {object} question - Question object
 * @param {string} answer - User's answer
 * @returns {boolean} Whether answer is valid
 */
function validateAnswer(question, answer) {
  const trimmedAnswer = answer.trim();

  // Handle optional questions - always valid
  if (question.validation === 'optional') {
    return true;
  }

  // Handle required validation
  if (question.validation === 'required') {
    return trimmedAnswer.length > 0;
  }

  // Handle email validation
  if (question.validation === 'email') {
    if (!trimmedAnswer) return false;
    // More comprehensive email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(trimmedAnswer) && trimmedAnswer.includes('@') && trimmedAnswer.includes('.');
  }

  // Handle URL validation
  if (question.validation === 'url') {
    if (!trimmedAnswer) return false;
    return /^https?:\/\/.+/.test(trimmedAnswer);
  }

  // Handle phone validation (for WhatsApp and similar)
  if (question.validation === 'phone' || question.id === 'whatsapp_number') {
    if (!trimmedAnswer || trimmedAnswer.toLowerCase() === 'skip') return true;

    // Allow various phone number formats
    const phoneRegex = /^[\+]?[\d\s\-\(\)\.]{7,20}$/;
    const hasDigits = /\d/.test(trimmedAnswer);
    const reasonableLength = trimmedAnswer.replace(/[\s\-\(\)\.]/g, '').length >= 7;

    return phoneRegex.test(trimmedAnswer) && hasDigits && reasonableLength;
  }

  // Default: any non-empty answer is valid
  return trimmedAnswer.length > 0;
}

/**
 * Apply TikTok-based nickname to a member if a TikTok question was asked
 * @param {object} member - Discord member object
 * @param {object} session - Onboarding session object
 */
async function applyTikTokNickname(member, session) {
  try {
    // Automatically find TikTok username from responses (no configuration needed)
    const tiktokUsername = serverConfigManager.findTikTokUsername(member.guild.id, session.responses);

    if (!tiktokUsername) {
      console.log(`ℹ️ No TikTok username question found for ${member.user.tag} in server ${member.guild.name}`);
      return;
    }

    // Generate the nickname using default format
    const newNickname = serverConfigManager.generateTikTokNickname(tiktokUsername);

    // Check if bot has permission to change nicknames
    if (!member.guild.members.me.permissions.has('ManageNicknames')) {
      console.warn(`⚠️ Bot lacks ManageNicknames permission in ${member.guild.name} - cannot set TikTok nickname`);
      return;
    }

    // Check if the member is manageable (not server owner, higher role, etc.)
    if (!member.manageable) {
      console.warn(`⚠️ Cannot manage member ${member.user.tag} in ${member.guild.name} - nickname change skipped`);
      return;
    }

    // Apply the nickname
    const oldNickname = member.nickname || member.user.username;
    await member.setNickname(newNickname);

    console.log(`✅ Applied TikTok nickname to ${member.user.tag}: "${oldNickname}" → "${newNickname}"`);

    // Update completion message to mention nickname change
    return { nicknameApplied: true, oldNickname, newNickname };

  } catch (error) {
    console.error(`❌ Error applying TikTok nickname to ${member.user.tag}:`, {
      message: error.message,
      stack: error.stack,
      guildId: member.guild.id,
      userId: member.user.id
    });

    // Don't fail the entire onboarding process for nickname errors
    return { nicknameApplied: false, error: error.message };
  }
}

/**
 * Get validation error message for a question
 * @param {object} question - Question object
 * @returns {string} Error message
 */
function getValidationError(question) {
  switch (question.validation) {
    case 'required':
      return `Please provide an answer for: ${question.question}`;
    case 'email':
      return `Please provide a valid email address (e.g., yourname@example.com). Make sure it includes an @ symbol and a domain.`;
    case 'url':
      return `Please provide a valid URL (e.g., https://example.com). Make sure it starts with http:// or https://.`;
    case 'phone':
      return `Please provide a valid phone number (e.g., +1-234-567-8900 or 234-567-8900). Include area code and use numbers only, or type 'skip' if you don't have one.`;
    default:
      // Special handling for WhatsApp question
      if (question.id === 'whatsapp_number') {
        return `Please provide a valid WhatsApp number (e.g., +1-234-567-8900 or 234-567-8900), or type 'skip' if you don't have WhatsApp.`;
      }
      return `Please provide a valid answer for: ${question.question}`;
  }
}

async function startOnboarding(channel, member) {
  try {
    // Clear any existing timers for this user
    clearUserTimers(member.id);

    // Initialize onboarding session
    const session = {
      userId: member.id,
      channelId: channel.id,
      currentQuestion: 0,
      responses: {},
      startedAt: new Date(),
      lastActivity: new Date()
    };

    activeOnboardings.set(member.id, session);

    // Set up inactivity timers
    setupInactivityTimers(channel, member, session);

    // Send Pushover notification for new onboarding
    try {
      await pushover.notifyOnboardingStarted(member.user.tag, member.guild.name);
    } catch (notifyError) {
      console.warn('Failed to send onboarding start notification:', notifyError.message);
    }

    // Brief pause before starting questions (lets user read welcome message)
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Ask first question
    await askQuestion(channel, member, session);

  } catch (error) {
    console.error('Error starting onboarding:', error);
  }
}

async function askQuestion(channel, member, session) {
  const serverQuestions = getServerQuestions(member.guild.id);
  const questionIndex = session.currentQuestion;

  if (questionIndex >= serverQuestions.length) {
    // All questions answered, complete onboarding
    await completeOnboarding(channel, member, session);
    return;
  }

  const question = serverQuestions[questionIndex];
  const questionNumber = questionIndex + 1;
  const totalQuestions = serverQuestions.length;

  let message = `**Question ${questionNumber}/${totalQuestions}:**\n${question.question}`;

  if (question.placeholder) {
    message += `\n\n*(Example: ${question.placeholder})*`;
  }

  if (question.validation === 'optional') {
    message += '\n\n*(Type "skip" if you don\'t have this)*';
  }

  // Add specific hints for different validation types
  if (question.validation === 'email') {
    message += '\n\n*(Make sure your email includes an @ symbol and a domain like .com)*';
  } else if (question.validation === 'phone' || question.id === 'whatsapp_number') {
    message += '\n\n*(Include country code for international numbers, e.g., +1 for US/Canada)*';
  }

  await channel.send(message);
}

async function handleResponse(message) {
  // Check if this is an active onboarding session
  const session = activeOnboardings.get(message.author.id);
  if (!session) return false;

  // Check if message is in the correct channel
  if (message.channel.id !== session.channelId) return false;

  // Update last activity and reset timers
  session.lastActivity = new Date();
  resetInactivityTimers(message.author.id);

  const serverQuestions = getServerQuestions(message.guild.id);
  const questionIndex = session.currentQuestion;

  // Safety check: ensure question exists
  if (!serverQuestions || questionIndex >= serverQuestions.length) {
    console.error(`❌ Onboarding error: Invalid question index ${questionIndex} for ${serverQuestions?.length || 0} questions`);
    const errorMessage = `<@${message.author.id}> ❌ Sorry, there was an issue with the onboarding process. Please try again by using the \`/onboard\` command.`;
    await message.channel.send(errorMessage);

    // Clean up the session
    clearUserSession(message.author.id);
    return true;
  }

  const question = serverQuestions[questionIndex];
  const answer = message.content.trim();

  // Additional safety check for question object
  if (!question || !question.id) {
    console.error(`❌ Onboarding error: Invalid question object at index ${questionIndex}:`, question);
    const errorMessage = `<@${message.author.id}> ❌ Sorry, there was an issue with the onboarding process. Please try again by using the \`/onboard\` command.`;
    await message.channel.send(errorMessage);

    // Clean up the session
    clearUserSession(message.author.id);
    return true;
  }

  // Handle optional questions
  if (question.validation === 'optional' && (answer.toLowerCase() === 'skip' || answer === '')) {
    session.responses[question.id] = 'Not provided';
    session.currentQuestion++;
    await askQuestion(message.channel, message.member, session);
    return true;
  }

  // Validate answer using new validation system
  if (!validateAnswer(question, answer)) {
    const errorMessage = `<@${message.author.id}> ❌ ${getValidationError(question)}`;
    await message.channel.send(errorMessage);
    return true;
  }

  // Store response and move to next question
  session.responses[question.id] = answer;
  session.currentQuestion++;

  // Ask next question or complete
  await askQuestion(message.channel, message.member, session);
  return true;
}

async function completeOnboarding(channel, member, session) {
  try {
    // Import required services
    const rolesService = require('./roles');
    const sheetsService = require('./sheets');
    const channelService = require('./channels');

    // Get server-specific configuration
    const serverConfig = serverConfigManager.getServerConfig(member.guild.id);

    if (!serverConfig) {
      throw new Error(`Server ${member.guild.name} is not configured. Please run /server-setup first.`);
    }

    // Assign final roles using server-specific configuration
    const result = await rolesService.assignOnboardingRoles(member, false, serverConfig);

    // Apply TikTok nickname if enabled and configured
    const nicknameResult = await applyTikTokNickname(member, session);

    // Prepare data for Google Sheets with dynamic questions
    const serverQuestions = getServerQuestions(member.guild.id);
    const questionAnswers = serverQuestions.map(q => session.responses[q.id] || 'Not provided');

    const row = [
      new Date().toISOString(),
      member.guild.name,
      member.guild.id,
      member.user.tag,
      member.user.id,
      channel.name,
      ...questionAnswers, // Dynamic question answers
      result.added.join(', ') || 'None',
      Math.random().toString(36).slice(2,8),
    ];

    // Log to Google Sheets
    try {
      await sheetsService.appendOnboardingRow(member.client, row);
      console.log(`✅ Google Sheets data saved for ${member.user.tag} (guild: ${member.guild.name})`);
    } catch (sheetsError) {
      console.error(`❌ Google Sheets Error - Failed to save onboarding data for ${member.user.tag}:`, {
        message: sheetsError.message,
        stack: sheetsError.stack,
        guildId: member.guild.id,
        guildName: member.guild.name,
        userId: member.user.id,
        userTag: member.user.tag,
        rowLength: row.length,
        timestamp: new Date().toISOString()
      });

      // Send Pushover notification for Google Sheets error
      try {
        await pushover.notifyCriticalError(
          'Google Sheets Save Failed',
          `Failed to save onboarding data for ${member.user.tag} in ${member.guild.name}`,
          member.guild.name
        );
      } catch (notifyError) {
        console.warn('Failed to send Google Sheets error notification:', notifyError.message);
      }

      // Don't fail the entire onboarding process for Google Sheets errors
      // Just log it and continue with the completion message
      console.warn(`⚠️ Onboarding completed for ${member.user.tag} but Google Sheets save failed`);
    }

    // Send completion message with nickname info if applicable
    let completionMessage = `<@${member.user.id}> 🎉 Great! You've completed onboarding, ${member.user.username}!\n\nYour info has been saved and you now have access to the full server.`;

    if (nicknameResult && nicknameResult.nicknameApplied) {
      completionMessage += `\n\n👤 **Your nickname has been set to:** \`${nicknameResult.newNickname}\``;
    }

    completionMessage += `\n\nWelcome to The Creator Vault! Check out the channels and say hi to everyone.`;

    await channel.send(completionMessage);

    // Send Pushover notification for onboarding completion
    try {
      const tiktokUsername = serverConfigManager.findTikTokUsername(member.guild.id, session.responses);
      await pushover.notifyOnboardingCompleted(member.user.tag, member.guild.name, tiktokUsername);
    } catch (notifyError) {
      console.warn('Failed to send onboarding completion notification:', notifyError.message);
    }

    // Send stylized audit log to server-specific audit channel
    const auditChannelId = serverConfig.audit_channel;
    if (!auditChannelId) {
      console.warn(`⚠️ No audit channel configured for server ${member.guild.name}`);
    } else {
      try {
        const auditChannel = await member.client.channels.fetch(auditChannelId);
      if (auditChannel) {
        // Create dynamic fields based on server questions
        const serverQuestions = getServerQuestions(member.guild.id);
        const auditFields = [
          { name: '👤 User', value: `${member.user.tag}\nID: ${member.user.id}`, inline: true },
          { name: '📅 Timestamp', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
          { name: '🎯 Channel', value: `#${channel.name}`, inline: true }
        ];

        // Add dynamic question responses
        serverQuestions.forEach((question, index) => {
          const answer = session.responses[question.id] || 'Not provided';
          const fieldName = question.question.length > 20
            ? question.question.substring(0, 17) + '...'
            : question.question;

          auditFields.push({
            name: fieldName,
            value: answer,
            inline: index < 2 // First two questions inline, others stacked
          });
        });

        const auditEmbed = new EmbedBuilder()
          .setTitle('✅ New Creator Onboarded!')
          .setDescription(`<@${member.user.id}> **${member.user.username}** completed onboarding successfully!`)
          .setColor(0x00ff00) // Green for success
          .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
          .addFields(auditFields)
          .setFooter({ text: 'Vaulty Onboarding System', iconURL: member.client.user.displayAvatarURL() })
          .setTimestamp();

        await auditChannel.send({ embeds: [auditEmbed] });
        console.log(`📋 Styled audit log sent for ${member.user.tag}`);
      }
    } catch (auditError) {
      console.error('Failed to send audit log:', auditError);
    }

    // Clean up private channel
    await channelService.cleanupOnboardingChannel(channel, member);

    // Remove from active onboardings
    activeOnboardings.delete(member.id);

    console.log(`✅ Onboarding completed for ${member.user.tag}`);
    }

  } catch (error) {
    console.error('❌ Critical Error completing onboarding:', {
      message: error.message,
      stack: error.stack,
      guildId: member.guild.id,
      guildName: member.guild.name,
      userId: member.user.id,
      userTag: member.user.tag,
      sessionExists: !!activeOnboardings.get(member.id),
      timestamp: new Date().toISOString()
    });

    // Send Pushover notification for critical onboarding error
    try {
      await pushover.notifyCriticalError(
        'Onboarding Completion Failed',
        `Critical error during onboarding completion for ${member.user.tag} in ${member.guild.name}: ${error.message}`,
        member.guild.name
      );
    } catch (notifyError) {
      console.warn('Failed to send critical error notification:', notifyError.message);
    }

    // Send specific error message based on error type
    let errorMessage;
    if (error.message.includes('Google Sheets')) {
      errorMessage = `<@${member.user.id}> ⚠️ Onboarding completed but there was an issue saving your data. Please contact an admin to verify your information was recorded.`;
    } else if (error.message.includes('role')) {
      errorMessage = `<@${member.user.id}> ⚠️ Onboarding completed but there was an issue assigning your roles. Please contact an admin to get your roles manually.`;
    } else {
      errorMessage = `<@${member.user.id}> ❌ Oops! Something went wrong during onboarding. Please contact an admin for help.`;
    }

    try {
      await channel.send(errorMessage);
    } catch (sendError) {
      console.error('❌ Failed to send error message to user:', {
        message: sendError.message,
        userId: member.user.id,
        channelId: channel.id
      });
    }
  }
}

function isUserOnboarding(userId) {
  return activeOnboardings.has(userId);
}

// Start test onboarding (similar to regular but with test indicators)
async function startTestOnboarding(channel, member) {
  try {
    // Clear any existing timers for this user
    clearUserTimers(member.id);

    // Initialize test onboarding session
    const session = {
      userId: member.id,
      channelId: channel.id,
      currentQuestion: 0,
      responses: {},
      isTestSession: true,
      startedAt: new Date(),
      lastActivity: new Date()
    };

    activeOnboardings.set(member.id, session);

    // Set up inactivity timers (same as regular onboarding)
    setupInactivityTimers(channel, member, session);

    // Brief pause before starting questions (lets user read welcome message)
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Ask first question
    await askTestQuestion(channel, member, session);

  } catch (error) {
    console.error('Error starting test onboarding:', error);
  }
}

async function askTestQuestion(channel, member, session) {
  const questionIndex = session.currentQuestion;

  if (questionIndex >= ONBOARDING_QUESTIONS.length) {
    // All questions answered, complete test onboarding
    await completeTestOnboarding(channel, member, session);
    return;
  }

  const question = ONBOARDING_QUESTIONS[questionIndex];
  const questionNumber = questionIndex + 1;
  const totalQuestions = ONBOARDING_QUESTIONS.length;

  let message = `🧪 **Test Question ${questionNumber}/${totalQuestions}:**\n${question.question}`;

  if (question.optional) {
    message += '\n\n*(Type "skip" if you don\'t have this)*';
  }

  message += '\n\n*This is just a test - no real changes will be made*';

  await channel.send(message);
}

async function completeTestOnboarding(channel, member, session) {
  try {
    // Import required services
    const sheetsService = require('./sheets');
    const channelService = require('./channels');

    // Apply TikTok nickname for testing (same as real onboarding)
    const nicknameResult = await applyTikTokNickname(member, session);

    // Prepare test data for Google Sheets with TEST indicator
    const row = [
      new Date().toISOString(),
      member.guild.name,
      member.guild.id,
      member.user.tag,
      member.user.id,
      channel.name,
      session.responses.tiktok_handle || 'Not provided',
      session.responses.email || 'Not provided',
      session.responses.whatsapp || 'Not provided',
      'TEST MODE - No role changes',
      `TEST-${Math.random().toString(36).slice(2,8)}`,
    ];

    // Log test data to Google Sheets
    try {
      await sheetsService.appendOnboardingRow(member.client, row);
      console.log(`🧪 Google Sheets test data saved for ${member.user.tag} (guild: ${member.guild.name})`);
    } catch (sheetsError) {
      console.error(`❌ Google Sheets Error - Failed to save test onboarding data for ${member.user.tag}:`, {
        message: sheetsError.message,
        stack: sheetsError.stack,
        guildId: member.guild.id,
        guildName: member.guild.name,
        userId: member.user.id,
        userTag: member.user.tag,
        rowLength: row.length,
        testMode: true,
        timestamp: new Date().toISOString()
      });

      // Don't fail the entire test for Google Sheets errors
      console.warn(`⚠️ Test onboarding completed for ${member.user.tag} but Google Sheets save failed`);
    }

    // Send test completion message with nickname info if applicable
    let testCompletionMessage = `<@${member.user.id}> 🧪 Test completed, ${member.user.username}!\n\nYour answers were saved to the test logs.`;

    if (nicknameResult && nicknameResult.nicknameApplied) {
      testCompletionMessage += `\n\n👤 **Your nickname has been set to:** \`${nicknameResult.newNickname}\` *(You can change it back manually)*`;
    }

    testCompletionMessage += `\n\n*Note: Only the nickname was changed for testing - no roles were assigned.*`;

    await channel.send(testCompletionMessage);

    // Send stylized audit log for test completion
    const auditChannelId = serverConfig.audit_channel;
    if (!auditChannelId) {
      console.warn(`⚠️ No audit channel configured for server ${member.guild.name} (test mode)`);
    } else {
      try {
        const auditChannel = await member.client.channels.fetch(auditChannelId);
      if (auditChannel) {
        const testAuditEmbed = new EmbedBuilder()
          .setTitle('🧪 Test Onboarding Completed!')
          .setDescription(`<@${member.user.id}> **${member.user.username}** completed onboarding TEST!`)
          .setColor(0xffa500) // Orange for test mode
          .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
          .addFields(
            { name: '👤 User', value: `${member.user.tag}\nID: ${member.user.id}`, inline: true },
            { name: '📅 Timestamp', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
            { name: '🎯 Channel', value: `#${channel.name}`, inline: true },
            { name: '📱 TikTok', value: session.responses.tiktok_handle || 'Not provided', inline: true },
            { name: '📧 Email', value: session.responses.email || 'Not provided', inline: true },
            { name: '💬 WhatsApp', value: session.responses.whatsapp || 'Not provided', inline: true },
            { name: '🧪 Mode', value: 'TEST - No role changes', inline: false }
          )
          .setFooter({ text: 'Vaulty Onboarding System (Test Mode)', iconURL: member.client.user.displayAvatarURL() })
          .setTimestamp();

        await auditChannel.send({ embeds: [testAuditEmbed] });
        console.log(`🧪 Styled test audit log sent for ${member.user.tag}`);
      }
    } catch (auditError) {
      console.error('Failed to send test audit log:', auditError);
    }

    // Clean up test channel
    await channelService.cleanupTestChannel(channel, member);

    // Remove from active onboardings
    activeOnboardings.delete(member.id);

    console.log(`🧪 Test onboarding completed for ${member.user.tag}`);
    }

  } catch (error) {
    console.error('❌ Critical Error completing test onboarding:', {
      message: error.message,
      stack: error.stack,
      guildId: member.guild.id,
      guildName: member.guild.name,
      userId: member.user.id,
      userTag: member.user.tag,
      testMode: true,
      sessionExists: !!activeOnboardings.get(member.id),
      timestamp: new Date().toISOString()
    });

    // Send specific error message based on error type
    let errorMessage;
    if (error.message.includes('Google Sheets')) {
      errorMessage = `<@${member.user.id}> ⚠️ Test completed but there was an issue saving test data. The test flow worked correctly.`;
    } else {
      errorMessage = `<@${member.user.id}> ❌ Test failed due to an error. Please contact a developer.`;
    }

    try {
      await channel.send(errorMessage);
    } catch (sendError) {
      console.error('❌ Failed to send test error message to user:', {
        message: sendError.message,
        userId: member.user.id,
        channelId: channel.id,
        testMode: true
      });
    }
  }
}

function clearUserSession(userId) {
  clearUserTimers(userId);
  return activeOnboardings.delete(userId);
}

function getActiveSessions() {
  return activeOnboardings;
}

function getSessionCount() {
  return activeOnboardings.size;
}

// Timer management functions
function setupInactivityTimers(channel, member, session) {
  const userId = member.id;
  const timers = {};

  // 10-minute reminder
  timers.reminderTimer = setTimeout(async () => {
    try {
      const currentSession = activeOnboardings.get(userId);
      if (currentSession && currentSession.channelId === session.channelId) {
        const reminderMessage = `<@${member.id}> 👋 Just checking in! Are you still there? Please reply to continue with onboarding.`;
        await channel.send(reminderMessage);
        console.log(`⏰ Sent 10-minute inactivity reminder for ${member.user.tag}`);
      }
    } catch (error) {
      console.error('Error sending reminder:', error);
    }
  }, 10 * 60 * 1000); // 10 minutes

  // 20-minute auto-cleanup
  timers.cleanupTimer = setTimeout(async () => {
    try {
      const currentSession = activeOnboardings.get(userId);
      if (currentSession && currentSession.channelId === session.channelId) {
        console.log(`⏰ Auto-cleanup triggered for inactive session: ${member.user.tag}`);

        // Send final warning
        const warningMessage = `<@${member.id}> ⏰ Your onboarding session has expired due to inactivity.\n\nTo restart onboarding, please use the \`/onboard\` command in the welcome channel.`;
        await channel.send(warningMessage);

        // Clean up session and channel
        const channelService = require('./channels');
        await channelService.cleanupOnboardingChannel(channel, member);
        clearUserSession(userId);

        console.log(`🗑️ Auto-cleaned up inactive session for ${member.user.tag}`);
      }
    } catch (error) {
      console.error('Error during auto-cleanup:', error);
    }
  }, 20 * 60 * 1000); // 20 minutes

  inactivityTimers.set(userId, timers);
}

function resetInactivityTimers(userId) {
  const timers = inactivityTimers.get(userId);
  if (timers) {
    if (timers.reminderTimer) clearTimeout(timers.reminderTimer);
    if (timers.cleanupTimer) clearTimeout(timers.cleanupTimer);

    // Don't restart timers on activity - let the natural flow continue
    // This prevents timer spam when users are actively responding
  }
}

function clearUserTimers(userId) {
  const timers = inactivityTimers.get(userId);
  if (timers) {
    if (timers.reminderTimer) clearTimeout(timers.reminderTimer);
    if (timers.cleanupTimer) clearTimeout(timers.cleanupTimer);
    inactivityTimers.delete(userId);
  }
}

module.exports = {
  startOnboarding,
  handleResponse,
  isUserOnboarding,
  startTestOnboarding,
  clearUserSession,
  getActiveSessions,
  getSessionCount
};
