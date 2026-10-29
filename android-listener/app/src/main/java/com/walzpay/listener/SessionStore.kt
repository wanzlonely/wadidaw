package com.walzpay.listener

import android.content.Context

object SessionStore {
    private const val PREF = "walzpay_session"

    @Volatile
    var token: String? = null
        private set

    @Volatile
    var email: String? = null
        private set

    @Volatile
    var displayName: String? = null
        private set

    @Volatile
    var userId: String? = null
        private set

    fun init(ctx: Context) {
        val p = ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE)
        token = p.getString("token", null)
        email = p.getString("email", null)
        displayName = p.getString("displayName", null)
        userId = p.getString("userId", null)
    }

    fun save(ctx: Context, token: String, userId: String, email: String, displayName: String) {
        this.token = token
        this.userId = userId
        this.email = email
        this.displayName = displayName
        ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE).edit()
            .putString("token", token)
            .putString("userId", userId)
            .putString("email", email)
            .putString("displayName", displayName)
            .apply()
    }

    fun clear(ctx: Context) {
        token = null
        userId = null
        email = null
        displayName = null
        ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE).edit().clear().apply()
    }

    fun isLoggedIn(): Boolean = !token.isNullOrBlank()
}
