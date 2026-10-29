package com.walzpay.listener

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Bitmap
import android.os.Bundle
import android.view.View
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.floatingactionbutton.ExtendedFloatingActionButton

/**
 * Shell: tampilan 1:1 website WALZPAY.
 * Fitur permission Android (notifikasi, baterai, overlay, sumber, dll)
 * dibuka lewat tombol "Izin Android" → ListenerActivity.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var loading: View

    companion object {
        const val SITE_URL = "https://walzpaynew.vercel.app"
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        SessionStore.init(this)
        setContentView(R.layout.activity_web)

        webView = findViewById(R.id.webView)
        loading = findViewById(R.id.loadingOverlay)
        val fab = findViewById<ExtendedFloatingActionButton>(R.id.fabListener)

        val settings: WebSettings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.allowFileAccess = true
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
        settings.cacheMode = WebSettings.LOAD_DEFAULT
        settings.userAgentString = settings.userAgentString + " WalzpayApp/2.1"

        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)

        // Bridge: website bisa panggil native permission
        webView.addJavascriptInterface(WalzBridge(), "WalzAndroid")

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                val url = request?.url?.toString() ?: return false
                if (url.contains("walzpay") || url.contains("vercel.app")) return false
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, request?.url))
                } catch (_: Exception) {
                }
                return true
            }

            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                loading.visibility = View.VISIBLE
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                loading.visibility = View.GONE
                // Sembunyikan petunjuk "hanya di app" jika ada, inject tombol buka izin
                view?.evaluateJavascript(
                    """
                    (function(){
                      try {
                        var tips = document.querySelectorAll('[data-android-tip], .android-only-tip');
                        tips.forEach(function(el){ el.style.display='none'; });
                      } catch(e){}
                    })();
                    """.trimIndent(),
                    null
                )
            }
        }
        webView.webChromeClient = WebChromeClient()

        if (savedInstanceState == null) {
            webView.loadUrl(SITE_URL)
        } else {
            webView.restoreState(savedInstanceState)
        }

        fab.setOnClickListener {
            startActivity(Intent(this, ListenerActivity::class.java))
        }

        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    if (webView.canGoBack()) webView.goBack()
                    else {
                        isEnabled = false
                        onBackPressedDispatcher.onBackPressed()
                    }
                }
            }
        )
    }

    inner class WalzBridge {
        @JavascriptInterface
        fun openPermissions() {
            runOnUiThread {
                startActivity(Intent(this@MainActivity, ListenerActivity::class.java))
            }
        }

        @JavascriptInterface
        fun isApp(): Boolean = true
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onPause() {
        webView.onPause()
        super.onPause()
    }
}
