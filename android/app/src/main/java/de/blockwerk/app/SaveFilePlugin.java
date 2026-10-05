package de.blockwerk.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * »Speichern« auf Android: öffnet die Dateiauswahl des Systems (»Speichern unter«), damit
 * das Projekt in »Downloads«, auf einer Speicherkarte oder in einer Cloud landen kann. Das
 * Fenster »Teilen« bietet auf Android keinen Ort auf dem Gerät an. Gegenstück: src/files.ts.
 */
@CapacitorPlugin(name = "SaveFile")
public class SaveFilePlugin extends Plugin {
    @PluginMethod
    public void save(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(call.getString("type", "application/octet-stream"));
        intent.putExtra(Intent.EXTRA_TITLE, call.getString("name", "blockwerk.txt"));
        startActivityForResult(call, intent, "written");
    }

    @ActivityCallback
    private void written(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject answer = new JSObject();
        Uri target = result.getResultCode() == Activity.RESULT_OK && result.getData() != null ? result.getData().getData() : null;
        if (target == null) {   // Auswahl abgebrochen
            answer.put("saved", false);
            call.resolve(answer);
            return;
        }
        // »wt«: eine vorhandene Datei ganz ersetzen, nicht nur ihren Anfang überschreiben
        try (OutputStream out = getContext().getContentResolver().openOutputStream(target, "wt")) {
            out.write(call.getString("text", "").getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            call.reject("Die Datei ließ sich nicht schreiben: " + e.getMessage(), "IO", e);
            return;
        }
        answer.put("saved", true);
        call.resolve(answer);
    }
}
