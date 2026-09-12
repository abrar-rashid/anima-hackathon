export { collectFreeText, groupSpansByResource, FREE_TEXT_KINDS, type FreeTextSpan } from './free-text'
export {
  acceptCandidate,
  candidateFingerprint,
  carryPriority,
  isTaskTag,
  resolveDueAt,
  snomedFromResource,
  verifyQuote,
  type CandidateOutcome,
  type DueAtDerivation,
  type RejectedCandidate,
  type RejectionReason,
} from './guards'
export {
  extractTasks,
  extractTasksDetailed,
  type ExtractionOutcome,
  type ExtractOptions,
} from './extract'
export {
  EPISODE_ID_DERIVATION_RULE,
  EPISODE_TIME_BASIS,
  EPISODE_UNSUPPLIED_FIELDS,
  taskIdFor,
  toEpisode,
  type EpisodeContext,
} from './episode'
export { EXTRACTION_SYSTEM_PROMPT, buildExtractionUserMessage } from './prompt'
export {
  CANDIDATE_JSON_SCHEMA,
  CandidateBatchSchema,
  EXTRACTION_SCHEMA_NAME,
  type ModelCandidate,
  type ModelTimeframe,
} from './schema'
export {
  createExtractionModel,
  extractionModelName,
  sanitiseModelError,
  type ExtractionModel,
  type ModelCallResult,
} from './model-client'
