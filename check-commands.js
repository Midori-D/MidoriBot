require('dotenv').config();
const { REST, Routes } = require('discord.js');

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  const guild = await rest.get(
    Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID)
  );
  const global = await rest.get(
    Routes.applicationCommands(process.env.DISCORD_CLIENT_ID)
  );
  console.log('Guild commands:', guild.map(c => c.name));
  console.log('Global commands:', global.map(c => c.name));
})();
