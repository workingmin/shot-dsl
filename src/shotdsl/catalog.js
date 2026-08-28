const alias = (id, support = 'alias', reason = '') => ({ alias: id, support, reason })

export const STYLE_CATALOG = {
  storyboard: {
    id: 'storyboard',
    label: 'Black-and-white 3D Storyboard',
    pipeline: 'storyboard',
    surface: 'matte-white',
    outlines: true
  }
}

export const STYLE_ALIASES = {
  'rough-ink': alias('storyboard', 'alias', 'Rough ink is now the single storyboard render pipeline'),
  rough_ink: alias('storyboard', 'alias', 'Rough ink is now the single storyboard render pipeline')
}

export const ACTION_CATALOG = {
  idle: { aliases: ['stand', 'standing'] },
  walk: { aliases: ['walking'] },
  run: { aliases: ['running', 'sprint', 'jog'] },
  crouch: { aliases: ['crouching'] },
  talk: { aliases: ['speak', 'speaking', 'talking', 'dialogue'] },
  reach: { aliases: ['grab', 'extend-hand'] },
  'look-around': { aliases: ['look', 'looking', 'glance'] },
  fall: { aliases: ['fall-down'] }
}

export const ACTION_ALIASES = Object.fromEntries(
  Object.entries(ACTION_CATALOG).flatMap(([id, definition]) => definition.aliases.map(name => [name, alias(id)]))
)

const procedural = (base, overlay) => ({ asset: base, support: 'procedural', overlay })

export const CHARACTER_CATALOG = {
  'storyboard-mannequin': {
    id: 'storyboard-mannequin',
    url: '/assets/characters/HumanMannequin.glb',
    label: 'Neutral Storyboard Mannequin',
    source: 'Mesh2Motion / Quaternius',
    license: { id: 'CC0-1.0', distribution: 'allowed' },
    proportion: 'human-neutral',
    fidelity: 'storyboard-proxy',
    rig: { family: 'quaternius-humanoid', restPose: 'asset-native', rootMotion: 'in-place' },
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
      walk: 'Walk',
      run: 'Sprint',
      crouch: 'Crouch_Idle',
      talk: procedural('Idle_A', 'talk'),
      reach: procedural('Idle_A', 'reach'),
      'look-around': procedural('Idle_A', 'look-around'),
      fall: 'Death_D'
    }
  },
  'human-mannequin': alias('storyboard-mannequin', 'alias', 'The neutral mannequin is now identified by its storyboard role'),
  humanoid: alias('storyboard-mannequin')
}

const resolveCatalogName = (name, catalog, aliases = {}) => {
  const direct = catalog[name]
  if (direct && !direct.alias) return { id: name, definition: direct, alias: null }
  const aliasDefinition = direct?.alias ? direct : aliases[name]
  if (!aliasDefinition) return null
  const definition = catalog[aliasDefinition.alias]
  if (!definition || definition.alias) return null
  return { id: aliasDefinition.alias, definition, alias: aliasDefinition }
}

export const resolveStyle = name => resolveCatalogName(name, STYLE_CATALOG, STYLE_ALIASES)
export const resolveAction = name => resolveCatalogName(name, ACTION_CATALOG, ACTION_ALIASES)
export const resolveModel = name => resolveCatalogName(name, CHARACTER_CATALOG)

export const getModelAction = (modelId, actionId) => {
  const model = resolveModel(modelId)?.definition
  const action = model?.clips?.[actionId]
  if (!action) return null
  if (typeof action === 'string') return { asset: action, support: 'exact' }
  return action
}

export const SUPPORTED_STYLES = new Set(Object.keys(STYLE_CATALOG))
export const SUPPORTED_ACTIONS = new Set(Object.keys(ACTION_CATALOG))
