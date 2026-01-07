require('dotenv').config();
const { ActionRowBuilder, ActivityType, AttachmentBuilder, ButtonBuilder, ButtonStyle, Client, EmbedBuilder, Events, GatewayIntentBits, Partials, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { installAutoRole } = require('./autorole');
const { installApply } = require('./apply');
const { getIntro, setIntro, deleteIntro } = require('./intros');
const { execFile } = require('child_process');
const { version } = require('./package.json');

const fs = require('fs');
const os = require('os');
const path = require('path');

// Intents
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent,],
  partials: [Partials.Channel]
});

// autorole.js
installAutoRole(client, { dataDir: path.join(__dirname, 'data'), defaultRoleId: process.env.AUTOROLE_ID });

// apply.js
installApply(client, {
  applyChannelId: process.env.APPLY_CHANNEL_ID,
  memberRoleId: process.env.MEMBER_ROLE_ID,
  logChannelId: process.env.LOG_CHANNEL_ID,
});

// MidoriBot Ready
client.once(Events.ClientReady, readyClient => {
    console.log(`✅ 미도리봇 v${version}, 온라인: ${readyClient.user.tag}`);
    readyClient.user.setPresence({
        activities: [{ name: '부다페스트 메이저 2025', type: ActivityType.Watching }],
        status: 'online'
    });
});

client.login(process.env.BOT_TOKEN);
const token = (process.env.DISCORD_TOKEN?? '').trim();
if (!token) console.warn('⚠️ DISCORD_TOKEN 미설정 (.env 확인)');

// Midori Server Guide
const STEAM_HOST = (process.env.STEAM_HOST?? '').trim(); // x.x.x.x 
const STEAM_HOST2 = (process.env.STEAM_HOST2?? '').trim(); // DNS
const STEAM_PASSWORD = (process.env.STEAM_PASSWORD?? '').trim();
const CSTV_PASSWORD = (process.env.CSTV_PASSWORD?? '').trim();
const consolecmd = `connect ${STEAM_HOST2}:27015; password ${STEAM_PASSWORD}`;
const cstvcmd = `connect ${STEAM_HOST2}:27020; password ${CSTV_PASSWORD}`;
const steamlink  = `steam://connect/${STEAM_HOST}/${STEAM_PASSWORD}`;
const connect_page = 'https://midori.wiki/counterstrike2/connect';
const THUMBNAIL_URL = 'https://midori.wiki/wp-content/uploads/2025/03/midori512x512.png';
const LANDING_RAW = (process.env.LANDING_URL?? '').trim();

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  if (message.content !== '미도리') return;

  const embed = new EmbedBuilder()
    .setColor('#00FF00')
    .setTitle('🕹️ 미도리 서버 접속하기')
    .setURL('https://midori.wiki') 
    .setDescription('아래 방법 중 하나로 접속하세요.')
    .addFields(
      {
        name: '① 웹으로 접속',
        value: `[🎮 SteamLink로 바로 접속](${connect_page}) 클릭`,
        inline: false
      },
      {
        name: '② CS2 콘솔 입력',
        value: '```cs\n' + consolecmd + '\n```',
        inline: false
      },
      {
        name: '③ WIN + R 후 다음을 입력',
        value: '```' + steamlink + '```',
        inline: false
      },
      {
        name: '+ 관전자는 콘솔로 접속 (CSTV)',
        value: '```cs\n' + cstvcmd + '\n```',
        inline: false,
      },
    )
      .setFooter({ text: 'CSPG X MIDORI' })
      .setTimestamp();

  // Thumbnail Guard
  if (THUMBNAIL_URL) embed.setThumbnail(THUMBNAIL_URL);
  if (typeof THUMBNAIL_URL !== 'undefined' && THUMBNAIL_URL) {
  embed.setThumbnail(THUMBNAIL_URL);
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('🎮 SteamLink로 바로 접속')
      .setStyle(ButtonStyle.Link)
      .setURL('https://midori.wiki/counterstrike2/connect'),
    new ButtonBuilder()
      .setLabel('🌐 midori.wiki 열기')
      .setStyle(ButtonStyle.Link)
      .setURL('https://midori.wiki')
  );

  await message.reply({
    content: '가짜 미도리 등장👧',
    embeds: [embed],
    components: [row]
  });
});

// Commands
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  if (commandName === '내정보') {
    const u = interaction.options.getUser('내정보') || interaction.user;
    const jsonKey = `"${String(u.id)}"`;
    return void interaction.reply({
      content: `내 태그: ${u.tag ?? u.username}\nID: ${u.id}\n확인된 JSON 키: ${jsonKey}`,
      ephemeral: true
    });
  }

  else if (commandName === '서버') {
    await interaction.reply(`서버 이름: ${interaction.guild.name}\n총 멤버수: ${interaction.guild.memberCount}`);
    return;
  }

  else if (commandName === '소개') {
    const u = interaction.options.getUser('유저') || interaction.user;
    const text = await getIntro(u.id);
    if (!text) {
      return void interaction.reply({ 
        content: `${u.username} 님은 아직 소개글이 없어요. 😭`,
        allowedMentions: { parse: [] }, // 멘션 방지
      });
    }

    const member = interaction.guild?.members.cache.get(u.id)
    ?? await interaction.guild?.members.fetch(u.id).catch(() => null);
    const displayName = member?.displayName ?? u.username; // 서버 닉네임
    const embed = new EmbedBuilder()
    .setColor('#00FF00')
    .setTitle(`${displayName}님을 소개합니다! 🪄`)
    .setDescription(text)
    .setThumbnail(u.displayAvatarURL({ size: 256 }))
    .setFooter({ text: '친하게 지내요~' })
    .setTimestamp();

    return await interaction.reply({
      embeds: [embed],
      allowedMentions: { parse: [] },
    });
  }

  else if (commandName === '소개설정') {
    const text = interaction.options.getString('내용', true); 
    const res = await setIntro(interaction.user.id, text);
    if (!res.ok && res.reason === 'too_long') {
      return void interaction.reply({ content: '소개글이 너무 길어요! (최대 256자)', flags: MessageFlags.Ephemeral }); // 길이 제한
    }
    if (!res.ok) {
      return void interaction.reply({ content: '소개글이 비어있어요!', flags: MessageFlags.Ephemeral });
    }
    return void interaction.reply({ content: '소개글 저장 완료! ✅', flags: MessageFlags.Ephemeral });
  }

  else if (commandName === '소개삭제') {
    const existed = await deleteIntro(interaction.user.id);
    return void interaction.reply({ content: existed ? '소개글 삭제 완료! 🗑️' : '삭제할 소개글이 없어요.', flags: MessageFlags.Ephemeral });
  }

  else if (commandName === '핑') {
    const base = '미도리봇, 잘 살아있어요. 퐁🏓\n핑 측정중…';
    await interaction.reply({ content: base });
    const sent = await interaction.fetchReply();
    const restMs = sent.createdTimestamp - interaction.createdTimestamp;
    const gwMs = Math.max(0, Math.round(client.ws.ping));

    const embed = new EmbedBuilder()
      .setColor('#00FF00')
      .setTitle('📡 통신 완료!')
      .addFields(
        { name: 'REST', value: `\`${restMs}ms\``, inline: true },
        { name: 'Gateway', value: `\`${gwMs}ms\``, inline: true },
      )
      .setTimestamp();

    await interaction.editReply({ content: sent.content, embeds: [embed] });
  }
});

// Bot Offline
process.on('SIGINT', () => {
  console.log('👋 미도리봇, 종료');
  client.destroy();
  process.exit();
});

client.on('error', (err) => console.error('client error:', err));
process.on('unhandledRejection', (err) => console.error('unhandledRejection:', err));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

client.login(process.env.DISCORD_TOKEN);
