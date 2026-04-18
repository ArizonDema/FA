const { Op } = require("sequelize")
const {
  AccountSemanticMapping,
  Account,
  GLAccount,
  JournalEntry,
  JournalLine,
  SemanticConcept,
} = require("../../../models")

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
}

function normalizeCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
}

function roundCurrency(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
}

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)))
}

function createConceptEntry(mapping) {
  return {
    semanticConceptId: mapping.semantic_concept_id,
    semanticConceptKey: mapping.semanticConcept?.stable_key || null,
    semanticConceptLabel: mapping.semanticConcept?.label || null,
    approvedAccountMappingsCount: 0,
    matchedSourceAccountCount: 0,
    unmatchedApprovedAccountCount: 0,
    supportingLineCount: 0,
    supportingEntryCount: 0,
    totalValue: 0,
    currencies: [],
    currency: null,
    approvedAccounts: [],
    matchedSourceAccounts: [],
    supportingEntryIds: [],
  }
}

function computeLineAmount(line, glAccount) {
  const debit = Number(line?.debit || 0)
  const credit = Number(line?.credit || 0)
  const accountType = String(glAccount?.type || "").trim().toLowerCase()

  if (["asset", "expense"].includes(accountType)) {
    return roundCurrency(debit - credit)
  }

  if (["liability", "equity", "income"].includes(accountType)) {
    return roundCurrency(credit - debit)
  }

  return roundCurrency(debit - credit)
}

function buildDateOverlapClause({ periodStart, periodEnd }) {
  return {
    [Op.and]: [
      {
        [Op.or]: [{ effective_start: null }, { effective_start: { [Op.lte]: periodEnd } }],
      },
      {
        [Op.or]: [{ effective_end: null }, { effective_end: { [Op.gte]: periodStart } }],
      },
    ],
  }
}

function pickSingleCurrency(values = []) {
  const currencies = unique(values)
  return currencies.length === 1 ? currencies[0] : null
}

function toPlainObject(record) {
  if (!record) return null
  return typeof record.toJSON === "function" ? record.toJSON() : { ...record }
}

class SemanticValueAggregationService {
  static buildResolvedAccountDescriptor(mapping) {
    const account = mapping.account
    return {
      mappingId: mapping.id,
      semanticConceptId: mapping.semantic_concept_id,
      accountId: account?.id || null,
      code: normalizeCode(account?.code),
      normalizedName: normalizeText(account?.normalized_name || account?.name),
      sourceSystem: String(account?.source_system || "").trim().toLowerCase() || null,
      sourceRef: String(account?.source_ref || "").trim() || null,
      displayAccount: {
        id: account?.id || null,
        code: account?.code || null,
        name: account?.name || null,
      },
    }
  }

  static addDescriptor(map, key, descriptor) {
    if (!key) return
    if (!map.has(key)) {
      map.set(key, [])
    }
    map.get(key).push(descriptor)
  }

  static async aggregate({ fundId, periodStart, periodEnd }) {
    const activeMappings = await AccountSemanticMapping.findAll({
      where: {
        portfolio_id: fundId,
        status: "approved",
        ...buildDateOverlapClause({ periodStart, periodEnd }),
      },
      include: [
        { model: Account, as: "account" },
        { model: SemanticConcept, as: "semanticConcept" },
      ],
      order: [
        ["approved_at", "DESC"],
        ["created_at", "DESC"],
      ],
    })

    const conceptsById = new Map()
    const descriptorsBySourceRef = new Map()
    const descriptorsByCode = new Map()
    const descriptorsByName = new Map()

    activeMappings.forEach((mappingRecord) => {
      const mapping = toPlainObject(mappingRecord)
      if (!mapping?.semantic_concept_id || !mapping?.account) return

      if (!conceptsById.has(mapping.semantic_concept_id)) {
        conceptsById.set(mapping.semantic_concept_id, createConceptEntry(mapping))
      }

      const conceptEntry = conceptsById.get(mapping.semantic_concept_id)
      conceptEntry.approvedAccountMappingsCount += 1
      conceptEntry.approvedAccounts.push({
        id: mapping.account.id,
        code: mapping.account.code || null,
        name: mapping.account.name || null,
      })

      const descriptor = this.buildResolvedAccountDescriptor(mapping)
      this.addDescriptor(descriptorsBySourceRef, descriptor.sourceRef, descriptor)
      this.addDescriptor(descriptorsByCode, descriptor.code, descriptor)
      this.addDescriptor(descriptorsByName, descriptor.normalizedName, descriptor)
    })

    const journalLines = await JournalLine.findAll({
      include: [
        {
          model: JournalEntry,
          as: "entry",
          where: {
            portfolio_id: fundId,
            status: "posted",
            entry_date: { [Op.between]: [periodStart, periodEnd] },
          },
          required: true,
        },
        {
          model: GLAccount,
          as: "account",
          required: false,
        },
      ],
      order: [["created_at", "ASC"]],
    })

    let mappedJournalLines = 0
    let unmappedJournalLines = 0

    journalLines.forEach((lineRecord) => {
      const line = toPlainObject(lineRecord)
      const glAccount = line.account
      const sourceRef = glAccount?.id ? String(glAccount.id).trim() : null
      const code = normalizeCode(glAccount?.code)
      const normalizedName = normalizeText(glAccount?.name)

      const candidateDescriptors = new Map()
      ;[
        ...(descriptorsBySourceRef.get(sourceRef) || []),
        ...(descriptorsByCode.get(code) || []),
        ...(descriptorsByName.get(normalizedName) || []),
      ].forEach((descriptor) => {
        const key = `${descriptor.semanticConceptId}:${descriptor.accountId || descriptor.mappingId}`
        if (!candidateDescriptors.has(key)) {
          candidateDescriptors.set(key, descriptor)
        }
      })

      if (!candidateDescriptors.size) {
        unmappedJournalLines += 1
        return
      }

      mappedJournalLines += 1
      const lineAmount = computeLineAmount(line, glAccount)
      const descriptorsByConcept = new Map()
      Array.from(candidateDescriptors.values()).forEach((descriptor) => {
        if (!descriptorsByConcept.has(descriptor.semanticConceptId)) {
          descriptorsByConcept.set(descriptor.semanticConceptId, [])
        }
        descriptorsByConcept.get(descriptor.semanticConceptId).push(descriptor)
      })

      descriptorsByConcept.forEach((descriptors, conceptId) => {
        const conceptEntry = conceptsById.get(conceptId)
        if (!conceptEntry) return

        conceptEntry.totalValue = roundCurrency(conceptEntry.totalValue + lineAmount)
        conceptEntry.supportingLineCount += 1

        const supportingEntryIds = new Set(conceptEntry.supportingEntryIds)
        if (line.entry?.id) {
          supportingEntryIds.add(line.entry.id)
          conceptEntry.supportingEntryIds = Array.from(supportingEntryIds)
          conceptEntry.supportingEntryCount = conceptEntry.supportingEntryIds.length
        }

        const matchedSourceAccounts = new Map(
          (conceptEntry.matchedSourceAccounts || []).map((item) => [item.accountId || item.glAccountId, item]),
        )

        descriptors.forEach((descriptor) => {
          const accountKey = descriptor.accountId || descriptor.mappingId
          matchedSourceAccounts.set(accountKey, {
            accountId: descriptor.accountId,
            code: descriptor.displayAccount.code,
            name: descriptor.displayAccount.name,
            glAccountId: glAccount?.id || null,
            glAccountCode: glAccount?.code || null,
            glAccountName: glAccount?.name || null,
          })
        })

        conceptEntry.matchedSourceAccounts = Array.from(matchedSourceAccounts.values())
        conceptEntry.matchedSourceAccountCount = conceptEntry.matchedSourceAccounts.length
        conceptEntry.unmatchedApprovedAccountCount = Math.max(
          0,
          conceptEntry.approvedAccountMappingsCount - conceptEntry.matchedSourceAccountCount,
        )

        const currencies = new Set(conceptEntry.currencies || [])
        if (line.currency) currencies.add(line.currency)
        conceptEntry.currencies = Array.from(currencies)
        conceptEntry.currency = pickSingleCurrency(conceptEntry.currencies)
      })
    })

    return {
      conceptsById,
      summary: {
        sourceSystem: "journal_entries",
        totalJournalLines: journalLines.length,
        mappedJournalLines,
        unmappedJournalLines,
        approvedAccountMappings: activeMappings.length,
        semanticConceptsWithApprovedMappings: conceptsById.size,
      },
    }
  }
}

module.exports = SemanticValueAggregationService
