package de.blockwerk.app;

import android.os.Bundle;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // eigene Plugins (Hub am USB-Kabel, »Speichern unter«) – müssen vor dem Aufbau der Brücke angemeldet sein
        registerPlugin(HubSerialPlugin.class);
        registerPlugin(SaveFilePlugin.class);
        super.onCreate(savedInstanceState);

        // Zurück-Taste: Hat die Seite einen Eintrag im Verlauf angelegt (die Controller-Ansicht des
        // Steuerfelds tut das), geht es dort einen Schritt zurück – erst sonst verlässt man Blockwerk.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView view = getBridge() == null ? null : getBridge().getWebView();
                if (view != null && view.canGoBack()) {
                    view.goBack();
                } else {
                    moveTaskToBack(true);
                }
            }
        });
    }
}
