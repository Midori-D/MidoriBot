require('dotenv').config();
const { Client, Events, GatewayIntentBits, ActivityType, EmbedBuilder } = require('discord.js');
const { version } = require('./package.json');
const fs = require('fs');
const path = require('path');
const mapPath = process.env.USERMAP_PATH || path.join(__dirname, 'usermap.json');

try {
  userMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  console.log('✅ usermap.json 인식 완료');
} catch {
  console.warn('⚠️ usermap.json 인식 불가, 빈 매핑으로 시작합니다.');
} //usermap.json, 응답

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

client.once(Events.ClientReady, readyClient => {
    console.log(`✅ 미도리봇 v${version}, 온라인: ${readyClient.user.tag}`);
    readyClient.user.setPresence({
        activities: [{ name: '블라스트 프리미어', type: ActivityType.Watching }],
        status: 'online'
    });
}); // 콘솔 온라인 응답, 디스코드 "플레이 중" 설정

client.on(Events.MessageCreate, message => {
    if (message.content === '미도리') {
        message.reply('가짜 미도리 등장👧');
    }
}); // 미도리, 응답

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  if (commandName === '핑') {
  const base = '미도리봇, 잘 살아있어요. 퐁🏓\n핑 측정중…';
  const sent = await interaction.reply({ content: base, fetchReply: true });

  const restMs = sent.createdTimestamp - interaction.createdTimestamp;
  const gwMs = Math.max(0, Math.round(client.ws.ping));

  const embed = new EmbedBuilder()
    .setColor('#00FF00')
    .setTitle('📡 통신 완료!')
    .addFields(
      { name: 'REST',    value: `\`${restMs}ms\``, inline: true },
      { name: 'Gateway', value: `\`${gwMs}ms\``,  inline: true },
    )

  await interaction.editReply({ content: sent.content, embeds: [embed] });
  }

  if (commandName === '서버') {
    await interaction.reply(`서버 이름: ${interaction.guild.name}\n총 멤버수: ${interaction.guild.memberCount}`);
    return;
  }

  if (commandName === '유저') {
    await interaction.reply(`당신의 태그: ${interaction.user.tag}\n당신의 id: ${interaction.user.id}`);
    return;
  }

  else if (commandName === '오윈') {
  const u = interaction.options.getUser('유저', true);
  const mappedId = userMap[u.id];

  if (!mappedId)  {
      await interaction.reply(`죄송합니다. ${username}님은 5E에 등록되어 있지 않아요 😢`);
      return;
  }

  const url = `https://arena.5eplay.com/data/player/${mappedId}`;
  await interaction.reply(`🔍 <@${u.id}>님의 5E 플레이어 정보: ${url}`);
  }
}); // 커맨드

process.on('SIGINT', () => {
  console.log('👋 미도리봇, 종료');
  client.destroy();
  process.exit();
}); // 미도리봇, 종료

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

client.login(process.env.DISCORD_TOKEN);