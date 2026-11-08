plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val appUrl = (project.findProperty("curatoAppUrl") as String?) ?: "https://curato.example.com/"

android {
    namespace = "com.curato.tv"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.curato.tv"
        // API 22 = Fire OS 5 (older Fire TV Sticks); Android TV devices are all API 21+.
        minSdk = 22
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
        buildConfigField("String", "APP_URL", "\"$appUrl\"")
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}
