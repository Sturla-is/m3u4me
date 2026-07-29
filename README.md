<p align="center">
<img src="design/readme_banner.jpg" width="960" height="480">
</p>
<h3 align="center">m3u4me: Self-hosted M3U playlist manager</h3>
<p align="center">
m3u4me is your IPTV playlists' new home. Your streams don't leave your local network, you are in charge, nobody can see or control your playlists.
</p>
<br/>

> [!WARNING]
> m3u4me does NOT provide ANY streams! It is purely a M3U playlist manager. You must bring your own content.

> [!NOTE]
> This app aims to be a self-hosted alternative to https://m3u4u.com/ - as you can see, m3u4me's name is obviously referencing them. The projects are not related in any way. No harm intended!

## AI Disclosure

> [!NOTE]
> This app's code was AI-generated, with minor interventions from me. I am a graphic designer with very limited coding knowledge; I do not support pointless usage of AI and I am fully aware of the harm it can cause. <br/><br/> m3u4me started out as something that was intended only for personal use - I am sharing it only because I believe it is an useful app which might help many other IPTV enthusiasts. <b>It will always be entirely free</b>. <br/><br/> I fully encourage any developer who comes across this app and wants to turn it into something human-made, without AI involvement. </br></br> AI was not used for <b>anything</b> else besides writing the actual code of the app.

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

## Features
- <b>Multiple playlist support:</b> Add as many playlists as you like! You can start from scratch or from an existing playlist.
- <b>Logo editing:</b> Add/edit/remove your channels' logos.
- <b>EPG tvg-id editing:</b> Add/edit/remove your EPG IDs.
- <b>Stream checker</b> (Not recommended): Basic stream checking functionality, not recommended due to some IPTV providers not reacting nicely to any sort of bulk checking. Use at your own risk!
- <b>Bulk actions:</b> Move, delete or check multiple channels at once.
- <b>Late import from M3U:</b> Forgot a source? Import new channels from a M3U file inside of an existing playlist, without overwriting your existing channels & categories.
- <b>Auto-saving:</b> You don't need to remember to save your changes or push your playlist. Everything happens instantly, automatically.
- <b>Undo delete:</b> Deleted a channel by mistake? Hit the "Undo" button which appears on the bottom of your screen and bring it back without a hassle.
- <b>Simple playlist link structure:</b> No more typing huge links on your TV. Playlists get assigned a numerical ID, which means that your download links look like this: http://IP:port/1 for your first playlist, http://IP:port/2 for the second one, and so on.
- <b>Global search:</b> Search for any channel, stream link, or EPG ID across all of your playlists at once.
- <b>Keyboard shortcuts</b>: Delete your channels with `DEL`, select everything with `Cmd+A`, make your work easier overall. Full list of commands is available inside the app.

### Cosmetic UI features:
- <b>Light mode, Dark mode & AMOLED Dark mode</b>
- <b>Custom accent colours</b>
- <b>Channel logo background colour presets</b>: Choose between light gray, white, black or transparency. <i>(Only for previewing. Does not affect the actual logos in the playlist.)</i>
- <b>Hide stream URLs</b>: Useful for sharing screenshots.

### What is not yet supported:
- <b>Xtream Codes API:</b> You can not import channels using a Xtream Codes source.
- <b>Managing EPG sources:</b> You need to gather your EPG IDs separately and then add them in m3u4me.

I plan to implement these features in future versions.

## Installation
> [!NOTE]
> m3u4me has been tested on macOS (Apple Silicon) and Debian, running via PM2 with as little as 512MB of RAM.
### 1. Install Node.js
The official website is pretty straightforward about this: https://nodejs.org/en/download.<br/>After installing, make sure it was installed correctly by running `node -v` and/or `npm -v` in your terminal.
### 2. Install PM2
This keeps your app running 24/7 in the background.
```
npm install -g pm2
```
### 3. Run the app
<b>3a. Clone the source via git:</b>
```
git clone https://github.com/andrei-savin/m3u4me.git
```
<b>3b. Navigate into the folder:</b>
```
cd m3u4me
```
<b>3c. Install the dependencies:</b>
```
npm install
```
m3u4me runs on port 8080 by default. You can change that in `ecosystem.config.cjs`.

<b>3d. Build the app:</b>
```
npm run build
```
<b>3e. Start up PM2:</b>
```
pm2 start ecosystem.config.cjs
```
All done! You can now use m3u4me at http://localhost:8080 [replace `localhost` with the IP of your server, and `8080` with whatever custom port you set up earlier].

### 4. Make m3u4me auto-run at startup (Optional):
```
pm2 startup
pm2 save
```

## Updating
### 1. Navigate into the app's folder
> [!NOTE]
> The folder shown in the command below is only an example.
```
cd /opt/m3u4me
```
### 2. Pull the latest code from this repo
```
git pull
```
> [!NOTE]
> During this step, you might run into the following error:
> `Your local changes to the following files would be overwritten by merge. / package-lock.json / Please commit your changes or stash them before you merge.`
> If so, just run `git restore package-lock.json` and then continue with the following steps.
### 3. Install any new dependencies
```
npm install
```
### 4. Rebuild the app
```
npm run build
```
### 5. Restart the PM2 process
```
pm2 restart ecosystem.config.cjs
```

## Bug reports & feature requests
If you encounter any AI slop, or other sort of error, feel free to create a GitHub issue. I will reply ASAP.
</br>You can also open issues for any feature requests. However, I can not guarantee that they will be accepted.
