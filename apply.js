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

    await message.delete().catch(() => null); // 원문 삭제

    const uid = message.author.id;
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`confirm_apply:${uid}:yes`).setLabel('YES').setEmoji('✅').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`confirm_apply:${uid}:no`).setLabel('NO').setEmoji('❌').setStyle(ButtonStyle.Danger),
    );

    await message.channel.send({ content: '카스 사랑하죠?', components: [row] });
  });

  client.on(Events.InteractionCreate, async (i) => {

    if (i.isButton() && i.customId.startsWith('confirm_apply:')) {
      const [, ownerId, choice] = i.customId.split(':');
      if (i.user.id !== ownerId)
        return void i.reply({ content: '작성자만 선택할 수 있어요. 가입코드를 입력 해 주세요👀', ephemeral: true });

      if (choice === 'yes') {
        const rowApply = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`apply_open:${ownerId}`)
            .setLabel('가입 신청서 열기')
            .setStyle(ButtonStyle.Primary)
        );

        const targetCh = APPLY_CHANNEL_ID
          ? await i.guild.channels.fetch(APPLY_CHANNEL_ID).catch(() => null)
          : i.channel;

        return void i.update({
          content: `✅ 약속 완료!\n📝 <@${ownerId}>님 환영합니다😆 버튼을 눌러 가입 신청서를 작성해 주세요!`,
          components: [rowApply],
        });
      }
      await i.update({
        content: `아쉽네요 <@${ownerId}>님, 사랑해야 계속 이용할 수 있어요🤬`,
        components: [],
      });
      return;
    }

    // Button
    if (i.isButton() && i.customId.startsWith('apply_open')) {
      const ownerId = i.customId.split(':')[1] || null;
      if (ownerId && i.user.id !== ownerId)
        return void i.reply({ content: '작성자만 열 수 있어요.👀', ephemeral: true });

      const modal = new ModalBuilder().setCustomId(`apply_modal:${i.user.id}`).setTitle('가입 신청서'); // 모달에 uid 바인딩

      const source = new TextInputBuilder()
        .setCustomId('source').setLabel('유입경로').setPlaceholder('예) 미도리 지인, 인벤').setStyle(TextInputStyle.Short).setRequired(true);
      const steamurl = new TextInputBuilder()
        .setCustomId('steamurl').setLabel('Steam 프로필 URL').setStyle(TextInputStyle.Short).setRequired(true);
      const platform = new TextInputBuilder()
        .setCustomId('platform')
        .setLabel('주로 하는 플랫폼')
        .setPlaceholder('예) 프리미어 / 페이스잇 / 오윈')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
      const msg = new TextInputBuilder()
        .setCustomId('msg').setLabel('소개한줄(모두 볼 수 있어요!)').setPlaceholder('<br> 또는 \\n 줄바꿈, 이후 /소개 명령어로 조회')
        .setStyle(TextInputStyle.Paragraph).setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(source),
        new ActionRowBuilder().addComponents(steamurl),
        new ActionRowBuilder().addComponents(platform),
        new ActionRowBuilder().addComponents(msg),
      );
      return void i.showModal(modal);
    }

    // Modal
    if (i.isModalSubmit() && i.customId.startsWith('apply_modal:')) {
      const ownerId = i.customId.split(':')[1];
      if (i.user.id !== ownerId)
        return void i.reply({ content: '작성자만 제출할 수 있어요. 다시 작성 해 주세요👀', ephemeral: true });

      if (!MEMBER_ROLE_ID)
        return i.reply({ content: '❌ MEMBER_ROLE_ID 미설정', ephemeral: true });
      
      const source = i.fields.getTextInputValue('source');
      const steam = i.fields.getTextInputValue('steamurl');
      const platform = i.fields.getTextInputValue('platform');
      const msg = i.fields.getTextInputValue('msg') || '';

      const noLink = (s = '') =>
        String(s).replace(/^https?:\/\//i, (m) => m.slice(0, 5) + '\u200B' + m.slice(5));
      const steamRegex = /steamcommunity\.com\/(id|profiles)\//;
      if (!steamRegex.test(steam)) {
        return void i.reply({
          content: `❌ 올바른 Steam 프로필 URL을 입력해주세요.\n예) ${noLink('https://steamcommunity.com/id/custom_id/')}`,
          ephemeral: true,
        });
      }

      const res = await setIntro(i.user.id, msg);
      if (!res.ok && res.reason === 'too_long')
        return void i.reply({ content: '소개글이 너무 길어요! (최대 256자)', ephemeral: true });
      if (!res.ok)
        return void i.reply({ content: '소개글이 비어있어요!', ephemeral: true });

      if (LOG_CHANNEL_ID) {
        const logCh = await i.guild.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
        await logCh?.send(`💡 가입신청\n- 유저: <@${i.user.id}> (${i.user.tag})\n- 유입경로: ${source}\n- 주 플랫폼: ${platform}\n- Steam: ${steam}\n- 소개: ${res.text || '(없음)'}`).catch(() => null);
      }

      await i.member.roles.add(MEMBER_ROLE_ID).catch(() => null);
      return void i.reply({ content: '✅ 인증 완료! 역할이 부여되었습니다.', ephemeral: true });
    }
  });

  console.log('✅ apply.js 인식 완료');
}

module.exports = { installApply };
