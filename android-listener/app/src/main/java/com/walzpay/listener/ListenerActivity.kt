package com.walzpay.listener

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.switchmaterial.SwitchMaterial
import rikka.shizuku.Shizuku

class ListenerActivity : AppCompatActivity() {

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

    private lateinit var tvPermissionStatus: TextView
    private lateinit var tvBatteryStatus: TextView
    private lateinit var tvShizukuStatus: TextView
    private lateinit var tvOverlayStatus: TextView
    private lateinit var tvSelectedPackages: TextView
    private lateinit var tvLogs: TextView
    private lateinit var etWebhookUrl: EditText
    private lateinit var etApiKey: EditText
    private lateinit var etSecret: EditText
    private lateinit var switchEnabled: SwitchMaterial

    private val shizukuPermissionListener =
        Shizuku.OnRequestPermissionResultListener { requestCode, grantResult ->
            if (requestCode == ShizukuHelper.REQUEST_CODE) {
                AppLog.append(
                    this,
                    if (grantResult == PackageManager.PERMISSION_GRANTED)
                        "Shizuku izin diberikan"
                    else
                        "Shizuku izin ditolak"
                )
                refreshUi()
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        try {
            Shizuku.addRequestPermissionResultListener(shizukuPermissionListener)
        } catch (_: Throwable) {
        }

        tvPermissionStatus = findViewById(R.id.tvPermissionStatus)
        tvBatteryStatus = findViewById(R.id.tvBatteryStatus)
        tvShizukuStatus = findViewById(R.id.tvShizukuStatus)
        tvOverlayStatus = findViewById(R.id.tvOverlayStatus)
        tvSelectedPackages = findViewById(R.id.tvSelectedPackages)
        tvLogs = findViewById(R.id.tvLogs)
        etWebhookUrl = findViewById(R.id.etWebhookUrl)
        etApiKey = findViewById(R.id.etApiKey)
        etSecret = findViewById(R.id.etSecret)
        switchEnabled = findViewById(R.id.switchEnabled)

        val prefs = getSharedPreferences("walzpay", Context.MODE_PRIVATE)
        etWebhookUrl.setText(
            prefs.getString("webhook_url", "https://walzpaynew.vercel.app/api/webhook")
        )
        etApiKey.setText(prefs.getString("api_key", ""))
        etSecret.setText(prefs.getString("webhook_secret", ""))
        switchEnabled.isChecked = prefs.getBoolean("listener_enabled", false)

        refreshUi()
        refreshPackageLabel()

        findViewById<Button>(R.id.btnOpenNotificationAccess).setOnClickListener {
            startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
        }
        findViewById<Button>(R.id.btnBattery).setOnClickListener {
            OemHelper.openBatterySettings(this)
        }
        findViewById<Button>(R.id.btnAutostart).setOnClickListener {
            OemHelper.openAutostartSettings(this)
        }
        findViewById<Button>(R.id.btnOverlay).setOnClickListener {
            requestOverlay()
        }
        findViewById<Button>(R.id.btnShizuku).setOnClickListener {
            if (!ShizukuHelper.isAvailable()) {
                Toast.makeText(this, "Pasang & jalankan app Shizuku dulu", Toast.LENGTH_LONG).show()
            } else if (ShizukuHelper.isGranted()) {
                Toast.makeText(this, "Shizuku sudah terhubung", Toast.LENGTH_SHORT).show()
            } else {
                ShizukuHelper.requestPermission()
            }
            refreshUi()
        }
        findViewById<Button>(R.id.btnPickPackages).setOnClickListener { showPackagePicker() }
        findViewById<Button>(R.id.btnClearLogs).setOnClickListener {
            AppLog.clear(this)
            tvLogs.text = AppLog.read(this)
        }
        findViewById<Button>(R.id.btnSave).setOnClickListener { saveSettings() }
    }

    private fun requestOverlay() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (Settings.canDrawOverlays(this)) {
                Toast.makeText(this, "Overlay sudah diizinkan", Toast.LENGTH_SHORT).show()
                return
            }
            val intent = Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:$packageName")
            )
            startActivity(intent)
        }
    }

    private fun saveSettings() {
        val prefs = getSharedPreferences("walzpay", Context.MODE_PRIVATE)
        val url = etWebhookUrl.text.toString().trim()
        val apiKey = etApiKey.text.toString().trim()
        val secret = etSecret.text.toString().trim()
        val enabled = switchEnabled.isChecked

        if (enabled && url.isEmpty()) {
            Toast.makeText(this, "Isi Webhook URL dulu", Toast.LENGTH_SHORT).show()
            return
        }
        if (enabled && apiKey.isEmpty()) {
            Toast.makeText(this, "API Key wajib", Toast.LENGTH_LONG).show()
            return
        }

        prefs.edit()
            .putString("webhook_url", url)
            .putString("api_key", apiKey)
            .putString("webhook_secret", secret)
            .putBoolean("listener_enabled", enabled)
            .apply()

        if (enabled) {
            val i = Intent(this, KeepAliveService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(i)
            else startService(i)
            WatchdogReceiver.schedule(this)
            AppLog.append(this, "Listener ON")
        } else {
            stopService(Intent(this, KeepAliveService::class.java))
            WatchdogReceiver.cancel(this)
            AppLog.append(this, "Listener OFF")
        }
        Toast.makeText(this, "Pengaturan disimpan", Toast.LENGTH_SHORT).show()
        refreshUi()
    }

    override fun onDestroy() {
        try {
            Shizuku.removeRequestPermissionResultListener(shizukuPermissionListener)
        } catch (_: Throwable) {
        }
        super.onDestroy()
    }

    override fun onResume() {
        super.onResume()
        refreshUi()
        refreshPackageLabel()
    }

    private fun refreshPackageLabel() {
        val prefs = getSharedPreferences("walzpay", Context.MODE_PRIVATE)
        val sel = prefs.getStringSet("selected_packages", null)
        tvSelectedPackages.text = if (sel.isNullOrEmpty()) {
            "Belum dipilih — Pilih sumber lalu Simpan"
        } else {
            "Terpilih ${sel.size} aplikasi (terpasang)"
        }
    }

    private fun showPackagePicker() {
        val prefs = getSharedPreferences("walzpay", Context.MODE_PRIVATE)
        val pm = packageManager

        val available = LinkedHashMap<String, String>()
        knownPackages.forEach { (pkg, label) ->
            if (isPackageInstalled(pkg)) available[pkg] = label
        }
        try {
            pm.getInstalledApplications(PackageManager.GET_META_DATA)
                .filter { (it.flags and ApplicationInfo.FLAG_SYSTEM) == 0 }
                .forEach {
                    if (!available.containsKey(it.packageName)) {
                        val label = try {
                            pm.getApplicationLabel(it).toString()
                        } catch (_: Exception) {
                            it.packageName
                        }
                        available[it.packageName] = label
                    }
                }
        } catch (_: Exception) {
        }

        if (available.isEmpty()) {
            Toast.makeText(this, "Tidak ada app terpasang terdeteksi", Toast.LENGTH_LONG).show()
            return
        }

        val packages = available.keys.toList()
        val labels = packages.map { "${available[it]}\n$it" }.toTypedArray()
        val current = prefs.getStringSet("selected_packages", null)?.toMutableSet()
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
                prefs.edit().putStringSet("selected_packages", HashSet(current)).apply()
                refreshPackageLabel()
                Toast.makeText(this, "Sumber disimpan (${current.size})", Toast.LENGTH_SHORT).show()
            }
            .setNegativeButton("Batal", null)
            .setNeutralButton("Pilih semua") { _, _ ->
                prefs.edit().putStringSet("selected_packages", HashSet(packages)).apply()
                refreshPackageLabel()
            }
            .show()
    }

    private fun isPackageInstalled(pkg: String): Boolean {
        return try {
            packageManager.getPackageInfo(pkg, 0)
            true
        } catch (_: Exception) {
            false
        }
    }

    private fun refreshUi() {
        tvPermissionStatus.text = if (isNotificationServiceEnabled())
            "Notifikasi: AKTIF" else "Notifikasi: belum diizinkan"
        tvBatteryStatus.text = if (isIgnoringBattery())
            "Baterai: tanpa optimasi" else "Baterai: masih dioptimasi"
        tvShizukuStatus.text = ShizukuHelper.statusText()
        val overlayOk = Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(this)
        tvOverlayStatus.text =
            if (overlayOk) "Overlay: diizinkan" else "Overlay: belum diizinkan"
        tvLogs.text = AppLog.read(this)
    }

    private fun isNotificationServiceEnabled(): Boolean {
        val cn = ComponentName(this, PaymentNotificationListener::class.java)
        val flat = Settings.Secure.getString(contentResolver, "enabled_notification_listeners")
            ?: return false
        return flat.split(":").any {
            ComponentName.unflattenFromString(it)?.equals(cn) == true
        }
    }

    private fun isIgnoringBattery(): Boolean {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        return pm.isIgnoringBatteryOptimizations(packageName)
    }
}
