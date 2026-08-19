const alias = (id, support = 'alias', reason = '', profile = null) => ({ alias: id, support, reason, ...(profile ? { profile } : {}) })

export const STYLE_CATALOG = {
  cinematic: {
    id: 'cinematic',
    label: 'Cinematic PBR',
    pipeline: 'cinematic',
    surface: 'solid',
    outlines: false
  },
  'rough-ink': {
    id: 'rough-ink',
    label: 'Rough Ink Storyboard',
    pipeline: 'rough-ink',
    surface: 'solid',
    outlines: true
  },
  wireframe: {
    id: 'wireframe',
    label: 'Technical Wireframe',
    pipeline: 'wireframe',
    surface: 'wireframe',
    outlines: false
  },
  'cinematic-outline': {
    id: 'cinematic-outline',
    label: 'Cinematic PBR + Outline',
    pipeline: 'cinematic-outline',
    surface: 'solid',
    outlines: true
  }
}

export const STYLE_ALIASES = {
  rough_ink: alias('rough-ink'),
  storyboard: alias('rough-ink'),
  'wire-frame': alias('wireframe'),
  '3d_cinematic': alias('cinematic'),
  '3d-cinematic': alias('cinematic'),
  cinematic_wireframe: alias('cinematic-outline'),
  'cinematic-wireframe': alias('cinematic-outline'),
  '3d_cinematic_wireframe': alias('cinematic-outline'),
  '3d-cinematic-wireframe': alias('cinematic-outline')
}

export const ACTION_CATALOG = {
  idle: { aliases: ['stand', 'standing'] },
  guard: { aliases: ['fighting-idle'] },
  walk: { aliases: ['walking'] },
  march: { aliases: [] },
  run: { aliases: ['running', 'sprint', 'jog'] },
  stretch: { aliases: [] },
  dance: { aliases: [] },
  'side-step': { aliases: ['sidestep'] },
  'jumping-jacks': { aliases: ['jumping-jack'] },
  crouch: { aliases: ['crouching'] },
  pushup: { aliases: ['push-up', 'pushups'] },
  cooldown: { aliases: ['cool-down'] },
  punch: { aliases: ['jab'] },
  cross: { aliases: ['cross-punch'] },
  hook: { aliases: ['hook-punch'] },
  kick: { aliases: [] },
  'hit-face': { aliases: ['head-hit'] },
  fall: { aliases: ['fall-down'] },
  talk: { aliases: ['speak', 'speaking', 'talking', 'dialogue'] },
  reach: { aliases: ['grab', 'extend-hand'] },
  'look-around': { aliases: ['look', 'looking', 'glance'] }
}

export const ACTION_ALIASES = Object.fromEntries(
  Object.entries(ACTION_CATALOG).flatMap(([id, definition]) => definition.aliases.map(name => [name, alias(id)]))
)

const procedural = (base, overlay) => ({ asset: base, support: 'procedural', overlay })
const approximate = (asset, reason) => ({ asset, support: 'approximate', reason })

export const CHARACTER_CATALOG = {
  'human-mannequin': {
    id: 'human-mannequin',
    url: '/assets/characters/HumanMannequin.glb',
    label: 'Human Mannequin · Mesh2Motion / Quaternius · CC0',
    source: 'Mesh2Motion / Quaternius',
    license: { id: 'CC0-1.0', distribution: 'allowed' },
    proportion: 'human-realistic',
    fidelity: 'motion-prototype',
    profile: { species: 'human', age: 'adult', gender: 'neutral', wardrobe: 'mannequin' },
    rig: { family: 'quaternius-humanoid', restPose: 'asset-native', rootMotion: 'in-place', retargetPolicy: 'offline-calibrated-only' },
    speech: { mode: 'procedural-gesture', visemes: [] },
    authoredBounds: { minY: -0.0003856996, maxY: 1.8291784525 },
    bones: {
      head: 'head',
      upper_arm_l: 'upperarm_l',
      upper_arm_r: 'upperarm_r',
      lower_arm_l: 'lowerarm_l',
      lower_arm_r: 'lowerarm_r',
      hand_l: 'hand_l',
      hand_r: 'hand_r',
      foot_l: 'foot_l',
      foot_r: 'foot_r'
    },
    clips: {
      idle: 'Idle_A',
      guard: 'Fighting Idle',
      walk: 'Walk',
      march: approximate('Walk', 'March reuses the walk cycle'),
      run: 'Sprint',
      stretch: 'Chest_Open',
      dance: 'Dance_Simple',
      'side-step': approximate('Dance Reach Hip', 'Side-step uses the closest lateral dance clip'),
      'jumping-jacks': 'Jumping Jacks',
      crouch: 'Crouch_Idle',
      pushup: 'Pushup',
      cooldown: 'Idle_Subtle',
      punch: 'Punch_Jab',
      cross: 'Punch_Cross',
      hook: 'Melee_Hook',
      kick: approximate('Melee_Hook', 'No retargeted kick asset is bundled'),
      'hit-face': 'Hit_Head',
      fall: 'Death_D',
      talk: procedural('Idle_A', 'talk'),
      reach: approximate('Dance Reach Hip', 'Reach uses a bundled hand-reaching dance motion'),
      'look-around': procedural('Idle_A', 'look-around')
    },
    contacts: {
      punch: {
        impactTimeMs: 292,
        effectorBone: 'hand_l',
        targetBone: 'head',
        responseClip: 'hit-face'
      }
    }
  },
  'game-ready-soldier': {
    id: 'game-ready-soldier',
    url: '/assets/characters/Soldier.glb',
    label: 'Vanguard Soldier · three.js / Mixamo sample',
    source: 'three.js r185 / Mixamo Vanguard sample',
    license: { id: 'upstream-review-required', distribution: 'internal-prototype-only' },
    proportion: 'human-realistic',
    fidelity: 'game-ready',
    profile: { species: 'human', age: 'adult', gender: 'unspecified', wardrobe: 'military' },
    rig: { family: 'mixamo', restPose: 'mixamo-t-pose', rootMotion: 'in-place', retargetPolicy: 'offline-calibrated-only' },
    speech: { mode: 'procedural-gesture', visemes: [] },
    authoredBounds: { minY: 0, maxY: 1.8 },
    clips: {
      idle: 'Idle',
      walk: 'Walk',
      march: approximate('Walk', 'March reuses the walk cycle'),
      run: 'Run',
      talk: procedural('Idle', 'talk'),
      reach: procedural('Idle', 'reach'),
      'look-around': procedural('Idle', 'look-around')
    },
    bones: {
      head: 'mixamorigHead',
      upper_arm_l: 'mixamorigLeftArm',
      upper_arm_r: 'mixamorigRightArm',
      lower_arm_l: 'mixamorigLeftForeArm',
      lower_arm_r: 'mixamorigRightForeArm',
      hand_l: 'mixamorigLeftHand',
      hand_r: 'mixamorigRightHand',
      foot_l: 'mixamorigLeftFoot',
      foot_r: 'mixamorigRightFoot'
    }
  },
  'robot-expressive': {
    id: 'robot-expressive',
    url: '/assets/characters/RobotExpressive.glb',
    label: 'Robot Expressive · CC0',
    source: 'three.js / Quaternius',
    license: { id: 'CC0-1.0', distribution: 'allowed' },
    profile: { species: 'robot', age: 'not-applicable', gender: 'neutral', wardrobe: 'integrated' },
    rig: { family: 'robot-expressive', restPose: 'asset-native', rootMotion: 'mixed', retargetPolicy: 'native-clips-only' },
    speech: { mode: 'procedural-gesture', visemes: [] },
    authoredBounds: { minY: -0.0203044343, maxY: 4.7711189772 },
    bones: {
      head: 'Head',
      upper_arm_l: 'UpperArm.L',
      upper_arm_r: 'UpperArm.R',
      lower_arm_l: 'LowerArm.L',
      lower_arm_r: 'LowerArm.R',
      hand_l: 'Hand.L',
      hand_r: 'Hand.R',
      foot_l: 'Foot.L',
      foot_r: 'Foot.R'
    },
    clips: {
      idle: 'Idle',
      guard: approximate('Idle', 'Robot has no guard animation'),
      walk: 'Walking',
      march: approximate('Walking', 'March reuses the walk cycle'),
      run: 'Running',
      stretch: approximate('Yes', 'Stretch uses the closest expressive upper-body clip'),
      dance: 'Dance',
      'side-step': approximate('Walking', 'Robot has no lateral step animation'),
      'jumping-jacks': approximate('Jump', 'Robot has a jump but no jumping-jacks clip'),
      crouch: approximate('Sitting', 'Crouch uses the sitting pose'),
      cooldown: approximate('Idle', 'Cooldown reuses idle'),
      punch: 'Punch',
      cross: approximate('Punch', 'Cross reuses the punch clip'),
      hook: approximate('Punch', 'Hook reuses the punch clip'),
      kick: approximate('Jump', 'Robot has no kick animation'),
      'hit-face': approximate('No', 'Hit reaction uses the negative head gesture'),
      fall: 'Death',
      talk: procedural('Idle', 'talk'),
      reach: procedural('Idle', 'reach'),
      'look-around': procedural('Idle', 'look-around')
    }
  },
  humanoid: alias('human-mannequin'),
  'humanoid-male': alias('human-mannequin', 'approximate', 'The bundled mannequin has no gendered mesh variant', { species: 'human', age: 'adult', gender: 'male' }),
  'humanoid-female': alias('human-mannequin', 'approximate', 'The bundled mannequin has no gendered mesh variant', { species: 'human', age: 'adult', gender: 'female' }),
  generic_male_business: alias('human-mannequin', 'approximate', 'Business wardrobe asset is not bundled', { species: 'human', age: 'adult', gender: 'male', wardrobe: 'business' }),
  generic_female_business: alias('human-mannequin', 'approximate', 'Business wardrobe and gendered mesh are not bundled', { species: 'human', age: 'adult', gender: 'female', wardrobe: 'business' }),
  generic_female: alias('human-mannequin', 'approximate', 'Gendered mesh is not bundled', { species: 'human', age: 'adult', gender: 'female', wardrobe: 'casual' }),
  generic_young_male: alias('human-mannequin', 'approximate', 'Age and gender variants are not bundled', { species: 'human', age: 'young-adult', gender: 'male', wardrobe: 'casual' }),
  generic_old_male: alias('human-mannequin', 'approximate', 'Age and gender variants are not bundled', { species: 'human', age: 'older-adult', gender: 'male', wardrobe: 'traditional' }),
  generic_teen_male: alias('human-mannequin', 'approximate', 'Age and gender variants are not bundled', { species: 'human', age: 'teen', gender: 'male', wardrobe: 'casual' })
}

const dialogueActions = ['idle', 'walk', 'talk', 'reach', 'look-around']
const humanoidBones = ['head', 'upper_arm_l', 'upper_arm_r', 'lower_arm_l', 'lower_arm_r', 'hand_l', 'hand_r', 'foot_l', 'foot_r']
const standardVisemes = ['sil', 'PP', 'FF', 'TH', 'DD', 'kk', 'CH', 'SS', 'nn', 'RR', 'aa', 'E', 'I', 'O', 'U']

export const ASSET_ENHANCEMENT_TARGETS = {
  'business-male-adult': {
    status: 'missing',
    aliases: ['generic_male_business'],
    profile: { species: 'human', age: 'adult', gender: 'male', wardrobe: 'business' },
    requiredActions: dialogueActions,
    requiredBones: humanoidBones,
    requiredVisemes: standardVisemes
  },
  'business-female-adult': {
    status: 'missing',
    aliases: ['generic_female_business'],
    profile: { species: 'human', age: 'adult', gender: 'female', wardrobe: 'business' },
    requiredActions: dialogueActions,
    requiredBones: humanoidBones,
    requiredVisemes: standardVisemes
  },
  'traditional-male-older-adult': {
    status: 'missing',
    aliases: ['generic_old_male'],
    profile: { species: 'human', age: 'older-adult', gender: 'male', wardrobe: 'traditional' },
    requiredActions: dialogueActions,
    requiredBones: humanoidBones,
    requiredVisemes: standardVisemes
  },
  'casual-male-teen': {
    status: 'missing',
    aliases: ['generic_teen_male'],
    profile: { species: 'human', age: 'teen', gender: 'male', wardrobe: 'casual' },
    requiredActions: dialogueActions,
    requiredBones: humanoidBones,
    requiredVisemes: standardVisemes
  },
  'casual-female-adult': {
    status: 'missing',
    aliases: ['generic_female'],
    profile: { species: 'human', age: 'adult', gender: 'female', wardrobe: 'casual' },
    requiredActions: dialogueActions,
    requiredBones: humanoidBones,
    requiredVisemes: standardVisemes
  }
}

const resolveCatalogName = (name, catalog, aliases = {}) => {
  if (catalog[name] && !catalog[name].alias) return { requested: name, id: name, definition: catalog[name], alias: null }
  const aliasDefinition = aliases[name] ?? catalog[name]
  if (!aliasDefinition?.alias || !catalog[aliasDefinition.alias]) return null
  return {
    requested: name,
    id: aliasDefinition.alias,
    definition: catalog[aliasDefinition.alias],
    alias: aliasDefinition
  }
}

export const resolveStyle = name => resolveCatalogName(name, STYLE_CATALOG, STYLE_ALIASES)
export const resolveAction = name => resolveCatalogName(name, ACTION_CATALOG, ACTION_ALIASES)
export const resolveModel = name => resolveCatalogName(name, CHARACTER_CATALOG)

export const getModelAction = (modelId, actionId) => {
  const model = resolveModel(modelId)
  if (!model) return null
  const mapping = model.definition.clips[actionId]
  if (!mapping) return null
  return typeof mapping === 'string'
    ? { asset: mapping, support: 'exact', overlay: null, reason: '' }
    : { overlay: null, reason: '', ...mapping }
}

export const SUPPORTED_STYLES = new Set(Object.keys(STYLE_CATALOG))
export const SUPPORTED_ACTIONS = new Set(Object.keys(ACTION_CATALOG))
