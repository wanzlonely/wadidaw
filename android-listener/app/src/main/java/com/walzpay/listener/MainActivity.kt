package com.walzpay.listener

import android.annotation.SuppressLint
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.view.View
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONObject

/**
 * Website UI penuh di WebView.
 * Tombol permission di website memanggil WalzAndroid.* → intent native.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var loading: View

    companion object {
        const val SITE_URL = "https://walzpaynew.vercel.app"
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

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        SessionStore.init(this)
        setContentView(R.layout.activity_web)

        webView = findViewById(R.id.webView)
        loading = findViewById(R.id.loadingOverlay)
        // Sembunyikan FAB jika ada di layout lama
        findViewById<View?>(R.id.fabListener)?.visibility = View.GONE

        val settings: WebSettings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.allowFileAccess = true
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
        settings.userAgentString = settings.userAgentString + " WalzpayApp/2.2"

        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)

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
                injectBridgeHook()
            }
        }
        webView.webChromeClient = WebChromeClient()

        if (savedInstanceState == null) webView.loadUrl(SITE_URL)
        else webView.restoreState(savedInstanceState)

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

    /** Tandai halaman bahwa ini app + bind klik data-walz-action */
    private fun injectBridgeHook() {
        webView.evaluateJavascript(
            """
            (function(){
              window.__WALZ_APP__ = true;
              document.documentElement.setAttribute('data-walz-app','1');
              document.querySelectorAll('[data-walz-action]').forEach(function(el){
                if (el.__walzBound) return;
                el.__walzBound = true;
                el.addEventListener('click', function(ev){
                  var a = el.getAttribute('data-walz-action');
                  if (!a || !window.WalzAndroid) return;
                  ev.preventDefault();
                  try {
                    if (a === 'notification') WalzAndroid.openNotificationAccess();
                    else if (a === 'battery') WalzAndroid.openBattery();
                    else if (a === 'autostart') WalzAndroid.openAutostart();
                    else if (a === 'overlay') WalzAndroid.openOverlay();
                    else if (a === 'shizuku') WalzAndroid.openShizuku();
                    else if (a === 'packages') WalzAndroid.openPackagePicker();
                    else if (a === 'toggle_listener') WalzAndroid.toggleListener();
                    else if (a === 'save_listener') WalzAndroid.saveListener();
                  } catch(e) { console.error(e); }
                });
              });
            })();
            """.trimIndent(),
            null
        )
    }

    inner class WalzBridge {
        @JavascriptInterface
        fun isApp(): Boolean = true

        @JavascriptInterface
        fun getStatusJson(): String {
            val j = JSONObject()
            j.put("notification", isNotificationEnabled())
            j.put("battery", isIgnoringBattery())
            j.put(
                "overlay",
                Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(this@MainActivity)
            )
            j.put("listener", prefs().getBoolean("listener_enabled", false))
            j.put("shizuku", try {
                ShizukuHelper.statusText()
            } catch (_: Throwable) {
                "n/a"
            })
            val sel = prefs().getStringSet("selected_packages", null)
            j.put("packages", sel?.size ?: 0)
            return j.toString()
        }

        @JavascriptInterface
        fun openNotificationAccess() {
            runOnUiThread {
                startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
                toast("Aktifkan WALZPAY di daftar akses notifikasi")
            }
        }

        @JavascriptInterface
        fun openBattery() {
            runOnUiThread {
                OemHelper.openBatterySettings(this@MainActivity)
            }
        }

        @JavascriptInterface
        fun openAutostart() {
            runOnUiThread {
                OemHelper.openAutostartSettings(this@MainActivity)
            }
        }

        @JavascriptInterface
        fun openOverlay() {
            runOnUiThread {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    if (Settings.canDrawOverlays(this@MainActivity)) {
                        toast("Overlay sudah diizinkan")
                        return@runOnUiThread
                    }
                    startActivity(
                        Intent(
                            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                            Uri.parse("package:$packageName")
                        )
                    )
                }
            }
        }

        @JavascriptInterface
        fun openShizuku() {
            runOnUiThread {
                if (!ShizukuHelper.isAvailable()) {
                    toast("Pasang & jalankan app Shizuku dulu")
                } else if (ShizukuHelper.isGranted()) {
                    toast("Shizuku sudah terhubung")
                } else {
                    ShizukuHelper.requestPermission()
                }
            }
        }

        @JavascriptInterface
        fun openPackagePicker() {
            runOnUiThread { showPackagePicker() }
        }

        @JavascriptInterface
        fun toggleListener() {
            runOnUiThread {
                val p = prefs()
                val on = !p.getBoolean("listener_enabled", false)
                if (on) {
                    val key = p.getString("api_key", "").orEmpty()
                    if (key.isBlank()) {
                        // Ambil API key dari settings website via localStorage injection nanti
                        toast("Isi API Key di Setel dulu, lalu aktifkan lagi")
                        return@runOnUiThread
                    }
                    p.edit().putBoolean("listener_enabled", true).apply()
                    startKeepAlive()
                    toast("Listener aktif")
                } else {
                    p.edit().putBoolean("listener_enabled", false).apply()
                    stopService(Intent(this@MainActivity, KeepAliveService::class.java))
                    WatchdogReceiver.cancel(this@MainActivity)
                    toast("Listener dimatikan")
                }
            }
        }

        @JavascriptInterface
        fun saveListener() {
            runOnUiThread {
                // Pastikan URL + key tersimpan default
                val p = prefs()
                if (p.getString("webhook_url", null).isNullOrBlank()) {
                    p.edit()
                        .putString("webhook_url", "$SITE_URL/api/webhook")
                        .apply()
                }
                if (p.getBoolean("listener_enabled", false)) {
                    startKeepAlive()
                }
                toast("Pengaturan listener disimpan")
            }
        }

        @JavascriptInterface
        fun setApiKey(key: String) {
            prefs().edit().putString("api_key", key.trim()).apply()
        }

        @JavascriptInterface
        fun setWebhookUrl(url: String) {
            prefs().edit().putString("webhook_url", url.trim()).apply()
        }

        @JavascriptInterface
        fun setWebhookSecret(secret: String) {
            prefs().edit().putString("webhook_secret", secret.trim()).apply()
        }
    }

    private fun prefs() = getSharedPreferences("walzpay", Context.MODE_PRIVATE)

    private fun startKeepAlive() {
        val i = Intent(this, KeepAliveService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(i)
        else startService(i)
        WatchdogReceiver.schedule(this)
        AppLog.append(this, "Listener ON (dari website)")
    }

    private fun isNotificationEnabled(): Boolean {
        val cn = ComponentName(this, PaymentNotificationListener::class.java)
        val flat = Settings.Secure.getString(
            contentResolver,
            "enabled_notification_listeners"
        ) ?: return false
        return flat.split(":").any {
            ComponentName.unflattenFromString(it)?.equals(cn) == true
        }
    }

    private fun isIgnoringBattery(): Boolean {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        return pm.isIgnoringBatteryOptimizations(packageName)
    }

    private fun toast(msg: String) {
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
    }

    private fun showPackagePicker() {
        val p = prefs()
        val available = LinkedHashMap<String, String>()
        knownPackages.forEach { (pkg, label) ->
            if (isPkg(pkg)) available[pkg] = label
        }
        try {
            packageManager.getInstalledApplications(PackageManager.GET_META_DATA)
                .filter { (it.flags and ApplicationInfo.FLAG_SYSTEM) == 0 }
                .forEach {
                    if (!available.containsKey(it.packageName)) {
                        val label = try {
                            packageManager.getApplicationLabel(it).toString()
                        } catch (_: Exception) {
                            it.packageName
                        }
                        available[it.packageName] = label
                    }
                }
        } catch (_: Exception) {
        }

        if (available.isEmpty()) {
            toast("Tidak ada app terpasang terdeteksi")
            return
        }

        val packages = available.keys.toList()
        val labels = packages.map { "${available[it]}\n$it" }.toTypedArray()
        val current = p.getStringSet("selected_packages", null)?.toMutableSet()
            ?: packages.filter { knownPackages.containsKey(it) }.toMutableSet()
        current.retainAll(packages.toSet())
        val checked = packages.map { current.contains(it) }.toBooleanArray()

        AlertDialog.Builder(this)
            .setTitle("Pilih sumber notifikasi")
            .setMultiChoiceItems(labels, checked) { _, which, isChecked ->
                val pkg = packages[which]
                if (isChecked) current.add(pkg) else current.remove(pkg)
            }
            .setPositiveButton("Simpan") { _, _ ->
                p.edit().putStringSet("selected_packages", HashSet(current)).apply()
                toast("Sumber disimpan (${current.size})")
            }
            .setNegativeButton("Batal", null)
            .show()
    }

    private fun isPkg(pkg: String): Boolean {
        return try {
            packageManager.getPackageInfo(pkg, 0)
            true
        } catch (_: Exception) {
            false
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
        injectBridgeHook()
    }

    override fun onPause() {
        webView.onPause()
        super.onPause()
    }
}
