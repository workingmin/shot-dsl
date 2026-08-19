# Character assets

Runtime capability metadata lives in `src/shotdsl/catalog.js`. Run
`npm run assets:audit` after changing a GLB or catalog entry; the audit checks
animation names, semantic bones, morph targets, licensing metadata, and the
machine-readable enhancement targets documented in
`docs/asset-data-enhancement.md`.

## Soldier.glb

- Source: three.js r185 `examples/models/gltf/Soldier.glb`
- Original sample attribution: Mixamo / Vanguard character
- Upstream: https://github.com/mrdoob/three.js/blob/r185/examples/models/gltf/Soldier.glb
- Local SHA-256: `dfb230fc1f942f259dd00281a1186953ad602fc5d69067ce63e24b2aa439736b`
- Included clips: `Idle`, `Walk`, `Run`, `TPose`

This textured, skinned character is the game-ready visual target used by the
cinematic pursuit demo. It is vendored for the internal prototype from the
official three.js animation example. Its upstream asset rights must be reviewed
before any external or commercial distribution; it must not silently become a
production asset.

## HumanMannequin.glb

- Source: Mesh2Motion `human-base-animations.glb` and `human-addon-animations.glb`
- Original models and animations: Quaternius
- License: CC0 1.0
- Upstream: https://github.com/Mesh2Motion/mesh2motion-app/tree/64c39b975b3d1ce1d367062bf52290d247afa0b5/static/animations
- Upstream SHA-256: `406eb0a8dc4ab366e623b79b6e3005a4951392e1bda78ae39c1099d31147733c`
- Addon SHA-256: `a0d64d555e0d492026b72d58bf8e16c5e86779295f9093e376dcc001915c2c95`
- Local SHA-256: `fdcd24b5006f04dcbbf4e974f2d7257d04fa122261ac0b14990c3625f1a63ff1`
- Local modification: retained the original movement/combat clips, then retargeted `Fighting Idle`, `Chest_Open`, `Dance_Simple`, `Crouch_Idle`, `Jumping Jacks`, `Dance Reach Hip`, `Pushup`, and `Idle_Subtle` onto the identical humanoid skeleton with glTF-Transform 4.4.2.

This is the default prototype character. It provides human proportions, a
standard humanoid skeleton, and deterministic local animation loading.

## RobotExpressive.glb

- Source: three.js r185 example assets
- Original model: Tomás Laulhé / Quaternius
- Modifications: Don McCurdy
- License: CC0 1.0
- Upstream: https://github.com/mrdoob/three.js/tree/r185/examples/models/gltf/RobotExpressive
- SHA-256: `047f5e5fb3bb6d378bd1df16ca6137f2a596c99b3a1b5690b4020c05aaf6f319`

The model remains vendored only as a stylized alternate/development asset.
