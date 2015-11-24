var Telegram = require('node-telegram-bot-api');
var GoogleSpreadsheets = require('google-spreadsheets');
var _ = require('lodash');

var config = require(process.env.HOME + '/.netflixochgin_bot_config.js');

var tg = new Telegram(config.tgToken, {polling: true});

var votes = {};
var nominated = [];
var movies = [];

var activeVote = false;

var nominateMovie = function(index) {
    var movie = movies[index];

    if (!movie) {
        // movie with index not found
        return 1;
    }

    // check if movie already was nominated
    var prevIndex = _.findIndex(nominated, function(nominatedMovie) {
        return nominatedMovie.title === movie.title;
    });

    if (prevIndex !== -1) {
        // movie was already nominated, return success
        return 0;
    }

    nominated.push(movie);
    return 0;
};

tg.on('message', function(msg) {
    if (!msg.text) {
        return;
    }

    if (!msg.text.indexOf('/movies')) {
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
        tg.sendMessage(msg.chat.id, 'Vote registered.', {
            reply_to_message_id: msg.message_id
        });
    } else if (!msg.text.indexOf('/reload')) {
        if (!msg.text.indexOf('/reload yes')) {
            votes = {};
            nominated = [];
            movies = [];

            activeVote = false;

            GoogleSpreadsheets.rows({
                key: config.spreadsheetKey,
                worksheet: config.worksheet
            }, function(err, spreadsheet) {
                spreadsheet.forEach(function(movie) {
                    movies.push({
                        title: movie.film,
                        settvidng: movie.settvidng,
                        imdb: movie.imdb,
                        genre: movie.genre,
                        beskrivning: movie.beskrivning
                    });
                });

                tg.sendMessage(msg.chat.id, 'Movies list updated, votes canceled.\n\n' +
                                            'Use /list to see the new list of movies.\n' +
                                            'Use /nominate to nominate movies for voting.\n' +
                                            'Use /startvote when all nominations are in to start voting!');
            });
        } else if (!msg.text.indexOf('/reload no')) {
            tg.sendMessage(msg.chat.id, 'Reload aborted.');
        } else {
            tg.sendMessage(msg.chat.id, 'Reload movies list and cancel current votes?', {
                reply_to_message_id: msg.message_id,
                reply_markup: {
                    keyboard: [
                        ['/reload yes'],
                        ['/reload no']
                    ],
                    selective: true,
                    one_time_keyboard: true
                }
            });
        }
    } else if (!msg.text.indexOf('/list')) {
        if (!movies.length) {
            return tg.sendMessage(msg.chat.id, 'No movies found, use /reload to reload the list of movies.');
        }

        var s = '*Current movies list:*\n\n';

        movies.forEach(function(movie, index) {
            // by default don't include seen movies
            if (msg.text.indexOf('/list_seen') === -1) {
                if (_.isString(movie.settvidng)) {
                    return;
                }
            }
            s += '*' + String(index) + ':* [' + movie.title + '](' + movie.imdb + ')\n(' +
                (_.isString(movie.genre) ? movie.genre : 'N/A') + ')\n'
        });

        tg.sendMessage(msg.chat.id, s, {
            reply_to_message_id: msg.message_id,
            disable_web_page_preview: true,
            parse_mode: 'Markdown'
        });
    } else if (!msg.text.indexOf('/nominate')) {
        if (activeVote) {
            return tg.sendMessage(msg.chat.id, 'Cannot nominate while voting is active.');
        }
        if (!movies.length) {
            return tg.sendMessage(msg.chat.id, 'No movies found, use /reload to reload the list of movies.');
        }

        var userNoms = msg.text.split(' ');

        // shift '/nominate' out
        userNoms.shift();

        // two syntaxes are supported:
        // /nominate 42: <Movie title> - nominates movie at index 42
        // /nominate 1 2 3 - nominates movies at index 1, 2, 3
        //
        // additionally, if no arguments are given the user will be presented
        // with a keypad containing the movies list

        if (_.isString(userNoms[0]) && userNoms[0].indexOf(':') !== -1) {
            // this handles the former syntax
            var nomIndex = parseInt(userNoms[0]);
            if (nominateMovie(nomIndex)) {
                return tg.sendMessage(msg.chat.id, 'Movie with index ' + nomIndex + ' not found!');
            } else {
                return tg.sendMessage(msg.chat.id, '*' + movies[nomIndex].title + '* was nominated for voting!\n\n' +
                'Use /startvote when all nominations are in to start voting.', {
                  parse_mode: 'Markdown'
                });
            }
        } else if (!userNoms[0]) {
            // arguments missing, send movies list
            var keyboard = [];
            movies.forEach(function(movie, index) {
                // by default don't include seen movies
                if (msg.text.indexOf('/nominate_seen') === -1) {
                    if (_.isString(movie.settvidng)) {
                        return;
                    }
                }

                keyboard.push(['/nominate ' + String(index) + ': ' + movie.title]);
            });

            tg.sendMessage(msg.chat.id, 'Select movie to nominate', {
                reply_to_message_id: msg.message_id,
                reply_markup: {
                    keyboard: keyboard,
                    selective: true,
                    one_time_keyboard: true
                }
            });
        } else {
            // this handles the latter syntax
            _.map(userNoms, function(index) {
                return parseInt(index);
            });

            // get rid of duplicates
            userNoms = _.uniq(userNoms);

            userNoms.forEach(function(nomIndex) {
                if (nominateMovie(nomIndex)) {
                    return tg.sendMessage(msg.chat.id, 'Movie with index ' + nomIndex + ' not found!');
                } else {
                    return tg.sendMessage(msg.chat.id, movies[nomIndex].title + ' was nominated for voting!\n' +
                                          'Use /startvote when all nominations are in to start voting.');
                }
            });
        }
    } else if (!msg.text.indexOf('/startvote')) {
        if (activeVote) {
            return tg.sendMessage(msg.chat.id, 'Voting already active, use /endvote to stop.');
        }
        if (nominated.length <= 1) {
            return tg.sendMessage(msg.chat.id, 'Not enough movies nominated, use /nominate to nominate movies.');
        }

        var s = '*Voting started!*\n\n';

        nominated.forEach(function(movie, index) {
            movie.votes = 0;

            s += '*' + String(index) + ':* [' + movie.title + '](' + movie.imdb + ')\n(' +
                (_.isString(movie.genre) ? movie.genre : 'N/A') + ')\n';
        });

        s += '\n*Vote for your favorite using* `/vote <number>`!\n';
        s += '*Vote for several movies by typing multiple numbers* ';
        s += '(the first movie gets the most votes).\n';
        s += '\n*Use* `/endvote` *once everyone has voted.*';

        tg.sendMessage(msg.chat.id, s, {
            disable_web_page_preview: true,
            parse_mode: 'Markdown'
        });
        activeVote = true;
    } else if (!msg.text.indexOf('/endvote')) {
        if (!activeVote) {
            return tg.sendMessage(msg.chat.id, 'Voting not active, use /startvote to start.');
        }

        _.keys(votes).forEach(function(userId) {
            var userVotes = votes[userId];

            userVotes.forEach(function(vote, index) {
                var movieId = parseInt(userVotes[index]);
                if (!nominated[movieId]) {
                    return;
                }

                // 1st vote gets 3 pts
                // 2nd vote gets 2 pts
                // any more get 1 point
                nominated[movieId].votes += 3 - Math.min(2, index);
            });
        });

        nominated = _.shuffle(nominated);

        nominated = _.sortBy(nominated, function(movie) {
            return movie.votes;
        });

        var s = '*Results:*\n\n';

        var numVotes = 0;
        nominated.forEach(function(movie) {
            if (!movie.votes) {
                return;
            }

            numVotes++;
            s += '*' + String(movie.votes) + ((movie.votes === 1) ? ' vote' : ' votes') + ':* [' + movie.title + '](' + movie.imdb + ')\n(' +
                (_.isString(movie.genre) ? movie.genre : 'N/A') + ')\n'
        });

        if (!numVotes) {
            s += '*No votes!*';
        }

        tg.sendMessage(msg.chat.id, s, {
            disable_web_page_preview: true,
            parse_mode: 'Markdown'
        }).then(function() {
            if (!numVotes) {
                return;
            }

            var winner = nominated[nominated.length - 1];

            var s = '*Winner:* [' + winner.title + '](' + winner.imdb + ')!';

            tg.sendMessage(msg.chat.id, s, {
                parse_mode: 'Markdown'
            });
        });

        activeVote = false;
    }
});
