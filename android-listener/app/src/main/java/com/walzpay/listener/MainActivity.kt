package com.walzpay.listener

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.walzpay.listener.databinding.ActivityMainBinding

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val prefs = getSharedPreferences("walzpay", Context.MODE_PRIVATE)

        val defaultUrl = "https://wadidaw-zeta.vercel.app/api/webhook"
        binding.etWebhookUrl.setText(prefs.getString("webhook_url", defaultUrl))
        binding.etSecret.setText(prefs.getString("webhook_secret", ""))
        binding.switchEnabled.isChecked = prefs.getBoolean("listener_enabled", false)

        refreshUi()

        binding.btnOpenNotificationAccess.setOnClickListener {
            startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
        }

        binding.btnBattery.setOnClickListener {
            requestIgnoreBattery()
        }

        binding.btnClearLogs.setOnClickListener {
            AppLog.clear(this)
            binding.tvLogs.text = AppLog.read(this)
            Toast.makeText(this, "Log dibersihkan", Toast.LENGTH_SHORT).show()
        }

        binding.btnSave.setOnClickListener {
            val url = binding.etWebhookUrl.text.toString().trim()
            val secret = binding.etSecret.text.toString().trim()
            val enabled = binding.switchEnabled.isChecked

            if (enabled && url.isEmpty()) {
                Toast.makeText(this, "Isi Webhook URL dulu", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            prefs.edit()
                .putString("webhook_url", url)
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
