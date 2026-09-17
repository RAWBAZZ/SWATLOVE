const audio = document.getElementById("audio");
const play = document.getElementById("play");
const startButton = document.getElementById("startButton");
const previous = document.getElementById("previous");
const next = document.getElementById("next");
const shuffle = document.getElementById("shuffleButton");
const progress = document.getElementById("progress");
const volume = document.getElementById("volume");
const currentTime = document.getElementById("currentTime");
const totalTime = document.getElementById("totalTime");
const songTitle = document.getElementById("songTitle");
const artistName = document.getElementById("artistName");
const coverImage = document.getElementById("coverImage");
const playlist = document.getElementById("playlist");
const trackCount = document.getElementById("trackCount");
const playerCard = document.querySelector(".player-card");
const background = document.querySelector(".background");

const modal = document.getElementById("uploadModal");
const openUpload = document.getElementById("openUpload");
const closeUpload = document.getElementById("closeUpload");
const addSong = document.getElementById("addSong");

const audioFile = document.getElementById("audioFile");
const coverFile = document.getElementById("coverFile");
const backgroundFile = document.getElementById("backgroundFile");
const audioName = document.getElementById("audioName");
const titleInput = document.getElementById("titleInput");
const artistInput = document.getElementById("artistInput");

let songs = [];
let currentIndex = -1;

audio.volume = 0.8;

function timeFormat(value) {
  if (!value || Number.isNaN(value)) return "0:00";

  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60)
    .toString()
    .padStart(2, "0");

  return `${minutes}:${seconds}`;
}

function renderPlaylist() {
  trackCount.textContent = `${songs.length} ${
    songs.length === 1 ? "track" : "tracks"
  }`;

  if (!songs.length) {
    playlist.innerHTML = `
      <div class="empty">
        <div>♫</div>
        <p>Your playlist is empty</p>
        <span>Upload music to start your collection.</span>
      </div>
    `;
    return;
  }

  playlist.innerHTML = songs
    .map(
      (song, index) => `
        <div class="song ${index === currentIndex ? "active" : ""}"
             data-index="${index}">
          <img src="${song.cover}" alt="${song.title}" />
          <div class="song-info">
            <strong>${song.title}</strong>
            <span>${song.artist}</span>
          </div>
          <button class="delete" data-delete="${index}">×</button>
        </div>
      `
    )
    .join("");

  document.querySelectorAll(".song").forEach((item) => {
    item.addEventListener("click", (event) => {
      if (event.target.dataset.delete !== undefined) return;

      loadSong(Number(item.dataset.index));
      audio.play();
    });
  });

  document.querySelectorAll(".delete").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();

      const index = Number(button.dataset.delete);
      songs.splice(index, 1);

      if (index === currentIndex) {
        audio.pause();
        currentIndex = -1;
        songTitle.textContent = "Nothing playing";
        artistName.textContent = "Add a song to begin";
      } else if (index < currentIndex) {
        currentIndex--;
      }

      renderPlaylist();
    });
  });
}

function loadSong(index) {
  if (!songs[index]) return;

  currentIndex = index;
  const song = songs[index];

  audio.src = song.audio;
  songTitle.textContent = song.title;
  artistName.textContent = song.artist;
  coverImage.src = song.cover;

  renderPlaylist();
}

function startPlaying() {
  if (!songs.length) {
    modal.classList.add("open");
    return;
  }

  if (currentIndex === -1) loadSong(0);
  audio.play();
}

function nextSong() {
  if (!songs.length) return;

  const index = currentIndex >= songs.length - 1 ? 0 : currentIndex + 1;
  loadSong(index);
  audio.play();
}

function previousSong() {
  if (!songs.length) return;

  const index = currentIndex <= 0 ? songs.length - 1 : currentIndex - 1;
  loadSong(index);
  audio.play();
}

play.addEventListener("click", () => {
  audio.paused ? startPlaying() : audio.pause();
});

startButton.addEventListener("click", () => {
  audio.paused ? startPlaying() : audio.pause();
});

next.addEventListener("click", nextSong);
previous.addEventListener("click", previousSong);

shuffle.addEventListener("click", () => {
  if (!songs.length) {
    modal.classList.add("open");
    return;
  }

  const randomIndex = Math.floor(Math.random() * songs.length);
  loadSong(randomIndex);
  audio.play();
});

audio.addEventListener("play", () => {
  play.textContent = "Ⅱ";
  playerCard.classList.add("playing");
});

audio.addEventListener("pause", () => {
  play.textContent = "▶";
  playerCard.classList.remove("playing");
});

audio.addEventListener("ended", nextSong);

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
  audio.volume = volume.value;
});

openUpload.addEventListener("click", () => {
  modal.classList.add("open");
});

closeUpload.addEventListener("click", () => {
  modal.classList.remove("open");
});

modal.addEventListener("click", (event) => {
  if (event.target === modal) {
    modal.classList.remove("open");
  }
});

audioFile.addEventListener("change", () => {
  if (audioFile.files[0]) {
    audioName.textContent = audioFile.files[0].name;
  }
});

addSong.addEventListener("click", () => {
  const audioData = audioFile.files[0];
  const coverData = coverFile.files[0];
  const backgroundData = backgroundFile.files[0];

  if (!audioData) {
    alert("Please choose an audio file.");
    return;
  }

  const defaultCover =
    "https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?auto=format&fit=crop&w=900&q=85";

  const newSong = {
    title:
      titleInput.value.trim() ||
      audioData.name.replace(/\.[^/.]+$/, ""),
    artist: artistInput.value.trim() || "SWATLOVE Collection",
    audio: URL.createObjectURL(audioData),
    cover: coverData ? URL.createObjectURL(coverData) : defaultCover
  };

  songs.push(newSong);

  if (backgroundData) {
    background.style.backgroundImage =
      `url("${URL.createObjectURL(backgroundData)}")`;
    background.style.opacity = "1";
  }

  renderPlaylist();
  loadSong(songs.length - 1);

  modal.classList.remove("open");

  audioFile.value = "";
  coverFile.value = "";
  backgroundFile.value = "";
  titleInput.value = "";
  artistInput.value = "";
  audioName.textContent = "MP3, WAV, OGG, M4A";
});
