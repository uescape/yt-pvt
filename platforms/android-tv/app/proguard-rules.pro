# The web app calls these through window.CuratoNative.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
