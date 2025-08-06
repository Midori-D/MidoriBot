// 1. 주요 모듈 불러오기
require('dotenv').config();
const { Client, Events, GatewayIntentBits } = require('discord.js');

// 2. 클라이언트 객체 생성 (Guilds 관련, 메시지 관련 인텐트 추가)
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// 3. 봇 온라인 상태 및 "플레이 중" 설정
client.once(Events.ClientReady, readyClient => {
    console.log(`✅ 미도리봇, 온라인: ${readyClient.user.tag}`);
    readyClient.user.setPresence({
        activities: [{ name: '블라스트 프리미어', type: 3 }], // type 3: Watching
        status: 'online'
    });
});

// 4. 핑 응답
client.on(Events.MessageCreate, message => {
    if (message.content === '핑') {
        message.reply('미도리봇, 잘 살아있어요. 퐁🏓');
    }
});

// 5. 환경변수에서 토큰을 읽어 로그인
client.login(process.env.DISCORD_BOT_TOKEN);
