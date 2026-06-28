# kotlinx.serialization
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**
-keepclassmembers class **$$serializer { *; }
-keepclasseswithmembers class com.nexusllm.app.data.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class com.nexusllm.app.data.**$$serializer { *; }
