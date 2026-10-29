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
import android.text.Editable
import android.text.TextWatcher
import android.widget.EditText
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import com.walzpay.listener.databinding.ActivityMainBinding

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding

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

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val prefs = getSharedPreferences("walzpay", Context.MODE_PRIVATE)

        val defaultUrl = "https://walzpaynew.vercel.app/api/webhook"
        binding.etWebhookUrl.setText(prefs.getString("webhook_url", defaultUrl))
        binding.etApiKey.setText(prefs.getString("api_key", ""))
        binding.etSecret.setText(prefs.getString("webhook_secret", ""))
        binding.switchEnabled.isChecked = prefs.getBoolean("listener_enabled", false)

        refreshUi()
        refreshPackageLabel()

        binding.btnOpenNotificationAccess.setOnClickListener {
            startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
        }

        binding.btnBattery.setOnClickListener {
            requestIgnoreBattery()
        }

        binding.btnPickPackages.setOnClickListener {
            showPackagePicker()
        }

        binding.btnClearLogs.setOnClickListener {
            AppLog.clear(this)
            binding.tvLogs.text = AppLog.read(this)
            Toast.makeText(this, "Log dibersihkan", Toast.LENGTH_SHORT).show()
        }

        binding.btnSave.setOnClickListener {
            val url = binding.etWebhookUrl.text.toString().trim()
            val apiKey = binding.etApiKey.text.toString().trim()
            val secret = binding.etSecret.text.toString().trim()
            val enabled = binding.switchEnabled.isChecked

            if (enabled && url.isEmpty()) {
                Toast.makeText(this, "Isi Webhook URL dulu", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            if (enabled && apiKey.isEmpty()) {
                Toast.makeText(
                    this,
                    "API Key wajib — salin dari website Setel",
                    Toast.LENGTH_LONG
                ).show()
                return@setOnClickListener
            }

            prefs.edit()
                .putString("webhook_url", url)
                .putString("api_key", apiKey)
                .putString("webhook_secret", secret)
                .putBoolean("listener_enabled", enabled)
                .apply()

            if (enabled) {
                val i = Intent(this, KeepAliveService::class.java)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    startForegroundService(i)
                } else {
                    startService(i)
                }
                AppLog.append(this, "Listener ON · FG service start")
            } else {
                stopService(Intent(this, KeepAliveService::class.java))
                AppLog.append(this, "Listener OFF")
            }

            Toast.makeText(this, "Pengaturan disimpan", Toast.LENGTH_SHORT).show()
            refreshUi()
        }
    }

    override fun onResume() {
        super.onResume()
        refreshUi()
        refreshPackageLabel()
    }

    private fun refreshPackageLabel() {
        val prefs = getSharedPreferences("walzpay", Context.MODE_PRIVATE)
        val sel = prefs.getStringSet("selected_packages", null)
        binding.tvSelectedPackages.text = if (sel.isNullOrEmpty()) {
            "Default: DANA, GoPay, OVO, Shopee, WA…"
        } else {
            "Terpilih ${sel.size} aplikasi: " + sel.take(4).joinToString(", ") +
                if (sel.size > 4) "…" else ""
        }
    }

    private fun showPackagePicker() {
        val prefs = getSharedPreferences("walzpay", Context.MODE_PRIVATE)
        val current = prefs.getStringSet("selected_packages", null)?.toMutableSet()
            ?: knownPackages.keys.toMutableSet()

        val pm = packageManager
        val installed = try {
            pm.getInstalledApplications(PackageManager.GET_META_DATA)
                .filter { (it.flags and ApplicationInfo.FLAG_SYSTEM) == 0 }
                .map {
                    val label = try {
                        pm.getApplicationLabel(it).toString()
                    } catch (_: Exception) {
                        it.packageName
                    }
                    it.packageName to label
                }
                .sortedBy { it.second.lowercase() }
        } catch (_: Exception) {
            emptyList()
        }

        val all = LinkedHashMap<String, String>()
        knownPackages.forEach { (k, v) -> all[k] = v }
        installed.forEach { (pkg, label) ->
            if (!all.containsKey(pkg)) all[pkg] = label
        }

        val packages = all.keys.toList()
        val labels = packages.map { pkg ->
            val name = all[pkg] ?: pkg
            "$name\n$pkg"
        }.toTypedArray()
        val checked = packages.map { current.contains(it) }.toBooleanArray()

        val builder = AlertDialog.Builder(this)
        builder.setTitle("Pilih sumber notifikasi")

        val search = EditText(this).apply {
            hint = "Cari aplikasi…"
            setPadding(48, 24, 48, 24)
        }
        builder.setView(search)

        builder.setMultiChoiceItems(labels, checked) { _, which, isChecked ->
            val pkg = packages[which]
            if (isChecked) current.add(pkg) else current.remove(pkg)
        }
        builder.setPositiveButton("Simpan") { _, _ ->
            prefs.edit().putStringSet("selected_packages", current).apply()
            refreshPackageLabel()
            Toast.makeText(this, "Sumber disimpan (${current.size})", Toast.LENGTH_SHORT).show()
        }
        builder.setNegativeButton("Batal", null)
        builder.setNeutralButton("Reset default") { _, _ ->
            prefs.edit().remove("selected_packages").apply()
            refreshPackageLabel()
            Toast.makeText(this, "Kembali ke default", Toast.LENGTH_SHORT).show()
        }

        val dialog = builder.create()
        dialog.show()

        search.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                // list filter optional — selection state stays in `current`
            }
        })
    }

    private fun refreshUi() {
        binding.tvPermissionStatus.text = if (isNotificationServiceEnabled()) {
            "✅ Akses notifikasi: AKTIF"
        } else {
            "❌ Akses notifikasi: belum diizinkan"
        }

        binding.tvBatteryStatus.text = if (isIgnoringBattery()) {
            "✅ Baterai: tanpa optimasi"
        } else {
            "⚠️ Baterai: masih dioptimasi sistem"
        }

        binding.tvLogs.text = AppLog.read(this)
    }

    private fun isNotificationServiceEnabled(): Boolean {
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

    private fun requestIgnoreBattery() {
        try {
            if (isIgnoringBattery()) {
                Toast.makeText(this, "Sudah tanpa optimasi baterai", Toast.LENGTH_SHORT).show()
                return
            }
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:$packageName")
            }
            startActivity(intent)
        } catch (e: Exception) {
            startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
        }
    }
}
