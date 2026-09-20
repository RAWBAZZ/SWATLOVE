const $ = (id) => document.getElementById(id);

const audio = $("audio");
const play = $("play");
const startButton = $("startButton");
const previous = $("previous");
const next = $("next");
const shuffle = $("shuffleButton");
const heart = $("heartButton");
const progress = $("progress");
const volume = $("volume");
const currentTime = $("currentTime");
const totalTime = $("totalTime");
const songTitle = $("songTitle");
const artistName = $("artistName");
const coverImage = $("coverImage");
const playlist = $("playlist");
const trackCount = $("trackCount");
const playerCard = $("playerCard");
const background = $("background");

const modal = $("uploadModal");
const openUpload = $("openUpload");
const closeUpload = $("closeUpload");
const addSong = $("addSong");
const formError = $("formError");

const audioFile = $("audioFile");
const coverFile = $("coverFile");
const backgroundFile = $("backgroundFile");
const audioName = $("audioName");
const coverName = $("coverName");
const backgroundName = $("backgroundName");
const titleInput = $("titleInput");
const artistInput = $("artistInput");

const letterDialog = $("letterDialog");

const DEFAULT_COVER = "assets/swat.jpg";
const DEFAULT_TITLE = "Nothing playing";
const DEFAULT_ARTIST = "Add a song to begin";

let songs = [];
let currentIndex = -1;

audio.volume = 0.8;

/* ---------- storage (IndexedDB) ----------
   Blob URLs die on refresh, so the files themselves are stored in the
   browser. Everything stays on this device; nothing is uploaded. */

let dbPromise;

function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open("swatlove", 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore("songs", { keyPath: "id", autoIncrement: true });
        db.createObjectStore("settings");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

async function dbRun(storeName, mode, action) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const request = action(transaction.objectStore(storeName));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

const dbAll = () => dbRun("songs", "readonly", (s) => s.getAll());
const dbPut = (record) => dbRun("songs", "readwrite", (s) => s.put(record));
const dbDelete = (id) => dbRun("songs", "readwrite", (s) => s.delete(id));
const settingGet = (key) => dbRun("settings", "readonly", (s) => s.get(key));
const settingSet = (key, value) =>
  dbRun("settings", "readwrite", (s) => s.put(value, key));

/* ---------- helpers ---------- */

function timeFormat(value) {
  if (!value || Number.isNaN(value)) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function escapeHTML(text) {
  return String(text).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function fromLibrary(entry) {
  return {
    id: `library:${entry.file}`,
    title: entry.title || entry.file.replace(/\.[^/.]+$/, ""),
    artist: entry.artist || "SWATLOVE Collection",
    fav: readFav(`library:${entry.file}`),
    record: null,
    builtin: true,
    audioUrl: `songs/${encodeURIComponent(entry.file)}`,
    coverUrl: entry.cover ? `songs/${encodeURIComponent(entry.cover)}` : DEFAULT_COVER
  };
}

function readFav(key) {
  try {
    return localStorage.getItem(`fav:${key}`) === "1";
  } catch (error) {
    return false;
  }
}

function writeFav(key, on) {
  try {
    localStorage.setItem(`fav:${key}`, on ? "1" : "0");
  } catch (error) {
    /* ignore */
  }
}

function fromRecord(record) {
  return {
    id: record.id,
    title: record.title,
    artist: record.artist,
    fav: Boolean(record.fav),
    record,
    audioUrl: URL.createObjectURL(record.audio),
    coverUrl: record.cover ? URL.createObjectURL(record.cover) : DEFAULT_COVER
  };
}

function setBackground(blob) {
  background.style.backgroundImage = `url("${URL.createObjectURL(blob)}")`;
  background.style.opacity = "1";
}

function showError(message) {
  formError.textContent = message;
  formError.hidden = !message;
}

function resetPlayerView() {
  songTitle.textContent = DEFAULT_TITLE;
  artistName.textContent = DEFAULT_ARTIST;
  coverImage.src = DEFAULT_COVER;
  progress.value = 0;
  currentTime.textContent = "0:00";
  totalTime.textContent = "0:00";
  heart.setAttribute("aria-pressed", "false");
  heart.textContent = "♡";
}

/* ---------- playlist ---------- */

function renderPlaylist() {
  trackCount.textContent = `${songs.length} ${songs.length === 1 ? "track" : "tracks"}`;

  if (!songs.length) {
    playlist.innerHTML = `
      <div class="empty">
        <div>♫</div>
        <p>Your playlist is empty</p>
        <span>Add a song to start your collection.</span>
      </div>`;
    return;
  }

  playlist.innerHTML = songs
    .map(
      (song, index) => `
        <div class="song ${index === currentIndex ? "active" : ""}"
             data-index="${index}" tabindex="0" role="button"
             aria-label="Play ${escapeHTML(song.title)}">
          <img src="${song.coverUrl}" alt="" />
          <div class="song-info">
            <strong>${escapeHTML(song.title)}</strong>
            <span>${escapeHTML(song.artist)}</span>
          </div>
          ${
            song.builtin
              ? ""
              : `<button class="delete" data-delete="${index}" type="button"
                  aria-label="Remove ${escapeHTML(song.title)}">×</button>`
          }
        </div>`
    )
    .join("");
}

playlist.addEventListener("click", (event) => {
  const deleteButton = event.target.closest("[data-delete]");
  if (deleteButton) {
    event.stopPropagation();
    removeSong(Number(deleteButton.dataset.delete));
    return;
  }

  const item = event.target.closest(".song");
  if (item) {
    loadSong(Number(item.dataset.index));
    audio.play();
  }
});

playlist.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const item = event.target.closest(".song");
  if (item && event.target === item) {
    event.preventDefault();
    loadSong(Number(item.dataset.index));
    audio.play();
  }
});

async function removeSong(index) {
  const [removed] = songs.splice(index, 1);
  if (!removed) return;

  URL.revokeObjectURL(removed.audioUrl);
  if (removed.coverUrl !== DEFAULT_COVER) URL.revokeObjectURL(removed.coverUrl);

  try {
    await dbDelete(removed.id);
  } catch (error) {
    console.error("Could not delete song", error);
  }

  if (index === currentIndex) {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    currentIndex = -1;
    resetPlayerView();
  } else if (index < currentIndex) {
    currentIndex--;
  }

  renderPlaylist();
}

function loadSong(index) {
  const song = songs[index];
  if (!song) return;

  currentIndex = index;
  audio.src = song.audioUrl;
  songTitle.textContent = song.title;
  artistName.textContent = song.artist;
  coverImage.src = song.coverUrl;
  progress.value = 0;
  currentTime.textContent = "0:00";
  totalTime.textContent = "0:00";
  updateHeart();
  updateMediaSession(song);
  renderPlaylist();
}

function updateHeart() {
  const song = songs[currentIndex];
  const on = Boolean(song && song.fav);
  heart.setAttribute("aria-pressed", String(on));
  heart.textContent = on ? "♥" : "♡";
}

heart.addEventListener("click", async () => {
  const song = songs[currentIndex];
  if (!song) return;

  song.fav = !song.fav;
  updateHeart();

  if (song.builtin) {
    writeFav(song.id, song.fav);
    return;
  }

  song.record.fav = song.fav;

  try {
    await dbPut(song.record);
  } catch (error) {
    console.error("Could not save favourite", error);
  }
});

/* ---------- playback ---------- */

function startPlaying() {
  if (!songs.length) {
    openModal();
    return;
  }
  if (currentIndex === -1) loadSong(0);
  audio.play();
}

function togglePlay() {
  if (audio.paused) startPlaying();
  else audio.pause();
}

function nextSong() {
  if (!songs.length) return;
  loadSong(currentIndex >= songs.length - 1 ? 0 : currentIndex + 1);
  audio.play();
}

function previousSong() {
  if (!songs.length) return;
  // Like most players: restart the song first, go back only near the start.
  if (audio.currentTime > 3) {
    audio.currentTime = 0;
    return;
  }
  loadSong(currentIndex <= 0 ? songs.length - 1 : currentIndex - 1);
  audio.play();
}

function shuffleSong() {
  if (!songs.length) {
    openModal();
    return;
  }
  let index = Math.floor(Math.random() * songs.length);
  if (songs.length > 1 && index === currentIndex) {
    index = (index + 1) % songs.length;
  }
  loadSong(index);
  audio.play();
}

play.addEventListener("click", togglePlay);
startButton.addEventListener("click", togglePlay);
next.addEventListener("click", nextSong);
previous.addEventListener("click", previousSong);
shuffle.addEventListener("click", shuffleSong);

audio.addEventListener("play", () => {
  play.textContent = "Ⅱ";
  startButton.textContent = "Ⅱ Pause";
  playerCard.classList.add("playing");
});

audio.addEventListener("pause", () => {
  play.textContent = "▶";
  startButton.textContent = "▶ Start listening";
  playerCard.classList.remove("playing");
});

audio.addEventListener("ended", nextSong);

audio.addEventListener("error", () => {
  if (audio.getAttribute("src")) {
    artistName.textContent = "This file could not be played";
  }
});

audio.addEventListener("loadedmetadata", () => {
  totalTime.textContent = timeFormat(audio.duration);
});

audio.addEventListener("timeupdate", () => {
  if (!audio.duration) return;
  progress.value = (audio.currentTime / audio.duration) * 100;
  currentTime.textContent = timeFormat(audio.currentTime);
});

progress.addEventListener("input", () => {
  if (!audio.duration) return;
  audio.currentTime = (progress.value / 100) * audio.duration;
});

volume.addEventListener("input", () => {
  audio.volume = Number(volume.value);
});

/* Lock-screen / headphone controls on phones */
function updateMediaSession(song) {
  if (!("mediaSession" in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: song.title,
    artist: song.artist,
    artwork: [{ src: song.coverUrl }]
  });
}

if ("mediaSession" in navigator) {
  navigator.mediaSession.setActionHandler("play", () => audio.play());
  navigator.mediaSession.setActionHandler("pause", () => audio.pause());
  navigator.mediaSession.setActionHandler("previoustrack", previousSong);
  navigator.mediaSession.setActionHandler("nexttrack", nextSong);
}

/* Keyboard: space = play/pause, arrows = skip 5s / change song */
document.addEventListener("keydown", (event) => {
  const tag = event.target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON") return;
  if (event.target.closest && event.target.closest(".song")) return;
  if (modal.classList.contains("open") || letterDialog.open) return;

  if (event.code === "Space") {
    event.preventDefault();
    togglePlay();
  } else if (event.code === "ArrowRight" && audio.duration) {
    audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
  } else if (event.code === "ArrowLeft" && audio.duration) {
    audio.currentTime = Math.max(0, audio.currentTime - 5);
  }
});

/* ---------- upload modal ---------- */

function openModal() {
  showError("");
  modal.classList.add("open");
}

function closeModal() {
  modal.classList.remove("open");
}

openUpload.addEventListener("click", openModal);
closeUpload.addEventListener("click", closeModal);

modal.addEventListener("click", (event) => {
  if (event.target === modal) closeModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeModal();
});

audioFile.addEventListener("change", () => {
  if (audioFile.files[0]) audioName.textContent = audioFile.files[0].name;
});

coverFile.addEventListener("change", () => {
  if (coverFile.files[0]) coverName.textContent = coverFile.files[0].name;
});

backgroundFile.addEventListener("change", () => {
  if (backgroundFile.files[0]) backgroundName.textContent = backgroundFile.files[0].name;
});

addSong.addEventListener("click", async () => {
  const audioData = audioFile.files[0];
  const coverData = coverFile.files[0];
  const backgroundData = backgroundFile.files[0];

  if (!audioData) {
    showError("Choose an audio file first.");
    return;
  }

  const record = {
    title: titleInput.value.trim() || audioData.name.replace(/\.[^/.]+$/, ""),
    artist: artistInput.value.trim() || "SWATLOVE Collection",
    audio: audioData,
    cover: coverData || null,
    fav: false
  };

  try {
    record.id = await dbPut(record);
    if (backgroundData) await settingSet("background", backgroundData);
  } catch (error) {
    console.error(error);
    showError("Could not save this song in the browser. Check that storage is not full or blocked.");
    return;
  }

  songs.push(fromRecord(record));
  if (backgroundData) setBackground(backgroundData);

  loadSong(songs.length - 1);
  closeModal();

  audioFile.value = "";
  coverFile.value = "";
  backgroundFile.value = "";
  titleInput.value = "";
  artistInput.value = "";
  audioName.textContent = "MP3, WAV, OGG, M4A";
  coverName.textContent = "Image shown while the song plays";
  backgroundName.textContent = "Image shown behind the app";
});

/* ---------- letter ---------- */

function openLetter() {
  if (typeof letterDialog.showModal === "function") letterDialog.showModal();
  else window.open("assets/note.jpg", "_blank");
}

$("openLetter").addEventListener("click", openLetter);
$("openLetterBtn").addEventListener("click", openLetter);
$("closeLetter").addEventListener("click", () => letterDialog.close());

letterDialog.addEventListener("click", (event) => {
  if (event.target === letterDialog) letterDialog.close();
});

/* ---------- start-up ---------- */

async function loadLibrary() {
  try {
    const response = await fetch("songs/songs.json", { cache: "no-cache" });
    if (!response.ok) return [];
    const list = await response.json();
    return Array.isArray(list) ? list.filter((item) => item && item.file).map(fromLibrary) : [];
  } catch (error) {
    return [];
  }
}

async function init() {
  renderPlaylist();
  const library = await loadLibrary();

  try {
    const [records, savedBackground] = await Promise.all([
      dbAll(),
      settingGet("background")
    ]);
    songs = [...library, ...records.map(fromRecord)];
    if (savedBackground) setBackground(savedBackground);
  } catch (error) {
    console.error("Storage is unavailable, songs will not be saved.", error);
    songs = library;
  }

  renderPlaylist();
}

init();
