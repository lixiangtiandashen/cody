@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.protocol_generated

data class ContextGroup(
  val dir: Uri? = null,
  val displayName: String,
  val providers: List<ContextProvider>,
)

