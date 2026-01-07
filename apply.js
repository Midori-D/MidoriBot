const { Events, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, } = require('discord.js');
const { getIntro, setIntro, deleteIntro } = require('./intros');

function installApply(client, opts = {}) {
  const APPLY_CHANNEL_ID = opts.applyChannelId || process.env.APPLY_CHANNEL_ID || null;
  const MEMBER_ROLE_ID = opts.memberRoleId || process.env.MEMBER_ROLE_ID || null;
  const LOG_CHANNEL_ID = opts.logChannelId || process.env.LOG_CHANNEL_ID || null;

  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    if (!message.inGuild()) return;
    if (APPLY_CHANNEL_ID && message.channelId !== APPLY_CHANNEL_ID) return;
    if (message.content.trim() !== '가입') return;

    await message.delete().catch(() => null);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('apply_open')
        .setLabel('가입 신청서 열기')
        .setStyle(ButtonStyle.Primary)
    );

    await message.channel.send({
      content: `📝 <@${message.author.id}>님 환영합니다😆 버튼을 눌러 가입 신청서를 작성해 주세요!`,
      components: [row],
    });
  });

  client.on(Events.InteractionCreate, async (i) => {
    if (i.isButton() && i.customId === 'apply_open') {
      const modal = new ModalBuilder()
        .setCustomId('apply_modal')
        .setTitle('가입 신청서');

      const source = new TextInputBuilder()
        .setCustomId('source')
        .setLabel('유입경로')
        .setPlaceholder('예)미도리 지인, 인벤')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const steamurl = new TextInputBuilder()
        .setCustomId('steamurl')
        .setLabel('Steam 프로필 URL')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const msg = new TextInputBuilder()
        .setCustomId('msg')
        .setLabel('소개한줄(모두 볼 수 있어요!)')
        .setPlaceholder('<br> 또는 \\n 으로 줄바꿈, 이후 /소개 명렁어로 볼 수 있어요')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(source),
        new ActionRowBuilder().addComponents(steamurl),
        new ActionRowBuilder().addComponents(msg),
      );

      return i.showModal(modal);
    }

    if (i.isModalSubmit() && i.customId === 'apply_modal') {
      if (!MEMBER_ROLE_ID) return i.reply({ content: '❌ MEMBER_ROLE_ID 미설정', ephemeral: true });

      const source = i.fields.getTextInputValue('source');
      const steam  = i.fields.getTextInputValue('steamurl');
      const msg    = i.fields.getTextInputValue('msg') || '';

      const res = await setIntro(i.user.id, msg);
      if (!res.ok && res.reason === 'too_long') {
        return void i.reply({ content: '소개글이 너무 길어요! (최대 256자)', ephemeral: true });
      }
      if (!res.ok) {
        return void i.reply({ content: '소개글이 비어있어요!', ephemeral: true });
      }

      if (LOG_CHANNEL_ID) {
        const logCh = await i.guild.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
        await logCh?.send(
          `✅ 가입신청\n- 유저: <@${i.user.id}> (${i.user.tag})\n- 유입경로: ${source}\n- Steam: ${steam}\n- 소개: ${res.text || '(없음)'}`
        ).catch(() => null);
      }

      await i.member.roles.add(MEMBER_ROLE_ID).catch(() => null);
      return void i.reply({ content: '✅ 인증 완료! 역할이 부여되었습니다.', ephemeral: true });
    }
  });

  console.log('✅ apply.js 인식 완료');
}

module.exports = { installApply };
