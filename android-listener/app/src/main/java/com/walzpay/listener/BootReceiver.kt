package com.walzpay.listener

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action == Intent.ACTION_BOOT_COMPLETED) {
            val prefs = context.getSharedPreferences("walzpay", Context.MODE_PRIVATE)
            if (prefs.getBoolean("listener_enabled", false)) {
                context.startService(Intent(context, KeepAliveService::class.java))
            }
        }
    }
}
