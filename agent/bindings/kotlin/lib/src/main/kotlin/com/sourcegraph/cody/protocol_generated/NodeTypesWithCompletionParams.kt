@file:Suppress("FunctionName", "ClassName")
package com.sourcegraph.cody.protocol_generated

data class NodeTypesWithCompletionParams(
  val atCursor: String? = null,
  val parent: String? = null,
  val grandparent: String? = null,
  val greatGrandparent: String? = null,
  val lastAncestorOnTheSameLine: String? = null,
)
