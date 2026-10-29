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

    /** Default packages jika user belum pilih di UI */
    private val defaultPackages = setOf(
        "id.dana",
        "id.dana.kasir",
        "com.gojek.gopaymerchant",
        "com.gojek.app",
        "ovo.id",
        "com.ovo.id",
        "com.shopee.id",
        "com.telkom.mwallet",
        "id.co.bri.merchant",
        "id.co.bri.brimo",
        "com.bca",
        "id.bmri.livin",
        "com.interactive.qrisid",
        "com.whatsapp",
        "com.whatsapp.w4b"
    )

    private fun selectedPackages(prefs: android.content.SharedPreferences): Set<String> {
        val raw = prefs.getStringSet("selected_packages", null)
        return if (raw.isNullOrEmpty()) defaultPackages else raw
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        if (sbn == null) return

        val packageName = sbn.packageName ?: return
        val prefs = getSharedPreferences("walzpay", Context.MODE_PRIVATE)
        if (packageName !in selectedPackages(prefs)) return

        if (!prefs.getBoolean("listener_enabled", false)) return

        val webhookUrl = prefs.getString("webhook_url", null)?.trim()
        if (webhookUrl.isNullOrEmpty()) {
            AppLog.append(this, "Skip: webhook URL kosong")
            return
        }

        val apiKey = prefs.getString("api_key", null)?.trim()
        if (apiKey.isNullOrEmpty()) {
            AppLog.append(this, "Skip: API Key kosong — isi dari Setel website")
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
            "otp", "kode verifikasi", "tarik tunai", "penarikan",
            "missed voice", "missed video"
        )
        if (ignoreKeywords.any { lower.contains(it) }) {
            AppLog.append(this, "Skip ignored · ${combined.take(40)}")
            return
        }

        val secret = prefs.getString("webhook_secret", null)
        val merchantId = when {
            packageName.contains("dana") -> "dana"
            packageName.contains("gopay") || packageName.contains("gojek") -> "gopay"
            packageName.contains("ovo") -> "ovo"
            packageName.contains("shopee") -> "shopee"
            packageName.contains("mwallet") || packageName.contains("linkaja") -> "linkaja"
            packageName.contains("bri") -> "bri"
            packageName.contains("bca") -> "bca"
            packageName.contains("bmri") || packageName.contains("mandiri") -> "mandiri"
            packageName.contains("interactive") -> "interactive"
            packageName.contains("whatsapp") -> "whatsapp"
            else -> "unknown"
        }

        AppLog.append(this, "Detect Rp$amount · $merchantId · $packageName")

        CoroutineScope(Dispatchers.IO).launch {
            sendToWebhook(
                url = webhookUrl,
                apiKey = apiKey,
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
        apiKey: String,
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
                put("paymentSource", merchantId.uppercase())
            }

            val body = json.toString().toRequestBody("application/json".toMediaType())
            val reqBuilder = Request.Builder().url(url).post(body)
            // Multi-tenant: server setTenant via API key
            reqBuilder.header("X-Api-Key", apiKey)
            reqBuilder.header("X-Walzpay-Key", apiKey)
            if (!secret.isNullOrBlank()) {
                reqBuilder.header("X-Webhook-Secret", secret)
                reqBuilder.header("X-Walzpay-Secret", secret)
            }
            val res = client.newCall(reqBuilder.build()).execute()
            val code = res.code
            val respBody = res.body?.string()?.take(120) ?: ""
            res.close()
            AppLog.append(
                this@PaymentNotificationListener,
                "Webhook HTTP $code · Rp$amount · $respBody"
            )
        } catch (e: Exception) {
            Log.e("WalzPay", "webhook error", e)
            AppLog.append(this@PaymentNotificationListener, "Webhook error: ${e.message}")
        }
    }
}
