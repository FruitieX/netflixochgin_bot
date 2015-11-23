var Telegram = require('node-telegram-bot-api');
var config = require(process.env.HOME + '/.netflixochgin_bot_config.js');

var tg = new Telegram(config.tgToken, {polling: true});

tg.on('message', function(msg) {
    if (msg.text && !msg.text.indexOf('/leffor')) {
        tg.sendMessage(msg.chat.id, config.spreadsheet);
    }
});
