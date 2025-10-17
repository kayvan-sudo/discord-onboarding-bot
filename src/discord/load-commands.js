const fs = require('fs');
const path = require('path');

module.exports = function loadCommands(client) {
  const commandsPath = path.join(__dirname, 'commands');
  if (!fs.existsSync(commandsPath)) return;
  const files = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
  for (const file of files) {
    const cmd = require(path.join(commandsPath, file));
    if (cmd && cmd.data && cmd.execute) {
      client.commands.set(cmd.data.name, cmd);
    }
  }
};

