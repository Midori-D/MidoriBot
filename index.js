// 1. 주요 클래스 가져오기
const { Client, Events, GatewayIntentBits } = require('discord.js');
const { token } = require('./config.json');

// 2. 클라이언트 객체 생성 (Guilds관련, 메시지관련 인텐트 추가)
const client = new Client({ intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
]});

// 3. 봇의 온라인 표시
client.once(Events.ClientReady, readyClient => {
  console.log(`✅ 미도리봇, 온라인: ${readyClient.user.tag}`);
  readyClient.user.setPresence({
    activities: [{ name: '블라스트 프리미어', type: 3 }],
    status: 'online',
  });
});

// 4. 누군가 ping을 작성하면 pong으로 답장한다.
client.on('messageCreate', (message) => {
    if(message.content == '핑'){
        message.reply('미도리봇, 잘 살아있어요. 퐁🏓');
    }
})

// 5. 시크릿키(토큰)을 통해 봇 로그인 실행
client.login(token);
