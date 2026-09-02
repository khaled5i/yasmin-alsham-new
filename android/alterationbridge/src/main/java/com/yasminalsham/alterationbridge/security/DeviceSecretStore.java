package com.yasminalsham.alterationbridge.security;

import android.annotation.SuppressLint;
import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@SuppressLint("ApplySharedPref") // Pairing credentials must be durable before the service starts.
public final class DeviceSecretStore {
    private static final String KEY_ALIAS = "yasmin_alteration_station_secret_v1";
    private static final String ANDROID_KEYSTORE = "AndroidKeyStore";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final String PREF_SECRET_IV = "station_secret_iv";
    private static final String PREF_SECRET_CIPHERTEXT = "station_secret_ciphertext";

    private final SharedPreferences preferences;

    public DeviceSecretStore(Context context, String preferencesName) {
        preferences = context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE);
    }

    public synchronized void save(String secret) throws Exception {
        if (secret == null || secret.trim().isEmpty()) {
            throw new IllegalArgumentException("Station secret is empty");
        }

        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
        byte[] encrypted = cipher.doFinal(secret.getBytes(StandardCharsets.UTF_8));
        preferences.edit()
                .putString(PREF_SECRET_IV, Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
                .putString(PREF_SECRET_CIPHERTEXT, Base64.encodeToString(encrypted, Base64.NO_WRAP))
                .commit();
    }

    public synchronized String load() throws Exception {
        String ivValue = preferences.getString(PREF_SECRET_IV, "");
        String encryptedValue = preferences.getString(PREF_SECRET_CIPHERTEXT, "");
        if (ivValue == null || ivValue.isEmpty() || encryptedValue == null || encryptedValue.isEmpty()) {
            return "";
        }

        byte[] iv = Base64.decode(ivValue, Base64.NO_WRAP);
        byte[] encrypted = Base64.decode(encryptedValue, Base64.NO_WRAP);
        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(128, iv));
        return new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
    }

    public synchronized void clear() {
        preferences.edit()
                .remove(PREF_SECRET_IV)
                .remove(PREF_SECRET_CIPHERTEXT)
                .commit();
    }

    private SecretKey getOrCreateKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(ANDROID_KEYSTORE);
        keyStore.load(null);
        KeyStore.Entry existing = keyStore.getEntry(KEY_ALIAS, null);
        if (existing instanceof KeyStore.SecretKeyEntry) {
            return ((KeyStore.SecretKeyEntry) existing).getSecretKey();
        }

        KeyGenerator generator = KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_AES,
                ANDROID_KEYSTORE
        );
        generator.init(new KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build());
        return generator.generateKey();
    }
}
