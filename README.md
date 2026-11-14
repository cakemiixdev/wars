# WARS

A browser arena game with a hand-drawn look, 3D and 2D stickman modes, bot matches, and online rooms.

## Play locally

Open `index.html` in a browser. It opens the game in `deepseek_html_20261113_4d8953.html`; keep `bedwars.js`, `bedwars.css`, and the `assets/` folder beside the HTML files.

Music is loaded only when enabled and uses the compressed `assets/music.ogg` soundtrack.

## Controls

- Move: `WASD` or arrow keys
- Attack: `Space`
- Shop: `E`
- Place a flat bridge tile or open the center chest: `F`
- Choose **2D Stickmen** or **3D Island Arena** in the lobby or Gameplay settings
- In the lobby, choose one of three 3D arenas: **Sky Garden**, **Ember Rift**, or **Frostwood Peaks**. Each has a wider main bridge, a larger center for fights, and two side platforms; Frostwood keeps its twin main ice paths. The room host selects the map.
- Run over the glowing rings near your island bridge for a short speed boost
- Your base forge generates 8 tokens per second. Loot the middle chest for 80 tokens and an emerald.
- Collect emeralds from the center generator; buy an Emerald Blade or Bed Plating in the shop.
- Bed Plating absorbs damage before your bed's health is affected. Destroy the enemy bed to win.
- After a bot match, choose **Rematch** for a quick replay with the same arena and bots.
- Open the quick guide: click the `?` button or press `?`

3D fighters are animated stick figures with spherical heads, articulated limbs, and your selected skin colors. Each arena has its own terrain, scenery, connected side routes, and boost pads. Player health is displayed during matches; a knockout triggers a short respawn and brief spawn shield. Matches and token income pause when the game tab is hidden.

Touch devices have a left joystick for camera-relative movement and a separate right joystick for looking around in 3D, plus action buttons. The camera resets when switching camera presets, and the look joystick is hidden in 2D mode.

The gameplay systems and their presentation are kept in `bedwars.js` and `bedwars.css`; the existing HTML remains the game entry point.

## GitHub Pages

In the repository, open **Settings → Pages**, choose **Deploy from a branch**, select `main` and `/(root)`, then save. The root `index.html` is the Pages entry point.
