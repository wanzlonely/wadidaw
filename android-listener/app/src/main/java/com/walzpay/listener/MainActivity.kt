package com.walzpay.listener

import android.Manifest
import android.annotation.SuppressLint
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.view.View
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding
import org.json.JSONArray
import org.json.JSONObject

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var loading: View
    private var showingOffline = false

    companion object {
        const val SITE_URL = "https://walzpaynew.vercel.app"
        const val SITE_CACHE_BUST = "3.1.1"
        private const val OFFLINE_URL = "file:///android_asset/offline.html"
    }

    private val knownPackages = linkedMapOf(
        "id.dana" to "DANA",
        "id.dana.kasir" to "DANA Kasir",
        "com.gojek.gopaymerchant" to "GoPay Merchant",
        "com.gojek.app" to "Gojek",
        "ovo.id" to "OVO",
        "com.ovo.id" to "OVO",
        "com.shopee.id" to "ShopeePay",
        "com.telkom.mwallet" to "LinkAja",
        "com.bca" to "BCA Mobile",
        "id.co.bri.brimo" to "BRImo",
        "id.co.bri.merchant" to "BRI Merchant",
        "id.bmri.livin" to "Livin Mandiri",
        "com.whatsapp" to "WhatsApp",
        "com.whatsapp.w4b" to "WhatsApp Business",
        "com.google.android.apps.messaging" to "Messages (SMS)"
    )

    private val requestNotifPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            toast(if (granted) "Notifikasi aplikasi diizinkan" else "Izin notifikasi ditolak")
        }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Comfortable system bars on all devices (status bar, notch, gesture nav)
        WindowCompat.setDecorFitsSystemWindows(window, true)

        SessionStore.init(this)
        setContentView(R.layout.activity_web)

        // Security: never enable WebView debugging in production builds
        if ((applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) == 0) {
            WebView.setWebContentsDebuggingEnabled(false)
        }

        val root = findViewById<View>(R.id.rootContainer)
        webView = findViewById(R.id.webView)
        loading = findViewById(R.id.loadingOverlay)
        findViewById<View?>(R.id.fabListener)?.visibility = View.GONE

        // Extra safety: apply system bar insets as padding (works on gesture nav + 3-button)
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            v.updatePadding(
                left = bars.left,
                top = bars.top,
                right = bars.right,
                bottom = bars.bottom
            )
            insets
        }

        val settings: WebSettings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.allowFileAccess = true
        settings.allowContentAccess = false
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        settings.cacheMode = WebSettings.LOAD_DEFAULT
        settings.mediaPlaybackRequiresUserGesture = true
        settings.setSupportMultipleWindows(false)
        settings.javaScriptCanOpenWindowsAutomatically = false
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            settings.safeBrowsingEnabled = true
        }
        // Use wide viewport so web UI scales nicely on phones & tablets
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true
        settings.userAgentString = settings.userAgentString + " WalzpayApp/" + SITE_CACHE_BUST

        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false)
        webView.addJavascriptInterface(WalzBridge(), "WalzAndroid")

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val url = request?.url?.toString() ?: return false
                if (url.contains("walzpay") || url.contains("vercel.app") || url.startsWith("file://")) {
                    return false
                }
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, request?.url))
                } catch (_: Exception) {}
                return true
            }

            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                if (url != null && !url.startsWith("file://")) {
                    showingOffline = false
                    loading.visibility = View.VISIBLE
                }
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                loading.visibility = View.GONE
                if (url != null && !url.startsWith("file://")) {
                    injectBridgeHook()
                }
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                if (request?.isForMainFrame == true) {
                    showOfflinePage()
                }
            }

            @Deprecated("Deprecated in API 23")
            override fun onReceivedError(
                view: WebView?,
                errorCode: Int,
                description: String?,
                failingUrl: String?
            ) {
                if (failingUrl != null && (failingUrl.startsWith("http") || failingUrl == SITE_URL)) {
                    showOfflinePage()
                }
            }
        }
        webView.webChromeClient = WebChromeClient()

        if (savedInstanceState == null) {
            prefs().edit().putString("last_cache_bust", SITE_CACHE_BUST).apply()
            loadMainSite()
        } else {
            webView.restoreState(savedInstanceState)
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (showingOffline) {
                    loadMainSite()
                    return
                }
                if (webView.canGoBack()) webView.goBack()
                else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })
    }

    private fun isOnline(): Boolean {
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(network) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }

    private fun loadMainSite() {
        showingOffline = false
        val ts = System.currentTimeMillis()
        webView.loadUrl("$SITE_URL/?v=$SITE_CACHE_BUST&t=$ts")
    }

    private fun showOfflinePage() {
        if (showingOffline) return
        showingOffline = true
        loading.visibility = View.GONE
        webView.loadUrl(OFFLINE_URL)
    }

    private fun injectBridgeHook() {
        webView.evaluateJavascript(
            "(function(){window.__WALZ_APP__=true;document.documentElement.setAttribute('data-walz-app','1');})();",
            null
        )
    }

    inner class WalzBridge {
        @JavascriptInterface fun isApp(): Boolean = true

        @JavascriptInterface
        fun reload() {
            runOnUiThread { loadMainSite() }
        }

        @JavascriptInterface
        fun getStatusJson(): String {
            val j = JSONObject()
            j.put("notification", isNotificationEnabled())
            j.put("battery", isIgnoringBattery())
            j.put("overlay", Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(this@MainActivity))
            j.put("listener", prefs().getBoolean("listener_enabled", false))
            j.put("push", hasPostNotifications())
            j.put("shizuku", try { ShizukuHelper.statusText() } catch (_: Throwable) { "n/a" })
            j.put("packages", prefs().getStringSet("selected_packages", null)?.size ?: 0)
            j.put("autostart", prefs().getBoolean("autostart_done", false))
            j.put("online", isOnline())
            return j.toString()
        }

        @JavascriptInterface
        fun openNotificationAccess() {
            runOnUiThread {
                startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
            }
        }

        @JavascriptInterface
        fun requestPostNotifications() {
            runOnUiThread {
                if (Build.VERSION.SDK_INT < 33) return@runOnUiThread
                if (hasPostNotifications()) return@runOnUiThread
                requestNotifPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }

        @JavascriptInterface
        fun openBattery() { runOnUiThread { OemHelper.openBatterySettings(this@MainActivity) } }

        @JavascriptInterface
        fun openAutostart() {
            runOnUiThread {
                prefs().edit().putBoolean("autostart_done", true).apply()
                OemHelper.openAutostartSettings(this@MainActivity)
            }
        }

        @JavascriptInterface
        fun markAutostartDone() {
            prefs().edit().putBoolean("autostart_done", true).apply()
        }

        @JavascriptInterface
        fun openOverlay() {
            runOnUiThread {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    if (Settings.canDrawOverlays(this@MainActivity)) return@runOnUiThread
                    startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")))
                }
            }
        }

        @JavascriptInterface
        fun openShizuku() {
            runOnUiThread {
                when {
                    !ShizukuHelper.isAvailable() -> toast("Pasang dan jalankan app Shizuku dulu")
                    ShizukuHelper.isGranted() -> { /* already connected */ }
                    else -> ShizukuHelper.requestPermission()
                }
            }
        }

        @JavascriptInterface fun openPackagePicker() { runOnUiThread { showPackagePicker() } }

        @JavascriptInterface
        fun getPackagesJson(): String {
            val available = buildAvailablePackages()
            val current = prefs().getStringSet("selected_packages", null) ?: emptySet()
            val arr = JSONArray()
            available.forEach { (pkg, label) ->
                val o = JSONObject()
                o.put("pkg", pkg)
                o.put("label", label)
                o.put("selected", current.contains(pkg))
                arr.put(o)
            }
            return arr.toString()
        }

        @JavascriptInterface
        fun setSelectedPackages(json: String) {
            try {
                val arr = JSONArray(json)
                val set = HashSet<String>()
                for (i in 0 until arr.length()) {
                    val s = arr.optString(i).trim()
                    if (s.isNotEmpty()) set.add(s)
                }
                prefs().edit().putStringSet("selected_packages", set).apply()
            } catch (_: Exception) {}
        }

        @JavascriptInterface
        fun toggleListener() {
            runOnUiThread {
                val p = prefs()
                val on = !p.getBoolean("listener_enabled", false)
                if (on) {
                    if (p.getString("api_key", "").isNullOrBlank()) {
                        toast("Buka Profil, pastikan API key ada, lalu aktifkan lagi")
                        return@runOnUiThread
                    }
                    p.edit().putBoolean("listener_enabled", true).apply()
                    startKeepAlive()
                } else {
                    p.edit().putBoolean("listener_enabled", false).apply()
                    stopService(Intent(this@MainActivity, KeepAliveService::class.java))
                    WatchdogReceiver.cancel(this@MainActivity)
                }
            }
        }

        @JavascriptInterface
        fun saveListener() {
            runOnUiThread {
                val p = prefs()
                if (p.getString("webhook_url", null).isNullOrBlank()) {
                    p.edit().putString("webhook_url", "$SITE_URL/api/webhook").apply()
                }
                if (p.getBoolean("listener_enabled", false)) startKeepAlive()
            }
        }

        @JavascriptInterface fun setApiKey(key: String) { prefs().edit().putString("api_key", key.trim()).apply() }
        @JavascriptInterface fun setWebhookUrl(url: String) { prefs().edit().putString("webhook_url", url.trim()).apply() }
        @JavascriptInterface fun setWebhookSecret(secret: String) { prefs().edit().putString("webhook_secret", secret.trim()).apply() }
    }

    private fun prefs() = getSharedPreferences("walzpay", Context.MODE_PRIVATE)

    private fun startKeepAlive() {
        val i = Intent(this, KeepAliveService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(i) else startService(i)
        WatchdogReceiver.schedule(this)
        AppLog.append(this, "Listener ON")
    }

    private fun hasPostNotifications(): Boolean {
        if (Build.VERSION.SDK_INT < 33) return true
        return ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
    }

    private fun isNotificationEnabled(): Boolean {
        val cn = ComponentName(this, PaymentNotificationListener::class.java)
        val flat = Settings.Secure.getString(contentResolver, "enabled_notification_listeners") ?: return false
        return flat.split(":").any { ComponentName.unflattenFromString(it)?.equals(cn) == true }
    }

    private fun isIgnoringBattery(): Boolean {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        return pm.isIgnoringBatteryOptimizations(packageName)
    }

    private fun toast(msg: String) = Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()

    private fun buildAvailablePackages(): LinkedHashMap<String, String> {
        val available = LinkedHashMap<String, String>()
        knownPackages.forEach { (pkg, label) -> if (isPkg(pkg)) available[pkg] = label }
        try {
            packageManager.getInstalledApplications(PackageManager.GET_META_DATA)
                .filter { (it.flags and ApplicationInfo.FLAG_SYSTEM) == 0 }
                .forEach {
                    if (!available.containsKey(it.packageName)) {
                        val label = try { packageManager.getApplicationLabel(it).toString() } catch (_: Exception) { it.packageName }
                        available[it.packageName] = label
                    }
                }
        } catch (_: Exception) {}
        return available
    }

    private fun showPackagePicker() {
        val available = buildAvailablePackages()
        if (available.isEmpty()) { toast("Tidak ada app terpasang"); return }
        val packages = available.keys.toList()
        val labels = packages.map { "${available[it]}\n$it" }.toTypedArray()
        val current = prefs().getStringSet("selected_packages", null)?.toMutableSet() ?: mutableSetOf()
        current.retainAll(packages.toSet())
        val checked = packages.map { current.contains(it) }.toBooleanArray()
        AlertDialog.Builder(this)
            .setTitle("Pilih sumber notifikasi")
            .setMultiChoiceItems(labels, checked) { _, which, isChecked ->
                val pkg = packages[which]
                if (isChecked) current.add(pkg) else current.remove(pkg)
            }
            .setPositiveButton("Simpan") { _, _ ->
                prefs().edit().putStringSet("selected_packages", HashSet(current)).apply()
            }
            .setNegativeButton("Batal", null)
            .show()
    }

    private fun isPkg(pkg: String) = try { packageManager.getPackageInfo(pkg, 0); true } catch (_: Exception) { false }

    override fun onSaveInstanceState(outState: Bundle) { super.onSaveInstanceState(outState); webView.saveState(outState) }
    override fun onResume() { super.onResume(); webView.onResume(); if (!showingOffline) injectBridgeHook() }
    override fun onPause() { webView.onPause(); super.onPause() }
}
