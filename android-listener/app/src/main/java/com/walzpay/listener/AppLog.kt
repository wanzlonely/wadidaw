package com.walzpay.listener

import android.content.Context
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Log ring sederhana di SharedPreferences (maks ~80 baris). */
object AppLog {
    private const val PREF = "walzpay"
    private const val KEY = "logs"
    private const val MAX = 80
    private val fmt = SimpleDateFormat("HH:mm:ss", Locale.getDefault())

    fun append(context: Context, message: String) {
        val prefs = context.getSharedPreferences(PREF, Context.MODE_PRIVATE)
        val line = "${fmt.format(Date())}  $message"
        val prev = prefs.getString(KEY, "") ?: ""
        val lines = (if (prev.isEmpty()) emptyList() else prev.split("\n")).toMutableList()
        lines.add(0, line)
        while (lines.size > MAX) lines.removeAt(lines.lastIndex)
        prefs.edit().putString(KEY, lines.joinToString("\n")).apply()
    }

    fun read(context: Context): String {
        return context.getSharedPreferences(PREF, Context.MODE_PRIVATE)
            .getString(KEY, "")
            ?.ifEmpty { "Belum ada log" }
            ?: "Belum ada log"
    }

    fun clear(context: Context) {
        context.getSharedPreferences(PREF, Context.MODE_PRIVATE)
            .edit().remove(KEY).apply()
    }
}
