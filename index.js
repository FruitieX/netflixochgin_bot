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
        var userVotes = msg.text.split(' ');

        // shift '/vote' out
        userVotes.shift();

        _.map(userVotes, function(vote) {
            return parseInt(vote);
        });

        // stop multiple votes for one movie
        userVotes = _.uniq(userVotes);

        votes[msg.from.id] = userVotes;
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
            s += '*Skriv in flera siffror för att rösta på flera filmer* ';
            s += '(första filmen får mest röster).\n';
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

        _.keys(votes).forEach(function(userId) {
            var userVotes = votes[userId];

            userVotes.forEach(function(vote, index) {
                var movieId = parseInt(userVotes[index]);
                if (!movies[movieId]) {
                    return;
                }

                // 1st vote gets 3 pts
                // 2nd vote gets 2 pts
                // any more get 1 point
                movies[movieId].votes += 3 - Math.min(2, index);
            });
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
