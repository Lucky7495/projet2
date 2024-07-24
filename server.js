const express = require('express');
const request = require('request');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const SpotifyWebApi = require('spotify-web-api-node');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const spotifyApi = new SpotifyWebApi({
    clientId: '2464c3b3b9c9452b9435682691b58831',
    clientSecret: 'e5160698201c4a07a83cf05c77ce15aa',
    redirectUri: 'https://lucky.freeboxos.fr/callback'
});

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

let accessToken = '';
const selectedPlaylists = ['4spbC6SRE1KGSwUYWxhDTl', '3Q4cDI8NG1WdN4Crzv6tqF'];

let editorData = {
    editor1: '',
    editor2: '',
    editor3: '',
    editor4: '',
    editor5: '',
    editor6: ''
};

let scores = {
    editor1: 0,
    editor2: 0,
    editor3: 0,
    editor4: 0,
    editor5: 0,
    editor6: 0
};

let chosenWords = [];
let currentTrackInfo = {
    trackId: '',
    title: '',
    artists: [],  // Changed from artist to artists
    albumCover: ''
};

let startTime = null;
let lastWinner = {
    editor: '',
    time: 0
};

let players = [];

app.get('/current-track-info', (req, res) => {
    res.json(currentTrackInfo);
});

app.post('/current-track-info', (req, res) => {
    const { trackId, title, artist, albumCover } = req.body;
    currentTrackInfo = { trackId, title, artist, albumCover };
    startTime = Date.now();  // Initialiser startTime ici
    console.log(`startTime initialized: ${startTime}`); // Log for debugging

    console.log('Received current track info:', currentTrackInfo);
    console.log('Updated chosen words:', chosenWords); // Log for debugging
    io.emit('wordSelected', chosenWords);
    io.emit('chosenWordsStatus', chosenWords.length === 0); // Met à jour l'état de chosenWords
    res.status(200).send('Current track info updated');
});

app.get('/last-winner', (req, res) => {
    res.json(lastWinner);
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Supprimer la route /waiting
// app.get('/waiting', (req, res) => {
//     res.sendFile(path.join(__dirname, 'public', 'waiting.html'));
// });

app.get('/master', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'master.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/editor1', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'editor1.html'));
});

app.get('/editor2', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'editor2.html'));
});

app.get('/editor3', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'editor3.html'));
});

app.get('/editor4', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'editor4.html'));
});

app.get('/editor5', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'editor5.html'));
});

app.get('/editor6', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'editor6.html'));
});

app.post('/set-players', (req, res) => {
    const { players: newPlayers } = req.body;
    if (Array.isArray(newPlayers) && newPlayers.length > 0) {
        players = newPlayers;
        io.emit('updateScores', { scores, players });
        res.status(200).send('Players set successfully');
    } else {
        res.status(400).send('Invalid players data');
    }
});

app.get('/get-players', (req, res) => {
    res.json(players);
});

app.get('/spotify-login', (req, res) => {
    const scopes = [
        'user-read-private',
        'user-read-email',
        'user-modify-playback-state',
        'user-read-playback-state',
        'streaming'
    ];
    const authorizeURL = spotifyApi.createAuthorizeURL(scopes);
    res.redirect(authorizeURL);
});

app.get('/callback', (req, res) => {
    const code = req.query.code || null;
    spotifyApi.authorizationCodeGrant(code).then(data => {
        accessToken = data.body['access_token'];
        const refreshToken = data.body['refresh_token'];
        spotifyApi.setAccessToken(accessToken);
        spotifyApi.setRefreshToken(refreshToken);
        res.redirect('/master');
    }).catch(err => {
        console.error('Error getting Tokens:', err);
        res.redirect('/');
    });
});

app.get('/playlists', (req, res) => {
    if (!accessToken) {
        res.sendStatus(401);
        return;
    }
    spotifyApi.setAccessToken(accessToken);
    const playlistPromises = selectedPlaylists.map(id => spotifyApi.getPlaylist(id));
    Promise.all(playlistPromises).then(results => {
        const playlists = results.map(result => result.body);
        res.json(playlists);
    }).catch(err => {
        console.error('Error fetching playlists:', err);
        res.sendStatus(500);
    });
});

app.get('/play', (req, res) => {
    const trackUri = req.query.trackUri;
    if (!accessToken) {
        res.sendStatus(401);
        return;
    }
    spotifyApi.setAccessToken(accessToken);
    spotifyApi.play({ uris: [trackUri] }).then(() => {
        res.sendStatus(200);
    }).catch(err => {
        console.error('Error playing track:', err);
        res.sendStatus(500);
    });
});

app.get('/get-access-token', (req, res) => {
    if (!accessToken) {
        res.sendStatus(401);
        return;
    }
    res.json({ accessToken });
});

app.put('/transfer', (req, res) => {
    const deviceId = req.body.deviceId;
    if (!accessToken) {
        res.sendStatus(401);
        return;
    }
    spotifyApi.setAccessToken(accessToken);
    spotifyApi.transferMyPlayback([deviceId], { play: true })
        .then(() => {
            res.sendStatus(200);
        })
        .catch(err => {
            console.error('Error transferring playback:', err);
            res.sendStatus(500);
        });
});

// Adapter les événements Socket.io pour l'affichage de la section "waiting"
io.on('connection', (socket) => {
    console.log('Nouveau client connecté');

    // Envoyer les états actuels lors de la connexion
    socket.emit('updateScores', { scores, players });
    socket.emit('currentTrackInfo', currentTrackInfo);
    socket.emit('lastWinner', lastWinner);
    socket.emit('chosenWordsStatus', chosenWords.length === 0); // Émettre l'état de chosenWords

    // Envoyer chosenWords seulement s'il n'est pas vide
    if (chosenWords.length > 0) {
        socket.emit('wordSelected', chosenWords);
    }

    socket.on('updateArtistNames', (artistNames) => {
        chosenWords = Array.isArray(artistNames) ? artistNames : [artistNames];
        console.log('Updated chosen words:', chosenWords);
        io.emit('chosenWordsStatus', chosenWords.length === 0); // Met à jour l'état de chosenWords
    });

    socket.on('requestWord', () => {
        socket.emit('wordSelected', chosenWords);
        console.log('Sent words to editor:', chosenWords);
    });

    socket.on('editorUpdate', (data) => {
        const { editor, content } = data;
        editorData[editor] = content;
        socket.to(editor).emit('editorContent', { editor, content });
    });

    socket.on('wordFound', (data) => {
        const { editor, word } = data;
        console.log(`wordFound received: editor=${editor}, word=${word}`); // Log for debugging
        if (chosenWords.some(chosenWord => word.includes(chosenWord.toLowerCase()))) {
            scores[editor] = (scores[editor] || 0) + 1;
            console.log(`Editor ${editor} found a word! Score: ${scores[editor]}`);

            chosenWords = [];
            io.emit('updateScores', { scores, players });
            io.emit('clearEditors');
            io.emit('resetWord'); // Mise à jour de l'événement pour afficher la section waiting
            io.emit('chosenWordsStatus', chosenWords.length === 0); // Met à jour l'état de chosenWords

            const endTime = Date.now();
            if (startTime === null) {
                console.error('startTime is not initialized');
            } else {
                const elapsedTime = ((endTime - startTime) / 1000).toFixed(2); // Calculate elapsed time in seconds
                console.log(`endTime: ${endTime}, startTime: ${startTime}, elapsedTime: ${elapsedTime}`); // Log for debugging

                lastWinner = {
                    editor: players[parseInt(editor.replace('editor', ''), 10) - 1] || editor,
                    time: elapsedTime
                };
                io.emit('lastWinner', lastWinner);
            }

            startTime = null; // Reset startTime for the next track
        }
    });

    socket.on('setPlayers', (newPlayers) => {
        players = newPlayers;
        console.log('Players set:', players);
        io.emit('updateScores', { scores, players });
    });

    socket.on('disconnect', () => {
        console.log('Client déconnecté');
    });

    socket.on('resetWord', () => {
        chosenWords = [];
        console.log('Chosen words reset manually:', chosenWords);
        lastWinner = {
            editor: '',
            time: 0
        };
        io.emit('resetWord'); // Mise à jour de l'événement pour afficher la section waiting
        io.emit('lastWinner', lastWinner);
        io.emit('chosenWordsStatus', chosenWords.length === 0); // Met à jour l'état de chosenWords
    });
});


const PORT = process.env.PORT || 8888;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
