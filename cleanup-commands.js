require('dotenv').config();
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');

const token    = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId  = process.env.DISCORD_GUILD_ID;

if (!token)    { console.error('❌ 토큰 없음'); process.exit(1); }
if (!clientId) { console.error('❌ DISCORD_CLIENT_ID 없음'); process.exit(1); }
if (!guildId)  { console.error('❌ DISCORD_GUILD_ID 없음'); process.exit(1); }

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    // 길드 명령어 모두 삭제(덮어쓰기)
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
    console.log('🧹 길드 명령어 전체 삭제 완료');

    // 글로벌 명령어 모두 삭제(덮어쓰기)
    await rest.put(Routes.applicationCommands(clientId), { body: [] });
    console.log('🧹 글로벌 명령어 전체 삭제 완료');

    // 디버깅
    const g = await rest.get(Routes.applicationGuildCommands(clientId, guildId));
    const a = await rest.get(Routes.applicationCommands(clientId));
    console.log('길드 잔여:', g.map(c => c.name));
    console.log('글로벌 잔여:', a.map(c => c.name));

    console.log('✅ 초기화 끝!');
  } catch (e) {
    console.error('❌ 초기화 중 오류:', e);
  }
})();
