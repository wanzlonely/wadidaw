package com.walzpay.listener

import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.fragment.app.Fragment
import com.google.android.material.bottomnavigation.BottomNavigationView
import com.walzpay.listener.net.ApiClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

class HomeActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        SessionStore.init(this)
        if (!SessionStore.isLoggedIn()) {
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
            return
        }

        setContentView(R.layout.activity_home)
        val nav = findViewById<BottomNavigationView>(R.id.bottomNav)

        if (savedInstanceState == null) {
            supportFragmentManager.beginTransaction()
                .replace(R.id.fragmentContainer, DashboardFragment())
                .commit()
        }

        nav.setOnItemSelectedListener { item ->
            when (item.itemId) {
                R.id.nav_home -> swap(DashboardFragment())
                R.id.nav_orders -> swap(OrdersFragment())
                R.id.nav_history -> swap(HistoryFragment())
                R.id.nav_profile -> swap(ProfileFragment())
                R.id.nav_listener -> {
                    startActivity(Intent(this, ListenerActivity::class.java))
                    false
                }
                else -> false
            }
        }
    }

    private fun swap(f: Fragment): Boolean {
        supportFragmentManager.beginTransaction()
            .replace(R.id.fragmentContainer, f)
            .commit()
        return true
    }
}

class DashboardFragment : Fragment() {
    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val v = inflater.inflate(R.layout.fragment_simple_list, container, false)
        v.findViewById<TextView>(R.id.tvTitle).text = "Beranda"
        v.findViewById<TextView>(R.id.tvSubtitle).text =
            "Halo, ${SessionStore.displayName ?: SessionStore.email}"
        val content = v.findViewById<TextView>(R.id.tvContent)
        val load = {
            CoroutineScope(Dispatchers.IO).launch {
                val live = ApiClient.getLive()
                val payments = ApiClient.listPayments()
                val orders = ApiClient.listOrders()
                val text = buildString {
                    appendLine("=== Status live ===")
                    appendLine(live.body?.toString(2) ?: live.err())
                    appendLine()
                    appendLine("=== Pembayaran (10) ===")
                    val pays = ApiClient.parseList("payments", payments.body)
                    if (pays.length() == 0) appendLine("(kosong)")
                    for (i in 0 until minOf(10, pays.length())) {
                        val p = pays.getJSONObject(i)
                        appendLine(
                            "Rp${p.optLong("amount")} · ${p.optString("merchantId")} · ${p.optString("receivedAt")}"
                        )
                    }
                    appendLine()
                    appendLine("=== Order pending ===")
                    val ords = ApiClient.parseList("orders", orders.body)
                    var pending = 0
                    for (i in 0 until ords.length()) {
                        val o = ords.getJSONObject(i)
                        if (o.optString("status") == "pending") {
                            pending++
                            appendLine(
                                "${o.optString("id")} · total Rp${o.optLong("totalAmount")} · ${o.optString("status")}"
                            )
                        }
                    }
                    if (pending == 0) appendLine("(tidak ada pending)")
                }
                withContext(Dispatchers.Main) { content.text = text }
            }
        }
        v.findViewById<Button>(R.id.btnRefresh).setOnClickListener { load() }
        load()
        return v
    }
}

class OrdersFragment : Fragment() {
    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val v = inflater.inflate(R.layout.fragment_simple_list, container, false)
        v.findViewById<TextView>(R.id.tvTitle).text = "Pesanan QRIS"
        v.findViewById<TextView>(R.id.tvSubtitle).text =
            "Buat order dinamis · nominal exact untuk match webhook"
        val et = v.findViewById<EditText>(R.id.etAmount)
        val btn = v.findViewById<Button>(R.id.btnAction)
        val content = v.findViewById<TextView>(R.id.tvContent)
        et.visibility = View.VISIBLE
        btn.visibility = View.VISIBLE
        btn.text = "Buat order"

        val load = {
            CoroutineScope(Dispatchers.IO).launch {
                val res = ApiClient.listOrders()
                val ords = ApiClient.parseList("orders", res.body)
                val text = buildString {
                    if (!res.ok) appendLine(res.err())
                    if (ords.length() == 0) appendLine("(belum ada order)")
                    for (i in 0 until ords.length()) {
                        val o = ords.getJSONObject(i)
                        appendLine(
                            "${o.optString("status").uppercase()} · base Rp${o.optLong("amount")} · total Rp${o.optLong("totalAmount")}"
                        )
                        appendLine("  id=${o.optString("id")} token=${o.optString("token")}")
                        appendLine()
                    }
                }
                withContext(Dispatchers.Main) { content.text = text }
            }
        }

        btn.setOnClickListener {
            val amount = et.text.toString().toLongOrNull()
            if (amount == null || amount <= 0) {
                Toast.makeText(requireContext(), "Isi nominal valid", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            CoroutineScope(Dispatchers.IO).launch {
                val res = ApiClient.createOrder(amount)
                withContext(Dispatchers.Main) {
                    if (res.ok) {
                        Toast.makeText(requireContext(), "Order dibuat", Toast.LENGTH_SHORT).show()
                        load()
                    } else {
                        Toast.makeText(requireContext(), res.err(), Toast.LENGTH_LONG).show()
                    }
                }
            }
        }

        v.findViewById<Button>(R.id.btnRefresh).setOnClickListener { load() }
        load()
        return v
    }
}

class HistoryFragment : Fragment() {
    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val v = inflater.inflate(R.layout.fragment_simple_list, container, false)
        v.findViewById<TextView>(R.id.tvTitle).text = "Riwayat"
        v.findViewById<TextView>(R.id.tvSubtitle).text = "Pembayaran masuk dari webhook"
        val content = v.findViewById<TextView>(R.id.tvContent)
        val load = {
            CoroutineScope(Dispatchers.IO).launch {
                val res = ApiClient.listPayments()
                val pays = ApiClient.parseList("payments", res.body)
                val text = buildString {
                    if (!res.ok) appendLine(res.err())
                    if (pays.length() == 0) appendLine("(belum ada pembayaran)")
                    for (i in 0 until pays.length()) {
                        val p = pays.getJSONObject(i)
                        appendLine(
                            "Rp${p.optLong("amount")} · ${p.optString("merchantId")} · ${p.optString("packageName")}"
                        )
                        appendLine("  ${p.optString("rawTitle")} ${p.optString("rawText")}")
                        appendLine("  ${p.optString("receivedAt")}")
                        appendLine()
                    }
                }
                withContext(Dispatchers.Main) { content.text = text }
            }
        }
        v.findViewById<Button>(R.id.btnRefresh).setOnClickListener { load() }
        load()
        return v
    }
}

class ProfileFragment : Fragment() {
    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val v = inflater.inflate(R.layout.fragment_simple_list, container, false)
        v.findViewById<TextView>(R.id.tvTitle).text = "Akun"
        v.findViewById<TextView>(R.id.tvSubtitle).text = SessionStore.email ?: "-"
        val content = v.findViewById<TextView>(R.id.tvContent)
        val btn = v.findViewById<Button>(R.id.btnAction)
        btn.visibility = View.VISIBLE
        btn.text = "Logout"

        CoroutineScope(Dispatchers.IO).launch {
            val me = ApiClient.auth("me")
            val settings = ApiClient.getSettings()
            val text = buildString {
                appendLine("User: ${SessionStore.displayName}")
                appendLine("Email: ${SessionStore.email}")
                appendLine("ID: ${SessionStore.userId}")
                appendLine()
                appendLine("=== Profil server ===")
                appendLine(me.body?.optJSONObject("user")?.toString(2) ?: me.err())
                appendLine()
                appendLine("=== Settings (API key di Setel web / Listener) ===")
                val s = settings.body
                if (s != null) {
                    appendLine("displayName: ${s.optString("displayName")}")
                    appendLine("apiKey: ${s.optString("apiKey").take(8)}…")
                    appendLine("feeType: ${s.optString("feeType")}")
                } else appendLine(settings.err())
            }
            withContext(Dispatchers.Main) { content.text = text }
        }

        btn.setOnClickListener {
            CoroutineScope(Dispatchers.IO).launch {
                try {
                    ApiClient.auth("logout")
                } catch (_: Exception) {
                }
                withContext(Dispatchers.Main) {
                    SessionStore.clear(requireContext())
                    startActivity(Intent(requireContext(), LoginActivity::class.java))
                    requireActivity().finish()
                }
            }
        }

        v.findViewById<Button>(R.id.btnRefresh).setOnClickListener {
            parentFragmentManager.beginTransaction()
                .replace(R.id.fragmentContainer, ProfileFragment())
                .commit()
        }
        return v
    }
}
