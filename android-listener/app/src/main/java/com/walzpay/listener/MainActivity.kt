package com.walzpay.listener

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.text.TextUtils
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

        binding.etWebhookUrl.setText(prefs.getString("webhook_url", ""))
        binding.etSecret.setText(prefs.getString("webhook_secret", ""))
        binding.switchEnabled.isChecked = prefs.getBoolean("listener_enabled", false)

        updatePermissionStatus()

        binding.btnOpenNotificationAccess.setOnClickListener {
            startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
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
                startService(Intent(this, KeepAliveService::class.java))
            } else {
                stopService(Intent(this, KeepAliveService::class.java))
            }

            Toast.makeText(this, "Pengaturan disimpan", Toast.LENGTH_SHORT).show()
            updatePermissionStatus()
        }
    }

    override fun onResume() {
        super.onResume()
        updatePermissionStatus()
    }

    private fun updatePermissionStatus() {
        val granted = isNotificationServiceEnabled()
        binding.tvPermissionStatus.text = if (granted) {
            "✅ Akses notifikasi: AKTIF"
        } else {
            "❌ Akses notifikasi: BELUM diizinkan — tekan tombol di bawah"
        }
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
}
