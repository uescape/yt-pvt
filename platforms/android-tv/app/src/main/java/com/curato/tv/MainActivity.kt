package com.curato.tv

import android.annotation.SuppressLint
import android.app.Activity
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient

/**
 * Android TV / Google TV / Fire TV shell.
 *
 * Loads the hosted Curato TV web app (same code as Samsung and LG) in a full-screen WebView.
 * Hosting it over https gives the YouTube embed a proper origin/referrer and lets the TV UI update
 * without a store release. The shell:
 *  - forwards the remote's Back button to the web app (window.__curatoBack),
 *  - exposes a tiny bridge (window.CuratoNative) for exit/platform/device name,
 *  - blocks top-level navigation to any other site, so tapping the YouTube logo inside the player
 *    can't open youtube.com and escape the profile's filters.
 */
class MainActivity : Activity() {

    private lateinit var webView: WebView

    private val appUri: Uri by lazy { Uri.parse(BuildConfig.APP_URL) }

    private val platform: String by lazy {
        if (packageManager.hasSystemFeature("amazon.hardware.fire_tv")) "firetv" else "androidtv"
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        webView = WebView(this).apply {
            setBackgroundColor(Color.parseColor("#0B0D12"))
            isFocusable = true
            isFocusableInTouchMode = true
            systemUiVisibility = View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY

            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.setSupportMultipleWindows(false)
            settings.userAgentString = "${settings.userAgentString} CuratoTV/${BuildConfig.VERSION_NAME}"

            addJavascriptInterface(Bridge(), "CuratoNative")
            webViewClient = ShellClient()
            webChromeClient = object : WebChromeClient() {
                // Avoid the grey "play" placeholder Android draws before video starts.
                override fun getDefaultVideoPoster(): Bitmap = Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888)
            }
        }
        setContentView(webView)

        if (savedInstanceState == null) loadApp() else webView.restoreState(savedInstanceState)
    }

    private fun loadApp() {
        val url = appUri.buildUpon().appendQueryParameter("platform", platform).build().toString()
        webView.loadUrl(url)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    /** Back is handled by the web app; it calls CuratoNative.exit() when there is nothing to go back to. */
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.keyCode == KeyEvent.KEYCODE_BACK) {
            if (event.action == KeyEvent.ACTION_UP) {
                webView.evaluateJavascript("(function(){ if (window.__curatoBack) { window.__curatoBack(); return 'handled'; } return 'none'; })()") { result ->
                    if (result == null || result.contains("none")) finish()
                }
            }
            return true
        }
        return super.dispatchKeyEvent(event)
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onPause() {
        webView.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }

    private inner class ShellClient : WebViewClient() {
        private val allowedHosts = setOf(
            appUri.host,
            "www.youtube.com",
            "youtube.com",
            "www.youtube-nocookie.com",
        )

        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            // Only top-level navigations are restricted; the YouTube iframe loads normally.
            if (!request.isForMainFrame) return false
            val host = request.url.host
            if (request.url.scheme == "file") return false
            return host != appUri.host // block (and ignore) everything else
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (request.isForMainFrame && request.url.host in allowedHosts) {
                view.loadUrl("file:///android_asset/offline.html")
            }
        }
    }

    private inner class Bridge {
        @JavascriptInterface
        fun exit() = runOnUiThread { finish() }

        @JavascriptInterface
        fun platform(): String = platform

        @JavascriptInterface
        fun reload() = runOnUiThread { loadApp() }

        @JavascriptInterface
        fun deviceName(): String {
            val name = if (Build.VERSION.SDK_INT >= 25) Settings.Global.getString(contentResolver, Settings.Global.DEVICE_NAME) else null
            return name ?: Build.MODEL ?: if (platform == "firetv") "Fire TV" else "Android TV"
        }
    }
}
