package com.walzpay.listener

import android.content.Context
import android.content.pm.PackageManager
import rikka.shizuku.Shizuku

/**
 * Integrasi Shizuku opsional.
 * Jika Shizuku tidak terpasang / tidak jalan → app tetap berfungsi normal.
 */
object ShizukuHelper {

    const val REQUEST_CODE = 4401

    fun isAvailable(): Boolean {
        return try {
            Shizuku.pingBinder()
        } catch (_: Throwable) {
            false
        }
    }

    fun isGranted(): Boolean {
        return try {
            if (!isAvailable()) return false
            Shizuku.checkSelfPermission() == PackageManager.PERMISSION_GRANTED
        } catch (_: Throwable) {
            false
        }
    }

    fun requestPermission() {
        try {
            if (!isAvailable()) return
            if (isGranted()) return
            Shizuku.requestPermission(REQUEST_CODE)
        } catch (_: Throwable) {
            /* ignore */
        }
    }

    fun statusText(): String {
        return try {
            when {
                !isAvailable() -> "Shizuku: tidak aktif / belum dipasang"
                isGranted() -> "Shizuku: TERHUBUNG ✓"
                else -> "Shizuku: perlu izin"
            }
        } catch (_: Throwable) {
            "Shizuku: tidak tersedia"
        }
    }

    fun logStatus(context: Context) {
        AppLog.append(context, statusText())
    }
}
