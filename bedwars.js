(() => {
  const BASE_TOKENS_PER_SECOND = 8;
  const EMERALD_FIRST_SPAWN = 8;
  const EMERALD_RESPAWN = 16;
  const MAX_BED_SHIELD = 120;
  const SHIELD_PER_UPGRADE = 40;
  const state = {
    baseClock: 0,
    emeraldClock: EMERALD_FIRST_SPAWN,
    nextPickupId: 0,
    scene: null,
    generatorMeshes: [],
    pickupMeshes: new Map(),
    shieldMeshes: { blue: null, red: null },
    lastAttackAt: {}
  };

  function getElement(id) {
    return document.getElementById(id);
  }

  function notify(message) {
    let toast = getElement("bedwars-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "bedwars-toast";
      toast.setAttribute("role", "status");
      document.getElementById("game").appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("visible");
    clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 1800);
  }

  function updateHud() {
    if (!gameState || !getElement("hud-tokens")) return;
    getElement("hud-tokens").textContent = Math.floor(gameState.tokens || 0);
    getElement("hud-emeralds").textContent = Math.floor(gameState.emeralds || 0);
    const localPlayer = gameState.players[myPeerId];
    getElement("hud-blocks").textContent = Math.max(0, localPlayer && localPlayer.blocks || 0);
    getElement("own-bed-shield").textContent = Math.max(0, gameState.blueBedShield || 0);
    getElement("enemy-bed-shield").textContent = Math.max(0, gameState.redBedShield || 0);
  }

  function bedAlive(team) {
    return team === "blue" ? gameState.bedHp > 0 : gameState.enemyBedHp > 0;
  }

  function bedSpawn(team) {
    return team === "blue" ? MAP.spawn : MAP.enemy;
  }

  function finishMatch(won) {
    if (isGameOver) return;
    isGameOver = true;
    gameState.result = won ? "win" : "loss";
    presentMatchResult(won);
  }

  function presentMatchResult(won) {
    isGameOver = true;
    const screen = getElement("game-over-screen");
    const rematchButton = getElement("rematch-btn");
    screen.classList.remove("bedwars-win", "bedwars-loss");
    screen.classList.add(won ? "bedwars-win" : "bedwars-loss");
    rematchButton.classList.toggle("hidden", !canRematch());
    getElement("bedwars-trophy").textContent = won ? "🏆" : "🛡️";
    getElement("go-title").textContent = won ? "VICTORY!" : "BED DESTROYED!";
    getElement("go-title").style.color = won ? "#baff6b" : "#ff9288";
    getElement("go-subtitle").textContent = won
      ? "The enemy bed is down. You won the match!"
      : "Your bed was destroyed. Better luck next time!";
    screen.classList.remove("hidden");
  }

  function canRematch() {
    return isHost && Object.values(gameState.players).every(player => player.id === myPeerId || player.isBot);
  }

  function rematchMatch() {
    if (!canRematch()) return;
    stopGameEngine();
    loadScene("game", true);
  }

  function checkGameOver() {
    if (gameState.enemyBedHp <= 0) finishMatch(true);
    else if (gameState.bedHp <= 0) finishMatch(false);
  }

  function resetMatch() {
    if (tokenIntervalId) {
      clearInterval(tokenIntervalId);
      tokenIntervalId = null;
    }
    gameState.tokens = 50;
    gameState.emeralds = 0;
    gameState.blueBedShield = 0;
    gameState.redBedShield = 0;
    gameState.pickups = [];
    gameState.result = null;
    gameState.bedHp = 100;
    gameState.enemyBedHp = 100;
    gameState.chests[0].opened = false;
    state.baseClock = 0;
    state.emeraldClock = EMERALD_FIRST_SPAWN;
    state.lastAttackAt = {};
    for (const id in gameState.players) {
      const player = gameState.players[id];
      player.id = id;
      player.team = player.isBot ? "red" : "blue";
      player.eliminated = false;
      player.hasEmeraldBlade = false;
    }
    getElement("game-over-screen").classList.remove("bedwars-win", "bedwars-loss");
    updateHud();
    refreshWorldVisuals();
  }

  function addPickup(kind, x, z, amount) {
    gameState.pickups.push({
      id: `drop-${++state.nextPickupId}`,
      kind,
      x,
      z,
      amount
    });
  }

  function update(dt) {
    if (isHost && !isGameOver) {
      state.baseClock += dt;
      if (state.baseClock >= 1) {
        const ticks = Math.floor(state.baseClock);
        state.baseClock -= ticks;
        gameState.tokens += ticks * BASE_TOKENS_PER_SECOND;
      }

      state.emeraldClock -= dt;
      if (state.emeraldClock <= 0) {
        if (!gameState.pickups.some(pickup => pickup.kind === "emerald")) {
          addPickup("emerald", MAP.mid.x, MAP.mid.z, 1);
        }
        state.emeraldClock = EMERALD_RESPAWN;
      }

      collectPickups();
    }

    updateHud();
    refreshWorldVisuals();
    if (gameState.result && !isGameOver) presentMatchResult(gameState.result === "win");
  }

  function collectPickups() {
    const remaining = [];
    for (const pickup of gameState.pickups) {
      let collected = false;
      for (const id in gameState.players) {
        const player = gameState.players[id];
        if (player.isBot || player.eliminated || player.hp <= 0) continue;
        if (Math.hypot(player.x - pickup.x, player.z - pickup.z) > 1.5) continue;
        if (pickup.kind === "emerald") {
          gameState.emeralds = (gameState.emeralds || 0) + pickup.amount;
          if (id === myPeerId) notify(`+${pickup.amount} emerald`);
        } else {
          gameState.tokens += pickup.amount;
          if (id === myPeerId) notify(`+${pickup.amount} tokens`);
        }
        collected = true;
        break;
      }
      if (!collected) remaining.push(pickup);
    }
    gameState.pickups = remaining;
  }

  function openChest(playerId) {
    const player = gameState.players[playerId];
    if (!player || Math.hypot(player.x - MAP.mid.x, player.z - MAP.mid.z) > 3) return false;
    if (!isHost) {
      sendAction("openChest");
      return true;
    }
    if (!gameState.chests[0].opened) {
      gameState.chests[0].opened = true;
      gameState.tokens += 80;
      gameState.emeralds = (gameState.emeralds || 0) + 1;
      if (chestMesh) chestMesh.visible = false;
      updateHud();
      notify("Chest looted: +80 tokens, +1 emerald");
    }
    return true;
  }

  function damageBed(team, damage) {
    if (!isHost || !bedAlive(team)) return;
    const shieldKey = team === "blue" ? "blueBedShield" : "redBedShield";
    const hpKey = team === "blue" ? "bedHp" : "enemyBedHp";
    const shield = Math.max(0, gameState[shieldKey] || 0);
    const absorbed = Math.min(shield, damage);
    gameState[shieldKey] = shield - absorbed;
    const overflow = damage - absorbed;
    if (overflow > 0) gameState[hpKey] = Math.max(0, gameState[hpKey] - overflow);
    getElement(team === "blue" ? "own-bed-hp" : "enemy-bed-hp").textContent = gameState[hpKey];
    updateHud();
    refreshWorldVisuals();
    checkGameOver();
  }

  function damagePlayer(attacker, target, damage) {
    if (!isHost || !target || target.eliminated || target.hp <= 0 || target.invulnerabilityTimer > 0) return;
    target.hp = Math.max(0, target.hp - damage);
    if (target.hp === 0) {
      if (bedAlive(target.team)) {
        const spawn = bedSpawn(target.team);
        target.x = spawn.x;
        target.z = spawn.z;
        if (target.isBot) {
          target.hp = MAX_PLAYER_HP;
          target.respawnTimer = 0;
          target.invulnerabilityTimer = 1.5;
        } else {
          target.respawnTimer = 2.25;
        }
      } else {
        target.eliminated = true;
      }
    }
    if (attacker && target.id === myPeerId) updatePlayerHud(target);
  }

  function attackFromPlayer(playerId) {
    if (!isHost) {
      sendAction("attack");
      return;
    }
    const attacker = gameState.players[playerId];
    if (!attacker || attacker.eliminated || attacker.respawnTimer > 0) return;
    const now = performance.now();
    if (now - (state.lastAttackAt[playerId] || 0) < 220) return;
    state.lastAttackAt[playerId] = now;
    const damage = attacker.hasEmeraldBlade ? 40 : attacker.hasAxe ? 35 : attacker.hasSword ? 20 : 10;
    const reach = attacker.hasAxe ? 4.2 : attacker.hasSword || attacker.hasEmeraldBlade ? 3.6 : 3.3;
    let nearest = null;
    let nearestDistance = reach;
    for (const id in gameState.players) {
      const target = gameState.players[id];
      if (id === playerId || target.team === attacker.team || target.eliminated || target.hp <= 0) continue;
      const distance = Math.hypot(attacker.x - target.x, attacker.z - target.z);
      if (distance < nearestDistance) {
        nearest = target;
        nearestDistance = distance;
      }
    }
    if (nearest) {
      damagePlayer(attacker, nearest, damage);
      return;
    }

    const targetTeam = attacker.team === "blue" ? "red" : "blue";
    const targetBed = targetTeam === "blue"
      ? { x: MAP.spawn.x + 5.5, z: MAP.spawn.z }
      : { x: MAP.enemy.x - 5.5, z: MAP.enemy.z };
    if (Math.hypot(attacker.x - targetBed.x, attacker.z - targetBed.z) < 3) {
      damageBed(targetTeam, damage);
    }
  }

  function purchase(playerId, item) {
    const player = gameState.players[playerId];
    if (!player || player.isBot || player.eliminated || isGameOver) return false;
    if (item === "sword" && !player.hasSword && gameState.tokens >= 120) {
      gameState.tokens -= 120;
      player.hasSword = true;
    } else if (item === "axe" && !player.hasAxe && gameState.tokens >= 250) {
      gameState.tokens -= 250;
      player.hasAxe = true;
    } else if (item === "wood" && gameState.tokens >= 25) {
      gameState.tokens -= 25;
      player.blocks = (player.blocks || 0) + 5;
    } else if (item === "emeraldBlade" && !player.hasEmeraldBlade && gameState.emeralds >= 4) {
      gameState.emeralds -= 4;
      player.hasEmeraldBlade = true;
      player.hasSword = true;
    } else if (item === "bedArmor") {
      const shieldKey = player.team === "red" ? "redBedShield" : "blueBedShield";
      if (gameState.emeralds < 2 || gameState[shieldKey] >= MAX_BED_SHIELD) return false;
      gameState.emeralds -= 2;
      gameState[shieldKey] = Math.min(MAX_BED_SHIELD, gameState[shieldKey] + SHIELD_PER_UPGRADE);
    } else {
      return false;
    }
    updateHud();
    refreshWorldVisuals();
    return true;
  }

  function requestPurchase(item) {
    if (isHost) {
      if (purchase(myPeerId, item)) {
        toggleShop(false);
        notify("Upgrade purchased!");
      } else {
        notify("Not enough resources or already owned");
      }
      return;
    }
    if (sendAction("purchase", { item })) {
      toggleShop(false);
      notify("Purchase sent to host");
    } else {
      notify("Could not reach the host");
    }
  }

  function sendAction(action, data = {}) {
    const connection = connections[hostId];
    if (!connection) return false;
    try {
      connection.send({ type: "bedwarsAction", action, playerId: myPeerId, ...data });
      return true;
    } catch (error) {
      console.error("Failed to send Bed Wars action:", error);
      return false;
    }
  }

  function handleAction(connection, data) {
    if (!isHost || !data || data.playerId !== connection.peer) return;
    let success = true;
    if (data.action === "attack") attackFromPlayer(connection.peer);
    else if (data.action === "openChest") success = openChest(connection.peer);
    else if (data.action === "purchase") success = purchase(connection.peer, data.item);
    else return;
    try {
      connection.send({ type: "bedwarsActionResult", action: data.action, success });
    } catch (error) {
      console.error("Failed to send Bed Wars action result:", error);
    }
  }

  function applyHostState(data) {
    if (!data || isHost) return;
    gameState.tokens = Number.isFinite(data.tokens) ? data.tokens : gameState.tokens;
    gameState.emeralds = Number.isFinite(data.emeralds) ? data.emeralds : 0;
    gameState.blueBedShield = Number.isFinite(data.blueBedShield) ? data.blueBedShield : 0;
    gameState.redBedShield = Number.isFinite(data.redBedShield) ? data.redBedShield : 0;
    gameState.pickups = Array.isArray(data.pickups) ? data.pickups : [];
    if (Array.isArray(data.chests)) gameState.chests = data.chests;
    getElement("own-bed-hp").textContent = gameState.bedHp;
    getElement("enemy-bed-hp").textContent = gameState.enemyBedHp;
    if (chestMesh && gameState.chests[0]) chestMesh.visible = !gameState.chests[0].opened;
    if (data.result === "win" || data.result === "loss") gameState.result = data.result;
    updateHud();
    refreshWorldVisuals();
  }

  function makeGenerator(x, z, color, isEmerald) {
    const group = new THREE.Group();
    const baseMaterial = new THREE.MeshStandardMaterial({ color: 0x24313b, roughness: 0.8 });
    const glowMaterial = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: isEmerald ? 0.55 : 0.2,
      roughness: 0.35,
      metalness: 0.12
    });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.5, 0.16, 12), baseMaterial);
    base.position.y = 0.08;
    group.add(base);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.08, 0.07, 6, 24), glowMaterial);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.17;
    group.add(ring);
    const core = new THREE.Mesh(
      isEmerald ? new THREE.OctahedronGeometry(0.34) : new THREE.BoxGeometry(0.38, 0.38, 0.38),
      glowMaterial
    );
    core.position.y = 0.52;
    group.add(core);
    group.position.set(x, 0.5, z);
    group.userData.core = core;
    scene.add(group);
    state.generatorMeshes.push(group);
  }

  function createPickupMesh(pickup) {
    const emerald = pickup.kind === "emerald";
    const material = new THREE.MeshStandardMaterial({
      color: emerald ? 0x55ffd0 : 0xffc34d,
      emissive: emerald ? 0x15bb8c : 0xb85b0a,
      emissiveIntensity: 0.7,
      roughness: 0.25,
      metalness: 0.2
    });
    const mesh = new THREE.Mesh(
      emerald ? new THREE.OctahedronGeometry(0.46) : new THREE.BoxGeometry(0.42, 0.42, 0.42),
      material
    );
    mesh.position.set(pickup.x, 1.2, pickup.z);
    mesh.userData.pickupId = pickup.id;
    scene.add(mesh);
    state.pickupMeshes.set(pickup.id, mesh);
  }

  function updateShieldVisual(team, shield) {
    const existing = state.shieldMeshes[team];
    if (!scene || shield <= 0) {
      if (existing && existing.parent) existing.parent.remove(existing);
      state.shieldMeshes[team] = null;
      return;
    }
    if (existing) {
      existing.material.opacity = 0.12 + 0.18 * Math.min(1, shield / MAX_BED_SHIELD);
      return;
    }
    const material = new THREE.MeshBasicMaterial({
      color: team === "blue" ? 0x65d9ff : 0xff7c68,
      wireframe: true,
      transparent: true,
      opacity: 0.3,
      depthWrite: false
    });
    const shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(2.15, 12, 8), material);
    const bed = team === "blue"
      ? { x: MAP.spawn.x + 5.5, z: MAP.spawn.z }
      : { x: MAP.enemy.x - 5.5, z: MAP.enemy.z };
    shieldMesh.position.set(bed.x, 1.5, bed.z);
    scene.add(shieldMesh);
    state.shieldMeshes[team] = shieldMesh;
  }

  function refreshWorldVisuals() {
    if (!scene || !THREE) return;
    if (state.scene !== scene) {
      state.scene = scene;
      state.generatorMeshes = [];
      state.pickupMeshes.clear();
      state.shieldMeshes = { blue: null, red: null };
      makeGenerator(MAP.spawn.x, MAP.spawn.z, 0x53c7ff, false);
      makeGenerator(MAP.enemy.x, MAP.enemy.z, 0xff715d, false);
      makeGenerator(MAP.mid.x, MAP.mid.z, 0x55ffd0, true);
    }
    const pickups = new Set(gameState.pickups.map(pickup => pickup.id));
    for (const [id, mesh] of state.pickupMeshes) {
      if (!pickups.has(id)) {
        if (mesh.parent) mesh.parent.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
        state.pickupMeshes.delete(id);
      }
    }
    for (const pickup of gameState.pickups) {
      if (!state.pickupMeshes.has(pickup.id)) createPickupMesh(pickup);
    }
    updateShieldVisual("blue", gameState.blueBedShield || 0);
    updateShieldVisual("red", gameState.redBedShield || 0);
  }

  function animateWorldVisuals(dt) {
    if (!scene) return;
    const time = performance.now() / 1000;
    for (const generator of state.generatorMeshes) {
      generator.userData.core.rotation.y += dt * 0.8;
      generator.userData.core.position.y = 0.9 + Math.sin(time * 2) * 0.08;
    }
    for (const mesh of state.pickupMeshes.values()) {
      mesh.rotation.y += dt * 1.8;
      mesh.position.y = 1.2 + Math.sin(time * 3 + mesh.position.x) * 0.16;
    }
  }

  function draw2D() {
    if (!ctx2d || !canvas2d) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const worldWidth = MAP.enemy.x - MAP.spawn.x + MAP.islandRadius * 2 + 4;
    const bridgeDepth = MAP.bridges.reduce((depth, bridge) => Math.max(depth, Math.abs(bridge.z) + bridge.width / 2), 0);
    const worldDepth = Math.max(MAP.islandRadius * 2 + 4, bridgeDepth * 2 + 6, 24);
    const scale = Math.min((width - 56) / worldWidth, (height - 180) / worldDepth);
    const centerX = width / 2;
    const centerY = height / 2;
    const point = (x, z) => ({ x: centerX + x * scale, y: centerY + z * scale });

    for (const [x, z, color] of [
      [MAP.spawn.x, MAP.spawn.z, "#53c7ff"],
      [MAP.enemy.x, MAP.enemy.z, "#ff715d"],
      [MAP.mid.x, MAP.mid.z, "#55ffd0"]
    ]) {
      const p = point(x, z);
      ctx2d.beginPath();
      ctx2d.arc(p.x, p.y, Math.max(4, scale * 0.46), 0, Math.PI * 2);
      ctx2d.fillStyle = color;
      ctx2d.fill();
      ctx2d.strokeStyle = "#17313b";
      ctx2d.lineWidth = Math.max(1.5, scale * 0.1);
      ctx2d.stroke();
    }

    for (const pickup of gameState.pickups) {
      const p = point(pickup.x, pickup.z);
      const size = Math.max(4, scale * 0.42);
      ctx2d.save();
      ctx2d.translate(p.x, p.y);
      ctx2d.rotate(Math.PI / 4);
      ctx2d.fillStyle = pickup.kind === "emerald" ? "#55ffd0" : "#ffc34d";
      ctx2d.fillRect(-size / 2, -size / 2, size, size);
      ctx2d.strokeStyle = "#17313b";
      ctx2d.lineWidth = Math.max(1, size * 0.12);
      ctx2d.strokeRect(-size / 2, -size / 2, size, size);
      ctx2d.restore();
    }
  }

  const originalStartGameEngine = startGameEngine;
  startGameEngine = function() {
    originalStartGameEngine();
    resetMatch();
  };

  const originalInitThreeJS = initThreeJS;
  initThreeJS = function() {
    originalInitThreeJS();
    refreshWorldVisuals();
  };

  const originalRender3D = render3D;
  render3D = function(dt) {
    originalRender3D(dt);
    refreshWorldVisuals();
    animateWorldVisuals(dt);
    syncPlayerWeapons();
  };

  const originalRender2D = render2D;
  render2D = function(time) {
    originalRender2D(time);
    draw2D();
  };

  function syncPlayerWeapons() {
    for (const id in playerMeshes) {
      const player = gameState.players[id];
      const mesh = playerMeshes[id];
      if (!player || !mesh) continue;
      const sword = mesh.userData.sword;
      const axe = mesh.userData.axe;
      if (sword) {
        sword.visible = !!(player.hasSword || player.hasEmeraldBlade);
        for (const part of sword.children) {
          if (part.material && part.material.color) {
            part.material.color.setHex(player.hasEmeraldBlade ? 0x54f5bf : 0xd9e4ed);
            if (part.material.emissive) part.material.emissive.setHex(player.hasEmeraldBlade ? 0x145b49 : 0x000000);
          }
        }
      }
      if (axe) axe.visible = !!player.hasAxe;
    }
  }

  const originalHandleConnection = handleConnection;
  handleConnection = function(connection) {
    originalHandleConnection(connection);
    connection.on("data", data => {
      if (!data || typeof data !== "object") return;
      if (data.type === "bedwarsAction" && isHost) handleAction(connection, data);
      if (data.type === "bedwarsActionResult" && !isHost) {
        notify(data.success ? "Upgrade ready!" : "Not enough resources or already owned");
      }
      if (data.type === "gameState" && !isHost) applyHostState(data);
    });
  };

  checkGameOver3D = checkGameOver;
  buySword = () => requestPurchase("sword");
  buyAxe = () => requestPurchase("axe");
  buyWood = () => requestPurchase("wood");
  window.buyEmeraldBlade = () => requestPurchase("emeraldBlade");
  window.buyBedArmor = () => requestPurchase("bedArmor");
  window.rematchMatch = rematchMatch;

  window.WarsBedWars = {
    update,
    draw2D,
    attackFromPlayer,
    damageBed,
    damagePlayer,
    openChest,
    requestAttack: attackFromPlayer,
    interactWithChest: openChest,
    syncHud: updateHud
  };

  updateHud();
})();
