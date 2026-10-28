package com.walzpay.listener

import android.app.Notification
import android.content.Context
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class PaymentNotificationListener : NotificationListenerService() {

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()

    private val allowedPackages = setOf(
        "id.dana",
        "id.dana.kasir",
        "com.gojek.gopaymerchant",
        "com.gojek.app"
    )

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        if (sbn == null) return

        val packageName = sbn.packageName ?: return
        if (packageName !in allowedPackages) return

        val prefs = getSharedPreferences("walzpay", Context.MODE_PRIVATE)
        if (!prefs.getBoolean("listener_enabled", false)) return

        val webhookUrl = prefs.getString("webhook_url", null)?.trim()
        if (webhookUrl.isNullOrEmpty()) {
            Log.w(TAG, "Webhook URL belum diisi")
            return
        }

        val notification = sbn.notification ?: return
        val extras = notification.extras ?: return

        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: ""
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString() ?: ""
        val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString() ?: ""

        val combined = "$title $text $bigText"
        val amount = extractAmount(combined)

        if (amount == null || amount <= 0) {
            Log.d(TAG, "Skip: tidak menemukan nominal valid → $combined")
            return
        }

        // Filter kasar notifikasi gagal / promo
        val lower = combined.lowercase()
        val ignoreKeywords = listOf("gagal", "batal", "refund", "promo", "voucher", "otp", "kode verifikasi")
        if (ignoreKeywords.any { lower.contains(it) }) {
            Log.d(TAG, "Skip ignored notification")
            return
        }

        val secret = prefs.getString("webhook_secret", null)

        CoroutineScope(Dispatchers.IO).launch {
            sendToWebhook(
                url = webhookUrl,
                secret = secret,
                packageName = packageName,
                title = title,
                text = text.ifEmpty { bigText },
                amount = amount
            )
        }
    }

    private fun extractAmount(text: String): Long? {
        val patterns = listOf(
            Regex("""rp\.?\s*([\d]{1,3}(?:[.\s]?\d{3})*(?:,\d+)?)""", RegexOption.IGNORE_CASE),
            Regex("""rp\.?\s*([\d]+)""", RegexOption.IGNORE_CASE),
            Regex("""\b([\d]{1,3}(?:\.\d{3})+)(?:,\d+)?\b""")
        )

        for (p in patterns) {
            val m = p.find(text) ?: continue
            val raw = m.groupValues[1]
                .replace(" ", "")
                .replace(".", "")
                .substringBefore(",")
            val value = raw.toLongOrNull()
            if (value != null && value > 0) return value
        }
        return null
    }

    private fun sendToWebhook(
        url: String,
        secret: String?,
        packageName: String,
        title: String,
        text: String,
        amount: Long
    ) {
        try {
            val json = JSONObject().apply {
                put("packageName", packageName)
                put("title", title)
                put("text", text)
                put("rawText", text)
                put("rawTitle", title)
                put("amount", amount)
                put("merchantId", if (packageName.contains("dana")) "dana" else "unknown")
                put("source", "walzpay-android-listener")
            }

            val body = json.toString()
                .toRequestBody("application/json; charset=utf-8".toMediaType())

            val requestBuilder = Request.Builder()
                .url(url)
                .post(body)
                .header("Content-Type", "application/json")

            if (!secret.isNullOrBlank()) {
                requestBuilder.header("x-walzpay-secret", secret)
            }

            client.newCall(requestBuilder.build()).execute().use { response ->
                Log.i(TAG, "Webhook response: ${response.code} ${response.message}")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Gagal kirim webhook", e)
        }
    }

    companion object {
        private const val TAG = "WalzpayListener"
    }
}
