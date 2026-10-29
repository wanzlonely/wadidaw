package com.walzpay.listener.net

import com.walzpay.listener.SessionStore
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

object ApiClient {
    const val BASE = "https://walzpaynew.vercel.app"

    private val client = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    private val JSON = "application/json; charset=utf-8".toMediaType()

    data class Res(val code: Int, val body: JSONObject?) {
        val ok get() = code in 200..299
        fun err(): String = body?.optString("error")
            ?.takeIf { it.isNotBlank() }
            ?: body?.optString("message")
            ?: "HTTP $code"
    }

    private fun authHeaders(b: Request.Builder): Request.Builder {
        val token = SessionStore.token
        if (!token.isNullOrBlank()) {
            b.header("X-Walz-Token", token)
            b.header("Authorization", "Bearer $token")
        }
        return b
    }

    fun post(path: String, json: JSONObject): Res {
        val body = json.toString().toRequestBody(JSON)
        val req = authHeaders(Request.Builder().url("$BASE$path").post(body)).build()
        return execute(req)
    }

    fun get(path: String): Res {
        val req = authHeaders(Request.Builder().url("$BASE$path").get()).build()
        return execute(req)
    }

    fun delete(path: String): Res {
        val req = authHeaders(Request.Builder().url("$BASE$path").delete()).build()
        return execute(req)
    }

    private fun execute(req: Request): Res {
        client.newCall(req).execute().use { res ->
            val text = res.body?.string().orEmpty()
            val obj = try {
                if (text.isBlank()) null else JSONObject(text)
            } catch (_: Exception) {
                JSONObject().put("raw", text)
            }
            return Res(res.code, obj)
        }
    }

    fun auth(action: String, extra: JSONObject = JSONObject()): Res {
        val j = JSONObject()
        j.put("action", action)
        extra.keys().forEach { j.put(it, extra.get(it)) }
        return post("/api/auth", j)
    }

    fun listOrders(status: String? = null): Res {
        val q = if (status.isNullOrBlank()) "" else "?status=$status"
        return get("/api/orders$q")
    }

    fun createOrder(amount: Long, note: String = ""): Res {
        val j = JSONObject()
            .put("amount", amount)
            .put("note", note)
            .put("dynamic", true)
        return post("/api/orders", j)
    }

    fun cancelOrder(id: String): Res = delete("/api/orders?id=$id")

    fun listPayments(): Res = get("/api/payments")

    fun getSettings(): Res = get("/api/settings")

    fun getLive(): Res = get("/api/live")

    fun parseList(key: String, body: JSONObject?): JSONArray {
        if (body == null) return JSONArray()
        return body.optJSONArray(key) ?: JSONArray()
    }
}
