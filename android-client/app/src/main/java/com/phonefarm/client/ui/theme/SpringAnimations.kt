package com.phonefarm.client.ui.theme

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring

/** Shared spring animation specs — inspired by Operit's natural-feel transitions. */
object SpringSpecs {
    /** Bubble expand/collapse — bouncy but not too heavy. */
    val bubble = spring<Float>(
        dampingRatio = Spring.DampingRatioMediumBouncy,
        stiffness = Spring.StiffnessMedium,
    )

    /** Edge snap — overdamped, minimal bounce. */
    val edgeSnap = spring<Float>(
        dampingRatio = Spring.DampingRatioLowBouncy,
        stiffness = Spring.StiffnessHigh,
    )

    /** Voice wake pulse — quick, snappy. */
    val voicePulse = spring<Float>(
        dampingRatio = Spring.DampingRatioHighBouncy,
        stiffness = Spring.StiffnessMediumLow,
    )

    /** Page transitions — smooth, no bounce. */
    val page = spring<Float>(
        dampingRatio = Spring.DampingRatioNoBouncy,
        stiffness = Spring.StiffnessMedium,
    )

    /** Card appear — staggered, gentle. */
    val cardAppear = spring<Float>(
        dampingRatio = Spring.DampingRatioNoBouncy,
        stiffness = Spring.StiffnessLow,
    )
}

/** Durations for non-spring animations. */
object Durations {
    const val FAST = 200
    const val NORMAL = 300
    const val SLOW = 500
    const val STAGGER_DELAY = 50
}
