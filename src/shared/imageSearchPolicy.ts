import type {
  WebImageSearchCapability,
  WebImageSearchDecision,
} from '../types/editor'

const DENIAL_PATTERNS = [
  /\b(?:do\s+not|don['’]t|never)\s+(?:use|find|search|look\s*up|source|download)[^.!?\n]{0,50}\b(?:web|online|internet|images?|photos?|pictures?)\b/i,
  /\b(?:no|without)\s+(?:web|online|internet|external|real(?:-world)?)\s+(?:images?|photos?|pictures?)\b/i,
  /\b(?:images?|photos?|pictures?)\s+(?:must\s+)?(?:not|never)\s+(?:come|be sourced)\s+from\s+(?:the\s+)?(?:web|internet|online)/i,
]

const AUTHORIZATION_PATTERNS = [
  /\b(?:search(?:\s+for)?|find|look\s*up|source)\s+(?:(?:an?|some|suitable|actual|authentic|real|real-world)\s+)?(?:images?|photos?|pictures?)\b/i,
  /\b(?:search|find|look\s*up|source|download)\s+(?:(?:the|some|suitable|actual|real|real-world)\s+){0,3}(?:images?|photos?|pictures?)[^.!?\n]{0,80}\b(?:web|internet|online)\b/i,
  /\b(?:search|find|look\s*up|source)\s+(?:the\s+)?(?:web|internet|online)\s+(?:for\s+)?[^.!?\n]{0,80}\b(?:images?|photos?|pictures?)\b/i,
  /\b(?:use|include|add)\s+[^.!?\n]{0,35}\b(?:images?|photos?|pictures?)\s+from\s+(?:the\s+)?(?:web|internet|online)\b/i,
  /\b(?:use|include|add)\s+(?:(?:an?|some|suitable)\s+)?(?:actual|authentic|real|real-world)\s+(?:images?|photos?|pictures?)\b/i,
  /\b(?:use|include|add|find|search(?:\s+for)?)\s+(?:(?:some|suitable)\s+)?(?:web|internet|online)\s+(?:images?|photos?|pictures?)\b/i,
  /\b(?:web|internet|online)\s+(?:image|photo|picture)\s+search\b/i,
]

export const DEFAULT_WEB_IMAGE_SEARCH_CAPABILITY: WebImageSearchCapability = {
  allowed: false,
  reason: 'Web image search was not explicitly authorized by the user.',
}

function normalizedPrompt(value: string) {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim()
}

export function detectWebImageSearchPermission(
  userPrompt: string
): WebImageSearchDecision {
  const prompt = normalizedPrompt(userPrompt)
  if (!prompt) {
    return {
      explicit: false,
      ...DEFAULT_WEB_IMAGE_SEARCH_CAPABILITY,
    }
  }

  if (DENIAL_PATTERNS.some((pattern) => pattern.test(prompt))) {
    return {
      explicit: true,
      allowed: false,
      reason: 'The user explicitly prohibited web image search.',
    }
  }

  if (AUTHORIZATION_PATTERNS.some((pattern) => pattern.test(prompt))) {
    return {
      explicit: true,
      allowed: true,
      reason: 'The user explicitly requested real images from the internet.',
    }
  }

  return {
    explicit: false,
    ...DEFAULT_WEB_IMAGE_SEARCH_CAPABILITY,
  }
}

export function resolveWebImageSearchCapability(
  userPrompt: string,
  existing?: WebImageSearchCapability | null
): WebImageSearchCapability {
  const decision = detectWebImageSearchPermission(userPrompt)
  if (decision.explicit) {
    return { allowed: decision.allowed, reason: decision.reason }
  }
  return existing || DEFAULT_WEB_IMAGE_SEARCH_CAPABILITY
}

export function assertWebImageSearchAllowed(capability: WebImageSearchCapability) {
  if (!capability.allowed) {
    throw new Error(
      'Web image search is disabled for this project. The user must explicitly request online image search.'
    )
  }
}

export function deriveWebImageQuery(userPrompt: string, fallback = '') {
  const prompt = normalizedPrompt(userPrompt)
  const subjectPatterns = [
    /\b(?:video|animation|scene|story)\s+about\s+(.+?)(?:\s+and\s+(?:search|find|use)\b|[.!?]|$)/i,
    /\b(?:images?|photos?|pictures?)\s+(?:of|showing|featuring)\s+(.+?)(?=\s+(?:from|on|using)\s+(?:the\s+)?(?:web|internet|online)\b|\s+(?:to|and)\s+(?:replace|use|put|place|show|add|insert)\b|[.!?]|\s+(?:for|where|when)\b|$)/i,
    /\b(?:search|find|look\s*up|source)\s+(?:the\s+)?(?:web|internet|online)\s+for\s+(?:real\s+|actual\s+)?(?:images?|photos?|pictures?)?\s*(?:of\s+)?(.+?)(?:[.!?]|$)/i,
  ]
  for (const pattern of subjectPatterns) {
    const subject = prompt.match(pattern)?.[1]
    if (subject?.trim()) return subject.trim().slice(0, 160)
  }

  const cleaned = prompt
    .replace(
      /\b(?:to|and)\s+(?:replace|use|put|place|show|add|insert)\b[^.!?]*/gi,
      ' '
    )
    .replace(/\b(?:from|on|using)\s+(?:the\s+)?(?:web|internet|online)\b/gi, ' ')
    .replace(/\b(?:for\s+)?each\s+scene\b/gi, ' ')
    .replace(/\b(?:please|create|make|build|use|include|add|search|find|look\s*up|source)\b/gi, ' ')
    .replace(/\b(?:the\s+)?(?:web|internet|online)\b/gi, ' ')
    .replace(/\b(?:real-world|real|actual|suitable)\s+(?:images?|photos?|pictures?)\b/gi, ' ')
    .replace(/\b(?:images?|photos?|pictures?)\b/gi, ' ')
    .replace(/\b(?:from|on|for|where|when|appropriate|useful|video|animation|this|the|an?)\b/gi, ' ')
    .replace(/[.!?]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[,;:\s-]+|[,;:\s-]+$/g, '')

  return (/[\p{L}\p{N}]/u.test(cleaned) ? cleaned : fallback.trim() || 'editorial photography').slice(
    0,
    160
  )
}
