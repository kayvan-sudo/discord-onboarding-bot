const { google } = require('googleapis');

/**
 * Server Configuration System for Multi-Server Bot Deployment
 * STORES CONFIG IN EACH SERVER'S ONBOARDING TAB (row 1) for clean organization
 */

class ServerConfigManager {
  constructor() {
    this.config = {};
    this.sheetsClient = null;
    this.spreadsheetId = process.env.MASTER_SPREADSHEET_ID;
    this.defaultConfig = {
      // Default settings for new servers
      required_roles: ['Creator', 'Verified'],
      welcome_role: 'Onboarding', // Role assigned when users join
      admin_roles: ['Owner', 'Admin', 'Moderator'],
      welcome_channel: 'welcome',
      onboarding_channel: 'onboarding',
      audit_channel: null, // Will be auto-detected
      sheet_tab_suffix: 'Onboarding',
      active: true,
      joined_at: null,
      last_updated: null,
      version: '1.0',

      // Dynamic questions system - EMPTY by default, must be manually configured
      questions: [], // Empty array - questions MUST be set manually
      question_version: 1,
      last_question_update: null,
    };
  }

  /**
   * Initialize Google Sheets client (reuse existing auth logic)
   */
  async initializeSheetsClient() {
    if (this.sheetsClient) return this.sheetsClient;

    try {
      console.log('🔐 Initializing Google Sheets for server config...');

      let creds;

      // Try environment variables first (preferred for Heroku/production)
      const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
      const privateKey = process.env.GOOGLE_PRIVATE_KEY;
      const credentialsJson = process.env.GOOGLE_CREDENTIALS_JSON;

      if (credentialsJson) {
        console.log('📄 Using GOOGLE_CREDENTIALS_JSON environment variable');
        try {
          creds = JSON.parse(credentialsJson);
        } catch (error) {
          console.error('❌ Google Credentials Error - Invalid GOOGLE_CREDENTIALS_JSON:', {
            message: error.message,
            timestamp: new Date().toISOString()
          });
          throw new Error('Invalid GOOGLE_CREDENTIALS_JSON environment variable');
        }
      } else if (clientEmail && privateKey) {
        console.log('🔑 Using GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY environment variables');
        creds = {
          type: 'service_account',
          client_email: clientEmail,
          private_key: privateKey.replace(/\\n/g, '\n'),
        };
      } else {
        throw new Error('No Google credentials found. Please set GOOGLE_CREDENTIALS_JSON or (GOOGLE_CLIENT_EMAIL + GOOGLE_PRIVATE_KEY)');
      }

      const auth = new google.auth.GoogleAuth({
        credentials: creds,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      this.sheetsClient = google.sheets({ version: 'v4', auth });
      console.log('✅ Google Sheets client initialized for server configs');
      return this.sheetsClient;
    } catch (error) {
      console.error('❌ Failed to initialize Google Sheets client:', error);
      throw error;
    }
  }

  /**
   * Ensure a server's onboarding sheet exists
   */
  async ensureServerSheet(guildId, sheetName) {
    const sheets = await this.initializeSheetsClient();

    try {
      // Check if sheet exists
      const spreadsheet = await sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId,
      });

      const existingSheet = spreadsheet.data.sheets.find(
        sheet => sheet.properties.title === sheetName
      );

      if (!existingSheet) {
        console.log(`📋 Creating onboarding sheet: ${sheetName}`);

        // Create the sheet
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: this.spreadsheetId,
          resource: {
            requests: [{
              addSheet: {
                properties: {
                  title: sheetName,
                }
              }
            }]
          }
        });

        console.log(`✅ Created onboarding sheet: ${sheetName}`);
      } else {
        // Existing sheet - migrate data if needed to make room for config
        await this.migrateExistingServerTab(sheetName);
      }
    } catch (error) {
      console.error(`❌ Error ensuring server sheet ${sheetName}:`, error);
      throw error;
    }
  }

  /**
   * Get the sheet name for a server's config (same as their onboarding tab)
   */
  getServerSheetName(guildId) {
    const serverConfig = this.config.servers?.[guildId];
    if (serverConfig && serverConfig.sheet_tab) {
      return serverConfig.sheet_tab;
    }

    // Fallback: try to find existing sheet for this guild
    // This will be handled by load() method
    return null;
  }

  /**
   * Get default questions for new servers
   */
  getDefaultQuestions() {
    return [
      {
        id: 'tiktok_handle',
        question: "What's your TikTok username? (without the @ symbol)",
        type: 'text',
        validation: 'required',
        placeholder: 'e.g., khaby.lame',
        order: 1,
        active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 'email_address',
        question: "What's your email address?",
        type: 'email',
        validation: 'email',
        placeholder: 'your@email.com',
        order: 2,
        active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 'whatsapp_number',
        question: "What's your WhatsApp number? (or type 'skip' if you don't have one)",
        type: 'text',
        validation: 'phone',
        placeholder: '+1234567890',
        order: 3,
        active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ];
  }

  /**
   * Migrate existing server tab data to make room for config in row 1
   */
  async migrateExistingServerTab(sheetName) {
    const sheets = await this.initializeSheetsClient();

    try {
      // Check what's currently in row 1
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `'${sheetName}'!A1:Z3`,
      });

      const rows = response.data.values || [];
      if (rows.length === 0) {
        console.log(`📋 ${sheetName} is empty, no migration needed`);
        return;
      }

      // If row 1 already has SERVER_CONFIG, it's already migrated
      if (rows[0] && rows[0][0] === 'SERVER_CONFIG') {
        console.log(`✅ ${sheetName} already has server config in row 1`);
        return;
      }

      console.log(`🔄 Migrating existing data in ${sheetName} to make room for server config...`);

      // Get all existing data in the sheet
      const allDataResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `'${sheetName}'!A:Z`,
      });

      const allData = allDataResponse.data.values || [];
      if (allData.length === 0) {
        console.log(`📋 ${sheetName} has no data to migrate`);
        return;
      }

      // Clear the entire sheet
      await sheets.spreadsheets.values.clear({
        spreadsheetId: this.spreadsheetId,
        range: `'${sheetName}'!A:Z`,
      });

      // Re-insert data shifted down by 2 rows (row 1 for config, row 2 empty, row 3+ for existing data)
      if (allData.length > 0) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: `'${sheetName}'!A3:Z`,
          valueInputOption: 'RAW',
          resource: { values: allData }
        });
      }

      console.log(`✅ Migrated ${allData.length} rows of existing data in ${sheetName}`);

    } catch (error) {
      console.error(`❌ Error migrating ${sheetName}:`, error.message);
      // Don't throw - migration is optional
    }
  }

  /**
   * Load configuration from Google Sheets (from each server's onboarding tab)
   */
  async load() {
    try {
      const sheets = await this.initializeSheetsClient();

      console.log('📋 Loading server configurations from Google Sheets...');

      // Get all sheets in the spreadsheet
      const spreadsheet = await sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId,
      });

      const servers = {};

      // Check each sheet for server config data (row 1)
      for (const sheet of spreadsheet.data.sheets) {
        const sheetName = sheet.properties.title;

        try {
          // Read row 1 to check if it contains server config
          const response = await sheets.spreadsheets.values.get({
            spreadsheetId: this.spreadsheetId,
            range: `'${sheetName}'!A1:Z1`,
          });

          const row = response.data.values?.[0];
          if (!row || row[0] !== 'SERVER_CONFIG') {
            continue; // Not a server config row
          }

          // This is a server config row, parse it
          const serverConfig = {};

          // Expected format: SERVER_CONFIG, guild_id, name, sheet_tab, active, etc.
          const headers = [
            'marker', 'guild_id', 'name', 'sheet_tab', 'active', 'required_roles',
            'welcome_role', 'admin_roles', 'welcome_channel', 'onboarding_channel',
            'audit_channel', 'joined_at', 'last_updated', 'version',
            'questions_json', 'question_version', 'last_question_update', 'server_type'
          ];

          headers.forEach((header, index) => {
            const value = row[index] || '';

            switch (header) {
              case 'required_roles':
              case 'admin_roles':
                serverConfig[header] = value ? value.split(',').map(r => r.trim()) : [];
                break;
              case 'active':
                serverConfig[header] = value === 'true';
                break;
              case 'questions_json':
                try {
                  serverConfig.questions = value ? JSON.parse(value) : [];
                } catch (e) {
                  console.warn(`⚠️ Failed to parse questions JSON for guild ${row[1]}:`, e.message);
                  serverConfig.questions = [];
                }
                break;
              case 'question_version':
                serverConfig[header] = value ? parseInt(value) : 1;
                break;
              case 'marker':
                // Skip the marker column
                break;
              default:
                serverConfig[header] = value || null;
            }
          });

          if (serverConfig.guild_id) {
            servers[serverConfig.guild_id] = serverConfig;
          }

        } catch (sheetError) {
          // Skip sheets we can't read (might be onboarding data sheets without config)
          console.warn(`⚠️ Could not read config from sheet ${sheetName}:`, sheetError.message);
        }
      }

      this.config = {
        servers,
        version: '1.0',
        last_updated: new Date().toISOString()
      };

      console.log(`📋 Loaded server configuration for ${Object.keys(servers).length} servers from Google Sheets`);
    } catch (error) {
      console.error('❌ Error loading server configuration from Google Sheets:', error);
      // Fallback to empty config
      this.config = { servers: {}, version: '1.0', last_updated: new Date().toISOString() };
    }
  }

  /**
   * Save configuration to Google Sheets (to each server's onboarding tab)
   */
  async save() {
    try {
      const sheets = await this.initializeSheetsClient();

      console.log('💾 Saving server configurations to Google Sheets...');

      // Save each server's config to their respective onboarding tab
      for (const [guildId, serverConfig] of Object.entries(this.config.servers || {})) {
        try {
          const sheetName = serverConfig.sheet_tab;

          // Prepare config row data
          const configRow = [
            'SERVER_CONFIG', // Marker to identify this as config data
            serverConfig.guild_id,
            serverConfig.name,
            serverConfig.sheet_tab,
            serverConfig.active,
            Array.isArray(serverConfig.required_roles) ? serverConfig.required_roles.join(',') : '',
            serverConfig.welcome_role,
            Array.isArray(serverConfig.admin_roles) ? serverConfig.admin_roles.join(',') : '',
            serverConfig.welcome_channel,
            serverConfig.onboarding_channel,
            serverConfig.audit_channel,
            serverConfig.joined_at,
            serverConfig.last_updated,
            serverConfig.version,
            JSON.stringify(serverConfig.questions || []),
            serverConfig.question_version,
            serverConfig.last_question_update,
            serverConfig.server_type
          ];

          // Save to row 1 of the server's sheet
          await sheets.spreadsheets.values.update({
            spreadsheetId: this.spreadsheetId,
            range: `'${sheetName}'!A1:R1`,
            valueInputOption: 'RAW',
            resource: { values: [configRow] }
          });

          console.log(`✅ Saved config for server: ${serverConfig.name} (${guildId})`);

        } catch (serverError) {
          console.error(`❌ Error saving config for server ${guildId}:`, serverError.message);
          // Continue with other servers
        }
      }

      this.config.last_updated = new Date().toISOString();
      console.log('💾 All server configurations saved to Google Sheets');
    } catch (error) {
      console.error('❌ Error saving server configurations to Google Sheets:', error);
      throw error;
    }
  }

  /**
   * Get configuration for a specific server
   * @param {string} guildId - Discord server ID
   * @returns {object} Server configuration
   */
  getServerConfig(guildId) {
    return this.config.servers[guildId] || null;
  }

  /**
   * Check if server is configured
   * @param {string} guildId - Discord server ID
   * @returns {boolean}
   */
  isServerConfigured(guildId) {
    const serverConfig = this.getServerConfig(guildId);
    return serverConfig && serverConfig.active && serverConfig.audit_channel;
  }

  /**
   * Create or update server configuration
   * @param {string} guildId - Discord server ID
   * @param {object} guild - Discord Guild object
   * @param {object} overrides - Configuration overrides
   */
  async configureServer(guildId, guild, overrides = {}) {
    const serverName = this.sanitizeServerName(guild.name);
    const tabName = this.generateTabName(serverName);

    const serverConfig = {
      ...this.defaultConfig,
      name: guild.name,
      guild_id: guildId,
      sheet_tab: tabName,
      joined_at: new Date().toISOString(),
      last_updated: new Date().toISOString(),
      ...overrides
    };

    // Auto-detect channels
    serverConfig.audit_channel = this.detectAuditChannel(guild);
    serverConfig.welcome_channel = this.detectWelcomeChannel(guild);

    if (!this.config.servers) {
      this.config.servers = {};
    }

    this.config.servers[guildId] = serverConfig;

    // Ensure the server's onboarding sheet exists before saving config
    await this.ensureServerSheet(guildId, serverConfig.sheet_tab);

    await this.save(); // This now saves to Google Sheets!

    console.log(`✅ Server configuration created for: ${guild.name}`);
    console.log(`📊 Google Sheet tab: ${tabName}`);
    console.log(`📢 Audit channel: ${serverConfig.audit_channel}`);
    console.log(`👋 Welcome channel: ${serverConfig.welcome_channel}`);

    return serverConfig;
  }

  /**
   * Update existing server configuration
   * @param {string} guildId - Discord server ID
   * @param {object} updates - Configuration updates
   */
  async updateServerConfig(guildId, updates) {
    if (!this.config.servers[guildId]) {
      throw new Error(`Server ${guildId} is not configured`);
    }

    this.config.servers[guildId] = {
      ...this.config.servers[guildId],
      ...updates,
      last_updated: new Date().toISOString()
    };

    await this.save(); // This now saves to Google Sheets! // This now saves to Google Sheets!
    console.log(`📝 Server configuration updated for: ${this.config.servers[guildId].name}`);
  }

  /**
   * Deactivate server configuration (soft delete)
   * @param {string} guildId - Discord server ID
   */
  async deactivateServer(guildId) {
    if (this.config.servers[guildId]) {
      this.config.servers[guildId].active = false;
      this.config.servers[guildId].last_updated = new Date().toISOString();
      await this.save(); // This now saves to Google Sheets! // This now saves to Google Sheets!
      console.log(`🚫 Server configuration deactivated for: ${this.config.servers[guildId].name}`);
    }
  }

  /**
   * Reactivate server configuration
   * @param {string} guildId - Discord server ID
   */
  async reactivateServer(guildId) {
    if (this.config.servers[guildId]) {
      this.config.servers[guildId].active = true;
      this.config.servers[guildId].last_updated = new Date().toISOString();
      await this.save(); // This now saves to Google Sheets! // This now saves to Google Sheets!
      console.log(`✅ Server configuration reactivated for: ${this.config.servers[guildId].name}`);
    }
  }

  /**
   * Get all configured servers
   * @returns {object} All server configurations
   */
  getAllServers() {
    return this.config.servers || {};
  }

  /**
   * Get active servers only
   * @returns {object} Active server configurations
   */
  getActiveServers() {
    const servers = {};
    for (const [guildId, config] of Object.entries(this.config.servers || {})) {
      if (config.active) {
        servers[guildId] = config;
      }
    }
    return servers;
  }

  /**
   * Sanitize server name for use in file/folder names
   * @param {string} name - Server name
   * @returns {string} Sanitized name
   */
  sanitizeServerName(name) {
    return name
      .replace(/[^a-zA-Z0-9\s-]/g, '') // Remove special characters
      .replace(/\s+/g, ' ') // Normalize spaces
      .trim()
      .substring(0, 30); // Limit length
  }

  /**
   * Generate Google Sheet tab name for server
   * @param {string} serverName - Sanitized server name
   * @returns {string} Tab name
   */
  generateTabName(serverName) {
    const suffix = this.defaultConfig.sheet_tab_suffix;
    const baseName = `${serverName} ${suffix}`;

    // Google Sheets tab names are limited to 31 characters
    if (baseName.length <= 31) {
      return baseName;
    }

    // Truncate server name to fit
    const maxServerNameLength = 31 - suffix.length - 1; // -1 for space
    const truncatedName = serverName.substring(0, maxServerNameLength);
    return `${truncatedName} ${suffix}`;
  }

  /**
   * Auto-detect audit channel from guild
   * @param {object} guild - Discord Guild object
   * @returns {string|null} Channel ID or null
   */
  detectAuditChannel(guild) {
    // Look for channels with "audit" in the name
    const auditChannel = guild.channels.cache.find(channel =>
      channel.name.toLowerCase().includes('audit') ||
      channel.name.toLowerCase().includes('log')
    );

    return auditChannel ? auditChannel.id : null;
  }

  /**
   * Auto-detect welcome channel from guild
   * @param {object} guild - Discord Guild object
   * @returns {string} Channel name
   */
  detectWelcomeChannel(guild) {
    // Look for channels with "welcome" in the name
    const welcomeChannel = guild.channels.cache.find(channel =>
      channel.name.toLowerCase().includes('welcome') ||
      channel.name.toLowerCase().includes('join') ||
      channel.name.toLowerCase().includes('intro')
    );

    return welcomeChannel ? welcomeChannel.name : this.defaultConfig.welcome_channel;
  }

  /**
   * Validate server configuration
   * @param {object} config - Server configuration
   * @returns {object} Validation result
   */
  validateConfig(config) {
    const errors = [];
    const warnings = [];

    // Required fields
    if (!config.name) errors.push('Server name is required');
    if (!config.guild_id) errors.push('Guild ID is required');
    if (!config.sheet_tab) errors.push('Sheet tab name is required');

    // Optional but recommended
    if (!config.audit_channel) warnings.push('No audit channel configured');
    if (!config.required_roles || config.required_roles.length === 0) {
      warnings.push('No required roles configured');
    }

    // Tab name length check
    if (config.sheet_tab && config.sheet_tab.length > 31) {
      errors.push('Sheet tab name exceeds 31 character limit');
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Get questions for a server
   * @param {string} guildId - Discord server ID
   * @returns {array} Array of active questions sorted by order
   */
  getServerQuestions(guildId) {
    const serverConfig = this.getServerConfig(guildId);
    if (!serverConfig || !serverConfig.questions) {
      return this.getDefaultQuestions();
    }

    return serverConfig.questions
      .filter(q => q.active)
      .sort((a, b) => a.order - b.order);
  }

  /**
   * Add a question to a server
   * @param {string} guildId - Discord server ID
   * @param {object} questionData - Question object
   * @returns {object} The added question
   */
  async addServerQuestion(guildId, questionData) {
    const serverConfig = this.getServerConfig(guildId);
    if (!serverConfig) {
      throw new Error(`Server ${guildId} is not configured`);
    }

    if (!serverConfig.questions) {
      serverConfig.questions = this.getDefaultQuestions();
    }

    // Generate unique ID
    const questionId = `question_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Find next order number
    const maxOrder = Math.max(...serverConfig.questions.map(q => q.order), 0);
    const newOrder = maxOrder + 1;

    const newQuestion = {
      id: questionId,
      question: questionData.question,
      type: questionData.type || 'text',
      validation: questionData.validation || 'required',
      placeholder: questionData.placeholder || '',
      order: newOrder,
      active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    serverConfig.questions.push(newQuestion);

    // Update version and timestamp
    serverConfig.question_version = (serverConfig.question_version || 1) + 1;
    serverConfig.last_question_update = new Date().toISOString();
    serverConfig.last_updated = new Date().toISOString();

    await this.save(); // This now saves to Google Sheets!
    console.log(`✅ Added question "${questionData.question}" to server ${guildId}`);

    return newQuestion;
  }

  /**
   * Update a question in a server
   * @param {string} guildId - Discord server ID
   * @param {string} questionId - Question ID to update
   * @param {object} updateData - Updated question data
   * @returns {object} The updated question
   */
  async updateServerQuestion(guildId, questionId, updateData) {
    const serverConfig = this.getServerConfig(guildId);
    if (!serverConfig || !serverConfig.questions) {
      throw new Error(`Server ${guildId} has no questions configured`);
    }

    const question = serverConfig.questions.find(q => q.id === questionId);
    if (!question) {
      throw new Error(`Question ${questionId} not found`);
    }

    // Update question fields
    Object.assign(question, updateData);
    question.updated_at = new Date().toISOString();

    // Update version and timestamp
    serverConfig.question_version = (serverConfig.question_version || 1) + 1;
    serverConfig.last_question_update = new Date().toISOString();
    serverConfig.last_updated = new Date().toISOString();

    await this.save(); // This now saves to Google Sheets!
    console.log(`✅ Updated question "${question.question}" in server ${guildId}`);

    return question;
  }

  /**
   * Remove a question from a server
   * @param {string} guildId - Discord server ID
   * @param {string} questionId - Question ID to remove
   */
  async removeServerQuestion(guildId, questionId) {
    const serverConfig = this.getServerConfig(guildId);
    if (!serverConfig || !serverConfig.questions) {
      throw new Error(`Server ${guildId} has no questions configured`);
    }

    const questionIndex = serverConfig.questions.findIndex(q => q.id === questionId);
    if (questionIndex === -1) {
      throw new Error(`Question ${questionId} not found`);
    }

    const removedQuestion = serverConfig.questions.splice(questionIndex, 1)[0];

    // Reorder remaining questions
    serverConfig.questions.forEach((q, index) => {
      q.order = index + 1;
    });

    // Update version and timestamp
    serverConfig.question_version = (serverConfig.question_version || 1) + 1;
    serverConfig.last_question_update = new Date().toISOString();
    serverConfig.last_updated = new Date().toISOString();

    await this.save(); // This now saves to Google Sheets!
    console.log(`✅ Removed question "${removedQuestion.question}" from server ${guildId}`);

    return removedQuestion;
  }

  /**
   * Reorder questions for a server
   * @param {string} guildId - Discord server ID
   * @param {array} questionOrder - Array of question IDs in new order
   */
  async reorderServerQuestions(guildId, questionOrder) {
    const serverConfig = this.getServerConfig(guildId);
    if (!serverConfig || !serverConfig.questions) {
      throw new Error(`Server ${guildId} has no questions configured`);
    }

    // Validate all questions exist
    const questionIds = serverConfig.questions.map(q => q.id);
    const missing = questionOrder.filter(id => !questionIds.includes(id));
    if (missing.length > 0) {
      throw new Error(`Questions not found: ${missing.join(', ')}`);
    }

    // Reorder questions
    const reorderedQuestions = [];
    questionOrder.forEach((questionId, index) => {
      const question = serverConfig.questions.find(q => q.id === questionId);
      question.order = index + 1;
      question.updated_at = new Date().toISOString();
      reorderedQuestions.push(question);
    });

    serverConfig.questions = reorderedQuestions;

    // Update version and timestamp
    serverConfig.question_version = (serverConfig.question_version || 1) + 1;
    serverConfig.last_question_update = new Date().toISOString();
    serverConfig.last_updated = new Date().toISOString();

    await this.save(); // This now saves to Google Sheets!
    console.log(`✅ Reordered questions for server ${guildId}`);
  }

  /**
   * Reset questions to defaults for a server
   * @param {string} guildId - Discord server ID
   */
  async resetServerQuestions(guildId) {
    const serverConfig = this.getServerConfig(guildId);
    if (!serverConfig) {
      throw new Error(`Server ${guildId} is not configured`);
    }

    serverConfig.questions = this.getDefaultQuestions();

    // Update version and timestamp
    serverConfig.question_version = (serverConfig.question_version || 1) + 1;
    serverConfig.last_question_update = new Date().toISOString();
    serverConfig.last_updated = new Date().toISOString();

    await this.save(); // This now saves to Google Sheets!
    console.log(`✅ Reset questions to defaults for server ${guildId}`);
  }

  /**
   * Detect if a question is asking for TikTok username and extract username from responses
   * @param {string} guildId - Discord server ID
   * @param {object} responses - Onboarding responses
   * @returns {string|null} TikTok username or null
   */
  findTikTokUsername(guildId, responses) {
    // Find questions that might be asking for TikTok username
    const serverQuestions = this.getServerQuestions(guildId);
    const tiktokQuestion = serverQuestions.find(q => {
      const questionText = q.question.toLowerCase();
      return questionText.includes('tiktok') &&
             (questionText.includes('username') ||
              questionText.includes('handle') ||
              questionText.includes('@') ||
              questionText.includes('account'));
    });

    if (!tiktokQuestion) {
      return null; // No TikTok question found
    }

    const tiktokUsername = responses[tiktokQuestion.id];
    if (!tiktokUsername || tiktokUsername === 'Not provided') {
      return null;
    }

    // Clean the username
    return this.cleanTikTokUsername(tiktokUsername);
  }

  /**
   * Clean TikTok username (remove @, handle variations)
   * @param {string} username - Raw username input
   * @returns {string} Cleaned username
   */
  cleanTikTokUsername(username) {
    if (!username) return null;

    // Remove @ symbol and trim whitespace
    let cleaned = username.replace(/^@+/, '').trim();

    // Remove any URLs or extra text
    cleaned = cleaned.split('/').pop(); // Take last part if it's a URL
    cleaned = cleaned.split('?')[0]; // Remove query parameters

    // Basic validation - should only contain allowed characters
    if (!/^[a-zA-Z0-9_.]+$/.test(cleaned)) {
      console.warn(`⚠️ Invalid TikTok username format: "${cleaned}"`);
      return null;
    }

    return cleaned;
  }

  /**
   * Generate nickname from TikTok username
   * @param {string} tiktokUsername - Clean TikTok username
   * @returns {string} Formatted nickname
   */
  generateTikTokNickname(tiktokUsername) {
    // Simple format: @username
    return `@${tiktokUsername}`;
  }

  /**
   * Get server statistics
   * @returns {object} Statistics
   */
  getStats() {
    const servers = this.config.servers || {};
    const activeServers = Object.values(servers).filter(s => s.active);
    const inactiveServers = Object.values(servers).filter(s => !s.active);

    return {
      total_servers: Object.keys(servers).length,
      active_servers: activeServers.length,
      inactive_servers: inactiveServers.length,
      configured_audit_channels: activeServers.filter(s => s.audit_channel).length,
      total_questions: activeServers.reduce((total, server) =>
        total + (server.questions ? server.questions.filter(q => q.active).length : 0), 0),
      last_updated: this.config.last_updated
    };
  }

  /**
   * Export configuration for backup
   * @returns {string} JSON string
   */
  exportConfig() {
    return JSON.stringify(this.config, null, 2);
  }

  /**
   * Import configuration from backup
   * @param {string} jsonString - JSON configuration string
   */
  async importConfig(jsonString) {
    try {
      const imported = JSON.parse(jsonString);

      // Validate structure
      if (!imported.servers || typeof imported.servers !== 'object') {
        throw new Error('Invalid configuration format');
      }

      // Validate each server config
      for (const [guildId, config] of Object.entries(imported.servers)) {
        const validation = this.validateConfig(config);
        if (!validation.valid) {
          throw new Error(`Invalid configuration for server ${guildId}: ${validation.errors.join(', ')}`);
        }
      }

      this.config = imported;
      await this.save(); // This now saves to Google Sheets!
      console.log('✅ Server configuration imported successfully');

    } catch (error) {
      console.error('❌ Error importing server configuration:', error);
      throw error;
    }
  }
}

// Helper function to auto-detect admin roles in a server
async function detectAdminRoles(guild) {
  try {
    const roles = await guild.roles.fetch();
    const adminRoles = [];

    // Always include server owner
    const owner = await guild.fetchOwner();
    if (owner) {
      adminRoles.push({
        id: owner.id,
        name: 'Server Owner',
        type: 'owner',
        permissions: ['Administrator']
      });
    }

    // Find roles with administrative permissions
    for (const [roleId, role] of roles) {
      // Skip @everyone role
      if (role.name === '@everyone') continue;

      // Check for Administrator permission
      if (role.permissions.has('Administrator')) {
        adminRoles.push({
          id: role.id,
          name: role.name,
          type: 'admin_role',
          permissions: ['Administrator']
        });
        continue;
      }

      // Check for key administrative permissions
      const keyPermissions = ['ManageGuild', 'ManageRoles', 'ManageChannels', 'KickMembers', 'BanMembers'];
      const hasKeyPermissions = keyPermissions.some(perm => role.permissions.has(perm));

      if (hasKeyPermissions) {
        adminRoles.push({
          id: role.id,
          name: role.name,
          type: 'moderation_role',
          permissions: keyPermissions.filter(perm => role.permissions.has(perm))
        });
      }
    }

    // Sort by privilege level (server owner first, then by role position)
    adminRoles.sort((a, b) => {
      if (a.type === 'owner' && b.type !== 'owner') return -1;
      if (b.type === 'owner' && a.type !== 'owner') return 1;

      // For roles, sort by position (higher position = more privileged)
      if (a.type !== 'owner' && b.type !== 'owner') {
        const roleA = roles.get(a.id);
        const roleB = roles.get(b.id);
        if (roleA && roleB) {
          return roleB.position - roleA.position;
        }
      }

      return 0;
    });

    console.log(`🔍 Detected ${adminRoles.length} admin roles/owners in ${guild.name}`);
    adminRoles.forEach(role => {
      console.log(`  - ${role.name} (${role.type})`);
    });

    return adminRoles;
  } catch (error) {
    console.error(`❌ Error detecting admin roles in ${guild.name}:`, error);
    return [];
  }
}

// Helper function to check if a member has admin permissions
async function checkMemberAdminPermissions(member) {
  try {
    console.log(`🔍 Checking admin permissions for ${member.user.tag} in ${member.guild.name}`);

    // Always allow server owner
    if (member.id === member.guild.ownerId) {
      console.log(`✅ User is server owner`);
      return { isAdmin: true, reason: 'Server Owner' };
    }

    // Check for Administrator permission
    if (member.permissions.has('Administrator')) {
      console.log(`✅ User has Administrator permission`);
      return { isAdmin: true, reason: 'Administrator Permission' };
    }

    // Force refresh member roles to ensure we have latest data
    try {
      await member.roles.fetch();
    } catch (error) {
      console.warn('⚠️ Could not refresh member roles:', error.message);
    }

    // Get server's admin roles
    const adminRoles = await detectAdminRoles(member.guild);
    console.log(`🔍 Found ${adminRoles.length} potential admin roles in server`);

    // Check if member has any detected admin role
    for (const adminRole of adminRoles) {
      if (adminRole.type === 'owner' && member.id === member.guild.ownerId) {
        console.log(`✅ User is server owner (via role detection)`);
        return { isAdmin: true, reason: `Server Owner` };
      }

      if (adminRole.type !== 'owner' && member.roles.cache.has(adminRole.id)) {
        console.log(`✅ User has admin role: ${adminRole.name}`);
        return { isAdmin: true, reason: `Admin Role: ${adminRole.name}` };
      }
    }

    // Debug: Show user's current roles
    const userRoles = member.roles.cache.map(role => role.name).join(', ');
    console.log(`❌ User does not have admin permissions. User roles: ${userRoles}`);
    console.log(`❌ Available admin roles: ${adminRoles.map(r => r.name).join(', ')}`);

    return { isAdmin: false, reason: 'No admin permissions found' };
  } catch (error) {
    console.error('❌ Error checking member admin permissions:', error);
    return { isAdmin: false, reason: 'Error checking permissions' };
  }
}

// Export singleton instance and utility functions
const serverConfigManager = new ServerConfigManager();

module.exports = serverConfigManager;
module.exports.detectAdminRoles = detectAdminRoles;
module.exports.checkMemberAdminPermissions = checkMemberAdminPermissions;
