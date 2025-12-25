require('dotenv').config();
const {ActionRowBuilder, ActivityType, AttachmentBuilder, ButtonBuilder, ButtonStyle, Client, EmbedBuilder, Events, GatewayIntentBits, MessageFlags} = require('discord.js');
const {getIntro, setIntro, deleteIntro} = require('./intros');
const {execFile} = require('child_process');
const {version} = require('./package.json');

const fs = require('fs');
const os = require('os');
const path = require('path');

const token = (process.env.DISCORD_TOKEN?? '').trim();
if (!token) console.warn('⚠️ DISCORD_TOKEN 미설정 (.env 확인)');

// Intents
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

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

// 오윈 크롤러
const DOTNET = (process.env.DOTNET_EXE || 'dotnet').trim();
const DEBUG_RANK = /^(1|true)$/i.test(process.env.DEBUG_RANK || '');
const FETCHRANK_EXE = (process.env.FETCHRANK_EXE || '').trim();
const FETCHRANK_DIR = (process.env.FETCHRANK_DIR || '').trim();
const HTML_CAP = 2_000_000;
const RANK_TIMEOUT_MS = parseInt(process.env.RANK_TIMEOUT_MS || '60000', 10);
const RANK_HTTP_MS = 5000;
const RANK_DOTNET_MS = 25000;

// 5Eusermap.json
const mapPath = process.env.USERMAP_PATH || path.join(__dirname, 'usermap.json');
let userMap = {};
try {
  userMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  console.log('✅ usermap.json 인식 완료');
} catch {
  console.warn('⚠️ usermap.json 인식 불가, 빈 매핑으로 시작');
}

// 디버그
function trunc(s, n = 1200) {
  s = String(s ?? '');
  return s.length > n ? s.slice(0, n) + '…(trunc)' : s;
}
function dlog(...args) { if (DEBUG_RANK) console.log('[RANK]', ...args); }

// 콘솔 온라인 응답, 디스코드 "플레이 중" 설정
client.once(Events.ClientReady, readyClient => {
    console.log(`✅ 미도리봇 v${version}, 온라인: ${readyClient.user.tag}`);
    readyClient.user.setPresence({
        activities: [{ name: 'ESL 프로리그 S22', type: ActivityType.Watching }],
        status: 'online'
    });
});

// 오윈
async function fetchRank(playerId) {
  const fast = await fetchRankViaHttp(playerId, RANK_HTTP_MS);
  if (fast?.Rank) return fast;
  return fetchRankViaDotnet(playerId, RANK_DOTNET_MS);
}

function fetchRankViaDotnet(playerId, timeoutMs = RANK_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const finish = (tag, err, stdout = '', stderr = '') => {
      const out = String(stdout);
      let data = null;

      const m = out.match(/\[DATA\]\s*({[\s\S]*?})\s*$/m);
      if (m) {
        try {
          data = JSON.parse(m[1]);
        } catch {
          const last = m[1].lastIndexOf('}');
          if (last >= 0) {
            try { data = JSON.parse(m[1].slice(0, last + 1)); } catch {}
          }
        }
      }

      if (!data) {
        const line = out.split(/\r?\n/).find(l => l.startsWith('[DATA] '));
        if (line) {
          try { data = JSON.parse(line.slice(7)); } catch {}
        }
      }

      const info = {
        source: tag, ok: !!data, data,
        error: err?.message, code: err?.code, signal: err?.signal,
        stdout: trunc(out), stderr: trunc(stderr),
      };
      dlog(tag, info);
      resolve(info);
    };

    if (FETCHRANK_EXE && FETCHRANK_EXE.length) {
      return execFile(
        FETCHRANK_EXE,
        [playerId],
        { windowsHide: true, timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 },
        (err, stdout, stderr) => finish('exe', err, stdout, stderr)
      );
    }
    if (!FETCHRANK_DIR) return resolve({ source: 'exe/run', ok: false, data: null, error: 'no path' });

    return execFile(
      DOTNET,
      ['run', '--', playerId],
      { cwd: FETCHRANK_DIR, windowsHide: true, timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout, stderr) => finish('run', err, stdout, stderr)
    );
  });
}

function normalizeUrlStrict(raw) {
  if (!raw) return '';
  let s = String(raw).trim();
  if (s.startsWith('//')) s = 'https:' + s;
  if (s.startsWith('/'))  s = 'https://arena.5eplay.com' + s;
  if (!/^https?:/i.test(s)) s = 'https:' + s;

  try {
    const u = new URL(s);
    if (!/^https?$/i.test(u.protocol.replace(':',''))) return '';
    const host = u.hostname.replace(/\.$/, '').toLowerCase();
    const root = '5eplay.com';
    const allowed = host === root || host.endsWith('.' + root);
    if (!allowed) return '';
    u.search = '';
    u.hash   = '';
    u.protocol = 'https:';
    return u.toString();
  } catch { return ''; }
}

async function fetchRankViaHttp(playerId, timeoutMs = RANK_TIMEOUT_MS) {
  const url = `https://arena.5eplay.com/data/player/${encodeURIComponent(playerId)}`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'user-agent': `MidoriBot/${version}`,
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9'
      }
    });

    const len = Number(res.headers.get('content-length') || 0);
    if (len && len > HTML_CAP) return null;
    const html = await res.text();
    if (html.length > HTML_CAP) return null;

    // 이미지 src 추출
    let m = html.match(/class=["']lego_level2025_img["'][^>]*\bsrc=["']([^"']+)["']/i);
    if (!m) m = html.match(/https?:\/\/[^\s"'<>]*\/level_2025\/[A-Za-z0-9_]+\.(?:png|gif)/i);
    if (!m) return null;

    const raw = m[1] || m[0];
    const src = normalizeUrlStrict(raw);
    if (!src) return null;

    const file = src.split('/').pop() || '';
    const rank = extractRankFromFile(file);
    return { Rank: rank, FileName: file, Src: src };
  } catch (e) {
    console.error('http fallback error:', e?.name === 'AbortError' ? 'timeout' : e?.message || e);
    return null;
  } finally { clearTimeout(t); }
}

function extractRankFromFile(file) {
  const stem = file.replace(/\.[^.]+$/, '');
  if (/^ques/i.test(stem)) return 'Unrank';
  const m = stem.match(/^([A-Da-d])(2)?(?:[_-]|$)/);
  if (!m) return null;
  const letter = m[1].toUpperCase();
  return m[2] ? `${letter}+` : letter;
}

async function getRankWithDebug(playerId) {
  const first = await fetchRankViaDotnet(playerId);
  if (first.ok) return first;
  const second = await fetchRankViaHttp(playerId);
  return second.ok ? second : { source: `${first.source}+http`, ok: false, data: null, error: first.error || second.error };
}

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
      .setFooter({ text: 'CSPG X MIDORI' })
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
      return void interaction.reply({ content: '소개글이 너무 길어요! (최대 256자)', ephemeral: true }); // 길이 제한
    }
    if (!res.ok) {
      return void interaction.reply({ content: '소개글이 비어있어요!', ephemeral: true });
    }
    return void interaction.reply({ content: '소개글 저장 완료! ✅', ephemeral: true });
  }

  else if (commandName === '소개삭제') {
    const existed = await deleteIntro(interaction.user.id);
    return void interaction.reply({ content: existed ? '소개글 삭제 완료! 🗑️' : '삭제할 소개글이 없어요.', ephemeral: true });
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
        { name: 'REST',    value: `\`${restMs}ms\``, inline: true },
        { name: 'Gateway', value: `\`${gwMs}ms\``,  inline: true },
      )
      .setTimestamp();

    await interaction.editReply({ content: sent.content, embeds: [embed] });
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

// Bot offline
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
