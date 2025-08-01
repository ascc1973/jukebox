// --- Elementos HTML ---
let introScreen;
let startButton;
let jukeboxMainContent;
let selectFolderButton;
let currentSongInfo;
let audioPlayerA;
let audioPlayerB;
let playButton;
let pauseButton;
let prevButton;
let nextButton;
let playbackSlider;
let songTimeElapsedDisplay;
let songTimeRemainingDisplay;
let songSearchInput;
let userSelectionListUl;
let userQueueListUl;

// --- Variables de Estado del Jukebox ---
let allSongs = [];
let userQueue = [];
let historySongs = []; // Para el botón de "anterior"

let currentlyPlayingSong = null;
let activePlayer = null;
let inactivePlayer = null;
let isPlaying = false;
let playbackInterval;
let isSeeking = false;
let wasPlayingBeforeSeek = false;

const FADE_DURATION = 2000;
const FADE_INTERVAL = 50;

// La lógica de reproducción aleatoria ahora se simplifica para la lista completa
let playedSongsInCycle = new Set();
let allSongIds = [];

// --- Funciones de Utilidad ---

/**
 * Formatea el tiempo en segundos a un string MM:SS.
 * @param {number} seconds - El tiempo en segundos.
 * @returns {string} El tiempo formateado.
 */
function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) {
        return "00:00";
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    const formattedMinutes = String(minutes).padStart(2, '0');
    const formattedSeconds = String(remainingSeconds).padStart(2, '0');
    return `${formattedMinutes}:${formattedSeconds}`;
}

/**
 * Actualiza la información de la canción actual en la interfaz de usuario.
 * @param {object|null} song - El objeto de la canción que se está reproduciendo o null si no hay ninguna.
 */
function updateCurrentSongInfo(song) {
    if (!currentSongInfo) return;

    const songTitleSpan = currentSongInfo.querySelector('.song-title');
    if (songTitleSpan) {
        if (song) {
            let artistPart = song.artist && song.artist.toLowerCase() !== "artista desconocido" ? ` - ${song.artist}` : '';
            songTitleSpan.textContent = `${song.title || 'Título Desconocido'}${artistPart}`;
        } else {
            songTitleSpan.textContent = 'Jukebox en espera...';
        }
    }
}

/**
 * Muestra u oculta la pantalla de inicio y la jukebox principal.
 * @param {boolean} showJukebox - `true` para mostrar la jukebox, `false` para mostrar la pantalla de inicio.
 */
function toggleJukeboxUI(showJukebox) {
    if (showJukebox) {
        if (introScreen) introScreen.classList.add('hidden');
        if (jukeboxMainContent) jukeboxMainContent.classList.remove('hidden');
    } else {
        if (introScreen) introScreen.classList.remove('hidden');
        if (jukeboxMainContent) jukeboxMainContent.classList.add('hidden');
    }
}

// --- Lógica de Manejo de Archivos y Listas ---

/**
 * Carga las canciones desde un directorio seleccionado por el usuario.
 * @param {FileSystemDirectoryHandle} dirHandle - El manejador del directorio.
 */
async function loadSongsFromDirectory(dirHandle) {
    allSongs = [];
    if (userSelectionListUl) {
        userSelectionListUl.innerHTML = '<li class="no-results">Cargando canciones...</li>';
    }
    const songsPromises = [];
    let idCounter = 0;

    async function processDirectory(handle) {
        for await (const entry of handle.values()) {
            if (entry.kind === 'directory') {
                await processDirectory(entry);
            } else if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.mp3')) {
                songsPromises.push((async () => {
                    const file = await entry.getFile();
                    const url = URL.createObjectURL(file);
                    const song = {
                        id: idCounter++,
                        title: entry.name.replace(/\.mp3$/i, ''),
                        artist: handle.name !== dirHandle.name ? handle.name : 'Artista Desconocido',
                        album: handle.name !== dirHandle.name ? handle.name : 'Álbum Desconocido',
                        file: url,
                        handle: file,
                    };
                    return song;
                })());
            }
        }
    }

    await processDirectory(dirHandle);
    allSongs = await Promise.all(songsPromises);

    if (allSongs.length === 0) {
        if (userSelectionListUl) {
            userSelectionListUl.innerHTML = '<li class="no-results">No se encontraron archivos MP3 en la carpeta.</li>';
        }
        return;
    }

    allSongIds = allSongs.map(s => s.id);
    initializePlayedSongs();
    renderSongLists();
    console.log(`Jukebox: ${allSongs.length} canciones cargadas desde la carpeta.`);
}


/**
 * Renderiza la lista de canciones seleccionables y la cola de usuario.
 */
function renderSongLists() {
    renderUserSelectionList();
    renderUserQueue();
}

/**
 * Renderiza la lista de canciones seleccionables (ahora con el filtro de búsqueda).
 */
function renderUserSelectionList(filteredSongs = allSongs) {
    if (userSelectionListUl) {
        userSelectionListUl.innerHTML = '';
        if (filteredSongs.length === 0) {
            const emptyMessage = document.createElement('li');
            emptyMessage.textContent = 'No se encontraron canciones.';
            emptyMessage.classList.add('no-results');
            userSelectionListUl.appendChild(emptyMessage);
            return;
        }

        filteredSongs.forEach(song => {
            const listItem = document.createElement('li');
            listItem.innerHTML = `<span class="song-list-item-title">${song.title}</span><span class="song-list-item-artist">${song.artist}</span>`;
            listItem.dataset.songId = song.id;
            listItem.addEventListener('click', () => {
                addSongToQueue(song);
            });
            userSelectionListUl.appendChild(listItem);
        });
    }
}

/**
 * Renderiza la cola de usuario.
 */
function renderUserQueue() {
    if (userQueueListUl) {
        userQueueListUl.innerHTML = '';
        if (userQueue.length === 0) {
            const emptyMessage = document.createElement('li');
            emptyMessage.textContent = 'Tu cola está vacía.';
            emptyMessage.classList.add('no-results');
            userQueueListUl.appendChild(emptyMessage);
            return;
        }

        userQueue.forEach((song, index) => {
            const listItem = document.createElement('li');
            listItem.innerHTML = `<span class="song-list-item-title">${song.title}</span><span class="song-list-item-artist">${song.artist}</span>`;
            listItem.classList.add('user-queue-item');
            listItem.addEventListener('click', () => {
                removeSongFromQueue(index);
            });
            userQueueListUl.appendChild(listItem);
        });
    }
}

/**
 * Añade una canción a la cola de usuario.
 * @param {object} songToAdd - La canción a añadir.
 */
function addSongToQueue(songToAdd) {
    if (!userQueue.some(song => song.id === songToAdd.id)) {
        userQueue.push(songToAdd);
        renderUserQueue();
        console.log(`Canción "${songToAdd.title}" añadida a la cola.`);
    }
}

/**
 * Elimina una canción de la cola de usuario.
 * @param {number} index - El índice de la canción a eliminar.
 */
function removeSongFromQueue(index) {
    const removedSong = userQueue.splice(index, 1);
    console.log(`Canción "${removedSong[0].title}" eliminada de la cola.`);
    renderUserQueue();
}

// --- Funciones de Búsqueda ---
/**
 * Filtra la lista de canciones en base a la entrada de búsqueda.
 */
function searchSongs() {
    if (!songSearchInput) return;

    const searchTerm = songSearchInput.value.toLowerCase();
    const filteredSongs = allSongs.filter(song =>
        song.title.toLowerCase().includes(searchTerm) ||
        (song.artist && song.artist.toLowerCase().includes(searchTerm)) ||
        (song.album && song.album.toLowerCase().includes(searchTerm))
    );
    renderUserSelectionList(filteredSongs);
}

// --- Lógica de Reproducción ---

/**
 * Alterna la visibilidad de los botones de Play y Pause.
 * @param {boolean} showPlayButton - `true` para mostrar el botón de Play, `false` para mostrar el de Pause.
 */
function togglePlayPauseButtons(showPlayButton) {
    if (!playButton || !pauseButton) return;

    if (showPlayButton) {
        playButton.classList.remove('hidden');
        pauseButton.classList.add('hidden');
    } else {
        playButton.classList.add('hidden');
        pauseButton.classList.remove('hidden');
    }
}

/**
 * Pausa la reproducción de la canción actual.
 */
function pausePlayback() {
    if (activePlayer && isPlaying) {
        activePlayer.pause();
        isPlaying = false;
        clearInterval(playbackInterval);
        togglePlayPauseButtons(true);
    }
}

/**
 * Reanuda la reproducción de la canción actual.
 */
async function resumePlayback() {
    if (activePlayer && !isPlaying) {
        try {
            await activePlayer.play();
            isPlaying = true;
            startPlaybackSlider();
            togglePlayPauseButtons(false);
        } catch (error) {
            console.error("Error al reanudar la reproducción:", error);
            isPlaying = false;
            togglePlayPauseButtons(true);
        }
    }
}

/**
 * Selecciona la siguiente canción para reproducir.
 * Prioriza la cola de usuario, luego la historia (si retrocede) y finalmente la reproducción aleatoria.
 * @returns {object|null} La próxima canción o null si no hay.
 */
function getNextSong() {
    if (userQueue.length > 0) {
        const song = userQueue.shift();
        renderUserQueue();
        return song;
    }

    return selectNextRandomSong();
}

/**
 * Selecciona una canción aleatoria que no haya sido reproducida en el ciclo actual.
 * @returns {object|null} La canción seleccionada o null si no hay canciones.
 */
function selectNextRandomSong() {
    const availableSongs = allSongs.filter(song => !playedSongsInCycle.has(song.id));

    if (availableSongs.length === 0) {
        console.log("Reiniciando ciclo de reproducción aleatoria.");
        initializePlayedSongs();
        return selectNextRandomSong();
    }

    const randomIndex = Math.floor(Math.random() * availableSongs.length);
    const song = availableSongs[randomIndex];

    playedSongsInCycle.add(song.id);

    return song;
}

/**
 * Carga y reproduce una canción con crossfade si es necesario.
 * @param {object} songToPlay - La canción a reproducir.
 */
async function playSong(songToPlay) {
    if (!songToPlay || !audioPlayerA || !audioPlayerB) {
        console.warn("No hay canción o reproductores para reproducir. Saltando...");
        playNextSong();
        return;
    }

    currentlyPlayingSong = songToPlay;

    const nextActivePlayer = (activePlayer === audioPlayerA) ? audioPlayerB : audioPlayerA;
    const currentActivePlayer = activePlayer;

    audioPlayerA.removeEventListener('ended', playNextSong);
    audioPlayerB.removeEventListener('ended', playNextSong);

    nextActivePlayer.src = songToPlay.file;
    nextActivePlayer.volume = 0;
    nextActivePlayer.load();

    const onCanPlayThrough = async () => {
        nextActivePlayer.removeEventListener('canplaythrough', onCanPlayThrough);
        try {
            await nextActivePlayer.play();
            isPlaying = true;
            togglePlayPauseButtons(false);
            activePlayer = nextActivePlayer;
            activePlayer.addEventListener('ended', playNextSong);

            updateCurrentSongInfo(songToPlay);
            startPlaybackSlider();

            if (currentActivePlayer && !currentActivePlayer.paused) {
                let currentVolumeFadeOut = currentActivePlayer.volume;
                let newVolumeFadeIn = 0;
                const fadeStep = FADE_INTERVAL / FADE_DURATION;

                const fadeInterval = setInterval(() => {
                    currentVolumeFadeOut -= fadeStep;
                    newVolumeFadeIn += fadeStep;
                    currentActivePlayer.volume = Math.max(0, currentVolumeFadeOut);
                    activePlayer.volume = Math.min(1, newVolumeFadeIn);

                    if (currentVolumeFadeOut <= 0 && newVolumeFadeIn >= 1) {
                        clearInterval(fadeInterval);
                        currentActivePlayer.pause();
                        currentActivePlayer.currentTime = 0;
                        activePlayer.volume = 1;
                    }
                }, FADE_INTERVAL);
            } else {
                activePlayer.volume = 1;
            }

            console.log(`Reproduciendo: ${songToPlay.title}`);
        } catch (error) {
            console.error(`Error al reproducir la canción "${songToPlay.title}":`, error);
            playNextSong();
        }
    };
    nextActivePlayer.addEventListener('canplaythrough', onCanPlayThrough);
}

/**
 * Reproduce la siguiente canción en la cola o de forma aleatoria.
 */
function playNextSong() {
    if (currentlyPlayingSong) {
        historySongs.push(currentlyPlayingSong);
    }

    const nextSong = getNextSong();
    if (nextSong) {
        playSong(nextSong);
    } else {
        console.log("Fin de la lista de reproducción.");
        stopPlayback();
    }
}

/**
 * Reproduce la canción anterior del historial.
 */
function playPrevSong() {
    if (historySongs.length > 0) {
        const prevSong = historySongs.pop();
        if (currentlyPlayingSong) {
            // No se hace push de la canción actual a la historia porque estamos retrocediendo
        }
        playSong(prevSong);
    } else {
        if (currentlyPlayingSong) {
            playSong(currentlyPlayingSong);
        }
    }
}

/**
 * Detiene la reproducción y limpia la interfaz.
 */
function stopPlayback() {
    if (activePlayer) {
        activePlayer.pause();
        activePlayer.currentTime = 0;
    }
    isPlaying = false;
    clearInterval(playbackInterval);
    togglePlayPauseButtons(true);
    updateCurrentSongInfo(null);
    if (playbackSlider) playbackSlider.value = 0;
    if (songTimeElapsedDisplay) songTimeElapsedDisplay.textContent = '00:00';
    if (songTimeRemainingDisplay) songTimeRemainingDisplay.textContent = '00:00';
}

/**
 * Inicializa el set de canciones reproducidas para un nuevo ciclo.
 */
function initializePlayedSongs() {
    playedSongsInCycle.clear();
}

/**
 * Inicia la actualización del slider de reproducción y el tiempo.
 */
function startPlaybackSlider() {
    if (playbackInterval) {
        clearInterval(playbackInterval);
    }
    playbackInterval = setInterval(() => {
        if (!isSeeking && activePlayer && !activePlayer.paused && activePlayer.duration && playbackSlider) {
            const currentTime = activePlayer.currentTime;
            const duration = activePlayer.duration;
            const progress = (currentTime / duration) * 100;
            playbackSlider.value = progress;
            if (songTimeElapsedDisplay) songTimeElapsedDisplay.textContent = formatTime(currentTime);
            if (songTimeRemainingDisplay) songTimeRemainingDisplay.textContent = formatTime(duration - currentTime);
        }
    }, 1000);
}

// --- Event Listener para cargar el DOM ---
document.addEventListener('DOMContentLoaded', () => {
    // Asignar elementos HTML a las variables después de que el DOM esté listo
    introScreen = document.getElementById('introScreen');
    startButton = document.getElementById('startButton');
    jukeboxMainContent = document.getElementById('jukeboxMainContent');
    selectFolderButton = document.getElementById('selectFolderButton');
    currentSongInfo = document.getElementById('currentSongInfo');
    audioPlayerA = document.getElementById('audioPlayerA');
    audioPlayerB = document.getElementById('audioPlayerB');
    playButton = document.getElementById('playButton');
    pauseButton = document.getElementById('pauseButton');
    prevButton = document.getElementById('prevButton');
    nextButton = document.getElementById('nextButton');
    playbackSlider = document.getElementById('playbackSlider');
    songTimeElapsedDisplay = document.getElementById('songTimeElapsed');
    songTimeRemainingDisplay = document.getElementById('songTimeRemaining');
    songSearchInput = document.getElementById('songSearchInput');
    userSelectionListUl = document.getElementById('userSelectionList');
    userQueueListUl = document.getElementById('userQueueList');
    
    console.log("DOM Cargado. Inicializando Jukebox.");

    // Oculta el contenido principal y muestra la pantalla de inicio
    toggleJukeboxUI(false);

    // --- Event Listeners ---
    if (startButton) {
        startButton.addEventListener('click', async () => {
            toggleJukeboxUI(true);
        });
    }

    if (selectFolderButton) {
        selectFolderButton.addEventListener('click', async () => {
            try {
                const dirHandle = await window.showDirectoryPicker();
                await loadSongsFromDirectory(dirHandle);
            } catch (error) {
                console.error("Error al seleccionar la carpeta:", error);
                alert("No se pudo seleccionar la carpeta. Asegúrate de que el navegador tenga permisos.");
            }
        });
    }

    if (playButton) playButton.addEventListener('click', () => {
        if (!currentlyPlayingSong) {
            playNextSong();
        } else {
            resumePlayback();
        }
    });

    if (pauseButton) pauseButton.addEventListener('click', pausePlayback);
    if (nextButton) nextButton.addEventListener('click', playNextSong);
    if (prevButton) prevButton.addEventListener('click', playPrevSong);

    if (playbackSlider) {
        playbackSlider.addEventListener('mousedown', () => {
            if (isPlaying) {
                wasPlayingBeforeSeek = true;
                pausePlayback();
            } else {
                wasPlayingBeforeSeek = false;
            }
            isSeeking = true;
        });

        playbackSlider.addEventListener('mouseup', () => {
            isSeeking = false;
            if (activePlayer && activePlayer.duration) {
                const seekTime = (playbackSlider.value / 100) * activePlayer.duration;
                activePlayer.currentTime = seekTime;
            }
            if (wasPlayingBeforeSeek) {
                resumePlayback();
            }
        });

        playbackSlider.addEventListener('input', () => {
            if (activePlayer && activePlayer.duration) {
                const tempTime = (playbackSlider.value / 100) * activePlayer.duration;
                if (songTimeElapsedDisplay) songTimeElapsedDisplay.textContent = formatTime(tempTime);
                if (songTimeRemainingDisplay) songTimeRemainingDisplay.textContent = formatTime(activePlayer.duration - tempTime);
            }
        });
    }

    if (songSearchInput) songSearchInput.addEventListener('input', searchSongs);

    // Inicializar listas vacías
    if (userSelectionListUl) {
        userSelectionListUl.innerHTML = '<li class="no-results">Selecciona una carpeta para cargar tus canciones.</li>';
    }
    if (userQueueListUl) {
        userQueueListUl.innerHTML = '<li class="no-results">Tu cola está vacía.</li>';
    }
});