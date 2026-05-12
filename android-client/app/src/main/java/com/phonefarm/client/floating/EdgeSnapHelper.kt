package com.phonefarm.client.floating

import android.graphics.PixelFormat
import android.view.Gravity
import android.view.WindowManager

/**
 * Edge snap helper for floating window.
 *
 * When the user drags the float bubble near a screen edge, it animates towards
 * that edge with a spring effect and partially "hides" (offset out of screen with
 * a small portion visible). Tapping the hidden portion restores full visibility.
 */
class EdgeSnapHelper(
    private val windowManager: WindowManager,
) {
    data class SnapState(
        val snappedEdge: SnapEdge = SnapEdge.NONE,
        val offsetFromEdge: Int = 0,
        val snappedX: Int = 0,
        val snappedY: Int = 0,
    )

    enum class SnapEdge { NONE, LEFT, RIGHT, TOP }

    companion object {
        /** Distance from edge (px) that triggers a snap. */
        const val SNAP_THRESHOLD_DP = 40f

        /** How much of the bubble (dp) remains visible when snapped. */
        const val PEEK_WIDTH_DP = 16f

        /** How much overshoot during spring animation (dp). */
        const val OVERSHOOT_DP = 20f
    }

    fun calculateSnap(
        x: Float,
        y: Float,
        bubbleWidth: Int,
        screenWidth: Int,
        screenHeight: Int,
        density: Float,
    ): SnapState {
        val snapThresholdPx = SNAP_THRESHOLD_DP * density
        val peekWidthPx = PEEK_WIDTH_DP * density

        var snappedX = x.toInt()
        var snappedY = y.toInt()
        var edge = SnapEdge.NONE
        var offset = 0

        // Check left edge
        if (x < snapThresholdPx) {
            edge = SnapEdge.LEFT
            offset = -(bubbleWidth - peekWidthPx)
            snappedX = offset
        }
        // Check right edge
        else if (x > screenWidth - bubbleWidth - snapThresholdPx) {
            edge = SnapEdge.RIGHT
            offset = screenWidth - peekWidthPx
            snappedX = offset
        }

        // Clamp Y within screen bounds
        if (snappedY < 0) snappedY = 0
        if (snappedY > screenHeight - bubbleWidth) snappedY = screenHeight - bubbleWidth

        return SnapState(
            snappedEdge = edge,
            offsetFromEdge = offset,
            snappedX = snappedX,
            snappedY = snappedY,
        )
    }

    fun getLayoutParams(
        x: Int,
        y: Int,
        width: Int,
        height: Int,
    ): WindowManager.LayoutParams {
        return WindowManager.LayoutParams(
            width,
            height,
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O)
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            else
                WindowManager.LayoutParams.TYPE_PHONE,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
            PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            this.x = x
            this.y = y
        }
    }
}
