const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');
const serverConfigManager = require('./server-config');

// Base headers that are always present
const BASE_HEADERS = [
  'Timestamp','Guild Name','Guild ID','User Tag','User ID',
  'Channel','Roles Added','Run ID'
];

// Legacy headers for backward compatibility
const LEGACY_HEADERS = [
  'Timestamp','Guild Name','Guild ID','User Tag','User ID',
  'Channel','TikTok Handle','Email','WhatsApp','Roles Added','Run ID'
];

/**
 * Generate dynamic headers based on server questions
 * @param {string} guildId - Discord server ID
 * @returns {array} Complete headers array
 */
function generateDynamicHeaders(guildId) {
  try {
    const serverConfig = serverConfigManager.getServerConfig(guildId);

    if (!serverConfig || !serverConfig.questions) {
      // Fallback to legacy headers if no server config
      return LEGACY_HEADERS;
    }

    const activeQuestions = serverConfig.questions
      .filter(q => q.active)
      .sort((a, b) => a.order - b.order);

    // Create headers from questions
    const questionHeaders = activeQuestions.map(q => q.question);

    // Combine base headers with dynamic question headers
    return [...BASE_HEADERS.slice(0, 6), ...questionHeaders, ...BASE_HEADERS.slice(6)];
  } catch (error) {
    console.warn('Error generating dynamic headers, using legacy:', error.message);
    return LEGACY_HEADERS;
  }
}

const MASTER_SPREADSHEET_ID = (process.env.MASTER_SPREADSHEET_ID || '').trim();

// Legacy support - parse old GUILD_TAB_MAP for backward compatibility
function parseMap(str) {
  const out = {};
  if (!str) return out;
  str.split(',').forEach(pair => {
    const [k, v] = pair.split(':').map(s => (s || '').trim());
    if (k && v) out[k] = v;
  });
  return out;
}

const LEGACY_GUILD_TAB_MAP = parseMap(process.env.GUILD_TAB_MAP || '');

// Initialize server config on module load
let configLoaded = false;
async function ensureConfigLoaded() {
  if (!configLoaded) {
    await serverConfigManager.load();
    configLoaded = true;
  }
}

function tabRange(tabName, a1Range) {
  const safe = `'${tabName.replace(/'/g, "''")}'`;
  return `${safe}!${a1Range}`;
}

async function getSheetsClient() {
  try {
    console.log('🔐 Initializing Google Sheets authentication...');

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
        type: process.env.GOOGLE_TYPE || 'service_account',
        project_id: process.env.GOOGLE_PROJECT_ID,
        private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
        private_key: privateKey.replace(/\\n/g, '\n'), // Handle escaped newlines
        client_email: clientEmail,
        client_id: process.env.GOOGLE_CLIENT_ID,
        auth_uri: process.env.GOOGLE_AUTH_URI || 'https://accounts.google.com/o/oauth2/auth',
        token_uri: process.env.GOOGLE_TOKEN_URI || 'https://oauth2.googleapis.com/token',
        auth_provider_x509_cert_url: process.env.GOOGLE_AUTH_PROVIDER_X509_CERT_URL || 'https://www.googleapis.com/oauth2/v1/certs',
        client_x509_cert_url: process.env.GOOGLE_CLIENT_X509_CERT_URL,
        universe_domain: process.env.GOOGLE_UNIVERSE_DOMAIN || 'googleapis.com'
      };
    } else {
      // Fallback to file-based credentials (for local development)
      console.log('📁 Falling back to google-credentials.json file');
      const credPath = path.resolve(__dirname, '..', '..', 'google-credentials.json');

      if (!fs.existsSync(credPath)) {
        console.error('❌ Google Credentials Error - No credentials found. Please set one of:', {
          envVars: 'GOOGLE_CREDENTIALS_JSON or (GOOGLE_CLIENT_EMAIL + GOOGLE_PRIVATE_KEY)',
          filePath: credPath,
          timestamp: new Date().toISOString()
        });
        throw new Error(`Google credentials not found. Set environment variables or create file at: ${credPath}`);
      }

      try {
        creds = require(credPath);
      } catch (error) {
        console.error('❌ Google Credentials Error - Cannot load credentials file:', {
          message: error.message,
          path: credPath,
          timestamp: new Date().toISOString()
        });
        throw new Error(`Invalid Google credentials file: ${error.message}`);
      }
    }

    // Validate required fields
    if (!creds.client_email || !creds.private_key) {
      console.error('❌ Google Credentials Error - Missing required fields:', {
        hasClientEmail: !!creds.client_email,
        hasPrivateKey: !!creds.private_key,
        availableFields: Object.keys(creds),
        timestamp: new Date().toISOString()
      });
      throw new Error('Google credentials missing required fields (client_email or private_key)');
    }

    const auth = new google.auth.GoogleAuth({
      credentials: creds,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const client = await auth.getClient();
    console.log('✅ Google Sheets authentication successful');

    return client;
  } catch (error) {
    console.error('❌ Google Sheets Authentication Critical Error:', {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    throw new Error(`Failed to authenticate with Google Sheets: ${error.message}`);
  }
}

async function ensureTabAndHeader(authClient, spreadsheetId, tabName, guildId = null) {
  try {
    const sheetsApi = google.sheets('v4');

    // Check if spreadsheet exists and get metadata
    let meta;
    try {
      meta = await sheetsApi.spreadsheets.get({ auth: authClient, spreadsheetId });
    } catch (error) {
      console.error(`❌ Google Sheets API Error - Cannot access spreadsheet ${spreadsheetId}:`, {
        message: error.message,
        code: error.code,
        status: error.status,
        details: error.response?.data || 'No additional details'
      });
      throw new Error(`Failed to access Google Sheets spreadsheet: ${error.message}`);
    }

    // Check if tab exists, create if not
    const found = (meta.data.sheets || []).find(s => s.properties?.title === tabName);
    if (!found) {
      console.log(`📊 Creating new tab: ${tabName}`);
      try {
        await sheetsApi.spreadsheets.batchUpdate({
          auth: authClient,
          spreadsheetId,
          requestBody: { requests: [{ addSheet: { properties: { title: tabName } } }] }
        });
        console.log(`✅ Successfully created tab: ${tabName}`);
      } catch (error) {
        console.error(`❌ Google Sheets API Error - Failed to create tab ${tabName}:`, {
          message: error.message,
          code: error.code,
          status: error.status,
          details: error.response?.data || 'No additional details'
        });
        throw new Error(`Failed to create Google Sheets tab: ${error.message}`);
      }
    }

    // Generate dynamic headers based on server configuration
    const headers = guildId ? generateDynamicHeaders(guildId) : LEGACY_HEADERS;

    // For server-specific tabs, put headers in row 3 (row 1 is for server config, row 2 empty)
    // For Master Log, put headers in row 1 as before
    const headerRow = guildId ? 3 : 1;
    const headerRange = `${tabName}!A${headerRow}:${String.fromCharCode(65 + headers.length - 1)}${headerRow}`;

    // Check current headers
    let check;
    try {
      check = await sheetsApi.spreadsheets.values.get({
        auth: authClient,
        spreadsheetId,
        range: headerRange
      });
    } catch (error) {
      console.warn(`⚠️ Google Sheets API Warning - Could not read headers for ${tabName}:`, {
        message: error.message,
        code: error.code,
        status: error.status
      });
      check = { data: {} };
    }

    const headerRowData = (check.data.values && check.data.values[0]) || [];
    const ok = headerRowData.length === headers.length && headerRowData.every((v, i) => v === headers[i]);

    if (!ok) {
      console.log(`📊 Updating headers for ${tabName} with ${headers.length} columns`);
      try {
        await sheetsApi.spreadsheets.values.update({
          auth: authClient,
          spreadsheetId,
          range: headerRange,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [headers] }
        });
        console.log(`✅ Successfully updated headers for tab: ${tabName}`);
      } catch (error) {
        console.error(`❌ Google Sheets API Error - Failed to update headers for ${tabName}:`, {
          message: error.message,
          code: error.code,
          status: error.status,
          details: error.response?.data || 'No additional details',
          headers: headers.length > 0 ? headers.slice(0, 3).join(', ') + (headers.length > 3 ? '...' : '') : 'None'
        });
        throw new Error(`Failed to update Google Sheets headers: ${error.message}`);
      }
    } else {
      console.log(`✅ Headers already up-to-date for tab: ${tabName}`);
    }
  } catch (error) {
    console.error(`❌ Google Sheets Setup Error for tab ${tabName}:`, {
      message: error.message,
      stack: error.stack,
      guildId: guildId || 'Master Log',
      spreadsheetId
    });
    throw error;
  }
}

async function appendOnce(sheetsApi, authClient, tabName, row, guildId = null) {
  try {
    // Ensure tab exists and has correct headers
    await ensureTabAndHeader(authClient, MASTER_SPREADSHEET_ID, tabName, guildId);

    // Calculate the range dynamically based on row length
    const endColumn = String.fromCharCode(65 + row.length - 1);

    // For server-specific tabs, append starting from row 4 (after config row 1, empty row 2, headers row 3)
    // For Master Log, append from row 2 as before
    const startRow = guildId ? 4 : 2;
    const range = `${tabName}!A${startRow}:${endColumn}`;

    console.log(`📝 Appending ${row.length} columns to ${tabName} starting from row ${startRow} (${range})`);

    try {
      await sheetsApi.spreadsheets.values.append({
        auth: authClient,
        spreadsheetId: MASTER_SPREADSHEET_ID,
        range: range,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [row] },
      });
      console.log(`✅ Successfully appended data to tab: ${tabName}`);
    } catch (error) {
      console.error(`❌ Google Sheets API Error - Failed to append data to ${tabName}:`, {
        message: error.message,
        code: error.code,
        status: error.status,
        details: error.response?.data || 'No additional details',
        range: range,
        rowLength: row.length,
        guildId: guildId || 'Master Log'
      });
      throw new Error(`Failed to append data to Google Sheets: ${error.message}`);
    }
  } catch (error) {
    console.error(`❌ Google Sheets Append Error for tab ${tabName}:`, {
      message: error.message,
      stack: error.stack,
      guildId: guildId || 'Master Log',
      rowLength: row.length,
      spreadsheetId: MASTER_SPREADSHEET_ID
    });
    throw error;
  }
}

async function appendOnboardingRow(client, row) {
  console.log('🔍 Starting Google Sheets append process...');
  console.log('Row data:', row);
  console.log('MASTER_SPREADSHEET_ID:', MASTER_SPREADSHEET_ID);

  if (!MASTER_SPREADSHEET_ID) {
    const error = new Error('MASTER_SPREADSHEET_ID missing from environment variables');
    console.error('❌ Configuration error:', error.message);
    throw error;
  }

  // Ensure server config is loaded
  await ensureConfigLoaded();

  const guildId = row[2];
  console.log('Guild ID:', guildId);

  // Get server-specific tab name from configuration
  const serverConfig = serverConfigManager.getServerConfig(guildId);
  let tabName = null;

  if (serverConfig && serverConfig.sheet_tab) {
    tabName = serverConfig.sheet_tab;
    console.log('📊 Using configured tab name:', tabName);
  } else {
    // Fallback to legacy mapping for backward compatibility
    tabName = LEGACY_GUILD_TAB_MAP[guildId];
    if (tabName) {
      console.log('📊 Using legacy tab mapping:', tabName);
    } else {
      console.warn(`⚠️ No tab configuration found for guild ${guildId}, using Master Log only`);
    }
  }

  const sheetsApi = google.sheets('v4');

  try {
    console.log('🔑 Getting Google Sheets client...');
    const authClient = await getSheetsClient();
    console.log('✅ Google Sheets client authenticated');

    const tabs = [];
    if (tabName) tabs.push(tabName);
    tabs.push('Master Log');
    console.log('📝 Tabs to append to:', tabs);

    for (const t of tabs) {
      console.log(`📊 Processing tab: ${t}`);
      let attempt = 0; let lastErr;
      while (attempt < 3) {
        try {
          // Pass guildId to appendOnce for dynamic header generation
          const guildIdForTab = t === 'Master Log' ? null : guildId;
          await appendOnce(sheetsApi, authClient, t, row, guildIdForTab);
          console.log(`✅ Successfully appended to tab: ${t}`);
          break;
        } catch (e) {
          console.error(`❌ Attempt ${attempt + 1} failed for tab ${t}:`, {
            message: e.message,
            code: e.code,
            status: e.status,
            details: e.response?.data || 'No additional details'
          });
          lastErr = e;
          await new Promise(res => setTimeout(res, 300 * Math.pow(2, attempt)));
          attempt += 1;
        }
      }
      if (attempt === 3) {
        console.error(`❌ All 3 attempts failed for tab: ${t}`);
        throw lastErr;
      }
    }
    console.log('🎉 Google Sheets append completed successfully');
  } catch (e) {
    console.error('❌ Google Sheets append failed:', {
      message: e.message,
      stack: e.stack,
      code: e.code,
      status: e.status
    });
    throw e;
  }
}

module.exports = { appendOnboardingRow, getSheetsClient };
