import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertWebImageSearchAllowed,
  deriveWebImageQuery,
  detectWebImageSearchPermission,
} from './imageSearchPolicy.ts'

const allowed = [
  'Search online for images of Tokyo.',
  'Use real photos from the internet.',
  'Find images on the web for each scene.',
  'Look up actual photos of the event online.',
  'Use real images for this video.',
  'Search the web for photos of SpaceX launches.',
  'Find real photos of SpaceX launches.',
  'Search for suitable photos where useful.',
  'Search images for the opening sequence.',
  'Use actual image for the background.',
  'Use an actual image for the background.',
  'Use actual images for this animation.',
  'Use a real image for this animation.',
]

const denied = [
  'Make a Tokyo video.',
  'Make it realistic.',
  'Use cinematic photography style.',
  'Create a news animation.',
  'Use beautiful visuals.',
  'Show a real person in a cinematic location.',
]

test('allows only explicit web-image instructions', () => {
  for (const prompt of allowed) {
    assert.equal(detectWebImageSearchPermission(prompt).allowed, true, prompt)
  }
})

test('does not infer permission from subject or visual style', () => {
  for (const prompt of denied) {
    assert.equal(detectWebImageSearchPermission(prompt).allowed, false, prompt)
  }
})

test('an explicit prohibition wins over an authorization phrase', () => {
  const decision = detectWebImageSearchPermission(
    'Use good visuals, but do not search the web for photos.'
  )
  assert.equal(decision.explicit, true)
  assert.equal(decision.allowed, false)
})

test('extracts a useful provider query and falls back for generic permission wording', () => {
  assert.equal(deriveWebImageQuery('Search online for images of Tokyo.', 'Fallback'), 'Tokyo')
  assert.equal(
    deriveWebImageQuery('Make a video about Mount Fuji and use real photos from the web.'),
    'Mount Fuji'
  )
  assert.equal(
    deriveWebImageQuery('Use real photos from the internet.', 'Mount Fuji'),
    'Mount Fuji'
  )
  assert.equal(
    deriveWebImageQuery(
      'Use an actual image of Elon Musk from the web to replace in the middle.',
      'Fallback'
    ),
    'Elon Musk'
  )
  assert.equal(
    deriveWebImageQuery('Find real photos of Elon Musk and replace the middle.'),
    'Elon Musk'
  )
})

test('the source-phase guard rejects an unauthorized web-image need', () => {
  assert.throws(
    () =>
      assertWebImageSearchAllowed({
        allowed: false,
        reason: 'Not explicitly authorized.',
      }),
    /explicitly request online image search/
  )
})
