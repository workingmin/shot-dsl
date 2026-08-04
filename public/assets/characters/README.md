# Character assets

## HumanMannequin.glb

- Source: Mesh2Motion `human-base-animations.glb` and `human-addon-animations.glb`
- Original models and animations: Quaternius
- License: CC0 1.0
- Upstream: https://github.com/Mesh2Motion/mesh2motion-app/tree/64c39b975b3d1ce1d367062bf52290d247afa0b5/static/animations
- Upstream SHA-256: `406eb0a8dc4ab366e623b79b6e3005a4951392e1bda78ae39c1099d31147733c`
- Addon SHA-256: `a0d64d555e0d492026b72d58bf8e16c5e86779295f9093e376dcc001915c2c95`
- Local SHA-256: `708de47790222029bb83c54c06b8573bb0eab0a95cf75139ea56542643000648`
- Local modification: retained `Idle_A`, `Walk`, `Sprint`, `Punch_Jab`, `Punch_Cross`, `Melee_Hook`, `Hit_Head`, and `Death_D`, then retargeted `Fighting Idle` onto the identical humanoid skeleton with glTF-Transform 4.4.2.

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
