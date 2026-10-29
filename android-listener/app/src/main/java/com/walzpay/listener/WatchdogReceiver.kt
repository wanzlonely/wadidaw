package com.walzpay.listener

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.SystemClock

/**
 * Alarm periodik: pastikan KeepAliveService tetap jalan.
 */
class WatchdogReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val prefs = context.getSharedPreferences("walzpay", Context.MODE_PRIVATE)
        if (!prefs.getBoolean("listener_enabled", false)) return

        val service = Intent(context, KeepAliveService::class.java)
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(service)
            } else {
                context.startService(service)
            }
            AppLog.append(context, "Watchdog: KeepAlive di-cek")
        } catch (e: Exception) {
            AppLog.append(context, "Watchdog error: ${e.message}")
        }

        schedule(context)
    }

    companion object {
        private const val INTERVAL_MS = 15 * 60 * 1000L // 15 menit
        private const val REQ = 8801

        fun schedule(context: Context) {
            val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val pi = PendingIntent.getBroadcast(
                context,
                REQ,
                Intent(context, WatchdogReceiver::class.java),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            val trigger = SystemClock.elapsedRealtime() + INTERVAL_MS
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    am.setExactAndAllowWhileIdle(
                        AlarmManager.ELAPSED_REALTIME_WAKEUP,
                        trigger,
                        pi
                    )
                } else {
                    am.setExact(AlarmManager.ELAPSED_REALTIME_WAKEUP, trigger, pi)
                }
            } catch (e: Exception) {
                am.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, trigger, pi)
            }
        }

        fun cancel(context: Context) {
            val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val pi = PendingIntent.getBroadcast(
                context,
                REQ,
                Intent(context, WatchdogReceiver::class.java),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            am.cancel(pi)
        }
    }
}
