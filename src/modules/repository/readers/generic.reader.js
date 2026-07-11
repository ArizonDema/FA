const { snippet } = require("./reader.utils")

class GenericRepositoryReader {
  static key = "generic"
  static version = "generic.v1"

  static analyze({ source }) {
    const excerpt = snippet(source.text, 1200)
    return {
      reader_key: this.key,
      reader_version: this.version,
      status: excerpt ? "completed" : "partial",
      summary_text: excerpt
        ? "Text was extracted and retained for future specialized reading."
        : "No machine-readable text was extracted from this file.",
      confidence: excerpt ? 0.5 : 0.1,
      key_points: [],
      structured_data_json: { extracted_text_available: Boolean(excerpt) },
      issues_json: excerpt
        ? []
        : [{ code: "no_key_point_reader", message: "No specialized reader is assigned to this category yet." }],
      source_text_excerpt: excerpt,
    }
  }
}

module.exports = GenericRepositoryReader
