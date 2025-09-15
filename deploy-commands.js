require('dotenv').config();
const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId  = process.env.DISCORD_GUILD_ID;
const scope = (process.env.DEPLOY_SCOPE || 'guild').toLowerCase();

if (!token)    { console.error('❌ DISCORD_TOKEN 누락'); process.exit(1); }
if (!clientId) { console.error('❌ DISCORD_CLIENT_ID 누락'); process.exit(1); }
if (scope === 'guild' && !guildId) { console.error('❌ DISCORD_GUILD_ID 누락'); process.exit(1); }

console.log(`deploy scope = ${scope}, client=${clientId}, guild=${guildId || '(none)'}`);

const commands = [
  new SlashCommandBuilder().setName('핑').setDescription('핑 확인').setDMPermission(false),
  new SlashCommandBuilder().setName('서버').setDescription('서버 정보 확인').setDMPermission(false),
  new SlashCommandBuilder().setName('내정보').setDescription('내 정보 확인').setDMPermission(false),
  new SlashCommandBuilder()
    .setName('오윈').setDescription('5E 랭크 확인').setDMPermission(false)
    .addUserOption(o => o.setName('유저').setDescription('대상 유저').setRequired(true)),
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    if (scope === 'global') {
      await rest.put(Routes.applicationCommands(clientId), { body: commands });
      console.log('🌐 전역 커맨드 배포(Global) 완료');
    } else {
      if (!guildId) throw new Error('GUILD_ID 누락');
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
      console.log('⚠️ 길드 커맨드 배포(GuildId) 완료');
    }
  } catch (err) {
    console.error('❌ 배포 오류:', err.rawError ?? err);
  }
})();
