package expo.modules.emwdat

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.widget.ImageView
import android.view.View
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView

class EMWDATView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
    private val imageView: ImageView
    private var isActive = false
    private var mockPreview: View? = null
    private var mockDeviceId: String? = null

    private val frameCallback: FrameCallback = { bitmap ->
        post { imageView.setImageBitmap(bitmap) }
    }

    init {
        setBackgroundColor(Color.BLACK)
        imageView = ImageView(context).apply {
            scaleType = ImageView.ScaleType.CENTER_CROP
            layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
        }
        addView(imageView)
    }

    fun setActive(active: Boolean) {
        if (active == isActive) return
        isActive = active
        if (active && mockPreview == null) {
            CameraSessionManager.setFrameCallback(frameCallback, this)
        } else {
            CameraSessionManager.removeFrameCallback(this)
            imageView.setImageBitmap(null)
        }
    }

    fun setMockDisplayDevice(id: String?) {
        if (mockDeviceId == id) return
        mockPreview?.let { removeView(it) }
        mockPreview = null
        mockDeviceId = id
        if (id != null) {
            check(context.applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE != 0) {
                "Mock display preview is only available in debug builds"
            }
            CameraSessionManager.removeFrameCallback(this)
            mockPreview = MockDeviceManager.createDisplayPreview(id, context).also {
                it.layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
                addView(it)
            }
        } else if (isActive) {
            CameraSessionManager.setFrameCallback(frameCallback, this)
        }
    }

    fun setResizeMode(mode: String) {
        imageView.scaleType = when (mode) {
            "cover" -> ImageView.ScaleType.CENTER_CROP
            "stretch" -> ImageView.ScaleType.FIT_XY
            "contain" -> ImageView.ScaleType.FIT_CENTER
            else -> ImageView.ScaleType.CENTER_CROP
        }
    }
}
