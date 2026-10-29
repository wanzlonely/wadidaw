package com.walzpay.listener

import android.content.Intent
import android.os.Bundle
import android.text.InputType
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.walzpay.listener.net.ApiClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import kotlin.random.Random

class LoginActivity : AppCompatActivity() {

    private var modeRegister = false
    private var needOtp = false
    private var otpUserId: String? = null
    private var captchaA = 0
    private var captchaB = 0
    private var showPw = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        SessionStore.init(this)
        if (SessionStore.isLoggedIn()) {
            startActivity(Intent(this, HomeActivity::class.java))
            finish()
            return
        }

        setContentView(R.layout.activity_login)
        refreshCaptcha()
        bind()
    }

    private fun bind() {
        val etName = findViewById<EditText>(R.id.etName)
        val etEmail = findViewById<EditText>(R.id.etEmail)
        val etPassword = findViewById<EditText>(R.id.etPassword)
        val etPassword2 = findViewById<EditText>(R.id.etPassword2)
        val etCaptcha = findViewById<EditText>(R.id.etCaptcha)
        val etOtp = findViewById<EditText>(R.id.etOtp)
        val tvMode = findViewById<TextView>(R.id.tvMode)
        val tvCaptcha = findViewById<TextView>(R.id.tvCaptcha)
        val tvError = findViewById<TextView>(R.id.tvError)
        val btnSubmit = findViewById<Button>(R.id.btnSubmit)
        val btnSwitch = findViewById<Button>(R.id.btnSwitch)
        val btnTogglePw = findViewById<Button>(R.id.btnTogglePw)

        btnTogglePw.setOnClickListener {
            showPw = !showPw
            val type = if (showPw)
                InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD
            else
                InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
            etPassword.inputType = type
            etPassword2.inputType = type
            btnTogglePw.text = if (showPw) "🙉" else "🙈"
        }

        btnSwitch.setOnClickListener {
            modeRegister = !modeRegister
            needOtp = false
            etOtp.visibility = View.GONE
            etName.visibility = if (modeRegister) View.VISIBLE else View.GONE
            etPassword2.visibility = if (modeRegister) View.VISIBLE else View.GONE
            tvMode.text = if (modeRegister) "Daftar" else "Masuk"
            btnSubmit.text = if (modeRegister) "Daftar" else "Masuk"
            btnSwitch.text =
                if (modeRegister) "Sudah punya akun? Masuk" else "Belum punya akun? Daftar"
            refreshCaptcha()
            tvError.visibility = View.GONE
        }

        findViewById<Button>(R.id.btnListenerOnly).setOnClickListener {
            startActivity(Intent(this, ListenerActivity::class.java))
        }

        btnSubmit.setOnClickListener {
            tvError.visibility = View.GONE
            val email = etEmail.text.toString().trim()
            val password = etPassword.text.toString()
            val captchaAns = etCaptcha.text.toString().trim()
            val expected = (captchaA + captchaB).toString()

            CoroutineScope(Dispatchers.IO).launch {
                try {
                    val res = if (needOtp) {
                        ApiClient.auth(
                            "verify_otp",
                            JSONObject()
                                .put("userId", otpUserId)
                                .put("code", etOtp.text.toString().trim())
                        )
                    } else if (modeRegister) {
                        ApiClient.auth(
                            "register",
                            JSONObject()
                                .put("email", email)
                                .put("password", password)
                                .put("password2", etPassword2.text.toString())
                                .put("displayName", etName.text.toString().trim())
                                .put("captchaAnswer", captchaAns)
                                .put("captchaExpected", expected)
                        )
                    } else {
                        ApiClient.auth(
                            "login",
                            JSONObject()
                                .put("email", email)
                                .put("password", password)
                                .put("captchaAnswer", captchaAns)
                                .put("captchaExpected", expected)
                        )
                    }

                    withContext(Dispatchers.Main) {
                        if (!res.ok) {
                            showErr(tvError, res.err())
                            refreshCaptcha()
                            return@withContext
                        }
                        val body = res.body!!
                        if (body.optBoolean("needOtp")) {
                            needOtp = true
                            otpUserId = body.optString("userId")
                            etOtp.visibility = View.VISIBLE
                            btnSubmit.text = "Verifikasi OTP"
                            Toast.makeText(
                                this@LoginActivity,
                                body.optString("message", "OTP dikirim"),
                                Toast.LENGTH_LONG
                            ).show()
                            return@withContext
                        }
                        val token = body.optString("token")
                        val user = body.optJSONObject("user")
                        if (token.isNullOrBlank() || user == null) {
                            showErr(tvError, "Respons login tidak valid")
                            return@withContext
                        }
                        SessionStore.save(
                            this@LoginActivity,
                            token,
                            user.optString("id"),
                            user.optString("email"),
                            user.optString("displayName")
                        )
                        startActivity(Intent(this@LoginActivity, HomeActivity::class.java))
                        finish()
                    }
                } catch (e: Exception) {
                    withContext(Dispatchers.Main) {
                        showErr(tvError, e.message ?: "Gagal koneksi")
                    }
                }
            }
        }

        tvCaptcha.text = "Captcha: $captchaA + $captchaB = ?"
    }

    private fun refreshCaptcha() {
        captchaA = Random.nextInt(1, 9)
        captchaB = Random.nextInt(1, 9)
        findViewById<TextView>(R.id.tvCaptcha).text = "Captcha: $captchaA + $captchaB = ?"
        findViewById<EditText>(R.id.etCaptcha).setText("")
    }

    private fun showErr(tv: TextView, msg: String) {
        tv.text = msg
        tv.visibility = View.VISIBLE
    }
}
