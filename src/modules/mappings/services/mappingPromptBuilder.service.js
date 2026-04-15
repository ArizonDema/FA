const config = require("../../../config/app")
const { normalizePhrase } = require("../utils/mappingText.util")

function compactCandidate(concept) {
  return {
    semanticConceptKey: concept.stableKey,
    label: concept.label,
    description: concept.description || null,
    category: concept.category,
    statementType: concept.statementType || null,
    synonyms: (concept.synonyms || []).slice(0, 4),
    examples: (concept.examples || []).slice(0, 3),
  }
}

class MappingPromptBuilder {
  static buildRowAssistancePrompt({
    row,
    deterministicSuggestions = [],
    deterministicSummary = null,
    candidateConcepts = [],
    additionalConcepts = [],
    neighboringLabels = {},
  }) {
    const promptVersion = config.mappingAssistance?.promptVersion || "phase5.v1"
    const normalizedRowLabel = normalizePhrase(row?.label || "")

    const requestPayload = {
      rowId: row.id,
      row: {
        label: row.label || null,
        normalizedLabel: normalizedRowLabel || null,
        rowType: row.row_type || row.rowType || null,
        sectionName: row.section_name || row.sectionName || null,
        parentSectionName: row.parent_section_name || row.parentSection || null,
        isFormula: Boolean(row.is_formula || row.isFormula),
        formulaText: row.formula_text || row.formulaText || null,
        previousRowLabel: neighboringLabels.previous || null,
        nextRowLabel: neighboringLabels.next || null,
      },
      deterministicCandidates: deterministicSuggestions.map((candidate) => ({
        semanticConceptKey: candidate.semanticConceptKey,
        label: candidate.semanticConceptLabel || candidate.label || null,
        deterministicRank: candidate.rank,
        deterministicScore: candidate.confidenceScore,
        rationale: candidate.rationale || null,
      })),
      candidateConcepts: candidateConcepts.map((concept) => compactCandidate(concept)),
      additionalEligibleConcepts: additionalConcepts.map((concept) => compactCandidate(concept)),
    }

    const systemPrompt = [
      "You are an accounting mapping assistant.",
      "You are advisory only. Deterministic scoring remains the primary system.",
      "Choose the best semantic concept candidates for one template row using only the supplied candidates and context.",
      "You may include at most two additional candidates from additionalEligibleConcepts when strongly justified.",
      "Return ONLY strict JSON with this shape:",
      "{",
      '  "rowId": "string",',
      '  "recommendedCandidates": [',
      "    {",
      '      "semanticConceptKey": "string",',
      '      "rank": 1,',
      '      "llmScore": 0.0,',
      '      "reasoning": "short string",',
      '      "evidence": ["short string"]',
      "    }",
      "  ],",
      '  "ambiguities": ["short string"],',
      '  "needsHumanReview": true',
      "}",
      "Do not invent keys outside deterministicCandidates or additionalEligibleConcepts.",
      "Keep reasoning concise and evidence atomic.",
      "If the row is ambiguous, mark needsHumanReview true.",
    ].join("\n")

    const userPrompt = [
      `Prompt version: ${promptVersion}`,
      "Use this compact structured input:",
      JSON.stringify(requestPayload),
    ].join("\n")

    return {
      promptVersion,
      requestPayload,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }
  }
}

module.exports = MappingPromptBuilder
