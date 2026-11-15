plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

import java.util.Properties
import java.io.FileInputStream

android {
    namespace = "com.walzpay.listener"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.walzpay.listener"
        minSdk = 26
        targetSdk = 35
        versionCode = 36
        versionName = "3.1.4"
    }

    signingConfigs {
        create("release") {
            // Prefer CI / local keystore.jks + passwords from env or keystore.properties
            val keystoreFile = file("../keystore/walzpay-release.jks")
            val propsFile = rootProject.file("keystore.properties")
            val props = Properties()
            if (propsFile.exists()) {
                props.load(FileInputStream(propsFile))
            }
            val storePass = System.getenv("WALZPAY_STORE_PASSWORD")
                ?: props.getProperty("storePassword")
                ?: "WalzPay#Release2026!"
            val keyPass = System.getenv("WALZPAY_KEY_PASSWORD")
                ?: props.getProperty("keyPassword")
                ?: storePass
            val alias = System.getenv("WALZPAY_KEY_ALIAS")
                ?: props.getProperty("keyAlias")
                ?: "walzpay"

            if (keystoreFile.exists()) {
                storeFile = keystoreFile
                storePassword = storePass
                keyAlias = alias
                keyPassword = keyPass
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            signingConfig = signingConfigs.getByName("release")
        }
        debug {
            isMinifyEnabled = false
            // debug tetap pakai default debug keystore
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        viewBinding = true
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.constraintlayout:constraintlayout:2.1.4")
    implementation("androidx.activity:activity-ktx:1.9.0")
    implementation("androidx.fragment:fragment-ktx:1.8.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
    implementation("dev.rikka.shizuku:api:13.1.5")
    implementation("dev.rikka.shizuku:provider:13.1.5")
}
