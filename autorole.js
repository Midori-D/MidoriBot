const fs = require('fs');
const path = require('path');
const { Events, PermissionFlagsBits } = require('discord.js');

const pickId = (s) => (s && (s.match(/\d{5,}/)?.[0] || null)) || null;
const isAdmin = (m) =>
  m?.permissions?.has(PermissionFlagsBits.Administrator) ||
  m?.permissions?.has(PermissionFlagsBits.ManageGuild);

// autorole.json
function loadMap(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
}
function saveMap(file, obj) {
  try { fs.writeFileSync(file, JSON.stringify(obj, null, 2), 'utf8'); } catch (e) { console.error('[autorole] save error:', e); }
}

// CheckRole
async function fetchRole(guild, roleId) {
  if (!roleId) return null;
  return guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
}

async function giveRole(member, role) {
  if (!role) return;
  if (member.user.bot) return;
  if (member.roles.cache.has(role.id)) return;
  try { await member.roles.add(role, '자동 역할 지급'); }
  catch (e) { console.error(`[autorole] add failed @${member.user.tag}:`, e?.code || e?.message || e); }
}

function installAutoRole(client, opts = {}) {
  const dataDir = opts.dataDir || path.resolve(process.cwd(), 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const AR_FILE = path.join(dataDir, 'autorole.json');
  const AUTOROLE = loadMap(AR_FILE);

  client.on(Events.GuildMemberAdd, async (member) => {
    const roleId = AUTOROLE[member.guild.id];
    const role = await fetchRole(member.guild, roleId);
    await giveRole(member, role);
  });

  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.inGuild?.()) return;
    const text  = message.content.trim();
    const lower = text.toLowerCase();
    const guild = message.guild;

    if (lower === '미도리 자동역할 확인') {
      const id = AUTOROLE[guild.id];
      return void message.reply(id ? `현재 자동역할: <@&${id}>` : '현재 자동역할이 설정되어 있지 않습니다.');
    }

    if (!isAdmin(message.member)) return;

    if (lower.startsWith('미도리 자동역할 설정')) {
      const roleMention = message.mentions.roles.first();
      const idFromText  = pickId(text);
      const roleId = roleMention?.id || idFromText;
      if (!roleId) return void message.reply('역할을 멘션하거나 역할 ID를 입력해 주세요. 예) `미도리 자동역할 설정 @게스트`');

      const role = await fetchRole(guild, roleId);
      if (!role) return void message.reply('해당 역할을 찾을 수 없습니다. 역할 ID/권한/위계 확인이 필요합니다.');

      AUTOROLE[guild.id] = role.id; saveMap(AR_FILE, AUTOROLE);
      return void message.reply(`✅ 이제 새로 들어온 멤버에게 **${role.name}** 역할을 자동 지급합니다.`);
    }

    if (lower === '미도리 자동역할 해제') {
      delete AUTOROLE[guild.id]; saveMap(AR_FILE, AUTOROLE);
      return void message.reply('🗑️ 이 서버의 자동 역할 지급을 해제했습니다.');
    }
  });

  console.log('✅ autorole.js 인식 완료');
}

module.exports = {installAutoRole};
