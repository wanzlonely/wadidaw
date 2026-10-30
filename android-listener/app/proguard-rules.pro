# WALZPAY Listener - ProGuard / R8

# Keep JavascriptInterface methods
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep WalzBridge and MainActivity
-keep class com.walzpay.listener.MainActivity$WalzBridge { *; }
-keep class com.walzpay.listener.MainActivity { *; }

# Keep notification listener
-keep class com.walzpay.listener.PaymentNotificationListener { *; }
-keep class com.walzpay.listener.KeepAliveService { *; }
-keep class com.walzpay.listener.BootReceiver { *; }
-keep class com.walzpay.listener.WatchdogReceiver { *; }

# OkHttp / coroutines (usually auto-kept, but safe)
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn kotlinx.coroutines.**

# Shizuku
-keep class rikka.shizuku.** { *; }
-dontwarn rikka.shizuku.**
