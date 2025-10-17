const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const https = require('https');

// Helper function to fetch TikTok profile data using multiple free APIs
async function getTikTokProfile(username) {
  // Try multiple free API services as fallbacks

  // Method 1: Try TikTok's unofficial API endpoint
  try {
    const result1 = await tryUnofficialAPI(username);
    if (result1.success) return result1;
  } catch (error) {
    console.log('Unofficial API failed, trying fallback...');
  }

  // Method 2: Try alternative API endpoint
  try {
    const result2 = await tryAlternativeAPI(username);
    if (result2.success) return result2;
  } catch (error) {
    console.log('Alternative API failed, trying web scraping...');
  }

  // Method 3: Try basic web scraping approach
  try {
    const result3 = await tryWebScraping(username);
    if (result3.success) return result3;
  } catch (error) {
    console.log('Web scraping failed');
  }

  return {
    success: false,
    error: 'Unable to fetch TikTok profile data from any source'
  };
}

// Try unofficial TikTok API
function tryUnofficialAPI(username) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.tiktok.com',
      path: `/api/user/detail/?unique_id=${username}`,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed && parsed.userInfo) {
            resolve({
              success: true,
              data: parsed.userInfo
            });
          } else {
            resolve({ success: false });
          }
        } catch (e) {
          resolve({ success: false });
        }
      });
    });

    req.on('error', () => resolve({ success: false }));
    req.setTimeout(8000, () => {
      req.destroy();
      resolve({ success: false });
    });
    req.end();
  });
}

// Try alternative API endpoint
function tryAlternativeAPI(username) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'api2.musical.ly',
      path: `/api/user/detail/?unique_id=${username}`,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed && parsed.userInfo) {
            resolve({
              success: true,
              data: parsed.userInfo
            });
          } else {
            resolve({ success: false });
          }
        } catch (e) {
          resolve({ success: false });
        }
      });
    });

    req.on('error', () => resolve({ success: false }));
    req.setTimeout(8000, () => {
      req.destroy();
      resolve({ success: false });
    });
    req.end();
  });
}

// Try basic web scraping approach
function tryWebScraping(username) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'www.tiktok.com',
      path: `/@${username}`,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          // Extract basic info from HTML (limited but better than nothing)
          const followerMatch = data.match(/"followerCount":"(\d+)"/);
          const followingMatch = data.match(/"followingCount":"(\d+)"/);
          const heartMatch = data.match(/"heartCount":"(\d+)"/);
          const videoMatch = data.match(/"videoCount":"(\d+)"/);
          const nicknameMatch = data.match(/"nickname":"([^"]+)"/);
          const verifiedMatch = data.match(/"verified":(true|false)/);
          const signatureMatch = data.match(/"signature":"([^"]*)"/);

          if (followerMatch || nicknameMatch) {
            const mockData = {
              user: {
                nickname: nicknameMatch ? nicknameMatch[1] : username,
                verified: verifiedMatch ? verifiedMatch[1] === 'true' : false,
                signature: signatureMatch ? signatureMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') : null
              },
              stats: {
                followerCount: followerMatch ? parseInt(followerMatch[1]) : 0,
                followingCount: followingMatch ? parseInt(followingMatch[1]) : 0,
                heartCount: heartMatch ? parseInt(heartMatch[1]) : 0,
                videoCount: videoMatch ? parseInt(videoMatch[1]) : 0
              }
            };

            resolve({
              success: true,
              data: mockData
            });
          } else {
            resolve({ success: false });
          }
        } catch (e) {
          resolve({ success: false });
        }
      });
    });

    req.on('error', () => resolve({ success: false }));
    req.setTimeout(10000, () => {
      req.destroy();
      resolve({ success: false });
    });
    req.end();
  });
}

// Helper function to calculate engagement rate
function calculateEngagementRate(stats) {
  const { followerCount, heartCount, videoCount } = stats;
  if (!followerCount || !heartCount || !videoCount || followerCount === 0) return 0;

  // CORRECT FORMULA: ((likes / followers) / videos) * 100
  // This gives engagement rate per video, which is the standard metric
  const engagementRate = ((heartCount / followerCount) / videoCount) * 100;
  return engagementRate.toFixed(2);
}

// Helper function to extract email from bio text
function extractEmailFromBio(bio) {
  if (!bio || typeof bio !== 'string') return null;

  // Common email patterns in TikTok bios
  const emailPatterns = [
    // Direct email: email@domain.com
    /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,

    // Email with labels: "Email: email@domain.com", "Contact: email@domain.com", etc.
    /(?:email|contact|business|inquiry|collaboration|promo|work|booking|management|press|media|dm|message|reach)(?:\s*:|\s*@\s*|\s*-\s*|\s*\|\s*)\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi,

    // Business inquiries: "for business inquiries: email@domain.com"
    /(?:for\s+)?(?:business\s+)?(?:inquir|contact|booking|promo|work|collaboration)s?(?:\s*:|\s*@\s*|\s*-\s*|\s*\|\s*)\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi,

    // With emojis: "📧 email@domain.com", "✉️ email@domain.com"
    /(?:📧|✉️|💌|📬|📮)\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,

    // Parentheses or brackets: "(email@domain.com)", "[email@domain.com]"
    /(?:\(|\\[)\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\s*(?:\)|\\])/g
  ];

  for (const pattern of emailPatterns) {
    const matches = bio.match(pattern);
    if (matches && matches.length > 0) {
      // For patterns with capture groups, use the captured email
      if (pattern.source.includes('(')) {
        const capturedEmails = matches.map(match => {
          const captureMatch = match.match(pattern);
          return captureMatch && captureMatch[1] ? captureMatch[1] : match;
        }).filter(email => email && email.includes('@'));

        if (capturedEmails.length > 0) {
          return capturedEmails[0]; // Return first valid email found
        }
      } else {
        // For direct patterns, return first match
        return matches[0];
      }
    }
  }

  return null;
}

// Helper function to format numbers
function formatNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tiktok-stats')
    .setDescription('Get TikTok profile statistics for a creator')
    .addStringOption(option =>
      option
        .setName('username')
        .setDescription('TikTok username (without @)')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(24)
    )
    .setDMPermission(false),

  async execute(interaction) {
    const username = interaction.options.getString('username').trim();

    // Validate username format
    if (!/^[a-zA-Z0-9_.]+$/.test(username)) {
      return interaction.reply({
        content: '❌ Invalid username format. Use only letters, numbers, underscores, and periods.',
        flags: 64
      });
    }

    await interaction.deferReply();

    try {
      // Fetch TikTok profile data
      console.log(`🔍 Fetching TikTok stats for @${username}...`);
      const profileResult = await getTikTokProfile(username);

      if (!profileResult.success) {
        return interaction.followUp({
          content: `❌ ${profileResult.error || 'Unable to fetch TikTok profile data'}`,
          flags: 64
        });
      }

      const profile = profileResult.data;
      const stats = profile.stats || {};

      // Calculate metrics
      const followerCount = stats.followerCount || 0;
      const followingCount = stats.followingCount || 0;
      const heartCount = stats.heartCount || 0;
      const videoCount = stats.videoCount || 0;
      const engagementRate = calculateEngagementRate(stats);

      // Create embed
      const profileUrl = `https://www.tiktok.com/@${username}`;
      const embed = new EmbedBuilder()
        .setTitle(`📊 TikTok Stats: @${username}`)
        .setColor(0xff0050) // TikTok's brand color
        .setURL(profileUrl) // Makes the entire embed clickable
        .setThumbnail(profile.user?.avatarThumb || null)
        .addFields(
          { name: '👤 Profile', value: profile.user?.nickname || username, inline: true },
          { name: '📊 Followers', value: formatNumber(followerCount), inline: true },
          { name: '👥 Following', value: formatNumber(followingCount), inline: true },
          { name: '❤️ Total Likes', value: formatNumber(heartCount), inline: true },
          { name: '🎥 Videos', value: formatNumber(videoCount), inline: true },
          { name: '📈 Engagement Rate', value: `${engagementRate}%`, inline: true },
          { name: '✅ Verified', value: profile.user?.verified ? 'Yes' : 'No', inline: true },
          { name: '🔗 URL', value: `[Visit Profile](${profileUrl})`, inline: true }
        )
        .setTimestamp()
        .setFooter({ text: 'Vaulty Bot - TikTok Analytics' });

      // Extract and display email from bio if available
      if (profile.user?.signature) {
        const extractedEmail = extractEmailFromBio(profile.user.signature);
        if (extractedEmail) {
          console.log(`📧 Found business email for @${username}: ${extractedEmail}`);
          embed.addFields({
            name: '📧 Business Email',
            value: extractedEmail,
            inline: true
          });
        } else {
          console.log(`📧 No business email found in bio for @${username}`);
          embed.addFields({
            name: '📧 Business Email',
            value: 'No email detected',
            inline: true
          });
        }
      } else {
        // No bio available
        embed.addFields({
          name: '📧 Business Email',
          value: 'No bio available',
          inline: true
        });
      }

      await interaction.followUp({ embeds: [embed] });

    } catch (error) {
      console.error('Error in tiktok-stats command:', error);
      await interaction.followUp({
        content: '❌ An error occurred while fetching TikTok data. Please try again later.',
        flags: 64
      });
    }
  }
};
