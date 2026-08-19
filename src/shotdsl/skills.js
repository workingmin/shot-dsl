const reviewOutput = (role, mediaType = 'diagnostics') => ({
  role,
  mediaType,
  requiresApproval: false
})

const patchOutput = role => ({
  role,
  mediaType: 'shotdsl-patch',
  requiresApproval: true
})

export const PROFESSIONAL_SKILL_SCHEMA_VERSION = 'professional-skill.v1'

// This catalog describes orchestration contracts, not model implementations.
// Keeping it beside the compiler lets an agent, CLI, or future visual workflow
// use the same input/output and permission boundary.
export const PROFESSIONAL_SKILL_CATALOG = {
  'previs.asset-supervisor': {
    id: 'previs.asset-supervisor',
    label: 'Asset supervisor',
    provider: 'compiler',
    stage: 'preflight',
    description: 'Checks model, rig, action, bone and approximation support before creative planning.',
    modes: ['review'],
    scopes: ['scene', 'actor'],
    capabilities: { readScene: true, readCatalog: true, proposePatch: false, applyPatch: false, network: false },
    inputs: ['scene-ir', 'character-catalog', 'action-catalog'],
    outputs: [reviewOutput('asset-fit-report')]
  },
  'previs.blocking-director': {
    id: 'previs.blocking-director',
    label: 'Blocking director',
    provider: 'agent',
    stage: 'staging',
    description: 'Proposes actor and prop positions, facing and movement keys from a dramatic beat.',
    modes: ['propose'],
    scopes: ['scene', 'beat'],
    capabilities: { readScene: true, readCatalog: true, proposePatch: true, applyPatch: false, network: false },
    inputs: ['scene-ir', 'beat-brief', 'asset-fit-report'],
    outputs: [patchOutput('blocking-patch')]
  },
  'previs.action-choreographer': {
    id: 'previs.action-choreographer',
    label: 'Action choreographer',
    provider: 'agent',
    stage: 'performance',
    description: 'Proposes playable action, gaze and contact timing without inventing unsupported clips.',
    modes: ['propose'],
    scopes: ['scene', 'timeline', 'beat', 'actor'],
    capabilities: { readScene: true, readCatalog: true, proposePatch: true, applyPatch: false, network: false },
    inputs: ['scene-ir', 'beat-brief', 'character-catalog', 'action-catalog'],
    outputs: [patchOutput('performance-patch')]
  },
  'previs.cinematographer': {
    id: 'previs.cinematographer',
    label: 'Cinematographer',
    provider: 'agent',
    stage: 'camera',
    description: 'Proposes coverage, lens, camera placement, movement and cuts for the staged beat.',
    modes: ['propose'],
    scopes: ['scene', 'timeline', 'beat', 'camera'],
    capabilities: { readScene: true, readCatalog: false, proposePatch: true, applyPatch: false, network: false },
    inputs: ['scene-ir', 'beat-brief', 'blocking-patch'],
    outputs: [patchOutput('camera-patch')]
  },
  'previs.continuity-supervisor': {
    id: 'previs.continuity-supervisor',
    label: 'Continuity supervisor',
    provider: 'analyzer',
    stage: 'review',
    description: 'Reviews screen direction, spatial continuity, action matching and beat coverage across cuts.',
    modes: ['review'],
    scopes: ['scene', 'timeline', 'beat'],
    capabilities: { readScene: true, readCatalog: false, proposePatch: false, applyPatch: false, network: false },
    inputs: ['scene-ir', 'beat-brief'],
    outputs: [reviewOutput('continuity-report')]
  },
  'previs.qc': {
    id: 'previs.qc',
    label: 'Previs QC',
    provider: 'compiler',
    stage: 'delivery',
    description: 'Runs final semantic, timing, reference and deterministic-seek readiness checks.',
    modes: ['review'],
    scopes: ['scene', 'timeline'],
    capabilities: { readScene: true, readCatalog: true, proposePatch: false, applyPatch: false, network: false },
    inputs: ['scene-ir', 'compiler-diagnostics'],
    outputs: [reviewOutput('previs-qc-report')]
  }
}

export const SUPPORTED_PROFESSIONAL_SKILLS = Object.freeze(Object.keys(PROFESSIONAL_SKILL_CATALOG))

export const resolveProfessionalSkill = id => PROFESSIONAL_SKILL_CATALOG[id] ?? null

export const skillContractForDispatch = (skill, dispatch) => ({
  schemaVersion: PROFESSIONAL_SKILL_SCHEMA_VERSION,
  id: dispatch.id,
  skill: skill.id,
  label: skill.label,
  provider: skill.provider,
  stage: skill.stage,
  mode: dispatch.mode,
  scope: dispatch.scope,
  after: dispatch.after,
  capabilities: { ...skill.capabilities },
  inputs: [...skill.inputs],
  outputs: skill.outputs.map(output => ({ ...output }))
})
