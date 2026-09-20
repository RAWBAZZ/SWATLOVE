# SWATLOVE — Personal Jukebox

A private music player for songs, photos and a handwritten note. Runs entirely in the browser: no server, no build step.

## Files

```
index.html
style.css
script.js
assets/
  swat.jpg   (cover art / record centre)
  note.jpg   (the handwritten letter)
```

## Features

- Add songs with optional artwork and a background photo
- Songs are saved in the browser (IndexedDB), so they are still there after a refresh
- Play, pause, seek, volume, next, previous, shuffle, favourite
- Lock-screen and headphone controls on phones
- The handwritten letter opens full size from the "The letter" section

## Deploy on Vercel

1. Push these files to the root of your GitHub repo (branch `main`).
2. In Vercel: **Add New → Project**, import the repo.
3. Framework Preset: **Other**. Leave Build Command and Output Directory empty. Deploy.

Every push to `main` redeploys automatically.

## Note on privacy

Songs and photos you add are stored only in the visitor's own browser. They are not uploaded anywhere, so a song added on your phone will not appear on another device. The two images in `assets/` are public if the repo is public.
