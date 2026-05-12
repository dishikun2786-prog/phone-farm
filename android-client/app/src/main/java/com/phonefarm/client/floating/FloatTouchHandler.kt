package com.phonefarm.client.floating

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.os.Handler
import android.os.Looper
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.view.animation.DecelerateInterpolator

/**
 * Touch event handler for the floating window bubble.
 *
 * Handles three gestures:
 *   1. **Drag**       : move the bubble with finger, snap to nearest edge on release.
 *   2. **Click**      : short tap (< 300ms, no significant movement) 鈫?expand to chat.
 *   3. **Long press** : hold (> 500ms) 鈫?show context menu (open app / pause / close).
 *
 * Edge snap uses a spring animation (ValueAnimator with decelerate interpolator)
 * to animate the bubble to the left or right edge after drag release.
 *
 * Only active in COLLAPSED state; disabled in other states by the service.
 */
class FloatTouchHandler(
    private val windowManager: WindowManager,
    private val layoutParams: WindowManager.LayoutParams,
    private val onTap: () -> Unit,
    private val onLongPress: () -> Unit,
    private val getCurrentState: () -> FloatState,
    private val onStateChange: (FloatState) -> Unit,
) : View.OnTouchListener {

    private var initialX = 0
    private var initialY = 0
    private var initialTouchX = 0f
    private var initialTouchY = 0f
    private var touchDownTime = 0L
    private var hasMoved = false

    private val handler = Handler(Looper.getMainLooper())
    private var longPressRunnable: Runnable? = null
    private var snapAnimator: ValueAnimator? = null

    companion object {
        private const val CLICK_THRESHOLD_MS = 300L
        private const val LONG_PRESS_THRESHOLD_MS = 500L
        private const val MOVE_THRESHOLD_PX = 10
        private const val SNAP_DURATION_MS = 300L
    }

    override fun onTouch(v: View, event: MotionEvent): Boolean {
        // Only handle touch in COLLAPSED state
        if (getCurrentState() != FloatState.COLLAPSED) return false

        when (event.action) {
            MotionEvent.ACTION_DOWN -> {
                initialX = layoutParams.x
                initialY = layoutParams.y
                initialTouchX = event.rawX
                initialTouchY = event.rawY
                touchDownTime = System.currentTimeMillis()
                hasMoved = false

                // Cancel any running snap animation
                snapAnimator?.cancel()

                // Schedule long press detection
                longPressRunnable?.let { handler.removeCallbacks(it) }
                val runnable = Runnable {
                    if (!hasMoved) {
                        v.performHapticFeedback(android.view.HapticFeedbackConstants.LONG_PRESS)
                        onLongPress()
                    }
                }
                longPressRunnable = runnable
                handler.postDelayed(runnable, LONG_PRESS_THRESHOLD_MS)

                return true
            }

            MotionEvent.ACTION_MOVE -> {
                val dx = (event.rawX - initialTouchX).toInt()
                val dy = (event.rawY - initialTouchY).toInt()
                val totalMovement = kotlin.math.abs(dx) + kotlin.math.abs(dy)

                if (totalMovement > MOVE_THRESHOLD_PX) {
                    hasMoved = true
                    // Cancel long press once movement exceeds threshold
                    longPressRunnable?.let { handler.removeCallbacks(it) }
                }

                if (hasMoved) {
                    val newX = initialX + dx
                    val newY = initialY + dy

                    // Clamp Y position
                    val clampedY = newY.coerceIn(0, getScreenHeight() - layoutParams.height)
                    layoutParams.x = newX
                    layoutParams.y = clampedY

                    try {
                        windowManager.updateViewLayout(v, layoutParams)
                    } catch (e: IllegalArgumentException) {
                        // View was removed 鈥?stop handling
                        return false
                    }
                }

                return true
            }

            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                // Cancel long press timer
                longPressRunnable?.let { handler.removeCallbacks(it) }
                longPressRunnable = null

                val elapsed = System.currentTimeMillis() - touchDownTime

                if (!hasMoved && elapsed < CLICK_THRESHOLD_MS) {
                    // Click detected 鈥?expand the bubble
                    onTap()
                } else if (hasMoved) {
                    // Drag ended 鈥?snap to nearest edge
                    snapToEdge(layoutParams.x, getScreenWidth(), v)
                }

                return true
            }
        }

        return false
    }

    /**
     * Animate the bubble snapping to the nearest edge using ValueAnimator.
     *
     * Uses a DecelerateInterpolator for a natural settling feel.
     *
     * @param currentX    Current X position of the bubble.
     * @param screenWidth Device screen width in pixels.
     * @param view        The float view to update.
     */
    private fun snapToEdge(currentX: Int, screenWidth: Int, view: View) {
        val bubbleCenterX = currentX + layoutParams.width / 2
        // Snap to left edge (x=0) or right edge (x=screenWidth - bubbleWidth)
        val targetX = if (bubbleCenterX < screenWidth / 2) {
            0
        } else {
            screenWidth - layoutParams.width
        }

        snapAnimator = ValueAnimator.ofInt(currentX, targetX).apply {
            duration = SNAP_DURATION_MS
            interpolator = DecelerateInterpolator(2f)
            addUpdateListener { animator ->
                layoutParams.x = animator.animatedValue as Int
                try {
                    windowManager.updateViewLayout(view, layoutParams)
                } catch (e: IllegalArgumentException) { }
            }
            addListener(object : AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: Animator) {
                    snapAnimator = null
                }
            })
            start()
        }
    }

    /**
     * Cancel any in-progress snap animation.
     */
    fun cancelSnap() {
        snapAnimator?.cancel()
        snapAnimator = null
    }

    private fun getScreenWidth(): Int {
        val metrics = android.content.res.Resources.getSystem().displayMetrics
        return metrics.widthPixels
    }

    private fun getScreenHeight(): Int {
        val metrics = android.content.res.Resources.getSystem().displayMetrics
        return metrics.heightPixels
    }
}
