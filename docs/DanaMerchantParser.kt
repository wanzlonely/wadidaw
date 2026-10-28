package com.walzpay.app.merchant

/**
 * WALZPAY — DANA Bisnis / DANA Kasir notification parser
 *
 * Packages:
 * - id.dana          (DANA app, mode bisnis)
 * - id.dana.kasir    (DANA Kasir merchant app)
 *
 * IMPORTANT:
 * This is a heuristic skeleton. Adjust keywords and amount extraction
 * after capturing real notification samples via Debug Mode.
 *
 * Integrate into qrishook-based project:
 * 1. Place under your merchant package
 * 2. Extend the same MerchantParser base class as other parsers
 * 3. Register in MerchantRegistry.builtInParsers
 */
object DanaMerchantParser : MerchantParser() {

    override val merchantId = "dana"
    override val displayName = "DANA Bisnis"
    override val merchantPackages = listOf("id.dana", "id.dana.kasir")

    private val successKeywords = listOf(
        "berhasil",
        "diterima",
        "masuk",
        "pembayaran",
        "qris",
        "uang masuk",
        "transaksi berhasil",
        "terima pembayaran",
        "saldo masuk"
    )

    private val ignoreKeywords = listOf(
        "gagal",
        "batal",
        "refund",
        "promo",
        "kaget",
        "voucher",
        "transfer keluar",
        "penarikan",
        "tarik tunai"
    )

    override fun parse(notification: ObservedNotification): QrisPaymentEvent? {
        val title = notification.title.orEmpty()
        val text = notification.text.orEmpty()
        val bigText = notification.bigText.orEmpty()
        val content = "$title $text $bigText".lowercase()

        if (ignoreKeywords.any { content.contains(it) }) return null
        if (!successKeywords.any { content.contains(it) }) return null

        val amount = extractAmount(content) ?: return null

        return QrisPaymentEvent(
            merchantId = merchantId,
            amount = amount,
            senderName = null,
            paymentSource = "DANA",
            rawTitle = title,
            rawText = text
        )
    }

    /**
     * Extract Rupiah amount from notification text.
     * Examples: "Rp10.000", "Rp 10.000", "Rp10000", "10.000"
     * Adapt to match helpers already used in the base project if present.
     */
    private fun extractAmount(content: String): Long? {
        val regex = Regex(
            """(?:rp\.?\s*)([\d.]+)""",
            RegexOption.IGNORE_CASE
        )
        val match = regex.find(content) ?: return null
        val digits = match.groupValues[1].replace(".", "")
        return digits.toLongOrNull()
    }
}
