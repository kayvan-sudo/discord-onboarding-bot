function parseRoleIds(str) {
  return (str || '').split(',').map(s => s.trim()).filter(Boolean);
}

// Helper function to find role by name
async function findRoleByName(guild, roleName) {
  const roles = await guild.roles.fetch();
  return roles.find(role => role.name === roleName) || null;
}

// Assign initial restricted role when users join
async function assignInitialRole(member) {
  try {
    // Get server-specific configuration
    const serverConfigManager = require('./server-config');
    const config = serverConfigManager.getServerConfig(member.guild.id);

    let onboardingRoleName = 'Onboarding'; // Default fallback

    // Use server-specific configuration if available
    if (config && config.welcome_role) {
      // Use the dedicated welcome role if configured
      onboardingRoleName = config.welcome_role;
    } else if (config && config.required_roles && config.required_roles.length > 0) {
      // Fallback to first required role for backward compatibility
      onboardingRoleName = config.required_roles[0];
    } else {
      // Fallback to environment variable for backward compatibility
      const required = parseRoleIds(process.env.REQUIRED_ROLE_IDS);
      if (required.length > 0) {
        // Try to find role by ID first (legacy support)
        const roles = await member.guild.roles.fetch();
        const roleById = roles.get(required[0]);
        if (roleById) {
          onboardingRoleName = roleById.name;
        }
      }
    }

    // Find the role by name in the server
    const roles = await member.guild.roles.fetch();
    const onboardingRole = roles.find(role => role.name === onboardingRoleName);

    if (!onboardingRole) {
      console.warn(`Onboarding role "${onboardingRoleName}" not found in ${member.guild.name}. Skipping auto-role assignment.`);
      return { added: [], removed: [] };
    }

    // Only add the role if they don't already have it
    if (!member.roles.cache.has(onboardingRole.id)) {
      await member.roles.add(onboardingRole);
      console.log(`✅ Assigned onboarding role "${onboardingRoleName}" to ${member.user.tag} in ${member.guild.name}`);
    } else {
      console.log(`ℹ️ User ${member.user.tag} already has onboarding role "${onboardingRoleName}"`);
    }

    return {
      added: [onboardingRole.name],
      removed: []
    };
  } catch (error) {
    console.error('❌ Error assigning initial role to', member.user.tag, ':', error);
    return { added: [], removed: [] };
  }
}

async function assignOnboardingRoles(member, requestedSample = false, serverConfig = null) {
  try {
    // Get server configuration if not provided
    if (!serverConfig) {
      const serverConfigManager = require('./server-config');
      serverConfig = serverConfigManager.getServerConfig(member.guild.id);
    }

    // Use server-specific configuration if available, otherwise fallback to legacy env vars
    let onboardingRoleName, onboardedRoleName, sampleRoleName;

    if (serverConfig && serverConfig.required_roles && serverConfig.required_roles.length >= 2) {
      // Use server-specific role names
      [onboardingRoleName, onboardedRoleName] = serverConfig.required_roles;
      if (serverConfig.required_roles.length >= 3) {
        sampleRoleName = serverConfig.required_roles[2];
      }
    } else {
      // Fallback to legacy environment variables for backward compatibility
      const required = parseRoleIds(process.env.REQUIRED_ROLE_IDS);
      if (required.length >= 2) {
        // Try to find roles by ID first (legacy support)
        const roles = await member.guild.roles.fetch();
        const onboardingRole = roles.get(required[0]);
        const onboardedRole = roles.get(required[1]);

        if (onboardingRole) onboardingRoleName = onboardingRole.name;
        if (onboardedRole) onboardedRoleName = onboardedRole.name;
        if (required.length >= 3) {
          const sampleRole = roles.get(required[2]);
          if (sampleRole) sampleRoleName = sampleRole.name;
        }
      }
    }

    if (!onboardingRoleName || !onboardedRoleName) {
      console.warn(`Missing role configuration for ${member.guild.name}. Cannot complete onboarding role assignment.`);
      return { added: [], removed: [] };
    }

  const toAdd = [];
  const toRemove = [];

  // Find and prepare roles
  let onboardingRole = null;
  let onboardedRole = null;
  let sampleRole = null;

  try {
    if (onboardingRoleName) {
      onboardingRole = await findRoleByName(member.guild, onboardingRoleName);
      if (!onboardingRole) {
        console.warn(`⚠️ Onboarding role "${onboardingRoleName}" not found in ${member.guild.name}`);
      }
    }

    if (onboardedRoleName) {
      onboardedRole = await findRoleByName(member.guild, onboardedRoleName);
      if (!onboardedRole) {
        console.warn(`⚠️ Onboarded role "${onboardedRoleName}" not found in ${member.guild.name}`);
      }
    }

    if (requestedSample && sampleRoleName) {
      sampleRole = await findRoleByName(member.guild, sampleRoleName);
      if (!sampleRole) {
        console.warn(`⚠️ Sample role "${sampleRoleName}" not found in ${member.guild.name}`);
      }
    }

    // Always add the onboarded role (if it exists)
    if (onboardedRole && !member.roles.cache.has(onboardedRole.id)) {
      toAdd.push(onboardedRole);
    }

    // Remove the onboarding role (if it exists)
    if (onboardingRole && member.roles.cache.has(onboardingRole.id)) {
      toRemove.push(onboardingRole);
    }

    // Add sample role if requested and exists
    if (requestedSample && sampleRole && !member.roles.cache.has(sampleRole.id)) {
      toAdd.push(sampleRole);
    }

    // Execute role changes
    if (toAdd.length) {
      await member.roles.add(toAdd);
      console.log(`✅ Added roles to ${member.user.tag}: ${toAdd.map(r => r.name).join(', ')}`);
    }

    if (toRemove.length) {
      await member.roles.remove(toRemove);
      console.log(`✅ Removed roles from ${member.user.tag}: ${toRemove.map(r => r.name).join(', ')}`);
    }

    } catch (error) {
      console.error(`❌ Role assignment error for ${member.user.tag}:`, error);
      // Don't throw error - just log and return partial results
    }

    return {
      added: toAdd.map(r => r.name),
      removed: toRemove.map(r => r.name)
    };
  } catch (error) {
    console.error('❌ Critical error in assignOnboardingRoles for', member.user.tag, ':', error);
    return { added: [], removed: [] };
  }
}

module.exports = { assignInitialRole, assignOnboardingRoles };

