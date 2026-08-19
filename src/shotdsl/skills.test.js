import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PROFESSIONAL_SKILL_CATALOG,
  SUPPORTED_PROFESSIONAL_SKILLS,
  resolveProfessionalSkill
} from './skills.js'

test('professional skills expose auditable orchestration contracts', () => {
  assert.deepEqual(SUPPORTED_PROFESSIONAL_SKILLS, [
    'previs.asset-supervisor',
    'previs.blocking-director',
    'previs.action-choreographer',
    'previs.cinematographer',
    'previs.continuity-supervisor',
    'previs.qc'
  ])
  for (const skill of Object.values(PROFESSIONAL_SKILL_CATALOG)) {
    assert.ok(skill.inputs.length > 0)
    assert.ok(skill.outputs.length > 0)
    assert.equal(skill.capabilities.applyPatch, false)
    if (skill.modes.includes('propose')) {
      assert.ok(skill.outputs.some(output => output.mediaType === 'shotdsl-patch' && output.requiresApproval))
    }
  }
  assert.equal(resolveProfessionalSkill('previs.cinematographer').provider, 'agent')
  assert.equal(resolveProfessionalSkill('previs.unknown'), null)
})
