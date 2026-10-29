package com.walzpay.listener

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity

/**
 * Entry point: arahkan ke Login atau Home native.
 * Listener permission → ListenerActivity (dari menu Home).
 */
class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        SessionStore.init(this)
        val next = if (SessionStore.isLoggedIn()) {
            HomeActivity::class.java
        } else {
            LoginActivity::class.java
        }
        startActivity(Intent(this, next))
        finish()
    }
}
