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

    /** Package yang dipantau. DANA Bisnis utama. */
    private val allowedPackages = setOf(
        "id.dana",
        "id.dana.kasir",
        "com.gojek.gopaymerchant",
        "id.co.bri.merchant",
        "com.interactive.qrisid"
    )

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        if (sbn == null) return

        val packageName = sbn.packageName ?: return
        if (packageName !in allowedPackages) return

        val prefs = getSharedPreferences("walzpay", Context.MODE_PRIVATE)
        if (!prefs.getBoolean("listener_enabled", false)) return

        val webhookUrl = prefs.getString("webhook_url", null)?.trim()
        if (webhookUrl.isNullOrEmpty()) {
            AppLog.append(this, "Skip: webhook URL kosong")
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
            AppLog.append(this, "Skip no amount · $packageName · ${combined.take(60)}")
            return
        }

        val lower = combined.lowercase()
        val ignoreKeywords = listOf(
            "gagal", "batal", "refund", "promo", "voucher",
            "otp", "kode verifikasi", "tarik tunai", "penarikan"
        )
        if (ignoreKeywords.any { lower.contains(it) }) {
            AppLog.append(this, "Skip ignored · ${combined.take(40)}")
            return
        }

        val secret = prefs.getString("webhook_secret", null)
        val merchantId = when {
            packageName.contains("dana") -> "dana"
            packageName.contains("gopay") || packageName.contains("gojek") -> "gopay"
            packageName.contains("bri") -> "bri"
            packageName.contains("interactive") -> "interactive"
            else -> "unknown"
        }

        AppLog.append(this, "Detect Rp$amount · $merchantId")

        CoroutineScope(Dispatchers.IO).launch {
            sendToWebhook(
                url = webhookUrl,
                secret = secret,
                packageName = packageName,
                title = title,
                text = text.ifEmpty { bigText },
                amount = amount,
                merchantId = merchantId
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
        amount: Long,
        merchantId: String
    ) {
        try {
            val json = JSONObject().apply {
                put("packageName", packageName)
                put("source_package", packageName)
                put("title", title)
                put("text", text)
                put("rawText", text)
                put("rawTitle", title)
                put("amount", amount)
                put("merchantId", merchantId)
                put("merchant_id", merchantId)
                put("paymentSource", if (merchantId == "dana") "DANA" else merchantId)
                put("source", "walzpay-android-listener")
                put(
                    "notification", JSONObject()
                        .put("title", title)
                        .put("text", text)
                        .put("source_package", packageName)
                )
                put(
                    "payment", JSONObject()
                        .put("amount", amount)
                        .put("currency", "IDR")
                        .put("payment_source", if (merchantId == "dana") "DANA" else merchantId)
                )
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
                val msg = "Webhook ${response.code} · Rp$amount"
                Log.i(TAG, msg)
                AppLog.append(applicationContext, msg)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Gagal kirim webhook", e)
            AppLog.append(applicationContext, "ERROR: ${e.message}")
        }
    }

    companion object {
        private const val TAG = "WalzpayListener"
    }
}
