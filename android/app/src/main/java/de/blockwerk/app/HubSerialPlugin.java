package de.blockwerk.app;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbManager;
import android.os.Build;
import android.util.Base64;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.hoho.android.usbserial.driver.CdcAcmSerialDriver;
import com.hoho.android.usbserial.driver.UsbSerialPort;
import com.hoho.android.usbserial.util.SerialInputOutputManager;

/**
 * Hub am USB-Kabel: Der Hub mit Pybricks-Firmware (ab 4.1) meldet sich als serielle
 * Schnittstelle (CDC ACM, zwei Schnittstellen: Steuerung und Daten). Dieses Plugin reicht
 * die rohen Bytes an die Seite weiter; Rahmen und Befehle baut src/hub/serialProtocol.ts.
 * Gegenstück auf der Seite: src/hub/nativeSerial.ts. Daten gehen als Base64 über die Brücke.
 */
@CapacitorPlugin(name = "HubSerial")
public class HubSerialPlugin extends Plugin implements SerialInputOutputManager.Listener {
    /** USB-Herstellernummer von LEGO. */
    private static final int LEGO_VENDOR = 0x0694;
    private static final String ACTION_PERMISSION = "de.blockwerk.app.USB_PERMISSION";
    private static final int WRITE_TIMEOUT_MS = 2000;

    private UsbSerialPort port;
    private SerialInputOutputManager io;
    /** open(), das noch auf die Antwort »Darf Blockwerk dieses USB-Gerät benutzen?« wartet. */
    private PluginCall waiting;
    private BroadcastReceiver permissionReceiver;

    private UsbManager manager() {
        return (UsbManager) getContext().getSystemService(Context.USB_SERVICE);
    }

    private UsbDevice find(Integer id) {
        UsbManager manager = manager();
        if (manager == null || id == null) return null;
        for (UsbDevice device : manager.getDeviceList().values()) {
            if (device.getVendorId() == LEGO_VENDOR && device.getDeviceId() == id) return device;
        }
        return null;
    }

    /** Angeschlossene LEGO-Hubs. */
    @PluginMethod
    public void list(PluginCall call) {
        UsbManager manager = manager();
        if (manager == null) { call.reject("Dieses Gerät kann keine USB-Geräte ansprechen.", "UNSUPPORTED"); return; }
        JSArray devices = new JSArray();
        for (UsbDevice device : manager.getDeviceList().values()) {
            if (device.getVendorId() != LEGO_VENDOR) continue;
            JSObject entry = new JSObject();
            entry.put("id", device.getDeviceId());
            entry.put("name", device.getProductName() != null ? device.getProductName() : "LEGO Hub");
            devices.put(entry);
        }
        JSObject result = new JSObject();
        result.put("devices", devices);
        call.resolve(result);
    }

    /** Öffnet die Schnittstelle; fehlt die Erlaubnis für das Gerät, fragt Android erst danach. */
    @PluginMethod
    public synchronized void open(PluginCall call) {
        final UsbDevice device = find(call.getInt("id"));
        final int baudRate = call.getInt("baudRate", 115200);
        if (device == null) { call.reject("Der Hub steckt nicht mehr am Kabel.", "NOT_FOUND"); return; }
        closePort();
        if (manager().hasPermission(device)) { openDevice(call, device, baudRate); return; }

        if (waiting != null) waiting.reject("Abgebrochen.", "DENIED");
        waiting = call;
        unregisterReceiver();
        permissionReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                synchronized (HubSerialPlugin.this) {
                    unregisterReceiver();
                    PluginCall pending = waiting;
                    waiting = null;
                    if (pending == null) return;
                    // nicht auf die Angaben im Intent verlassen – nachsehen, ob die Erlaubnis jetzt da ist
                    if (manager().hasPermission(device)) openDevice(pending, device, baudRate);
                    else pending.reject("Die Erlaubnis für das USB-Gerät wurde nicht erteilt.", "DENIED");
                }
            }
        };
        ContextCompat.registerReceiver(getContext(), permissionReceiver, new IntentFilter(ACTION_PERMISSION), ContextCompat.RECEIVER_NOT_EXPORTED);
        // Android trägt das Ergebnis in den Intent ein, deshalb veränderlich; seit Android 14 muss er dann an die eigene App gerichtet sein
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0;
        Intent answer = new Intent(ACTION_PERMISSION).setPackage(getContext().getPackageName());
        manager().requestPermission(device, PendingIntent.getBroadcast(getContext(), 0, answer, flags));
    }

    private void openDevice(PluginCall call, UsbDevice device, int baudRate) {
        UsbDeviceConnection connection = manager().openDevice(device);
        if (connection == null) { call.reject("Die Schnittstelle lässt sich nicht öffnen.", "OPEN_FAILED"); return; }
        UsbSerialPort opened = new CdcAcmSerialDriver(device).getPorts().get(0);
        try {
            opened.open(connection);
        } catch (Exception e) {
            connection.close();
            call.reject("Die Schnittstelle lässt sich nicht öffnen: " + e.getMessage(), "OPEN_FAILED", e);
            return;
        }
        port = opened;   // ab hier räumt closePort() auf
        try {
            // Die Geschwindigkeit ist am Hub ohne Bedeutung (keine echte serielle Leitung), muss aber gültig sein
            opened.setParameters(baudRate, 8, UsbSerialPort.STOPBITS_1, UsbSerialPort.PARITY_NONE);
            io = new SerialInputOutputManager(opened, this);
            io.start();
            call.resolve();
        } catch (Exception e) {
            closePort();
            call.reject("Die Schnittstelle lässt sich nicht öffnen: " + e.getMessage(), "OPEN_FAILED", e);
        }
    }

    /** Am DTR-Signal erkennt der Hub, dass ein Programm die Schnittstelle geöffnet hat. */
    @PluginMethod
    public synchronized void setSignals(PluginCall call) {
        if (port == null) { call.reject("Die Schnittstelle ist nicht geöffnet.", "CLOSED"); return; }
        try {
            port.setDTR(Boolean.TRUE.equals(call.getBoolean("dtr", false)));
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage(), "IO", e);
        }
    }

    @PluginMethod
    public void write(PluginCall call) {
        UsbSerialPort target;
        synchronized (this) { target = port; }
        String data = call.getString("data");
        if (target == null) { call.reject("Die Schnittstelle ist nicht geöffnet.", "CLOSED"); return; }
        if (data == null) { call.reject("Keine Daten.", "IO"); return; }
        try {
            target.write(Base64.decode(data, Base64.DEFAULT), WRITE_TIMEOUT_MS);
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage(), "IO", e);
        }
    }

    @PluginMethod
    public synchronized void close(PluginCall call) {
        closePort();
        call.resolve();
    }

    /** Was der Hub schickt, geht unverändert an die Seite. */
    @Override
    public void onNewData(byte[] data) {
        JSObject event = new JSObject();
        event.put("data", Base64.encodeToString(data, Base64.NO_WRAP));
        notifyListeners("data", event);
    }

    /** Kabel gezogen oder Hub ausgeschaltet. */
    @Override
    public void onRunError(Exception e) {
        synchronized (this) {
            if (port == null) return;   // von uns selbst geschlossen
            closePort();
        }
        notifyListeners("closed", new JSObject());
    }

    private synchronized void closePort() {
        UsbSerialPort closing = port;
        port = null;
        if (io != null) { io.setListener(null); io.stop(); io = null; }
        if (closing != null) {
            try { closing.close(); } catch (Exception ignored) { /* schon weg */ }
        }
    }

    private void unregisterReceiver() {
        if (permissionReceiver == null) return;
        try { getContext().unregisterReceiver(permissionReceiver); } catch (Exception ignored) { /* schon abgemeldet */ }
        permissionReceiver = null;
    }

    @Override
    protected void handleOnDestroy() {
        synchronized (this) {
            unregisterReceiver();
            closePort();
        }
        super.handleOnDestroy();
    }
}
