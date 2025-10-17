# 🤖 Vaulty - Multi-Server Discord Onboarding Bot v131

**Enterprise-grade Discord bot for creator onboarding with multi-server support, TikTok analytics, automatic nickname management, mobile push notifications, and comprehensive administrative controls. Features Google Sheets persistence with zero-configuration Heroku deployment.**

[![Deploy to Heroku](https://img.shields.io/badge/Deploy-Heroku-7056bf)](https://heroku.com/deploy)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933)](https://nodejs.org/)
[![Discord.js](https://img.shields.io/badge/Discord.js-v14-5865f2)](https://discord.js.org/)
[![Pushover](https://img.shields.io/badge/Mobile-Pushover-36a64f)](https://pushover.net/)
[![License](https://img.shields.io/badge/License-ISC-blue)](LICENSE)
[![Version](https://img.shields.io/badge/Version-131-brightgreen)](https://github.com/NYTEMODEONLY/cv-onboarding-bot)

---

## ✨ **Features Overview**

### 🎯 **Core Functionality**
- **Multi-Server Support**: Deploy to unlimited Discord servers with independent configurations
- **Dynamic Question System**: Fully customizable onboarding questions per server
- **Interactive Onboarding**: Modal-based forms with role-gated channel visibility
- **Automatic TikTok Nickname**: Bot sets Discord nickname to TikTok username during onboarding
- **TikTok Analytics**: Real-time creator statistics and engagement metrics with email scraping
- **Google Sheets Persistence**: Complete configuration and data persistence with Heroku compatibility
- **Styled Audit Logs**: Rich embeds with user avatars and clickable mentions

### 👑 **Administrative Features**
- **Server Type Selection**: Choose between Client Server (standardized questions) or Custom Server (full control)
- **Guided Server Setup**: Interactive configuration process for new servers with question customization
- **Smart Channel Management**: Auto-detection of channels with duplicate prevention and cleanup
- **Heroku-Persistent Configuration**: Server settings survive bot restarts with Google Sheets storage
- **Question Management**: Full CRUD operations for onboarding questions (Add/Edit/Remove/Reorder)
- **Granular Controls**: Configure channels, roles, permissions, and questions per server
- **Interactive Management**: GUI-based configuration with select menus, modals, and forms
- **Health Monitoring**: Comprehensive server status and performance analytics
- **Mobile Push Notifications**: Real-time alerts via Pushover for critical events and activity monitoring
- **Role Management**: Server-specific role assignment and permission handling
- **Server Reset**: Reset configuration while preserving Google Sheets connection and data

### 📊 **Analytics & Reporting**
- **Creator Statistics**: TikTok follower counts, engagement rates, video metrics
- **Server Analytics**: Onboarding completion rates, user activity tracking
- **Question Analytics**: Track question performance and completion rates
- **Global Insights**: Multi-server performance and usage statistics
- **Audit Trails**: Complete activity logging with rich formatting and configuration changes

---

## 🚀 **Quick Start**

### **Prerequisites**
- [Node.js 18+](https://nodejs.org/)
- [Discord Bot Token](https://discord.com/developers/applications)
- [Google Service Account](https://console.cloud.google.com/) with Sheets API enabled
- [Heroku Account](https://heroku.com) (for 24/7 hosting)
- [Pushover Account](https://pushover.net/) (for mobile notifications - optional but recommended)

### **Local Development**
```bash
# Clone repository
git clone <your-repo-url>
cd onboardingbot

# Install dependencies
npm install

# Setup environment
cp ENV_EXAMPLE .env
# Edit .env with your credentials

# Register Discord commands
npm run register:commands

# Start bot
npm start
```

---

## ⚙️ **Command Reference**

### **User Commands**
| Command | Description | Access |
|---------|-------------|---------|
| `/onboard` | Start interactive onboarding process with automatic TikTok nickname setting | Everyone |
| `/tiktok-stats <username>` | Get TikTok creator analytics with email scraping | Everyone |

### **Administrative Commands**
| Command | Description | Access |
|---------|-------------|---------|
| `/server-setup` | Choose server type (Client/Custom) and configure new server | Admins |
| `/server-config view` | View current server configuration | Admins |
| `/server-config set-welcome` | Set welcome channel | Admins |
| `/server-config set-audit` | Set audit log channel | Admins |
| `/server-config set-roles` | Configure onboarding roles | Admins |
| `/server-config add-admin-role` | Add admin role | Admins |
| `/server-config remove-admin-role` | Remove admin role | Admins |
| `/server-config questions view` | View all onboarding questions | Admins |
| `/server-config questions add` | Add new onboarding question | Admins |
| `/server-config questions edit` | Edit existing question | Admins |
| `/server-config questions remove` | Remove question | Admins |
| `/server-config questions reorder` | Change question order | Admins |
| `/server-config questions reset` | Reset to default questions | Admins |
| `/server-config reset` | Reset server configuration while preserving data | Admins |
| `/server-status` | View server health and analytics | Admins |
| `/ping` | Bot performance metrics | Staff |

### **Testing Commands**
| Command | Description | Access |
|---------|-------------|---------|
| `/test-onboard` | Test onboarding without role changes (includes nickname setting) | Staff |

---

## 🏗️ **Multi-Server Architecture**

### **Server Configuration System**
Each Discord server gets its own configuration profile with:
- **Welcome Channel**: Where users start onboarding
- **Audit Channel**: Where completion logs are sent
- **Role Structure**: Server-specific onboarding roles
- **Google Sheet Tab**: Auto-generated server-specific logging
- **Admin Roles**: Customizable administrative permissions

### **Guided Setup Process**
When bot joins a new server:
1. **Detection**: Bot detects server join event
2. **Auto-Detection**: Scans for common channels (welcome, audit, general) and roles
3. **Basic Configuration**: Creates initial configuration with detected defaults
4. **Admin Notification**: Sends welcome message with detected settings and setup instructions
5. **Interactive Setup**: Guides admin through `/server-setup` for final configuration
6. **Google Sheets**: Creates dedicated tab for the server after admin confirmation

### **Data Isolation**
- **Server-specific logging**: Each server has its own Google Sheet tab
- **Independent configurations**: Settings don't affect other servers
- **Isolated audit logs**: Private channels per server
- **Role management**: Server-specific role hierarchies

---

## 📊 **TikTok Analytics**

### **Available Metrics**
- **📊 Follower Count**: Real-time follower statistics
- **📈 Engagement Rate**: Likes, comments, shares analysis
- **🎥 Video Statistics**: Total videos, average views
- **✅ Verification Status**: Account verification state
- **👤 Profile Information**: Bio, nickname, account details
- **📧 Business Email**: Scraped from public TikTok bio (if available)

### **Automatic Features**
- **🤖 TikTok Nickname Setting**: During onboarding, bot automatically sets user's Discord nickname to their TikTok username
- **📧 Email Scraping**: Detects business emails from TikTok bios using advanced regex patterns
- **🔍 Bio Analysis**: Recognizes various email formats (direct emails, "business inquiries", contact info, etc.)

### **Usage Examples**
```bash
# Get creator statistics with email scraping
/tiktok-stats username:khaby.lame
/tiktok-stats username:charlidamelio
/tiktok-stats username:mrbeast
```

### **Free Implementation**
- No API keys required for basic stats
- Uses public data sources and web scraping
- Rate-limited and cached for performance
- Real-time data fetching with intelligent parsing

---

## ❓ **Dynamic Question System**

### **Question Management**
Each Discord server can have fully customized onboarding questions with:
- **Custom Question Text**: Tailored to your server's needs
- **Question Types**: Text, Email, Number, URL validation
- **Validation Rules**: Required, Optional, Email, URL
- **Placeholder Text**: Helpful hints for users
- **Flexible Ordering**: Reorder questions as needed
- **Real-time Editing**: Modify questions without data loss

### **Default Questions**
```javascript
[
  {
    question: "What's your TikTok username? (without the @ symbol)",
    type: "text",
    validation: "required",
    placeholder: "e.g., khaby.lame"
  },
  {
    question: "What's your email address?",
    type: "email",
    validation: "email",
    placeholder: "your@email.com"
  },
  {
    question: "What's your WhatsApp number? (or type 'skip' if you don't have one)",
    type: "text",
    validation: "optional",
    placeholder: "+1234567890"
  }
]
```

### **Question Operations**
- **View Questions**: `/server-config questions view`
- **Add Question**: Interactive modal with preview and confirmation
- **Edit Question**: Modify existing questions with validation
- **Remove Question**: Delete unwanted questions
- **Reorder Questions**: Change question sequence
- **Reset to Default**: Restore original question set

### **Google Sheets Integration**
- **Dynamic Headers**: Column headers automatically match questions
- **Flexible Structure**: Adapts to any number of questions
- **Version Control**: Tracks question changes over time
- **Migration Support**: Handles existing data when questions change

---

## 🏗️ **Server Setup Process**

### **Server Type Selection**
When setting up a new server, admins choose between two setup types:

#### **🏢 Client Server (Recommended for most)**
- **Standardized onboarding process** for TikTok creators
- **Pre-configured questions** optimized for client relationships:
  - TikTok Shop username (required)
  - Contact method (WhatsApp/email)
  - Sample request (optional)
- **Fast deployment** - ready in seconds
- **Automatic TikTok nickname setting**
- **Can still customize** questions later

#### **🎨 Custom Server (Full Control)**
- **Complete customization** of all aspects
- **Build questions from scratch** with full control
- **Advanced configuration options**
- **Flexible for unique requirements**
- **Manual setup process**

### **Setup Flow**
1. **Run `/server-setup`** → Choose Client Server or Custom Server
2. **Automatic Configuration** → Bot sets up Google Sheets, channels, roles
3. **Question Setup** → Standardized questions (Client) or custom builder (Custom)
4. **Ready to Use** → Onboarding immediately available

---

## 🔧 **Server Configuration Guide**

### **Initial Setup**
```bash
# 1. Invite bot to your server
# 2. Bot detects server and auto-scans channels/roles
# 3. Receive welcome message with detected settings
# 4. Run guided setup for final configuration
/server-setup

# 5. Fine-tune and manage configuration
/server-config view
/server-config set-welcome #your-welcome-channel
/server-config set-audit #your-audit-channel
/server-config set-roles

# 6. Customize onboarding questions (optional)
/server-config questions view
/server-config questions add
/server-config questions edit <question_id>
/server-config questions reorder
```

### **Channel Configuration**
```bash
# Set welcome channel
/server-config set-welcome #welcome

# Set audit channel
/server-config set-audit #audit-logs
```

### **Role Configuration**
```bash
# Configure onboarding roles (interactive modal)
/server-config set-roles

# Add admin roles
/server-config add-admin-role @Moderator
/server-config add-admin-role @ServerOwner
```

### **Monitoring & Health**
```bash
# View server status and health
/server-status

# View detailed configuration
/server-config view
```

---

## 🚀 **Heroku Deployment (24/7 Hosting)**

### **One-Click Deploy**
[![Deploy to Heroku](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy)

### **Manual Deployment**
```bash
# 1. Create Heroku app
heroku create your-vaulty-bot

# 2. Set environment variables
heroku config:set DISCORD_TOKEN="your-bot-token"
heroku config:set APPLICATION_ID="your-app-id"
heroku config:set MASTER_SPREADSHEET_ID="your-sheet-id"

# 3. Deploy
git push heroku main

# 4. Scale worker
heroku ps:scale worker=1
```

### **Environment Variables**
| Variable | Description | Required |
|----------|-------------|----------|
| `DISCORD_TOKEN` | Discord bot token | ✅ |
| `APPLICATION_ID` | Discord application ID | ✅ |
| `MASTER_SPREADSHEET_ID` | Google Sheet ID | ✅ |
| `GOOGLE_CREDENTIALS_JSON` | Full Google service account JSON | ✅ (choose one auth method) |
| `GOOGLE_CLIENT_EMAIL` | Service account email | ✅ (with GOOGLE_PRIVATE_KEY) |
| `GOOGLE_PRIVATE_KEY` | Service account private key | ✅ (with GOOGLE_CLIENT_EMAIL) |
| `PUSHOVER_APP_TOKEN` | Pushover app token for mobile notifications | ❌ (optional) |
| `PUSHOVER_USER_KEY` | Pushover user key for mobile notifications | ❌ (optional) |
| `GUILD_ID` | Dev guild for testing | ❌ |

### **Google Sheets Setup**
1. Create new Google Sheet
2. Share with service account email (Editor access)
3. Place `google-credentials.json` in project root
4. Bot will auto-create server-specific tabs

---

## 📋 **Google Sheets Structure**

### **Master Sheet Organization**
```
Your Google Spreadsheet:
├── Master Log (all servers aggregated)
├── CreatorVaultOnboarding (Server 1)
│   ├── Row 1: Server config (guild_id, channels, roles, questions)
│   ├── Row 2: Empty separator
│   ├── Row 3: Onboarding headers
│   └── Row 4+: Onboarding data
├── GamingCreatorsHubOnboarding (Server 2)
│   ├── Row 1: Server config (guild_id, channels, roles, questions)
│   ├── Row 2: Empty separator
│   ├── Row 3: Onboarding headers
│   └── Row 4+: Onboarding data
└── ... (auto-created per server with same structure)
```

**✅ Heroku-Persistent**: All server configurations and onboarding data survive bot restarts**

### **Data Columns**
| Column | Description |
|--------|-------------|
**Fixed Columns:**
| Column | Description |
|--------|-------------|
| Timestamp | ISO timestamp of onboarding |
| Guild Name | Discord server name |
| Guild ID | Discord server ID |
| User Tag | Discord @username#1234 |
| User ID | Discord user snowflake |
| Channel | Onboarding channel used |
| Roles Added | Roles granted to user |
| Run ID | Unique onboarding session ID |

**Dynamic Question Columns:**
Additional columns are automatically created based on your custom questions:
- **Question 1**: "What's your TikTok username?"
- **Question 2**: "What's your email address?"
- **Question 3**: "What's your WhatsApp number?"
- **...** (as many as you configure)

**Example Sheet Structure:**
```
Timestamp | Guild Name | Guild ID | User Tag | User ID | Channel | What's your TikTok username? | What's your email address? | What's your WhatsApp number? | Roles Added | Run ID
```

---

## 🛡️ **Security & Permissions**

### **Bot Permissions Required**
- `Send Messages`
- `Use Slash Commands`
- `Embed Links`
- `Manage Roles`
- `Read Message History`
- `View Channels`

### **Role Hierarchy**
Ensure bot role is **above** the roles it needs to assign:
```
Bot Role (highest)
├── Admin Role
├── Moderator Role
├── Creator Role
├── Verified Role
└── @everyone (lowest)
```

### **Admin Access Control**
- **Role-based**: Multiple admin roles per server
- **Permission-based**: Administrator permission required
- **Server-specific**: Admin roles configured per server

---

## 📈 **Analytics & Monitoring**

### **Server Health Metrics**
- **Configuration Status**: Complete/incomplete setup
- **Bot Permissions**: Required permissions check
- **Channel Access**: Audit and welcome channel availability
- **Role Configuration**: Required roles existence and hierarchy

### **Onboarding Analytics**
- **Active Sessions**: Currently running onboarding processes
- **Completion Rates**: Success/failure statistics
- **Time Metrics**: Average completion time
- **Error Tracking**: Failed onboarding attempts

### **Bot Performance**
- **Uptime**: Continuous operation time
- **Memory Usage**: Resource consumption
- **Response Time**: Command execution latency
- **Server Count**: Total servers managed

---

## 📱 **Pushover Mobile Monitoring**

### **Real-Time Mobile Notifications**
Vaulty integrates with Pushover to deliver instant mobile notifications for critical bot events and onboarding activity. Monitor your bot's performance and user activity from anywhere!

### **Notification Events**
| Event Type | Description | Priority | Sound |
|------------|-------------|----------|-------|
| **Bot Startup** | Bot comes online and reports server count | Normal | Magic |
| **New Onboarding** | User starts the onboarding process | Normal | Bike |
| **Onboarding Complete** | User successfully completes onboarding | Normal | Cash Register |
| **New Server Join** | Bot is invited to a new Discord server | Normal | Tugboat |
| **Health Check Failure** | Startup health checks detect issues | Normal | Echo |
| **Critical Errors** | Google Sheets failures, role assignment errors | High | Siren/Falling |

### **Setup Instructions**
1. **Create Pushover Account**: Sign up at [pushover.net](https://pushover.net/)
2. **Download App**: Install Pushover on your mobile device
3. **Create Application**: Create a new application in your Pushover dashboard
4. **Configure Environment Variables**:
   ```bash
   heroku config:set PUSHOVER_APP_TOKEN="your_app_token"
   heroku config:set PUSHOVER_USER_KEY="your_user_key"
   ```
5. **Redeploy Bot**: The bot will automatically start sending notifications

### **Sample Notifications**
```
🤖 Bot Started
Vaulty Bot is now online and ready!
Managing 3 Discord servers

🎯 New Onboarding
User: JohnDoe#1234
Server: Creator Community

✅ Onboarding Complete
User: JohnDoe#1234
Server: Creator Community
TikTok: @johndoe

🚨 Critical Error
Google Sheets Save Failed
Failed to save onboarding data for JohnDoe#1234 in Creator Community
```

### **Benefits**
- **Real-Time Awareness**: Know instantly when onboardings occur
- **Proactive Monitoring**: Get alerted to critical errors before they impact users
- **Mobile Access**: Monitor your bot from anywhere
- **Customizable Sounds**: Different notification sounds for different event types
- **Battery Efficient**: Pushover is optimized for mobile battery life

---

## 🔧 **Advanced Configuration**

### **Custom Role Names**
```bash
# Configure server-specific roles
/server-config set-roles
# Interactive modal will guide you through:
# - Role to remove (e.g., "Newcomer")
# - Role to grant (e.g., "Creator")
# - Optional sample role (e.g., "VIP")
```

### **Channel Restrictions**
```bash
# Restrict onboarding to specific channels
/server-config set-welcome #welcome
# Users can only start onboarding from this channel
```

### **Audit Log Customization**
```bash
# Set custom audit channel
/server-config set-audit #admin-logs
# All completion logs will be sent here
```

---

## 🚨 **Troubleshooting**

### **Common Issues**
- **Bot not responding**: Check worker dyno status
- **Commands not appearing**: Re-register commands
- **Permission errors**: Verify bot role hierarchy
- **Google Sheets errors**: Check service account permissions

### **Debug Commands**
```bash
# Check bot status
/ping

# View server configuration
/server-config view

# Monitor server health
/server-status
```

### **Logs & Monitoring**
```bash
# Heroku logs
heroku logs --tail

# Local debugging
npm run register:commands
npm start
```

---

## 📚 **API Reference**

### **Server Configuration API**
- **File**: `src/services/server-config.js`
- **Storage**: `server-config.json`
- **Methods**: `configureServer()`, `getServerConfig()`, `updateServerConfig()`

### **Google Sheets API**
- **File**: `src/services/sheets.js`
- **Features**: Auto-tab creation, dynamic routing
- **Fallback**: Legacy `GUILD_TAB_MAP` support

### **Onboarding Service**
- **File**: `src/services/onboarding.js`
- **Features**: Multi-server support, styled audit logs, Pushover notifications
- **Events**: `guildCreate`, `guildDelete`, `interactionCreate`

### **Pushover Service**
- **File**: `src/utils/pushover.js`
- **Features**: Mobile push notifications, customizable sounds and priorities
- **Methods**: `notifyBotStarted()`, `notifyOnboardingStarted()`, `notifyOnboardingCompleted()`, `notifyCriticalError()`

---

## 🤝 **Contributing**

1. Fork the repository
2. Create feature branch: `git checkout -b feature/new-feature`
3. Commit changes: `git commit -m "Add new feature"`
4. Push to branch: `git push origin feature/new-feature`
5. Create Pull Request

---

## 📄 **License**

ISC License - see [LICENSE](LICENSE) file for details.

---

## 📝 **Changelog**

### **v120 - Mobile Monitoring & Pushover Integration** (Current)
- ✅ **Pushover Mobile Notifications**: Real-time alerts for bot activity and critical events
- ✅ **Onboarding Activity Monitoring**: Instant notifications for new onboardings and completions
- ✅ **Critical Error Alerts**: Mobile notifications for Google Sheets failures and system errors
- ✅ **Server Health Monitoring**: Push notifications for health check failures and new server joins
- ✅ **Bot Status Alerts**: Startup confirmations and error notifications via mobile
- ✅ **Comprehensive Documentation**: Updated README with Pushover setup and configuration
- ✅ **Enhanced Environment Variables**: Added Pushover configuration options

### **v110 - Enterprise Security & Documentation**
- ✅ **Complete Security Audit**: Zero critical vulnerabilities found
- ✅ **Enterprise Security Compliance**: All credentials properly managed
- ✅ **Documentation Standardization**: All files updated to v110
- ✅ **Production Readiness Verified**: Full enterprise deployment ready

### **v109 - Production Ready**
- ✅ **Security Audit Passed**: All security best practices implemented
- ✅ **Production Hardening**: Comprehensive error handling and stability
- ✅ **Performance Optimization**: Enhanced bot responsiveness and reliability
- ✅ **Documentation Complete**: All README files updated and synchronized

### **v100 - Enterprise Creator Onboarding Suite**
- ✅ **Server Type Selection**: Client Server (standardized) vs Custom Server (full control)
- ✅ **Automatic TikTok Nickname Setting**: Bot sets Discord nickname to TikTok username during onboarding
- ✅ **TikTok Email Scraping**: Advanced regex detection of business emails from public TikTok bios
- ✅ **Enhanced Server Reset**: Reset configuration while preserving Google Sheets and historical data
- ✅ **Environment Variable Authentication**: Flexible Google Sheets auth (JSON or separate credentials)
- ✅ **Client Server Templates**: Pre-configured questions for TikTok Shop creators
- ✅ **Streamlined Setup Flow**: Faster deployment for client servers
- ✅ **Improved Error Handling**: Better user feedback and interaction handling
- ✅ **Production Hardening**: Comprehensive testing and stability improvements

### **v4.0 - Dynamic Question System**
- ✅ **Dynamic Question Management**: Fully customizable onboarding questions per server
- ✅ **Interactive Question Builder**: Modal-based question creation with preview and confirmation
- ✅ **Question CRUD Operations**: Add, edit, remove, and reorder questions
- ✅ **Dynamic Google Sheets**: Headers automatically adapt to custom questions
- ✅ **Question Validation**: Support for text, email, number, URL, and custom validation
- ✅ **Question Versioning**: Track changes and handle migrations
- ✅ **Flexible Question Ordering**: Reorder questions as needed
- ✅ **Enhanced Audit Logging**: Configuration changes logged to audit channel
- ✅ **Server-Specific Questions**: Each server maintains its own question set
- ✅ **Backward Compatibility**: Existing servers continue working with default questions

### **v3.8 - Multi-Server Edition**
- ✅ Multi-server architecture with independent configurations
- ✅ Interactive server setup with auto-detection
- ✅ Server-specific Google Sheets tabs
- ✅ Ephemeral admin commands with audit logging
- ✅ Enhanced error handling and validation
- ✅ Improved audit logs with user mentions and avatars
- ✅ Comprehensive server status and health monitoring

---

## 🆘 **Support**

- **Issues**: [GitHub Issues](https://github.com/your-repo/issues)
- **Documentation**: This README
- **Commands**: `/server-status` for health checks
- **Logs**: `heroku logs --tail` for debugging

---

## 👨‍💻 **Built by nytemode**
**https://nytemode.com**

*Professional Discord bot development and automation solutions*

---

**Built with ❤️ for the creator community**

*Vaulty v120 - Mobile Monitoring Ready*
