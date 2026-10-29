package com.walzpay.listener

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.widget.Toast

/**
 * Buka halaman Autostart / startup management per OEM.
 * Android standar tidak punya permission "autostart" — hanya intent vendor.
 */
object OemHelper {

    fun openAutostartSettings(context: Context) {
        val candidates = buildList {
            // Xiaomi / MIUI / HyperOS
            add(component("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"))
            add(packageIntent("com.miui.securitycenter"))
            // OPPO / ColorOS
            add(component("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"))
            add(component("com.oplus.safecenter", "com.oplus.safecenter.permission.startup.StartupAppListActivity"))
            add(component("com.coloros.safecenter", "com.coloros.safecenter.startupapp.StartupAppListActivity"))
            // Vivo
            add(component("com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity"))
            add(component("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"))
            // Huawei / Honor
            add(component("com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"))
            add(component("com.huawei.systemmanager", "com.huawei.systemmanager.optimize.process.ProtectActivity"))
            // Samsung
            add(component("com.samsung.android.lool", "com.samsung.android.sm.battery.ui.BatteryActivity"))
            add(component("com.samsung.android.sm", "com.samsung.android.sm.ui.battery.BatteryActivity"))
            // OnePlus
            add(component("com.oneplus.security", "com.oneplus.security.chainlaunch.view.ChainLaunchAppListActivity"))
            // Realme
            add(component("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.FakeActivity"))
            // Fallback: app details
            add(
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = Uri.parse("package:${context.packageName}")
                }
            )
        }

        for (intent in candidates) {
            try {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                if (intent.resolveActivity(context.packageManager) != null) {
                    context.startActivity(intent)
                    AppLog.append(context, "Autostart settings dibuka (${intent.component ?: intent.action})")
                    return
                }
            } catch (_: Exception) {
                /* coba berikutnya */
            }
        }
        Toast.makeText(
            context,
            "Buka manual: Pengaturan → Aplikasi → WALZPAY → Autostart / Jalankan di latar",
            Toast.LENGTH_LONG
        ).show()
    }

    fun openBatterySettings(context: Context) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val i = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                    data = Uri.parse("package:${context.packageName}")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(i)
                return
            }
        } catch (_: Exception) {
        }
        try {
            context.startActivity(
                Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
        } catch (_: Exception) {
            openAppDetails(context)
        }
    }

    fun openAppDetails(context: Context) {
        try {
            context.startActivity(
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = Uri.parse("package:${context.packageName}")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
            )
        } catch (_: Exception) {
            Toast.makeText(context, "Tidak bisa buka detail aplikasi", Toast.LENGTH_SHORT).show()
        }
    }

    private fun component(pkg: String, cls: String): Intent =
        Intent().setComponent(ComponentName(pkg, cls))

    private fun packageIntent(pkg: String): Intent =
        contextPackageLaunch(pkg)

    private fun contextPackageLaunch(pkg: String): Intent {
        return Intent().setPackage(pkg).setAction(Intent.ACTION_MAIN)
    }
}
