var Telegram = require('node-telegram-bot-api');
var GoogleSpreadsheets = require('google-spreadsheets');
var _ = require('lodash');

var config = require(process.env.HOME + '/.netflixochgin_bot_config.js');

var tg = new Telegram(config.tgToken, {polling: true});

var votes = {};
var movies = [];

var activeVote = false;

tg.on('message', function(msg) {
    if (!msg.text) {
        return;
    }

    if (!msg.text.indexOf('/leffor')) {
        tg.sendMessage(msg.chat.id, 'https://docs.google.com/spreadsheets/d/' +
            config.spreadsheetKey);
    } else if (!msg.text.indexOf('/vote')) {
        votes[msg.from.id] = parseInt(msg.text.split(' ')[1]);
    } else if (!msg.text.indexOf('/startvote')) {
        if (activeVote) {
            return tg.sendMessage(msg.chat.id, 'Röstning redan aktiv, använd `/endvote` för att stoppa nuvarande röstning!');
        }

        movies = [];
        votes = {};

        GoogleSpreadsheets.rows({
            key: config.spreadsheetKey,
            worksheet: config.worksheet
        }, function(err, spreadsheet) {
            var s = '*Röstning påbörjad!*\n\n';

            var index = 0;
            spreadsheet.forEach(function(movie) {
                // by default don't include seen movies
                if (msg.text.indexOf('/startvote_with_seen') === -1) {
                    if (_.isString(movie.settvidng)) {
                        return;
                    }
                }
                s += '*' + String(index++) + ':* [' + movie.title + '](' + movie.imdb + ')\n(' +
                    (_.isString(movie.genre) ? movie.genre : 'N/A') + ')\n'

                movies.push({
                    title: movie.film,
                    settvidng: movie.settvidng,
                    imdb: movie.imdb,
                    genre: movie.genre,
                    beskrivning: movie.beskrivning,
                    votes: 0
                });
            });

            s += '\n*Rösta på din favorit med* `/vote <siffra>`!\n';
            s += '\n*Använd* `/endvote` *då alla har röstat klart.*';
            tg.sendMessage(msg.chat.id, s, {
                disable_web_page_preview: true,
                parse_mode: 'Markdown'
            });
            activeVote = true;
        });
    } else if (!msg.text.indexOf('/endvote')) {
        if (!activeVote) {
            return tg.sendMessage(msg.chat.id, 'Röstning ej aktiv, använd /startvote för att starta en röstning!');
        }

        _.keys(votes).forEach(function(vote) {
            if (!movies[votes[vote]]) {
                return;
            }

            movies[votes[vote]].votes++;
        });

        movies = _.shuffle(movies);

        movies = _.sortBy(movies, function(movie) {
            return movie.votes;
        });

        var s = '*Resultat:*\n\n';

        var numVotes = 0;
        movies.forEach(function(movie) {
            if (!movie.votes) {
                return;
            }

            numVotes++;
            s += '*' + String(movie.votes) + ((movie.votes === 1) ? ' röst' : ' röster') + ':* [' + movie.title + '](' + movie.imdb + ')\n(' +
                (_.isString(movie.genre) ? movie.genre : 'N/A') + ')\n'
        });

        if (!numVotes) {
            s += '*Inga röster!*';
        }

        tg.sendMessage(msg.chat.id, s, {
            disable_web_page_preview: true,
            parse_mode: 'Markdown'
        }).then(function() {
            if (!numVotes) {
                return;
            }

            var winner = movies[movies.length - 1];

            var s = '*Vinnare:* [' + winner.title + '](' + winner.imdb + ')!';

            tg.sendMessage(msg.chat.id, s, {
                parse_mode: 'Markdown'
            });
        });

        activeVote = false;
    }
});
