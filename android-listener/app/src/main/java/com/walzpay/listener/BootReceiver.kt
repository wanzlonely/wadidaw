package com.walzpay.listener

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return
        val ok = action == Intent.ACTION_BOOT_COMPLETED ||
            action == Intent.ACTION_MY_PACKAGE_REPLACED ||
            action == Intent.ACTION_LOCKED_BOOT_COMPLETED ||
            action == "android.intent.action.QUICKBOOT_POWERON"
        if (!ok) return

        val prefs = context.getSharedPreferences("walzpay", Context.MODE_PRIVATE)
        if (!prefs.getBoolean("listener_enabled", false)) return

        val service = Intent(context, KeepAliveService::class.java)
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(service)
            } else {
                context.startService(service)
            }
            WatchdogReceiver.schedule(context)
            AppLog.append(context, "Boot: KeepAlive + Watchdog")
        } catch (e: Exception) {
            AppLog.append(context, "Boot error: ${e.message}")
        }
    }
}
