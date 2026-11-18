# MetaDetect Premium integration

WALZPAY is used as the payment engine for MetaDetect Premium only.

## Required environment
Set `WALZPAY_CALLBACK_SECRET` in this Vercel project. It must exactly match the secret configured in the MetaDetect Vercel project.

MetaDetect will call this project's `POST /api/orders` using a dedicated merchant API key. WALZPAY automatically uses the first saved static QRIS template for that merchant, so no template ID needs to be copied into MetaDetect.
- `WALZPAY_API_BASE_URL`
- `WALZPAY_API_KEY`
- `WALZPAY_CALLBACK_SECRET`

Before connecting, save at least one static QRIS template in the WALZPAY merchant Setel page. The first saved template is used by MetaDetect Premium checkout.

## Signed callback
When an order with a callback URL is matched as paid, WALZPAY signs the exact JSON request body using HMAC-SHA256 and sends `X-Walzpay-Signature: sha256=<hex>`. The receiving MetaDetect endpoint verifies this signature before granting Premium.

The webhook endpoint now fails closed if neither a valid merchant API key nor a configured valid `WEBHOOK_SECRET` is supplied. Keep the Android listener configured with its merchant API key.
