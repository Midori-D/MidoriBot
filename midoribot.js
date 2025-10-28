require('dotenv').config();
const {ActionRowBuilder, ActivityType, AttachmentBuilder, ButtonBuilder, ButtonStyle, ChannelType, Client, EmbedBuilder, Events, GatewayIntentBits, MessageFlags, PermissionFlagsBits} = require('discord.js');
const { execFile } = require('child_process');
const { version } = require('./package.json');
const fs = require('fs');
const os = require('os');
const path = require('path');

const token = (process.env.DISCORD_TOKEN?? '').trim();
if (!token) console.warn('⚠️ DISCORD_TOKEN 미설정 (.env 확인)');

// 인텐트
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
  ]
});

// 미도리 서버 안내 설정
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

// 보이스 집계 설정
const DATA_DIR = path.resolve(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const EXCLUDED_CHANNEL_IDS = new Set([ // 제외할 채널 ID
  // '123456789012345678',
]);
const EXCLUDED_ROLE_IDS = new Set([ // 제외할 유저 ID
  // '987654321098765432',
]);
const MIN_CONN_PEOPLE = 2; // 활동 인정 최소 인원
const TZ = 'Asia/Seoul';
const dayKey = (d = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

// voicemap.json 불러오기
fs.mkdirSync(DATA_DIR, { recursive: true });
const GCFG_FILE = path.join(DATA_DIR, 'voicemap.json');
let ENABLED_GUILDS = new Set();
try {
  if (fs.existsSync(GCFG_FILE)) {
    ENABLED_GUILDS = new Set(JSON.parse(fs.readFileSync(GCFG_FILE, 'utf8')));
    console.log('✅ voicemap.json 인식 완료');
  }
} catch (e) {
  console.error('⚠️ voicemap.json 로드 에러:', e);
}
function saveGuildConfig() {
  try {
    fs.writeFileSync(GCFG_FILE, JSON.stringify([...ENABLED_GUILDS], null, 2), 'utf8');
  } catch (e) {
    console.error('⚠️ voicemap.json 세이브 에러:', e);
  }
}
const isGuildEnabled = (gid) => ENABLED_GUILDS.has(gid);

// usermap.json 불러오기
const mapPath = process.env.USERMAP_PATH || path.join(__dirname, 'usermap.json');
let userMap = {};
try {
  userMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  console.log('✅ usermap.json 인식 완료');
} catch {
  console.warn('⚠️ usermap.json 인식 불가, 빈 매핑으로 시작');
}

// 콘솔 온라인 응답, 디스코드 "플레이 중" 설정
client.once(Events.ClientReady, readyClient => {
    console.log(`✅ 미도리봇 v${version}, 온라인: ${readyClient.user.tag}`);
    readyClient.user.setPresence({
        activities: [{ name: 'ESL 프로리그 S22', type: ActivityType.Watching }],
        status: 'online'
    });
});

//보이스 집계
const connAgg  = Object.create(null);
const connLive = new Map();
function ensureConn(gid, uid, date = dayKey()) {
  connAgg[date] ??= {}; connAgg[date][gid] ??= {};
  connAgg[date][gid][uid] ??= { connectedMs: 0, sessions: 0 };
  return connAgg[date][gid][uid];
}

function msToHMS(ms=0) {
  const s = Math.max(0, Math.round(ms/1000));
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), ss = s%60;
  return `${h}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
}

function flushConnGuild(guild, date = dayKey()) {
  const now = Date.now();
  const dateStartMs = new Date(`${date}T00:00:00+09:00`).getTime();
  for (const [key, s] of connLive) {
    const [gid, uid] = key.split(':');
    if (gid !== guild.id) continue;
    const from = Math.max(s.startMs, dateStartMs);
    const add  = now - from;
    if (add > 0) ensureConn(guild.id, uid, date).connectedMs += add;
    s.startMs = now;
  }
}
function hasExcludedRole(member) {
  if (!EXCLUDED_ROLE_IDS?.size) return false;
  for (const rid of EXCLUDED_ROLE_IDS) if (member.roles?.cache?.has?.(rid)) return true;
  return false;
}
function isChannelAllowed(channel) {
  return channel && channel.type === ChannelType.GuildVoice && !EXCLUDED_CHANNEL_IDS?.has?.(channel.id);
}
function isMemberAllowedInChannel(member, channel) {
  if (!member || member.user?.bot) return false;
  if (!isChannelAllowed(channel)) return false;
  if (hasExcludedRole(member)) return false;
  return true;
}
function recalcPresenceChannel(channel) {
  if (!isChannelAllowed(channel)) return;
  const gid = channel.guild.id;
  if (typeof isGuildEnabled === 'function' && !isGuildEnabled(gid)) return;

  const now     = Date.now();
  const members = [...channel.members.values()];
  const allowed = members.filter(m => isMemberAllowedInChannel(m, channel));
  const enough  = allowed.length >= MIN_CONN_PEOPLE;

  for (const m of members) {
    const key  = `${gid}:${m.id}`;
    const live = connLive.get(key);
    if (live && live.channelId === channel.id) {
      const stillAllowed = allowed.some(x => x.id === m.id);
      if (!enough || !stillAllowed) {
        ensureConn(gid, m.id).connectedMs += (now - live.startMs);
        connLive.delete(key);
      }
    }
  }

  if (enough) {
    for (const m of allowed) {
      const key = `${gid}:${m.id}`;
      if (!connLive.has(key)) {
        connLive.set(key, { channelId: channel.id, startMs: now });
        ensureConn(gid, m.id).sessions += 1;
      }
    }
  }
}

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  try {
    const guild = newState.guild ?? oldState.guild;
    if (!guild || (typeof isGuildEnabled === 'function' && !isGuildEnabled(guild.id))) return;

    if (oldState?.channel) recalcPresenceChannel(oldState.channel);
    if (newState?.channel) recalcPresenceChannel(newState.channel);
  } catch (e) {
    console.error('[voice] VSU (presence) error:', e);
  }
});

// 미도리봇 보이스 토글
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.inGuild?.() || !message.guild) return;
  const m = message.content.trim();
  const isAdmin =
    message.member?.permissions.has(PermissionFlagsBits.Administrator) ||
    message.member?.permissions.has(PermissionFlagsBits.ManageGuild);

  if (m === '미도리 보이스 ON') {
    if (!isAdmin) return void message.reply('🔒 관리자만 설정할 수 있어요.');
    ENABLED_GUILDS.add(message.guild.id);
    saveGuildConfig();
    return void message.reply('✅ 이 서버에서 **보이스 활동을 집계**합니다');
  }

  if (m === '미도리 보이스 OFF') {
    if (!isAdmin) return void message.reply('🔒 관리자만 설정할 수 있어요.');
    const date = dayKey();

    flushConnGuild(message.guild, date);

    // CSV 생성
    const gStats = connAgg?.[date]?.[message.guild.id];
    let fpath = null;
    if (gStats && Object.keys(gStats).length) {
      const header = ['date','guildId','userId','displayName','sessions_conn','connected_ms','connected_hms'];
      const rows = [header.join(',')];

      for (const [uid, st] of Object.entries(gStats)) {
      const gidCell = `="${message.guild.id}"`;
      const uidCell = `="${uid}"`;
      let name = `user_${uid}`;
      try { const mem = await message.guild.members.fetch(uid); if (mem?.displayName) name = mem.displayName; } catch {}
      name = name.replaceAll(',', ' ');
      rows.push([date, gidCell, uidCell, name, (st.sessions|0), (st.connectedMs|0), msToHMS(st.connectedMs|0)].join(','));
      }
      const fname = `voice_connected_${date}_${message.guild.id}.csv`;
      fpath = path.join(DATA_DIR, fname);
      fs.writeFileSync(fpath, rows.join('\n'), 'utf8');
    }

    ENABLED_GUILDS.delete(message.guild.id); saveGuildConfig?.();
    for (const [key] of [...connLive]) { const [gid] = key.split(':'); if (gid === message.guild.id) connLive.delete(key); }

    if (fpath) {
      return message.reply({
        content: `🛑 **보이스 활동 집계를 정지**합니다 — 📁 **CSV 저장** 완료 (\`${path.basename(fpath)}\`)`,
        files: [fpath],
        allowedMentions: { repliedUser: false },
      });
    } else {
      return message.reply({
        content: `🛑 **보이스 활동 집계를 정지**합니다 — **${date}** 저장할 데이터가 **없습니다.**`,
        allowedMentions: { repliedUser: false },
      });
    }
  }
  if (m === '미도리 보이스 상태') {
    return void message.reply(
      isGuildEnabled(message.guild.id)
        ? '🟢 이 서버는 **집계 중**입니다.'
        : '⚪ 이 서버는 **집계 꺼짐**입니다.'
    );
  }
});

// 보이스 디버그
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.inGuild?.()) return;
  if (message.content !== '미도리 보이스 디버그') return;

  const date = dayKey();
  if (typeof flushConnGuild === 'function') {
    try { flushConnGuild(message.guild, date); } catch {}
  }
  const stats = connAgg?.[date]?.[message.guild.id] || {};
  const entries = Object.entries(stats)
    .map(([uid, st]) => ({
      uid,
      sessions: Number(st?.sessions) || 0,
      ms: Number(st?.connectedMs) || 0,
    }))
    .sort((a, b) => b.ms - a.ms);
  const top3 = entries.slice(0, 3);
  const msToHMS = (ms = 0) => {
    const n = Math.max(0, Math.floor(Number(ms) || 0));
    const s = Math.floor(n / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    return `${h}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
  };

  const lines = await Promise.all(top3.map(async (r, i) => {
    let name = `user_${r.uid}`;
    try {
      const mem = await message.guild.members.fetch(r.uid);
      if (mem?.displayName) name = mem.displayName;
    } catch {}
    return `${i + 1}. ${name} — ${msToHMS(r.ms)} (${r.sessions}회 세션)`;
  }));

  await message.reply([
    `enabled=${ENABLED_GUILDS.has(message.guild.id)}`,
    `date=${date}`,
    `aggregated_users=${entries.length}`,
    ...(lines.length ? lines : ['(데이터 없음)']),
  ].join('\n'));
});

// 미도리 서버 안내
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
      .setFooter({ text: '문제 발생 시 관리자에게 문의하세요!' })
      .setTimestamp();

  // 썸네일 가드
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

// 커맨드
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  if (commandName === '핑') {
  const base = '미도리봇, 잘 살아있어요. 퐁🏓\n핑 측정중…';
  await interaction.reply({ content: base });
  const sent = await interaction.fetchReply();
  const restMs = sent.createdTimestamp - interaction.createdTimestamp;
  const gwMs = Math.max(0, Math.round(client.ws.ping));

  const embed = new EmbedBuilder()
    .setColor('#00FF00')
    .setTitle('📡 통신 완료!')
    .addFields(
      { name: 'REST',    value: `\`${restMs}ms\``, inline: true },
      { name: 'Gateway', value: `\`${gwMs}ms\``,  inline: true },
    )
    .setTimestamp();

  await interaction.editReply({ content: sent.content, embeds: [embed] });
  }

  if (commandName === '서버') {
    await interaction.reply(`서버 이름: ${interaction.guild.name}\n총 멤버수: ${interaction.guild.memberCount}`);
    return;
  }

  else if (commandName === '내정보') {
    const u = interaction.options.getUser('내정보') || interaction.user;
    const jsonKey = `"${String(u.id)}"`;
    return void interaction.reply({
      content: `내 태그: ${u.tag ?? u.username}\nID: ${u.id}\n확인된 JSON 키: ${jsonKey}`,
      ephemeral: true
    });
  }

  else if (commandName === '오윈') {
    const u = interaction.options.getUser('유저', true);
    const mappedId = userMap[String(u.id)]
  || userMap[u.username]

  if (!mappedId)  {
    return void interaction.reply(`죄송합니다. <@${u.id}> (${u.username}) 님은 5E에 등록되어 있지 않아요 😢`);
  }

  const profileUrl = `https://arena.5eplay.com/data/player/${mappedId}`;

  await interaction.deferReply();
  let info = await fetchRankViaDotnet(mappedId);
  let data = (info && info.ok) ? info.data : null;
  if (!data) data = await fetchRankViaHttp(mappedId);
  
  function formatLeaderboard(list, { topMedals = 3 } = {}) {
  if (!Array.isArray(list) || list.length === 0) return '데이터가 없습니다';

  const sorted = [...list].sort((a, b) => (b.pts ?? 0) - (a.pts ?? 0));

  const medals = ['🥇', '🥈', '🥉'];
  const lines = sorted.map((r, i) => {
    const name = String(r.name ?? '-');
    const pts  = Number.isFinite(r.pts) ? r.pts : 0;
    if (i < topMedals) {
      return `${medals[i] ?? `#${i + 1}`} **${name}** · ${pts}pt`;
    }
    return `\`${String(i + 1).padStart(2, ' ')}\` ${name} · ${pts}pt`;
  });

  const text = lines.join('\n');
  return text.length > 1024 ? text.slice(0, 1000) + '\n…(truncated)' : text;
}

  const rank = data?.Rank ?? null;
  const thumb = data?.Src ?? null;

  const leaderboard = [
  { name: 'Yupix',  pts: 1280 },
  { name: 'Dejavu', pts: 1215 },
  { name: 'Sasssssss', pts: 1190 },
  ];

  const lbText = formatLeaderboard(leaderboard);
  
  const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setAuthor({ name: `${u.username}님의 5E 정보`, iconURL: u.displayAvatarURL() })
        .setURL(profileUrl)
        .addFields(
          { name: '5E ID', value: `\`${mappedId}\``, inline: true },
          { name: '랭크', value: rank ? `\`${rank}\`` : '표시할 정보를 찾지 못했어요', inline: true },
          { name: '프로필', value: `[열기](${profileUrl})`, inline: true },
          { name: '🏆 내전 순위', value: lbText, inline: false },
        )
        .setFooter({ text: '데이터 출처: 5E Arena' })
        .setTimestamp();

        if (thumb) embed.setThumbnail(thumb);

        const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('5E 프로필').setStyle(ButtonStyle.Link).setURL(profileUrl),
        );

await interaction.editReply({ embeds: [embed], components: [row] });
    }
});

// 미도리봇, 종료
process.on('SIGINT', () => {
  console.log('👋 미도리봇, 종료');
  client.destroy();
  process.exit();
});

client.on('error', (err) => console.error('client error:', err));
process.on('unhandledRejection', (err) => console.error('unhandledRejection:', err));
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

client.login(process.env.DISCORD_TOKEN);
