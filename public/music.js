let accessToken, player, deviceId;
const socket = io();

const initializePlayer = async () => {
    try {
        const response = await fetch('/get-access-token');
        const data = await response.json();
        accessToken = data.accessToken;
        console.log('Access Token:', accessToken);
        loadSpotifyPlayer();
    } catch (err) {
        console.error('Error fetching access token:', err);
    }
};

const loadSpotifyPlayer = () => {
    window.onSpotifyWebPlaybackSDKReady = () => {
        player = new Spotify.Player({
            name: 'Web Playback SDK',
            getOAuthToken: cb => cb(accessToken),
            volume: 0.5
        });

        player.addListener('ready', ({ device_id }) => {
            console.log('Player is ready with Device ID', device_id);
            deviceId = device_id;
            transferPlaybackHere();
            setupEventListeners();
        });

        player.addListener('not_ready', ({ device_id }) => {
            console.log('Device ID has gone offline', device_id);
        });

        player.addListener('player_state_changed', state => {
            if (state) {
                updateTrackInfo(state);
            }
        });

        player.connect().then(success => {
            if (success) {
                console.log('Player connected successfully');
            } else {
                console.error('Player connection failed');
            }
        });
    };

    const script = document.createElement('script');
    script.src = "https://sdk.scdn.co/spotify-player.js";
    document.head.appendChild(script);
};

const setupEventListeners = () => {
    const nextTrackButton = document.getElementById('nextTrackButton');
    const seekButton = document.getElementById('seekButton');
    const playPauseButton = document.getElementById('playPauseButton');

    if (nextTrackButton && seekButton && playPauseButton) {
        nextTrackButton.addEventListener('click', skipToNextTrack);
        seekButton.addEventListener('click', seekToPosition);
        playPauseButton.addEventListener('click', togglePlayPause);
    } else {
        console.error('Button elements not found');
    }
};

const transferPlaybackHere = async () => {
    try {
        const response = await fetch('/transfer', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId })
        });
        if (response.ok) {
            console.log('Playback transferred to this device');
        } else {
            console.error('Error transferring playback:', response.statusText);
        }
    } catch (err) {
        console.error('Error transferring playback:', err);
    }
};

const loadPlaylists = async () => {
    const playlistContainer = document.getElementById('playlists');
    try {
        const response = await fetch('/playlists');
        const playlists = await response.json();
        playlists.forEach(playlist => {
            const img = document.createElement('img');
            img.src = playlist.images[0].url;
            img.alt = playlist.name;
            img.className = 'playlist-image';
            img.addEventListener('click', () => playRandomTrackFromPlaylist(playlist.id));
            playlistContainer.appendChild(img);
        });
    } catch (err) {
        console.error('Error fetching playlists:', err);
    }
};

const playRandomTrackFromPlaylist = async (playlistId) => {
    try {
        let response = await fetch('https://api.spotify.com/v1/me/player/shuffle?state=true', {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (!response.ok) throw new Error('Failed to enable shuffle mode');

        response = await fetch('https://api.spotify.com/v1/me/player/play', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ context_uri: `spotify:playlist:${playlistId}` })
        });
        if (response.ok) {
            console.log('Playing playlist in shuffle mode:', playlistId);
        } else {
            console.error('Error playing playlist:', response.statusText);
        }
    } catch (err) {
        console.error('Error enabling shuffle mode or playing playlist:', err);
    }
};

const skipToNextTrack = () => {
    if (player) {
        player.nextTrack().then(() => {
            console.log('Skipped to next track!');
        }).catch(err => console.error('Error skipping to next track:', err));
    } else {
        console.error('Player not initialized or not connected');
    }
};

const seekToPosition = () => {
    if (player) {
        player.seek(60 * 1000).then(() => {
            console.log('Changed position!');
        }).catch(err => console.error('Error seeking:', err));
    } else {
        console.error('Player not initialized or not connected');
    }
};

const togglePlayPause = () => {
    if (player) {
        player.getCurrentState().then(state => {
            if (!state) {
                console.error('User is not playing music through the Web Playback SDK');
                return;
            }
            if (state.paused) {
                player.resume().then(() => {
                    console.log('Resumed playback!');
                });
            } else {
                player.pause().then(() => {
                    console.log('Paused playback!');
                });
            }
        });
    } else {
        console.error('Player not initialized or not connected');
    }
};

document.addEventListener('DOMContentLoaded', () => {
    initializePlayer();
    loadPlaylists();
});

function updateTrackInfo(state) {
    if (!state || !state.track_window.current_track) {
        console.error('No track info available');
        return;
    }

    const { current_track } = state.track_window;
    const { name, artists, album } = current_track;
    const artistNames = artists.map(artist => artist.name);
    const artistNamesString = artistNames.join(', ');

    const trackInfo = {
        title: name,
        artist: artistNamesString,
        albumCover: album.images[0].url
    };

    document.getElementById('track-title').textContent = `Titre : ${name}`;
    document.getElementById('track-artist').textContent = `Artiste : ${artistNamesString}`;
    document.getElementById('track-cover').src = album.images[0].url;

    updateCurrentTrackInfo(trackInfo);
    socket.emit('updateArtistNames', artistNames);
}

function updateCurrentTrackInfo(trackInfo) {
    fetch('/current-track-info', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(trackInfo)
    })
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to update current track info');
            }
        })
        .catch(error => console.error('Error updating current track info:', error));
}
